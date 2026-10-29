import { Peer, type DataConnection, type PeerOptions } from 'peerjs';
import { RoomAuthority } from './room-authority';
import { CREW_CHECKPOINTS, CREW_COOLDOWN_MS, CREW_DURATION_MS, CREW_REWARD, MAX_ROOM_PLAYERS, ROOM_PROTOCOL, type HomeAction, type MultiplayerSession, type MultiplayerState, type OnlinePose, type RoomCommand, type RoomSnapshot } from './multiplayer-model';
import type { PokerAction } from './poker-model';
import type { GarageAction } from './garage';
import type { JobAction } from './online-jobs';
import type { CareerAction, CrewBaseAction } from './career';
import type { CasinoGameAction } from './casino-games';
import type { TournamentAction } from './poker-tournament';
import type { CityEventAction } from './city-events';
import { cityEventAt } from './city-life';
import { CONNECTION_PROGRESS, CONNECTION_TIMEOUT_MESSAGE, CONNECTION_TIMEOUT_MS, SIGNALING_UNAVAILABLE_MESSAGE, type ConnectionPhase } from './connection-lifecycle';
import { buildIceConfiguration } from './ice-config';

const STALE_MS = 15000;
const MAX_PACKET = 32768;
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const clone = <T>(value: T): T => structuredClone(value);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const integer = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const finiteNumber = (value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const pointOrNull = (value:unknown)=>value===null||record(value)&&finiteNumber(value.x)&&finiteNumber(value.z);
const idValue = (value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
const shortText=(value:unknown,max=600):value is string=>typeof value==='string'&&value.length<=max;
const boundedInteger=(value:unknown,max:number)=>integer(value)&&Number(value)<=max;
const cardArray=(value:unknown,max:number)=>Array.isArray(value)&&value.length<=max&&value.every(card=>record(card)&&boundedInteger(card.rank,14)&&[0,2,3,4,5,6,7,8,9,10,11,12,13,14].includes(Number(card.rank))&&['♠','♥','♦','♣'].includes(String(card.suit)));
function publicHand(value:unknown):boolean {
  if(value===null)return true;
  if(!record(value)||!Array.isArray(value.players)||value.players.length!==4||!Array.isArray(value.deck)||value.deck.length!==0||value.seed!==0||!cardArray(value.board,5))return false;
  if(!Array.isArray(value.raiseRights)||value.raiseRights.length!==4||!value.raiseRights.every(v=>typeof v==='boolean')||!Array.isArray(value.payouts)||value.payouts.length!==4||!value.payouts.every(integer)||!Array.isArray(value.winners)||value.winners.some(v=>!boundedInteger(v,3))||!Array.isArray(value.log)||value.log.length>40||!value.log.every(v=>shortText(v)))return false;
  if(!['waiting','preflop','flop','turn','river','showdown'].includes(String(value.phase))||!integer(value.pot)||!integer(value.handNumber)||!boundedInteger(value.dealer,3)||(value.actor!==null&&!boundedInteger(value.actor,3)))return false;
  return value.players.every(player=>record(player)&&shortText(player.id,128)&&shortText(player.name,40)&&cardArray(player.hole,2)&&integer(player.stack)&&integer(player.bet)&&integer(player.contributed)&&typeof player.folded==='boolean'&&typeof player.allIn==='boolean');
}

function token(length: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map(byte => alphabet[byte & 31]).join('');
}
function nickname(name: string) {
  const value = name.trim();
  if (!/^[\p{L}\p{N}_ -]{2,18}$/u.test(value)) throw new Error('Wpisz nick od 2 do 18 znaków: litery, cyfry, spacje, _ lub -.');
  return value;
}
function options(): { peerOptions: PeerOptions; relayConfigured: boolean } {
  // PeerJS's retired public TURN servers are not an application relay. Only a
  // deliberately configured service may be advertised as available.
  const { config } = buildIceConfiguration(import.meta.env.VITE_ICE_SERVERS);
  const result: PeerOptions = { debug: 0, config };
  const env = import.meta.env;
  if (env.VITE_PEER_HOST) {
    result.host = env.VITE_PEER_HOST;
    result.port = Number(env.VITE_PEER_PORT || 443);
    result.path = env.VITE_PEER_PATH || '/';
    result.secure = env.VITE_PEER_SECURE !== 'false';
  }
  // Real WebRTC integration tests use an actual local PeerServer. An invite URL
  // or a global on the public site cannot replace its signaling configuration.
  if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
    const local = (window as unknown as { __NEON_SIGNALING__?: PeerOptions }).__NEON_SIGNALING__;
    if (local && typeof local.host === 'string') {
      Object.assign(result, { host: local.host, port: local.port ?? 9000, path: local.path ?? '/peerjs', secure: local.secure ?? false });
      if (local.key) result.key = local.key;
      result.config = local.config ?? { iceServers: [] };
    }
  }
  const finalConfig: RTCConfiguration | undefined = result.config;
  const relayConfigured = Boolean(finalConfig?.iceServers?.some(server => {
    const urls = typeof server.urls === 'string' ? [server.urls] : Array.isArray(server.urls) ? server.urls : [];
    return urls.some(url => typeof url === 'string' && /^turns?:/i.test(url)) && typeof server.username === 'string' && Boolean(server.username.trim()) && typeof server.credential === 'string' && Boolean(server.credential.trim());
  }));
  return { peerOptions: result, relayConfigured };
}
function peerError(type: string) {
  if (type === 'peer-unavailable') return 'Nie znaleziono pokoju. Sprawdź kod i upewnij się, że gospodarz ma otwartą grę.';
  if (type === 'browser-incompatible') return 'Ta przeglądarka nie obsługuje połączeń multiplayer. Użyj aktualnego Chrome lub Firefox.';
  if (type === 'unavailable-id') return 'Ten kod pokoju jest już zajęty. Utwórz nowy pokój.';
  if (type === 'webrtc') return 'Nie udało się połączyć z graczem. Sieć może blokować połączenia; spróbuj ponownie lub użyj innej sieci.';
  return 'Nie udało się połączyć z serwerem połączeń. Sprawdź internet i spróbuj ponownie.';
}
function packet(value: unknown): Record<string, unknown> | null {
  if (!record(value)) return null;
  try { return JSON.stringify(value).length <= MAX_PACKET ? value : null; } catch { return null; }
}
function command(value: unknown): value is RoomCommand {
  if (!record(value)) return false;
  if (['sit', 'stand', 'deal', 'ping', 'challengeStart', 'exitRide'].includes(String(value.type))) return true;
  if (value.type === 'pose') return record(value.pose);
  if (value.type === 'ride') return typeof value.driverId==='string' && /^[A-Za-z0-9_-]{1,128}$/.test(value.driverId);
  if (value.type === 'cityEventClaim') return typeof value.eventId==='string' && value.eventId.length<=80;
  if (value.type === 'garage') return record(value.action) && ['buy','select','paint','upgrade'].includes(String(value.action.type));
  if (value.type === 'career') return record(value.action) && ['buyHome','furnish','storeCar','retrieveCar','repairCar','rest','contractStart','contractVisit','contractCancel'].includes(String(value.action.type));
  if (value.type === 'crewBase') return record(value.action) && ['buy','furnish'].includes(String(value.action.type));
  if (value.type === 'home') return record(value.action) && (value.action.kind==='exit'||value.action.kind==='enter'&&['canal','loft','crew'].includes(String(value.action.home)));
  if (value.type === 'casinoGame') return record(value.action) && integer(value.action.version) && ['blackjackDeal','blackjackHit','blackjackStand','blackjackDouble','blackjackForfeit','rouletteSpin'].includes(String(value.action.kind));
  if (value.type === 'tournament') return record(value.action) && ['open','join','start','next','withdraw','action'].includes(String(value.action.kind));
  if (value.type === 'cityActivity') return record(value.action) && ['join','interact','abandon'].includes(String(value.action.kind)) && typeof value.action.eventId==='string' && value.action.eventId.length<=100;
  if (value.type === 'job') return record(value.action) && ['heistStart','heistInteract','heistHack','heistRecon','heistBreach','heistAbort','raceStart','raceReady'].includes(String(value.action.kind)) && (value.action.kind!=='heistHack'||integer(value.action.symbol)&&Number(value.action.symbol)<=3) && (value.action.kind!=='heistStart'||value.action.variant===undefined||['sapphire','bank'].includes(String(value.action.variant)));
  if (value.type === 'spend') return integer(value.amount);
  if (value.type === 'action') return integer(value.version) && record(value.action) && ['fold', 'check', 'call', 'raise', 'allIn'].includes(String(value.action.type));
  return false;
}
function snapshot(value: unknown, hostId: string, youId: string, code: string): value is RoomSnapshot {
  if (!record(value) || value.hostId !== hostId || value.youId !== youId || value.code !== code || !integer(value.wallet) || !integer(value.tableVersion) || typeof value.seated !== 'boolean') return false;
  if (typeof value.worldTime !== 'number' || !Number.isFinite(value.worldTime) || value.worldTime < 0 || !Array.isArray(value.vehicles) || value.vehicles.length > 64) return false;
  for (const vehicle of value.vehicles) if (!record(vehicle) || typeof vehicle.id !== 'string' || !['sport', 'sedan', 'police'].includes(String(vehicle.kind)) || !['x', 'z', 'heading', 'speed', 'health', 'color'].every(key => typeof vehicle[key] === 'number' && Number.isFinite(vehicle[key]))) return false;
  if (value.turnDeadline !== null && (typeof value.turnDeadline !== 'number' || !Number.isFinite(value.turnDeadline))) return false;
  if (!Array.isArray(value.members) || value.members.length < 1 || value.members.length > MAX_ROOM_PLAYERS) return false;
  const ids = new Set<string>();
  for (const member of value.members) {
    if (!record(member) || typeof member.id !== 'string' || ids.has(member.id) || typeof member.name !== 'string' || member.name.length > 18 || !integer(member.slot) || Number(member.slot) >= MAX_ROOM_PLAYERS || !record(member.pose)) return false;
    ids.add(member.id);
  }
  if (!ids.has(youId) || !ids.has(hostId)) return false;
  const challenge=value.challenge;
  if(!record(challenge)||!['idle','active','completed','failed'].includes(String(challenge.status))||!integer(challenge.run)||typeof challenge.eligible!=='boolean'||!integer(challenge.checkpoint)||Number(challenge.checkpoint)>3||challenge.total!==3||challenge.reward!==CREW_REWARD)return false;
  if(!integer(challenge.remainingMs)||Number(challenge.remainingMs)>CREW_DURATION_MS||!integer(challenge.cooldownMs)||Number(challenge.cooldownMs)>CREW_COOLDOWN_MS||!Array.isArray(challenge.contributors)||challenge.contributors.length>MAX_ROOM_PLAYERS||new Set(challenge.contributors).size!==challenge.contributors.length)return false;
  if(!challenge.contributors.every(id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id)))return false;
  if(challenge.status==='active') {
    const target=CREW_CHECKPOINTS[Number(challenge.checkpoint)];
    if(!target||!record(challenge.target)||challenge.target.x!==target.x||challenge.target.z!==target.z||challenge.cooldownMs!==0)return false;
  } else if(challenge.target!==null||challenge.remainingMs!==0||(challenge.status==='completed'&&challenge.checkpoint!==3)||(challenge.status==='idle'&&(challenge.run!==0||challenge.eligible||challenge.checkpoint!==0||challenge.cooldownMs!==0||challenge.contributors.length!==0)))return false;
  if(challenge.status!=='idle'&&Number(challenge.run)<1)return false;
  if(typeof value.cityEventClaimed!=='boolean'||!record(value.garage)||!Array.isArray(value.garage.owned)||value.garage.owned.length<1||value.garage.owned.length>3||!value.garage.owned.every(id=>['stratus','sentinel','comet'].includes(String(id)))||!value.garage.owned.includes(value.garage.selected)||!record(value.garage.cars))return false;
  for(const id of value.garage.owned){
    const car=value.garage.cars[String(id)];
    if(!record(car)||!integer(car.paint)||Number(car.paint)>0xffffff||!['engine','brakes','nitro'].every(key=>integer(car[key])&&Number(car[key])<=3))return false;
  }
  const career=value.career,base=value.crewBase,effect=value.careerEffect;
  if(!record(career)||!boundedInteger(career.reputation,100000)||!Array.isArray(career.awarded)||career.awarded.length>4096||!career.awarded.every(source=>shortText(source,100))||!Array.isArray(career.ownedHomes)||career.ownedHomes.length>2||new Set(career.ownedHomes).size!==career.ownedHomes.length||!career.ownedHomes.every(id=>['canal','loft'].includes(String(id)))||!record(career.furniture)||!record(career.storedCars)||!integer(career.contractSerial)||!integer(career.completedContracts))return false;
  for(const items of Object.values(career.furniture))if(!Array.isArray(items)||items.length>3||!items.every(item=>['sofa','neon','workbench'].includes(String(item))))return false;
  for(const [car,home] of Object.entries(career.storedCars))if(!['stratus','sentinel','comet'].includes(car)||!career.ownedHomes.includes(home))return false;
  if(career.activeContract!==null){const active=career.activeContract;if(!record(active)||!['nova','milo','vera'].includes(String(active.id))||!integer(active.run)||!boundedInteger(active.stage,2)||!finiteNumber(active.startedAt)||!finiteNumber(active.deadline)||active.deadline<=active.startedAt)return false;}
  if(!record(base)||typeof base.owned!=='boolean'||!Array.isArray(base.furniture)||base.furniture.length>3||!base.furniture.every(item=>['sofa','neon','workbench'].includes(String(item)))||(base.purchasedBy!==null&&!idValue(base.purchasedBy)))return false;
  if(!record(effect)||!integer(effect.version)||![null,'canal','loft'].includes(effect.home as null|string)||(effect.effect!==null&&!record(effect.effect)))return false;
  const games=value.casinoGames;
  if(!record(games)||!integer(games.version)||!record(games.blackjack)||!record(games.roulette))return false;
  const bj=games.blackjack,roulette=games.roulette;
  if(!['idle','playing','settled'].includes(String(bj.status))||!cardArray(bj.player,12)||!cardArray(bj.dealer,12)||!boundedInteger(bj.stake,1000)||!boundedInteger(bj.payout,2500)||![null,'win','loss','push','blackjack'].includes(bj.outcome as null|string)||typeof bj.canDouble!=='boolean'||!shortText(bj.message))return false;
  if(roulette.number!==null&&!boundedInteger(roulette.number,36)||![null,'red','black','odd','even','straight'].includes(roulette.choice as null|string)||!boundedInteger(roulette.stake,500)||!boundedInteger(roulette.payout,18000)||!Array.isArray(roulette.history)||roulette.history.length>12||!roulette.history.every(number=>boundedInteger(number,36))||!shortText(roulette.message))return false;
  const tournament=value.tournament;
  if(!record(tournament)||!['idle','registration','playing','completed'].includes(String(tournament.status))||!integer(tournament.version)||tournament.buyIn!==250||!boundedInteger(tournament.pot,1000)||!boundedInteger(tournament.level,8)||tournament.handLimit!==24||!Array.isArray(tournament.participants)||tournament.participants.length>4||!shortText(tournament.message)||(tournament.turnDeadline!==null&&!finiteNumber(tournament.turnDeadline))||!Array.isArray(tournament.winnerIds)||tournament.winnerIds.length>4||!tournament.winnerIds.every(idValue)||!publicHand(tournament.poker))return false;
  for(const person of tournament.participants)if(!record(person)||!idValue(person.id)||!shortText(person.name,18)||!boundedInteger(person.chips,4000)||!['registered','playing','eliminated','withdrawn','winner'].includes(String(person.status)))return false;
  const activity=value.cityActivities;
  if(!record(activity)||!(activity.id===null||shortText(activity.id,100))||![null,'convoy','wanted','courier'].includes(activity.kind as null|string)||!['upcoming','available','active','completed','expired'].includes(String(activity.status))||![null,'pickup','checkpoint','delivery'].includes(activity.stage as null|string)||!shortText(activity.title,100)||!shortText(activity.instruction)||!boundedInteger(activity.reward,650)||!finiteNumber(activity.remainingMs)||activity.remainingMs<0||!finiteNumber(activity.nextInMs)||activity.nextInMs<0||!boundedInteger(activity.progress,100)||!['joined','eligible','canJoin','canInteract'].every(key=>typeof activity[key]==='boolean')||!['target','pickup','checkpoint','drop'].every(key=>pointOrNull(activity[key]))||!Array.isArray(activity.participants)||activity.participants.length>4)return false;
  for(const person of activity.participants)if(!record(person)||!idValue(person.id)||!shortText(person.name,18)||!boundedInteger(person.progress,100))return false;
  const jobs=value.jobs;
  if(!record(jobs)||![null,'heist','race'].includes(jobs.active as null|string)||!record(jobs.heist)||!record(jobs.race))return false;
  const heist=jobs.heist,race=jobs.race;
  if(!['idle','gather','hack','recon','alarm','breach','escape','completed','failed'].includes(String(heist.status))||!['idle','lobby','countdown','running','completed','failed'].includes(String(race.status)))return false;
  if(!integer(heist.run)||!integer(race.run)||!integer(heist.remainingMs)||!integer(heist.cooldownMs)||!integer(race.remainingMs)||!integer(race.countdownMs)||!integer(race.cooldownMs)||!Array.isArray(heist.sequence)||heist.sequence.length>3||!heist.sequence.every(symbol=>integer(symbol)&&Number(symbol)<=3)||!Array.isArray(race.participants)||race.participants.length>MAX_ROOM_PLAYERS||!Array.isArray(race.ready)||race.ready.length>MAX_ROOM_PLAYERS)return false;
  if(typeof heist.eligible!=='boolean'||!['driver','hacker','lookout','breacher','spectator'].includes(String(heist.role))||!integer(heist.progress)||Number(heist.progress)>3||!integer(heist.alarm)||Number(heist.alarm)>3||!Array.isArray(heist.gathered)||heist.gathered.length>MAX_ROOM_PLAYERS||!heist.gathered.every(idValue)||!pointOrNull(heist.target)||typeof heist.message!=='string'||heist.message.length>600)return false;
  if(heist.role!=='hacker'&&heist.sequence.length>0)return false;
  if(![heist.driverId,heist.hackerId].every(id=>id===null||idValue(id)))return false;
  if(typeof race.eligible!=='boolean'||typeof race.canReady!=='boolean'||!race.ready.every(idValue)||!pointOrNull(race.target)||!pointOrNull(race.grid)||typeof race.message!=='string'||race.message.length>600)return false;
  for(const participant of race.participants){
    if(!record(participant)||!idValue(participant.id)||typeof participant.name!=='string'||participant.name.length>18||!integer(participant.checkpoint)||Number(participant.checkpoint)>4||!['waiting','ready','racing','finished','dnf','spectator'].includes(String(participant.status))||!integer(participant.prize)||Number(participant.prize)>500)return false;
    if(participant.finishedMs!==null&&!integer(participant.finishedMs)||participant.rank!==null&&(!integer(participant.rank)||Number(participant.rank)<1||Number(participant.rank)>4))return false;
  }
  for(const member of value.members){
    const pose=(member as Record<string,unknown>).pose;
    if(!record(pose)||!['x','z','heading'].every(key=>typeof pose[key]==='number'&&Number.isFinite(pose[key]))||!['drive','foot'].includes(String(pose.mode))||![null,'casino'].includes(pose.interior as null|string))return false;
    if(pose.homeId!==undefined&&pose.homeId!==null&&!['canal','loft','crew'].includes(String(pose.homeId)))return false;
    if(pose.passengerOf!==undefined&&pose.passengerOf!==null&&(typeof pose.passengerOf!=='string'||!ids.has(pose.passengerOf)||pose.passengerOf===(member as Record<string,unknown>).id||pose.mode!=='foot'||pose.interior!==null||pose.vehicle!==null))return false;
  }
  if(!publicHand(value.poker))return false;
  return true;
}

interface Guest {
  connection: DataConnection; joined: boolean; sequence: number; lastSeen: number;
  windowAt: number; messages: number; startedAt: number; openedAt: number | null;
}
interface Pending { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> | null; phase: ConnectionPhase }

/** Browser-hosted rooms: the host alone owns poker state and personalizes each
 * data-channel response. The public signaling service never handles game data. */
export class MultiplayerClient implements MultiplayerSession {
  private current: MultiplayerState = { status: 'offline', message: '', snapshot: null };
  private listeners = new Set<(state: MultiplayerState) => void>();
  private peer: Peer | null = null;
  private authority: RoomAuthority | null = null;
  private guests = new Map<string, Guest>();
  private hostConnection: DataConnection | null = null;
  private ownId = '';
  private hostId = '';
  private roomCode = '';
  private sequence = 0;
  private serverSequence = 0;
  private hostLastSeen = 0;
  private queuedPose: OnlinePose | null = null;
  private epoch = 0;
  private pending: Pending | null = null;
  private pumpTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private watchTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private relayConfigured = false;

  get state() { return clone(this.current); }
  get isHost() { return this.authority !== null; }
  get id() { return this.ownId; }
  subscribe(listener: (state: MultiplayerState) => void) {
    this.listeners.add(listener); listener(this.state);
    return () => { this.listeners.delete(listener); };
  }
  create(name: string) {
    return this.start(true, name, token(8));
  }
  join(code: string, name: string) {
    return this.start(false, name, code.trim().toUpperCase().replace(/[\s-]/g, ''));
  }
  leave() {
    if (this.authority) for (const guest of this.guests.values()) this.send(guest.connection, { type: 'closed', reason: 'Gospodarz zakończył pokój. Możesz utworzyć nowy.' });
    this.clean('Łączenie zostało anulowane.');
    this.publish({ status: 'offline', message: '', snapshot: null });
  }
  updatePose(pose: OnlinePose) { if (this.current.status === 'online') this.queuedPose = clone(pose); }
  sit() { this.issue({ type: 'sit' }); }
  stand() { this.issue({ type: 'stand' }); }
  deal() { this.issue({ type: 'deal' }); }
  action(action: PokerAction) {
    if (this.current.snapshot) this.issue({ type: 'action', action, version: this.current.snapshot.tableVersion });
  }
  spend(amount: number) { this.issue({ type: 'spend', amount }); }
  startChallenge() { this.issue({ type: 'challengeStart' }); }
  garage(action:GarageAction) { this.issue({type:'garage',action}); }
  job(action:JobAction) { this.issue({type:'job',action}); }
  career(action:CareerAction) { this.issue({type:'career',action}); }
  crewBase(action:CrewBaseAction) { this.issue({type:'crewBase',action}); }
  home(action:HomeAction) { this.issue({type:'home',action}); }
  casinoGame(action:CasinoGameAction) { this.issue({type:'casinoGame',action}); }
  tournament(action:TournamentAction) { this.issue({type:'tournament',action}); }
  cityActivity(action:CityEventAction) { this.issue({type:'cityActivity',action}); }
  claimCityEvent() { const event=this.current.snapshot&&cityEventAt(this.current.snapshot.worldTime);if(event)this.issue({type:'cityEventClaim',eventId:event.id}); }
  ride(driverId:string) { this.issue({type:'ride',driverId}); }
  exitRide() { this.issue({type:'exitRide'}); }

  private start(host: boolean, rawName: string, code: string): Promise<void> {
    this.clean('Poprzednie łączenie zostało anulowane.');
    let name: string;
    let peerOptions: PeerOptions;
    this.relayConfigured = false;
    try {
      name = nickname(rawName);
      if (!/^[A-Z2-9]{8}$/.test(code)) throw new Error('Kod pokoju musi mieć 8 liter lub cyfr.');
      if (!globalThis.RTCPeerConnection) throw new Error('Ta przeglądarka nie obsługuje połączeń multiplayer.');
      const configured = options();
      peerOptions = configured.peerOptions; this.relayConfigured = configured.relayConfigured;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nieprawidłowy nick lub kod pokoju.';
      this.publish({ status: 'error', message, snapshot: null });
      return Promise.reject(new Error(message));
    }
    this.roomCode = code; this.hostId = `neonc-${code}`;
    this.ownId = host ? this.hostId : `neonc-player-${token(16)}`;
    this.publish({ status: 'connecting', message: host ? 'Tworzenie pokoju…' : 'Łączenie z pokojem…', snapshot: null });
    const epoch = this.epoch;
    return new Promise<void>((resolve, reject) => {
      this.pending = { resolve, reject, timer: null, phase: 'signaling' };
      this.armConnectionPhase('signaling');
      try {
        const peer = new Peer(this.ownId, peerOptions); this.peer = peer;
        let opened = false;
        peer.on('open', () => {
          if (this.epoch !== epoch) return;
          if (this.reconnectTimer !== null) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
          this.reconnectAttempt = 0;
          if (opened) { this.publish({ ...this.current, message: '' }); return; }
          opened = true;
          if (host) {
            try { this.authority = new RoomAuthority(code, this.ownId, name); } catch (error) { this.fail(error instanceof Error ? error.message : 'Nie udało się utworzyć pokoju.'); return; }
            this.acceptSnapshot(this.authority.snapshot(this.ownId), '');
            this.startTimers(epoch); this.complete();
          } else {
            this.armConnectionPhase('rtc');
            const connection = peer.connect(this.hostId, { reliable: true, serialization: 'json', metadata: { protocol: ROOM_PROTOCOL } });
            this.hostConnection = connection; this.hostLastSeen = Date.now();
            connection.on('open', () => {
              if (this.epoch !== epoch || this.hostConnection !== connection) return;
              this.armConnectionPhase('admission');
              this.send(connection, { type: 'hello', protocol: ROOM_PROTOCOL, name, seq: ++this.sequence });
            });
            connection.on('data', data => { if (this.epoch === epoch && this.hostConnection === connection) this.receiveHost(data); });
            connection.on('close', () => {
              if (this.epoch !== epoch) return;
              this.fail(this.pending?.phase === 'rtc' ? this.rtcFailure() : 'Połączenie z gospodarzem zostało przerwane. Pokój zakończył działanie.');
            });
            connection.on('error', error => {
              if (this.epoch !== epoch) return;
              const negotiating = this.current.status === 'connecting' && (error.type === 'negotiation-failed' || this.pending?.phase === 'rtc');
              this.fail(negotiating ? this.rtcFailure() : 'Nie udało się utrzymać połączenia z gospodarzem. Spróbuj dołączyć ponownie.');
            });
            this.startTimers(epoch);
          }
        });
        peer.on('connection', connection => {
          if (this.epoch !== epoch || !host || !this.authority) { connection.close(); return; }
          this.receiveConnection(connection, epoch);
        });
        peer.on('call', call => call.close());
        peer.on('disconnected', () => {
          if (this.epoch !== epoch) return;
          if (this.current.status !== 'online') { this.fail(peerError('network')); return; }
          // Established RTC channels survive a temporary signaling outage.
          this.publish({ ...this.current, message: SIGNALING_UNAVAILABLE_MESSAGE });
          this.queueReconnect(epoch);
        });
        peer.on('error', error => {
          if (this.epoch !== epoch) return;
          if (this.current.status !== 'online' || ['browser-incompatible', 'invalid-id', 'invalid-key', 'ssl-unavailable'].includes(error.type)) this.fail(peerError(error.type));
          // A failed incoming negotiation must not terminate the host's other
          // established connections; their own close/heartbeat handles loss.
        });
        peer.on('close', () => { if (this.epoch === epoch) this.fail('Połączenie multiplayer zostało zamknięte.'); });
      } catch { this.fail('Nie udało się uruchomić połączenia multiplayer w tej przeglądarce.'); }
    });
  }
  private rtcFailure() {
    return this.relayConfigured
      ? 'Nie udało się zestawić połączenia między graczami. Sprawdź dostępność skonfigurowanego serwera TURN lub ograniczenia sieci.'
      : 'Nie udało się zestawić połączenia między graczami. Gra nie ma skonfigurowanego serwera pośredniczącego TURN; niektóre sieci wymagają go do połączenia z gospodarzem.';
  }
  private armConnectionPhase(phase: ConnectionPhase) {
    const pending = this.pending;
    if (!pending) return;
    if (pending.timer !== null) clearTimeout(pending.timer);
    pending.phase = phase;
    const epoch = this.epoch;
    pending.timer = setTimeout(() => {
      if (this.epoch === epoch && this.pending === pending) this.fail(phase === 'rtc' ? this.rtcFailure() : CONNECTION_TIMEOUT_MESSAGE[phase]);
    }, CONNECTION_TIMEOUT_MS[phase]);
    this.publish({ status: 'connecting', message: CONNECTION_PROGRESS[phase], snapshot: null });
  }
  private queueReconnect(epoch: number) {
    if (this.epoch !== epoch || this.current.status !== 'online' || !this.peer || this.peer.destroyed || this.reconnectTimer !== null) return;
    const delay = Math.min(2000 * 2 ** Math.min(this.reconnectAttempt, 3), 15000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      const peer = this.peer;
      if (this.epoch !== epoch || this.current.status !== 'online' || !peer || peer.destroyed || peer.open) return;
      this.reconnectAttempt++;
      // Arm the watchdog before reconnect(): synchronous failure events must not
      // schedule another attempt alongside this one. A stalled signaling socket
      // is closed without disturbing the existing RTC data channels.
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        if (this.epoch !== epoch || this.peer !== peer || this.current.status !== 'online' || peer.open) return;
        this.queueReconnect(epoch);
        if (!peer.disconnected && !peer.destroyed) peer.disconnect();
      }, CONNECTION_TIMEOUT_MS.signaling);
      if (!peer.disconnected) peer.disconnect();
      try { peer.reconnect(); } catch { /* The watchdog retries with backoff. */ }
    }, delay);
  }
  private receiveConnection(connection: DataConnection, epoch: number) {
    if (this.guests.has(connection.peer) || this.guests.size >= MAX_ROOM_PLAYERS - 1) {
      connection.on('open', () => { this.send(connection, { type: 'rejected', reason: 'Pokój jest pełny lub masz już w nim otwarte połączenie.' }); connection.close({ flush: true }); });
      return;
    }
    const now = Date.now();
    const guest: Guest = { connection, joined: false, sequence: 0, lastSeen: now, windowAt: now, messages: 0, startedAt: now, openedAt: connection.open ? now : null };
    this.guests.set(connection.peer, guest);
    const current = () => this.epoch === epoch && this.guests.get(connection.peer) === guest;
    connection.on('open', () => { if (current()) guest.openedAt = guest.lastSeen = Date.now(); });
    connection.on('data', data => {
      if (!current() || !this.authority) return;
      const now = Date.now();
      if (now - guest.windowAt >= 1000) { guest.windowAt = now; guest.messages = 0; }
      if (++guest.messages > 80) { this.drop(guest, 'Zbyt wiele wiadomości. Połącz się ponownie.'); return; }
      const message = packet(data);
      if (!message || !integer(message.seq) || Number(message.seq) <= guest.sequence) return;
      guest.sequence = Number(message.seq); guest.lastSeen = now;
      if (!guest.joined) {
        if (message.type !== 'hello' || message.protocol !== ROOM_PROTOCOL || typeof message.name !== 'string') { this.drop(guest, 'Ta wersja gry nie może dołączyć do pokoju. Odśwież stronę.'); return; }
        const result = this.authority.join(connection.peer, message.name);
        if (!result.ok) { this.drop(guest, result.reason); return; }
        guest.joined = true; this.broadcast(); return;
      }
      if (message.type !== 'command' || !command(message.command)) return;
      const result = this.authority.command(connection.peer, message.command, now);
      // Movement is broadcast on the room's common 10 Hz pump, rather than
      // multiplying outgoing snapshots by the number of players.
      if (result.ok && (message.command.type === 'pose' || message.command.type === 'ping')) return;
      // command also advances an expired turn, even if its stale action fails.
      this.broadcast(connection.peer, result.ok ? '' : result.reason);
    });
    connection.on('close', () => { if (current()) this.drop(guest); });
    connection.on('error', () => { if (current()) this.drop(guest); });
  }
  private receiveHost(data: unknown) {
    const message = packet(data);
    if (!message) { this.fail('Gospodarz wysłał nieprawidłowe dane pokoju.'); return; }
    if ((message.type === 'rejected' || message.type === 'closed') && typeof message.reason === 'string') { this.fail(message.reason.slice(0, 300)); return; }
    if (message.type !== 'snapshot') return;
    if (message.protocol !== ROOM_PROTOCOL) { this.fail('Gospodarz ma inną wersję gry. Odśwież stronę u obu osób i utwórz nowy pokój.'); return; }
    if (!integer(message.seq) || Number(message.seq) <= this.serverSequence) return;
    if (!snapshot(message.snapshot, this.hostId, this.ownId, this.roomCode)) { this.fail('Dane pokoju są niezgodne z tą wersją gry. Odśwież stronę i dołącz ponownie.'); return; }
    this.serverSequence = Number(message.seq); this.hostLastSeen = Date.now();
    this.acceptSnapshot(message.snapshot, typeof message.notice === 'string' ? message.notice.slice(0, 300) : undefined); this.complete();
  }
  private issue(value: RoomCommand) {
    if (this.current.status !== 'online') return;
    if (this.authority) {
      const result = this.authority.command(this.ownId, value, Date.now());
      if (!result.ok || (value.type !== 'pose' && value.type !== 'ping')) this.broadcast(this.ownId, result.ok ? '' : result.reason);
    } else if (this.hostConnection) this.send(this.hostConnection, { type: 'command', command: value, seq: ++this.sequence });
  }
  private startTimers(epoch: number) {
    this.pumpTimer = setInterval(() => {
      if (this.epoch !== epoch || this.current.status !== 'online') return;
      const pose = this.queuedPose; this.queuedPose = null;
      if (pose) this.issue({ type: 'pose', pose });
      if (this.authority) this.broadcast();
    }, 100);
    this.heartbeatTimer = setInterval(() => {
      if (this.epoch !== epoch) return;
      if (this.current.status === 'online') this.issue({ type: 'ping' });
      if (this.current.status === 'online' && !this.authority && this.hostConnection && Date.now() - this.hostLastSeen > STALE_MS) this.fail('Gospodarz nie odpowiada. Pokój zakończył działanie.');
    }, 2000);
    this.watchTimer = setInterval(() => {
      if (this.epoch !== epoch || !this.authority) return;
      const now = Date.now();
      for (const guest of [...this.guests.values()]) {
        const start = guest.joined ? guest.lastSeen : guest.openedAt ?? guest.startedAt;
        const timeout = guest.joined ? STALE_MS : guest.openedAt === null ? CONNECTION_TIMEOUT_MS.rtc : CONNECTION_TIMEOUT_MS.admission;
        if (now - start > timeout) this.drop(guest, 'Połączenie wygasło. Spróbuj dołączyć ponownie.');
      }
      if (this.authority?.tick(Date.now())) this.broadcast();
    }, 500);
  }
  private broadcast(noticeId?: string, notice?: string) {
    if (!this.authority) return;
    this.acceptSnapshot(this.authority.snapshot(this.ownId), noticeId === this.ownId ? notice : undefined);
    for (const [id, guest] of this.guests) {
      if (!guest.joined || !guest.connection.open) continue;
      const payload: Record<string, unknown> = { type: 'snapshot', protocol: ROOM_PROTOCOL, seq: ++this.serverSequence, snapshot: this.authority.snapshot(id) };
      if (id === noticeId && notice !== undefined) payload.notice = notice;
      // Poses are replaceable. Do not queue obsolete snapshots for a slow peer.
      if (guest.connection.dataChannel?.bufferedAmount > 262144) continue;
      this.send(guest.connection, payload);
    }
  }
  private acceptSnapshot(value: RoomSnapshot, notice?: string) {
    const previous = this.current.snapshot;
    const changed = !previous || previous.tableVersion !== value.tableVersion || previous.wallet !== value.wallet || previous.seated !== value.seated || previous.challenge.status !== value.challenge.status || previous.challenge.checkpoint !== value.challenge.checkpoint || JSON.stringify(previous.garage)!==JSON.stringify(value.garage) || previous.jobs.heist.status!==value.jobs.heist.status || previous.jobs.race.status!==value.jobs.race.status || previous.members.find(member=>member.id===previous.youId)?.pose.passengerOf!==value.members.find(member=>member.id===value.youId)?.pose.passengerOf || JSON.stringify(previous.career)!==JSON.stringify(value.career) || JSON.stringify(previous.crewBase)!==JSON.stringify(value.crewBase) || previous.careerEffect.version!==value.careerEffect.version || previous.casinoGames.version!==value.casinoGames.version || previous.tournament.version!==value.tournament.version || previous.cityActivities.id!==value.cityActivities.id || previous.cityActivities.status!==value.cityActivities.status || previous.cityActivities.stage!==value.cityActivities.stage || previous.cityActivities.holderId!==value.cityActivities.holderId || previous.members.find(member=>member.id===previous.youId)?.pose.homeId!==value.members.find(member=>member.id===value.youId)?.pose.homeId;
    this.publish({ status: 'online', message: notice ?? (changed ? '' : this.current.message), snapshot: clone(value) });
  }
  private drop(guest: Guest, reason?: string) {
    if (this.guests.get(guest.connection.peer) !== guest) return;
    this.guests.delete(guest.connection.peer);
    if (reason && guest.connection.open) this.send(guest.connection, { type: 'rejected', reason });
    if (guest.joined) this.authority?.leave(guest.connection.peer);
    guest.connection.close({ flush: true }); this.broadcast();
  }
  private send(connection: DataConnection, message: unknown) {
    if (!connection.open) return;
    try {
      const result = connection.send(message);
      if (result && typeof result.catch === 'function') void result.catch(() => { connection.close(); });
    } catch { connection.close(); }
  }
  private publish(value: MultiplayerState) {
    const signaling = this.peer?.open ? 'online' : value.status === 'connecting' ? 'connecting' : this.peer ? 'reconnecting' : undefined;
    this.current = { ...value, signaling, relayConfigured: this.relayConfigured, message: value.status === 'online' && signaling === 'reconnecting' ? SIGNALING_UNAVAILABLE_MESSAGE : value.message };
    for (const listener of this.listeners) listener(this.state);
  }
  private complete() {
    const pending = this.pending; this.pending = null;
    if (pending) { if (pending.timer !== null) clearTimeout(pending.timer); pending.resolve(); }
  }
  private fail(message: string) {
    this.clean(message); this.publish({ status: 'error', message, snapshot: null });
  }
  private clean(reason: string) {
    this.epoch++;
    if (this.pumpTimer !== null) clearInterval(this.pumpTimer);
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
    if (this.watchTimer !== null) clearInterval(this.watchTimer);
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.pumpTimer = this.heartbeatTimer = this.watchTimer = null; this.reconnectTimer = null;
    const pending = this.pending; this.pending = null;
    if (pending) { if (pending.timer !== null) clearTimeout(pending.timer); pending.reject(new Error(reason)); }
    this.hostConnection?.close(); this.hostConnection = null;
    for (const guest of this.guests.values()) guest.connection.close();
    this.guests.clear(); this.peer?.destroy(); this.peer = null; this.authority = null;
    this.ownId = this.hostId = this.roomCode = ''; this.sequence = this.serverSequence = 0; this.queuedPose = null;
    this.reconnectAttempt = 0;
  }
}

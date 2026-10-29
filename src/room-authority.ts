import { CASINO } from './casino-location';
import { BUILDINGS, ROADS, WORLD_BOUNDS } from './model';
import { createGarage, garageAction, garageVehicle, GARAGE_LOCATION, type GarageState } from './garage';
import { OnlineJobs } from './online-jobs';
import { cityEventAt } from './city-life';
import { CityEvents } from './city-events';
import { CasinoGames } from './casino-games';
import { CASINO_GAMES } from './casino-games-location';
import { PokerTournament } from './poker-tournament';
import { appearanceAction, createAppearance, type AppearanceState } from './appearance';
import { HostPhone } from './phone';
import { Factions } from './factions';
import { CampaignController } from './campaign';
import { MobilityTrials, WATER_BOUNDS, DOCK } from './mobility';
import { awardReputation, careerAction, createCareer, createCrewBase, crewBaseAction, homeStreetExit, CREW_BASE, HOME_ROOM, HOMES, type CareerState, type CrewBaseState } from './career';
import { act, createPokerTable, dealHand, foldPokerSeat, legalActions } from './poker';
import { CREW_CHECKPOINTS, CREW_COOLDOWN_MS, CREW_DURATION_MS, CREW_REWARD, MAX_ROOM_PLAYERS, ONLINE_BUY_IN, ONLINE_TURN_MS } from './multiplayer-model';
import type { CrewChallenge, HomeAction, OnlineCareerEffect, OnlineDeliveryEffect, OnlineMember, OnlinePose, OnlineVehicle, RoomCommand, RoomResult, RoomSnapshot } from './multiplayer-model';
import type { PokerAction, PokerSeat, PokerState } from './poker-model';

interface Member { view: OnlineMember; wallet: number; lastSpend: number; garage: GarageState; claimedEvent: string | null; career:CareerState; careerEffect:OnlineCareerEffect; casinoGames:CasinoGames; homeReturn:OnlinePose|null; appearance:AppearanceState; deliveryEffect:OnlineDeliveryEffect }
const yes: RoomResult = {ok:true};
const no=(reason:string):RoomResult=>({ok:false,reason});
const handActive=(s:PokerState)=>s.phase!=='waiting'&&s.phase!=='showdown';
const nickname=(value:unknown)=>typeof value==='string'&&!/[\u0000-\u001f\u007f]/.test(value)?value.trim().replace(/\s+/g,' '):'';
const validName=(value:string)=>value.length>=2&&value.length<=18&&/^[\p{L}\p{N} _.-]+$/u.test(value);
const validId=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=128&&/^[A-Za-z0-9_-]+$/.test(value);
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const emptySeat=(index:number):PokerSeat=>({id:`empty-${index}`,name:'Wolne miejsce',stack:0,hole:[],folded:true,allIn:false,bet:0,contributed:0,acted:true});

/** The browser hosting a friends' room owns its table, wallets and turn clock. */
export class RoomAuthority {
  readonly code: string;
  readonly hostId: string;
  private readonly people=new Map<string,Member>();
  private seats:(string|null)[]=[null,null,null,null];
  private table:PokerState;
  private version=0;
  private deadline:number|null=null;
  private now=0;
  private epoch:number|null=null;
  private readonly vehicles=new Map<string,OnlineVehicle>();
  private challengeStatus:CrewChallenge['status']='idle';
  private challengeRun=0;
  private checkpoint=0;
  private challengeDeadline=0;
  private challengeReadyAt=0;
  private readonly challengeEligible=new Set<string>();
  private readonly contributors=new Set<string>();
  private readonly jobs:OnlineJobs;
  private readonly cityActivities=new CityEvents();
  private readonly tournament:PokerTournament;
  private crewBase:CrewBaseState=createCrewBase();
  private readonly phone:HostPhone;
  private readonly factions=new Factions();
  private readonly campaign:CampaignController;
  private readonly mobility=new MobilityTrials();

  constructor(code:string,hostId:string,name:string,seed?:number) {
    if(typeof code!=='string'||!/^[A-Z2-9]{8}$/i.test(code)||!validId(hostId)||!validName(nickname(name)))throw new Error('Niepoprawny kod pokoju lub pseudonim.');
    this.code=code.toUpperCase();this.hostId=hostId;this.jobs=new OnlineJobs(hostId);this.tournament=new PokerTournament(hostId,seed);this.phone=new HostPhone(hostId);this.campaign=new CampaignController(hostId);
    this.table=createPokerTable(seed,ONLINE_BUY_IN);this.table.players=this.table.players.map((_,i)=>emptySeat(i));
    this.join(hostId,name);
  }

  join(id:string,name:string):RoomResult {
    const clean=nickname(name);
    if(!validId(id)||!validName(clean))return no('Wpisz pseudonim: 2–18 liter, cyfr, spacji, kropek lub myślników.');
    if(this.people.has(id))return no('Ten gracz jest już w pokoju.');
    if(this.people.size>=MAX_ROOM_PLAYERS)return no('Pokój jest pełny. Mogą grać najwyżej 4 osoby.');
    const occupied=new Set([...this.people.values()].map(p=>p.view.slot));
    const slot=[0,1,2,3].find(index=>!occupied.has(index))!;
    const z=68-slot*7,color=[0xded8cb,0x8f78bf,0x63a9a2,0xe1a86b][slot];
    const pose:OnlinePose={x:0,z,heading:0,mode:'drive',interior:null,seated:false,vehicle:{id:'stratus',kind:'sport',x:0,z,heading:0,color,speed:0,health:100}};
    const appearance=createAppearance();
    this.people.set(id,{view:{id,name:clean,slot,pose,appearance:structuredClone(appearance)},wallet:1250,lastSpend:-Infinity,garage:createGarage(),claimedEvent:null,career:createCareer(),careerEffect:{version:0,effect:null,home:null},casinoGames:new CasinoGames(),homeReturn:null,appearance,deliveryEffect:{version:0,target:null}});
    return yes;
  }

  leave(id:string):void {
    if(!this.people.has(id))return;
    this.releasePassengers(id);
    this.stand(id);
    const car=this.people.get(id)?.view.pose.vehicle;
    if(car&&car.id!=='stratus')this.vehicles.set(car.id,{...car,...(car.kind==='boat'?DOCK.mooring:{}),speed:0});
    this.challengeEligible.delete(id);
    this.people.delete(id);this.updateJobs();this.updateExpansions();
  }

  command(id:string,command:RoomCommand,now=Date.now()):RoomResult {
    this.tick(now);
    const member=this.people.get(id);
    if(!member)return no('Nie należysz do tego pokoju.');
    if(!command||typeof command!=='object'||typeof command.type!=='string')return no('Niepoprawne polecenie pokoju.');
    switch(command.type) {
      case 'ping': return yes;
      case 'ride': return this.ride(id,member,command.driverId);
      case 'exitRide': { const result=this.exitRide(member);this.updateJobs();return result; }
      case 'garage': {
        if(this.jobs.busy||this.challengeStatus==='active')return no('Dokończ aktywność ekipy przed zmianą samochodu.');
        const pose=member.view.pose;
        if(pose.interior||pose.homeId||pose.seated||pose.passengerOf||Math.hypot(pose.x-GARAGE_LOCATION.x,pose.z-GARAGE_LOCATION.z)>6||Math.abs(pose.vehicle?.speed??0)>1.5)return no('Podejdź do warsztatu lub zaparkuj przy jego bramie.');
        if(command.action&&typeof command.action==='object'&&command.action.type==='select'&&typeof command.action.car==='string'&&member.career.storedCars[command.action.car])return no('Ten samochód jest zabezpieczony przy mieszkaniu. Odbierz go na swoim parkingu.');
        const result=garageAction(member.garage,member.wallet,command.action,member.career.reputation);
        if(!result.ok)return no(result.reason);
        member.garage=result.garage;member.wallet=result.wallet;
        if(pose.vehicle?.id==='stratus')Object.assign(pose.vehicle,garageVehicle(member.garage));
        return yes;
      }
      case 'appearance': {
        const result=appearanceAction(member.appearance,member.wallet,command.action);
        if(!result.ok)return no(result.reason);
        member.appearance=result.appearance;member.wallet=result.wallet;member.view.appearance=structuredClone(result.appearance);return yes;
      }
      case 'phone': {
        const busy=this.jobs.busy||this.challengeStatus==='active'||this.tournament.contains(id)||this.campaign.snapshot(id).status==='active'||this.mobility.snapshot(id).status==='running'||this.factions.snapshot(id).job.status==='active';
        const result=this.phone.command(id,command.action,this.members(),member.wallet,this.now,{stored:Boolean(member.career.storedCars[member.garage.selected]),busy,occupiedByOther:false});
        if(!result.ok)return no(result.reason);member.wallet=result.wallet;
        if(result.delivery)member.deliveryEffect={version:member.deliveryEffect.version+1,target:{...result.delivery}};
        return yes;
      }
      case 'faction': {
        if(command.action?.kind==='start'&&(this.jobs.busy||this.challengeStatus==='active'||this.tournament.contains(id)||this.campaign.snapshot(id).status==='active'||this.mobility.snapshot(id).status==='running'))return no('Najpierw dokończ bieżące zlecenie lub próbę czasową.');
        const result=this.factions.command(id,command.action,this.members(),this.now);this.updateExpansions();return result;
      }
      case 'campaign': {
        if(command.action&&['start','continue','retry','restart'].includes(command.action.kind)&&(this.jobs.busy||this.challengeStatus==='active'||[...this.people.keys()].some(personId=>this.tournament.contains(personId)||this.mobility.snapshot(personId).status==='running'||this.factions.snapshot(personId).job.status==='active')))return no('Najpierw zakończcie bieżące aktywności ekipy.');
        const result=this.campaign.command(id,command.action,this.members(),this.now);this.updateExpansions();return result;
      }
      case 'mobilityTrial': {
        if(command.action?.kind==='start'&&(this.jobs.busy||this.challengeStatus==='active'||this.tournament.contains(id)||this.campaign.snapshot(id).status==='active'||this.factions.snapshot(id).job.status==='active'))return no('Najpierw dokończ bieżące zlecenie.');
        const result=this.mobility.command(id,command.action,this.members(),this.now);this.updateExpansions();return result;
      }
      case 'job': {
        const action=command.action;
        const planningRooms:{member:Member;pose:OnlinePose;homeReturn:OnlinePose|null}[]=[];
        if(!action||typeof action!=='object'||!['heistStart','heistInteract','heistHack','heistRecon','heistBreach','heistAbort','raceStart','raceReady'].includes(action.kind))return no('Nieznana aktywność miasta.');
        if(action.kind==='heistStart'&&action.variant!==undefined&&!['sapphire','bank'].includes(action.variant))return no('Nieznany plan napadu.');
        if(action.kind==='heistHack'&&(!Number.isInteger(action.symbol)||action.symbol<0||action.symbol>3))return no('Niepoprawny symbol terminala.');
        if((action.kind==='heistStart'||action.kind==='raceStart')&&this.challengeStatus==='active')return no('Najpierw dokończcie Nocny przerzut.');
        if((action.kind==='heistStart'||action.kind==='raceStart')&&this.campaign.snapshot(id).status==='active')return no('Najpierw dokończcie rozdział kampanii.');
        if((action.kind==='heistStart'||action.kind==='raceStart')&&member.view.pose.homeId){
          if(id!==this.hostId||member.view.pose.homeId!=='crew'||Math.hypot(member.view.pose.x-HOME_ROOM.planning.x,member.view.pose.z-HOME_ROOM.planning.z)>3)return no('Plan napadu otwórz przy stole w bazie ekipy albo wyjdź na ulicę.');
          if(this.jobs.busy)return no('Najpierw dokończcie bieżące zlecenie ekipy.');
          for(const person of this.people.values())if(person.view.pose.homeId==='crew'){
            planningRooms.push({member:person,pose:structuredClone(person.view.pose),homeReturn:person.homeReturn?structuredClone(person.homeReturn):null});this.leaveHome(person);
          }
        }
        const result=this.jobs.command(id,action,this.members(),this.now);
        if(!result.ok)for(const previous of planningRooms){previous.member.view.pose=previous.pose;previous.member.homeReturn=previous.homeReturn;}
        this.updateJobs();return result;
      }
      case 'career': {
        const pose=member.view.pose,action=command.action;
        if(!action||typeof action!=='object')return no('Nieznana akcja kariery.');
        const personalHome=pose.homeId==='canal'||pose.homeId==='loft'?pose.homeId:null;
        const result=careerAction(member.career,member.wallet,action,{pose:{...pose,interior:pose.homeId?'home':pose.interior},now:this.worldTime(),homeId:personalHome,garageOwned:member.garage.owned,selectedCar:member.garage.selected,vehicleId:pose.vehicle?.id??null,vehicleSpeed:pose.vehicle?.speed??0,busy:this.jobs.busy||this.challengeStatus==='active'||this.tournament.contains(id)});
        if(!result.ok)return no(result.reason);
        member.career=result.career;member.wallet=result.wallet;
        if(result.effect){
          const home='home' in action&&(action.home==='canal'||action.home==='loft')?action.home:null;
          member.careerEffect={version:member.careerEffect.version+1,effect:result.effect,home};
          if(result.effect.storedCar&&pose.vehicle?.id==='stratus'){
            this.releasePassengers(id);member.view.pose={...pose,mode:'foot',vehicle:null,x:(home?HOMES[home].parking.x:pose.x)+2.6,z:home?HOMES[home].parking.z:pose.z,passengerOf:null};
          }
          if(result.effect.retrievedCar&&home){
            const selected=garageAction(member.garage,member.wallet,{type:'select',car:result.effect.retrievedCar});
            if(selected.ok)member.garage=selected.garage;
          }
          if(result.effect.repairCar&&pose.vehicle?.id==='stratus')pose.vehicle.health=100;
        }
        return yes;
      }
      case 'crewBase': {
        const result=crewBaseAction(this.crewBase,member.wallet,command.action,id,id===this.hostId);
        if(!result.ok)return no(result.reason);this.crewBase=result.base;member.wallet=result.wallet;return yes;
      }
      case 'home': return this.home(member,command.action);
      case 'casinoGame': {
        const pose=member.view.pose,action=command.action;
        if(!action||typeof action!=='object'||pose.interior!=='casino'||pose.homeId||pose.mode!=='foot'||pose.seated||pose.passengerOf||this.tournament.contains(id))return no('Podejdź do wolnego stanowiska w kasynie.');
        const target=action.kind==='rouletteSpin'?CASINO_GAMES.roulette:CASINO_GAMES.blackjack;
        if((action.kind==='blackjackDeal'||action.kind==='rouletteSpin')&&Math.hypot(pose.x-target.x,pose.z-target.z)>2.8)return no('Podejdź do odpowiedniego stołu gry.');
        const result=member.casinoGames.command(action,member.wallet);
        if(!result.ok)return no(result.reason);member.wallet=result.wallet;return yes;
      }
      case 'tournament': {
        const action=command.action,pose=member.view.pose;
        if(!action||typeof action!=='object')return no('Nieznana akcja turnieju.');
        if(action.kind!=='withdraw'&&(pose.interior!=='casino'||pose.homeId||pose.mode!=='foot'||pose.passengerOf||Math.hypot(pose.x-CASINO_GAMES.tournament.x,pose.z-CASINO_GAMES.tournament.z)>2.8))return no('Podejdź do stanowiska turniejowego w kasynie.');
        if(this.seats.includes(id)||member.casinoGames.snapshot().blackjack.status==='playing')return no('Najpierw odejdź od stołu gotówkowego i dokończ blackjacka.');
        if(action.kind==='start'){
          const entrants=this.tournament.snapshot(id).participants.filter(person=>person.status==='registered');
          if(entrants.some(person=>{const entrant=this.people.get(person.id)?.view.pose;return !entrant||entrant.interior!=='casino'||entrant.homeId||entrant.mode!=='foot'||Math.hypot(entrant.x-CASINO_GAMES.tournament.x,entrant.z-CASINO_GAMES.tournament.z)>2.8;}))return no('Wszyscy zapisani gracze muszą wrócić do stanowiska turniejowego.');
        }
        const result=this.tournament.command(id,action,this.members(),member.wallet,this.now);
        if(!result.ok)return no(result.reason);member.wallet=result.wallet;this.updateExpansions();return yes;
      }
      case 'cityActivity': {
        const result=this.cityActivities.command(id,command.action,this.members(),this.now);this.updateExpansions();return result;
      }
      case 'cityEventClaim': {
        const event=cityEventAt(this.worldTime()),pose=member.view.pose;
        if(!event||command.eventId!==event.id||pose.interior||pose.homeId||pose.seated||pose.passengerOf||Math.hypot(pose.x-event.target.x,pose.z-event.target.z)>5)return no('Podejdź do aktywnego wydarzenia w mieście.');
        if(member.claimedEvent===event.id)return no('Nagroda za to wydarzenie została już odebrana.');
        member.claimedEvent=event.id;member.wallet+=event.reward;member.career=awardReputation(member.career,event.id,20);return yes;
      }
      case 'challengeStart': return this.startChallenge(id,member);
      case 'pose': return this.move(member,command.pose);
      case 'sit': return this.sit(id,member);
      case 'stand': return this.stand(id);
      case 'deal': return this.deal(id);
      case 'action': {
        const seat=this.seats.indexOf(id);
        if(seat<0)return no('Najpierw zajmij miejsce przy stole.');
        if(!Number.isSafeInteger(command.version)||command.version!==this.version)return no('Stan stołu się zmienił. Wybierz akcję ponownie.');
        if(!this.validAction(command.action))return no('Niepoprawna akcja pokerowa.');
        const result=act(this.table,seat,command.action);
        if(!result.ok)return no(result.reason);
        this.table=result.state;this.changed();return yes;
      }
      case 'spend': {
        if(!Number.isSafeInteger(command.amount)||command.amount<1||command.amount>200)return no('Niepoprawna opłata.');
        if(this.now-member.lastSpend<1500)return no('Poczekaj przed kolejną opłatą.');
        member.wallet=Math.max(0,member.wallet-command.amount);member.lastSpend=this.now;return yes;
      }
      default: return no('Nieznane polecenie pokoju.');
    }
  }

  tick(now=Date.now()):boolean {
    if(!finite(now)||now<0)return false;
    this.now=Math.max(this.now,now);
    if(this.epoch===null)this.epoch=this.now;
    let changed=this.updateJobs();changed=this.updateExpansions()||changed;
    if(this.challengeStatus==='active'&&this.now>=this.challengeDeadline) {
      this.challengeStatus='failed';this.challengeReadyAt=this.challengeDeadline+CREW_COOLDOWN_MS;changed=true;
    }
    if(this.deadline===null||this.now<this.deadline||!handActive(this.table)||this.table.actor===null)return changed;
    const seat=this.table.actor,legal=legalActions(this.table,seat);
    const result=act(this.table,seat,legal.canCheck?{type:'check'}:{type:'fold'});
    if(!result.ok)return changed;
    this.table=result.state;this.changed();return true;
  }

  snapshot(id:string):RoomSnapshot {
    const member=this.people.get(id);
    if(!member)throw new Error('Nie należysz do tego pokoju.');
    const seat=this.seats.indexOf(id);
    const poker=seat>=0?this.publicTable(seat):null;
    return {code:this.code,hostId:this.hostId,youId:id,members:[...this.people.values()].map(person=>({...structuredClone(person.view),appearance:structuredClone(person.appearance),factionId:this.factions.snapshot(person.view.id).profile.faction})).sort((a,b)=>a.slot-b.slot),wallet:member.wallet,seated:seat>=0,poker,tableVersion:this.version,turnDeadline:this.deadline,vehicles:[...this.vehicles.values()].map(car=>({...car})),worldTime:this.epoch===null?0:(this.now-this.epoch)/1000,challenge:this.publicChallenge(id),garage:structuredClone(member.garage),jobs:this.jobs.snapshot(id,this.now),cityEventClaimed:member.claimedEvent===cityEventAt(this.worldTime())?.id,career:structuredClone({...member.career,awarded:[]}),crewBase:structuredClone(this.crewBase),careerEffect:structuredClone(member.careerEffect),casinoGames:member.casinoGames.snapshot(),tournament:this.tournament.snapshot(id),cityActivities:this.cityActivities.snapshot(id),appearance:structuredClone(member.appearance),phone:this.phone.snapshot(id),deliveryEffect:structuredClone(member.deliveryEffect),factions:this.factions.snapshot(id),campaign:this.campaign.snapshot(id),mobilityTrial:this.mobility.snapshot(id)};
  }

  private startChallenge(id:string,member:Member):RoomResult {
    if(id!==this.hostId)return no('Tylko gospodarz może rozpocząć Nocny przerzut.');
    if(this.jobs.busy)return no('Najpierw dokończcie napad lub wyścig.');
    if(this.campaign.snapshot(id).status==='active')return no('Najpierw dokończcie rozdział kampanii.');
    if(this.people.size<2)return no('Zaproś co najmniej jednego znajomego do wspólnego zlecenia.');
    if(member.view.pose.interior!==null||member.view.pose.homeId||member.view.pose.seated)return no('Wyjdź z wnętrza, aby rozpocząć zlecenie ekipy.');
    if(this.challengeStatus==='active')return no('Nocny przerzut już trwa. Jedźcie do wspólnego celu.');
    if(this.now<this.challengeReadyAt)return no('Ekipa potrzebuje chwili przed następnym przerzutem.');
    this.challengeStatus='active';this.challengeRun++;this.checkpoint=0;this.challengeDeadline=this.now+CREW_DURATION_MS;
    this.challengeEligible.clear();for(const memberId of this.people.keys())this.challengeEligible.add(memberId);
    this.contributors.clear();return yes;
  }

  private publicChallenge(id:string):CrewChallenge {
    const active=this.challengeStatus==='active';
    return {status:this.challengeStatus,run:this.challengeRun,eligible:this.challengeEligible.has(id),checkpoint:this.checkpoint,total:3,target:active?{...CREW_CHECKPOINTS[this.checkpoint]}:null,remainingMs:active?Math.max(0,Math.ceil(this.challengeDeadline-this.now)):0,cooldownMs:active?0:Math.max(0,Math.ceil(this.challengeReadyAt-this.now)),reward:CREW_REWARD,contributors:[...this.contributors]};
  }

  private reachCheckpoint(member:Member) {
    if(this.challengeStatus!=='active'||member.view.pose.interior!==null||member.view.pose.homeId||member.view.pose.seated||member.view.pose.passengerOf)return;
    const target=CREW_CHECKPOINTS[this.checkpoint],pose=member.view.pose;
    if(Math.hypot(pose.x-target.x,pose.z-target.z)>5)return;
    this.contributors.add(member.view.id);this.checkpoint++;
    if(this.checkpoint<CREW_CHECKPOINTS.length)return;
    this.challengeStatus='completed';this.challengeReadyAt=this.now+CREW_COOLDOWN_MS;
    for(const id of this.challengeEligible) {
      const participant=this.people.get(id);
      if(participant){participant.wallet+=CREW_REWARD;participant.career=awardReputation(participant.career,`crew:${this.challengeRun}`,60);}
    }
  }

  private worldTime() { return this.epoch===null?0:(this.now-this.epoch)/1000; }
  private members() { return [...this.people.values()].map(member=>member.view); }

  /** Controllers own clocks and outcomes; only this boundary changes session wallets. */
  private updateExpansions():boolean {
    const previousCampaign=this.campaign.snapshot(this.hostId),previousPhone=this.phone.snapshot(this.hostId);
    const beforeFuture=JSON.stringify([previousCampaign.status,previousCampaign.chapter,previousCampaign.objective,previousCampaign.holdMs,previousPhone.invites.map(invite=>[invite.id,invite.status,invite.accepted])]);
    const members=this.members();
    this.phone.update(members,this.now);this.factions.update(members,this.now);this.campaign.update(members,this.now);this.mobility.update(members,this.now);
    const futureCredits=[...this.factions.drainCredits(),...this.campaign.drainCredits(),...this.mobility.drainCredits().map(credit=>({...credit,reputation:40}))];
    for(const credit of futureCredits){
      const member=this.people.get(credit.id);
      if(member&&Number.isSafeInteger(credit.amount)&&credit.amount>0){member.wallet+=credit.amount;if(credit.reputation>0)member.career=awardReputation(member.career,credit.sourceId,credit.reputation);}
    }
    const nextCampaign=this.campaign.snapshot(this.hostId),nextPhone=this.phone.snapshot(this.hostId);
    const afterFuture=JSON.stringify([nextCampaign.status,nextCampaign.chapter,nextCampaign.objective,nextCampaign.holdMs,nextPhone.invites.map(invite=>[invite.id,invite.status,invite.accepted])]);
    const before=this.tournament.snapshot(this.hostId).version;
    const tournament=this.tournament.update(this.members(),this.now);
    let changed=tournament.credits.length>0||futureCredits.length>0||beforeFuture!==afterFuture;
    for(const credit of tournament.credits){
      const member=this.people.get(credit.id);
      if(member&&Number.isSafeInteger(credit.amount)&&credit.amount>0)member.wallet+=credit.amount;
    }
    const tournamentState=this.tournament.snapshot(this.hostId);
    for(const member of this.people.values()){
      const enrolled=tournamentState.status==='playing'&&this.tournament.contains(member.view.id);
      member.view.pose.seated=this.seats.includes(member.view.id)||enrolled;
      if(enrolled&&member.view.pose.interior!=='casino'){
        // A queued pose cannot teleport a registered player out during start.
        Object.assign(member.view.pose,{...CASINO_GAMES.tournament,mode:'foot',vehicle:null,interior:'casino',homeId:null});
      }
    }
    const previousEvent=this.cityActivities.snapshot(this.hostId);
    if(this.epoch!==null)this.cityActivities.update(this.members(),this.now);
    const credits=this.cityActivities.drainCredits();
    for(const credit of credits){
      const member=this.people.get(credit.id);
      if(member&&Number.isSafeInteger(credit.amount)&&credit.amount>0){member.wallet+=credit.amount;member.career=awardReputation(member.career,credit.eventId,80);}
    }
    const event=this.cityActivities.snapshot(this.hostId);
    changed=changed||before!==tournamentState.version||credits.length>0||previousEvent.id!==event.id||previousEvent.status!==event.status||previousEvent.stage!==event.stage||previousEvent.holderId!==event.holderId;
    // Contact objectives progress from verified poses, never client-provided rewards.
    for(const member of this.people.values())if(member.career.activeContract){
      const result=careerAction(member.career,member.wallet,{type:'contractVisit'},{pose:{...member.view.pose,interior:member.view.pose.homeId?'home':member.view.pose.interior},now:this.worldTime()});
      if(result.ok){member.career=result.career;member.wallet=result.wallet;changed=true;}
    }
    return changed;
  }

  private home(member:Member,action:HomeAction):RoomResult {
    if(!action||typeof action!=='object')return no('Nieznane wejście do lokalu.');
    const pose=member.view.pose;
    if(action.kind==='exit'){
      if(!pose.homeId)return no('Nie jesteś w mieszkaniu.');
      if(Math.hypot(pose.x-HOME_ROOM.exit.x,pose.z-HOME_ROOM.exit.z)>2)return no('Podejdź do drzwi wyjściowych.');
      this.leaveHome(member);return yes;
    }
    if(action.kind!=='enter'||!['canal','loft','crew'].includes(action.home))return no('Nieznany lokal.');
    if(pose.interior||pose.homeId||pose.seated||pose.passengerOf||pose.mode!=='foot')return no('Podejdź pieszo do drzwi lokalu.');
    if(this.jobs.busy||this.challengeStatus==='active'||this.tournament.contains(member.view.id))return no('Najpierw zakończ aktywność ekipy.');
    const definition=action.home==='crew'?CREW_BASE:HOMES[action.home];
    if(action.home==='crew'?!this.crewBase.owned:!member.career.ownedHomes.includes(action.home))return no('Najpierw kup ten lokal.');
    if(Math.hypot(pose.x-definition.door.x,pose.z-definition.door.z)>3.5)return no('Podejdź do drzwi wskazanego lokalu.');
    member.homeReturn={...pose,...homeStreetExit(action.home),homeId:null};
    member.view.pose={...HOME_ROOM.entry,heading:0,mode:'foot',vehicle:null,interior:null,homeId:action.home,seated:false,passengerOf:null};
    return yes;
  }
  private leaveHome(member:Member){
    const home=member.view.pose.homeId;
    const exit=home==='crew'||home==='canal'||home==='loft'?homeStreetExit(home):{x:0,z:68,heading:Math.PI};
    member.view.pose=member.homeReturn?{...member.homeReturn,homeId:null,seated:false}:{...exit,mode:'foot',vehicle:null,interior:null,homeId:null,seated:false,passengerOf:null};
    member.homeReturn=null;
  }

  private updateJobs():boolean {
    const before=JSON.stringify(this.jobs.snapshot(this.hostId,this.now));
    const result=this.jobs.update(this.members(),this.now);
    for(const credit of result.credits) {
      const member=this.people.get(credit.id);
      if(member&&Number.isSafeInteger(credit.amount)&&credit.amount>0){
        member.wallet+=credit.amount;const jobs=this.jobs.snapshot(credit.id,this.now);
        const source=jobs.heist.status==='completed'&&jobs.heist.eligible&&credit.amount===jobs.heist.reward?`heist:${jobs.heist.variant}:${jobs.heist.run}`:`race:${jobs.race.run}`;
        member.career=awardReputation(member.career,source,source.startsWith('heist:')?120:80);
      }
    }
    // The ready grid is host owned, so neither a queued pose nor a slow client
    // can turn the countdown into a rolling start.
    for(const member of this.people.values()) {
      const race=this.jobs.snapshot(member.view.id,this.now).race;
      if(race.status!=='countdown'||!race.grid||member.view.pose.mode!=='drive'||member.view.pose.vehicle?.id!=='stratus')continue;
      Object.assign(member.view.pose,race.grid,{heading:0});
      Object.assign(member.view.pose.vehicle,race.grid,{heading:0,speed:0});
      this.followPassengers(member.view.id);
    }
    return result.credits.length>0||before!==JSON.stringify(this.jobs.snapshot(this.hostId,this.now));
  }

  private ride(id:string,member:Member,driverId:string):RoomResult {
    if(!validId(driverId)||driverId===id)return no('Wybierz samochód innego gracza.');
    const driver=this.people.get(driverId),pose=member.view.pose,car=driver?.view.pose.vehicle;
    if(pose.mode!=='foot'||pose.interior||pose.homeId||pose.seated||pose.passengerOf)return no('Podejdź pieszo do samochodu znajomego.');
    const atDock=car?.kind==='boat'&&Math.hypot(pose.x-DOCK.land.x,pose.z-DOCK.land.z)<=3.5&&Math.hypot(car.x-DOCK.mooring.x,car.z-DOCK.mooring.z)<=DOCK.radius;
    if(!driver||driver.view.pose.mode!=='drive'||driver.view.pose.interior||driver.view.pose.homeId||!car||car.health<=0||Math.abs(car.speed)>3||!atDock&&Math.hypot(pose.x-car.x,pose.z-car.z)>5.5)return no('Podejdź do zatrzymanego pojazdu znajomego albo do przystani.');
    const capacity=car.kind==='bike'?1:3;
    if([...this.people.values()].filter(person=>person.view.pose.passengerOf===driverId).length>=capacity)return no('W pojeździe nie ma już wolnych miejsc.');
    member.view.pose={x:car.x,z:car.z,heading:car.heading,mode:'foot',interior:null,seated:false,vehicle:null,passengerOf:driverId};
    this.updateJobs();return yes;
  }

  private exitPoint(car:OnlineVehicle,slot:number) {
    if(car.kind==='boat')return{...DOCK.land};
    const safe=(point:{x:number;z:number})=>point.x>WORLD_BOUNDS.minX+.6&&point.x<WORLD_BOUNDS.maxX-.6&&point.z>WORLD_BOUNDS.minZ+.6&&point.z<WORLD_BOUNDS.maxZ-.6&&!BUILDINGS.some(building=>Math.abs(point.x-building.x)<building.halfX+.6&&Math.abs(point.z-building.z)<building.halfZ+.6);
    const side=slot%2?1:-1;
    const candidates=[side,-side].flatMap(direction=>[2.9+(slot>=2?1.2:0),5].map(offset=>({x:car.x+Math.cos(car.heading)*offset*direction,z:car.z+Math.sin(car.heading)*offset*direction})));
    const exit=candidates.find(safe);
    if(exit)return exit;
    // A disconnect must always free the seat even if a corrupted car pose was
    // surrounded by geometry; the nearest street intersection is a safe fallback.
    return ROADS.flatMap(x=>ROADS.map(z=>({x,z}))).filter(safe).sort((a,b)=>Math.hypot(a.x-car.x,a.z-car.z)-Math.hypot(b.x-car.x,b.z-car.z))[0]??{x:0,z:80};
  }

  private exitRide(member:Member,forced=false):RoomResult {
    const driverId=member.view.pose.passengerOf;
    if(!driverId)return no('Nie jesteś pasażerem.');
    const driver=this.people.get(driverId),car=driver?.view.pose.vehicle;
    if(!forced&&car?.kind==='boat'&&Math.hypot(car.x-DOCK.mooring.x,car.z-DOCK.mooring.z)>DOCK.radius)return no('Motorówką trzeba najpierw wrócić do przystani.');
    if(!forced&&car&&Math.abs(car.speed)>3)return no('Poczekaj, aż kierowca zatrzyma samochód.');
    const position=car?this.exitPoint(car,member.view.slot):{x:member.view.pose.x,z:member.view.pose.z};
    member.view.pose={...position,heading:member.view.pose.heading,mode:'foot',interior:null,seated:false,vehicle:null,passengerOf:null};
    return yes;
  }

  private followPassengers(driverId:string) {
    const driver=this.people.get(driverId),car=driver?.view.pose.vehicle;
    if(!driver||driver.view.pose.mode!=='drive'||!car){this.releasePassengers(driverId);return;}
    for(const member of this.people.values())if(member.view.pose.passengerOf===driverId)Object.assign(member.view.pose,{x:car.x,z:car.z,heading:car.heading});
  }

  private releasePassengers(driverId:string) {
    for(const member of this.people.values())if(member.view.pose.passengerOf===driverId)this.exitRide(member,true);
  }

  private validAction(value:unknown):value is PokerAction {
    if(!value||typeof value!=='object')return false;
    const action=value as Record<string,unknown>;
    return action.type==='fold'||action.type==='check'||action.type==='call'||action.type==='allIn'||(action.type==='raise'&&Number.isSafeInteger(action.to));
  }

  private move(member:Member,value:OnlinePose):RoomResult {
    if(!value||typeof value!=='object'||!finite(value.x)||!finite(value.z)||!finite(value.heading)||Math.abs(value.heading)>1e6||!['drive','foot'].includes(value.mode)||(value.interior!==null&&value.interior!=='casino'))return no('Niepoprawna pozycja gracza.');
    // Pose pumps keep running while seated. The driver's accepted pose owns the
    // passenger position; ignoring these updates avoids repeated error notices.
    if(member.view.pose.passengerOf)return yes;
    const homeId=member.view.pose.homeId??null;
    if(value.homeId!==undefined&&value.homeId!==null&&!['canal','loft','crew'].includes(value.homeId))return no('Niepoprawny lokal gracza.');
    // Property transitions use home commands. Ignore the already queued pose
    // from the previous space while a client receives the authoritative change.
    if((value.homeId??null)!==homeId)return yes;
    if(homeId&&(value.interior!==null||value.mode!=='foot'))return no('W mieszkaniu można poruszać się tylko pieszo.');
    const boating=value.mode==='drive'&&value.vehicle?.kind==='boat';
    const bounds=homeId?HOME_ROOM.bounds:value.interior==='casino'?CASINO.bounds:boating?WATER_BOUNDS:WORLD_BOUNDS;
    if(value.x<bounds.minX||value.x>bounds.maxX||value.z<bounds.minZ||value.z>bounds.maxZ)return no('Pozycja znajduje się poza mapą.');
    const seated=this.seats.includes(member.view.id)||(this.tournament.snapshot(member.view.id).status==='playing'&&this.tournament.contains(member.view.id));
    if(seated&&(value.interior!=='casino'||value.mode!=='foot'||Math.hypot(value.x-member.view.pose.x,value.z-member.view.pose.z)>.5))return no('Wstań od stołu, zanim ruszysz dalej.');
    let vehicle:OnlinePose['vehicle']=null;
    if(value.mode==='drive') {
      const car=value.vehicle;
      if(value.interior!==null||!car||typeof car!=='object'||typeof car.id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(car.id)||!['sport','sedan','bike','boat'].includes(car.kind)||![car.x,car.z,car.heading,car.color,car.speed,car.health].every(finite)||Math.hypot(car.x-value.x,car.z-value.z)>2||Math.abs(car.speed)>50||car.health<0||car.health>100||!Number.isSafeInteger(car.color)||car.color<0||car.color>0xffffff||Math.abs(car.heading)>1e6)return no('Niepoprawny pojazd gracza.');
      if(car.id!=='stratus'&&!/^(parked-[1-4]|traffic-[0-7]|bike-1|boat-1)$/.test(car.id))return no('Nieznany pojazd miasta.');
      if((car.kind==='boat')!==(car.id==='boat-1')||(car.kind==='bike')!==(car.id==='bike-1'))return no('Typ pojazdu nie pasuje do modelu miasta.');
      const carBounds=car.kind==='boat'?WATER_BOUNDS:WORLD_BOUNDS;
      if(car.x<carBounds.minX||car.x>carBounds.maxX||car.z<carBounds.minZ||car.z>carBounds.maxZ)return no('Pojazd znajduje się poza mapą.');
      if(car.kind==='boat'&&member.view.pose.vehicle?.id!=='boat-1'&&(member.view.pose.mode!=='foot'||member.view.pose.interior||member.view.pose.homeId||Math.hypot(member.view.pose.x-DOCK.land.x,member.view.pose.z-DOCK.land.z)>6.5||Math.hypot(car.x-DOCK.mooring.x,car.z-DOCK.mooring.z)>DOCK.radius+2))return no('Podejdź do przystani, aby wejść do motorówki.');
      if(car.airHeight!==undefined&&(!finite(car.airHeight)||car.airHeight<0||car.airHeight>15)||car.lean!==undefined&&(!finite(car.lean)||Math.abs(car.lean)>1.5))return no('Niepoprawny stan ruchu pojazdu.');
      if(car.id!=='stratus'&&[...this.people.values()].some(person=>person!==member&&person.view.pose.mode==='drive'&&person.view.pose.vehicle?.id===car.id))return no('Ten samochód prowadzi już inny gracz.');
      vehicle={id:car.id,kind:car.kind,x:car.x,z:car.z,heading:Math.atan2(Math.sin(car.heading),Math.cos(car.heading)),color:car.color,speed:car.speed,health:car.health};
      if(car.kind==='bike'){vehicle.airHeight=car.airHeight??0;vehicle.lean=car.lean??0;}
      if(car.id==='stratus')Object.assign(vehicle,garageVehicle(member.garage));
      if(car.id==='stratus'&&member.career.storedCars[member.garage.selected])return no('Odbierz własny samochód z mieszkania, zanim ruszysz.');
    } else if(value.vehicle!==null)return no('Pieszy nie może jednocześnie prowadzić pojazdu.');
    const previousCar=member.view.pose.vehicle;
    if(previousCar&&(!vehicle||previousCar.id!==vehicle.id))this.releasePassengers(member.view.id);
    if(previousCar&&previousCar.id!=='stratus'&&previousCar.id!==vehicle?.id)this.vehicles.set(previousCar.id,{...previousCar,...(previousCar.kind==='boat'?DOCK.mooring:{}),speed:0});
    if(vehicle&&vehicle.id!=='stratus')this.vehicles.set(vehicle.id,{...vehicle});
    const race=this.jobs.snapshot(member.view.id,this.now).race;
    const grid=race.status==='countdown'&&race.grid&&vehicle?.id==='stratus'?race.grid:null;
    if(grid&&vehicle)Object.assign(vehicle,grid,{heading:0,speed:0});
    if(member.view.pose.interior==='casino'&&value.interior!=='casino'){
      const blackjack=member.casinoGames.snapshot();
      if(blackjack.blackjack.status==='playing')member.casinoGames.command({kind:'blackjackForfeit',version:blackjack.version},member.wallet);
    }
    member.view.pose={x:grid?.x??value.x,z:grid?.z??value.z,heading:grid?0:Math.atan2(Math.sin(value.heading),Math.cos(value.heading)),mode:value.mode,interior:value.interior,seated,vehicle,passengerOf:null,homeId};
    this.followPassengers(member.view.id);
    this.reachCheckpoint(member);this.updateJobs();this.updateExpansions();
    return yes;
  }

  private sit(id:string,member:Member):RoomResult {
    if(this.seats.includes(id))return no('Masz już miejsce przy stole.');
    const pose=member.view.pose;
    if(pose.passengerOf||pose.homeId||pose.mode!=='foot'||pose.interior!=='casino'||Math.hypot(pose.x-CASINO.table.x,pose.z-CASINO.table.z)>5.5)return no('Podejdź pieszo do stołu w kasynie.');
    if(this.tournament.contains(id)||member.casinoGames.snapshot().blackjack.status==='playing')return no('Najpierw zakończ turniej lub bieżące rozdanie blackjacka.');
    if(member.wallet<ONLINE_BUY_IN)return no('Potrzebujesz $200, aby zająć miejsce.');
    const seat=this.seats.findIndex((owner,index)=>owner===null&&(!handActive(this.table)||this.table.players[index].contributed===0));
    if(seat<0)return no('Wszystkie miejsca są zajęte. Poczekaj na kolejne rozdanie.');
    member.wallet-=ONLINE_BUY_IN;member.view.pose.seated=true;this.seats[seat]=id;
    this.table.players[seat]={...emptySeat(seat),id,name:member.view.name,stack:ONLINE_BUY_IN};
    this.table.message=handActive(this.table)?`${member.view.name} czeka na kolejne rozdanie.`:'Zaproś drugiego gracza i rozdaj karty.';
    this.changed(false);return yes;
  }

  private stand(id:string):RoomResult {
    const member=this.people.get(id),seat=this.seats.indexOf(id);
    if(!member)return no('Nie należysz do tego pokoju.');
    if(seat<0)return yes;
    if(handActive(this.table)&&!this.table.players[seat].folded) {
      const result=foldPokerSeat(this.table,seat);
      if(!result.ok)return no(result.reason);
      this.table=result.state;
    }
    member.wallet+=this.table.players[seat].stack;
    this.table.players[seat].stack=0;this.table.players[seat].folded=true;
    this.seats[seat]=null;member.view.pose.seated=false;
    if(!handActive(this.table))this.table.players[seat]=emptySeat(seat);
    if(this.seats.every(owner=>owner===null)) {
      const seed=this.table.seed,handNumber=this.table.handNumber;
      this.table=createPokerTable(seed,ONLINE_BUY_IN);this.table.handNumber=handNumber;
      this.table.players=this.table.players.map((_,i)=>emptySeat(i));
    }
    this.changed();return yes;
  }

  private deal(id:string):RoomResult {
    const seat=this.seats.indexOf(id);
    if(seat<0)return no('Najpierw zajmij miejsce przy stole.');
    if(handActive(this.table))return no('Najpierw dokończ bieżące rozdanie.');
    if(this.table.players[seat].stack<=0)return no('Skończyły ci się żetony. Wstań i opłać nowe wpisowe.');
    if(this.seats.filter((owner,index)=>owner!==null&&this.table.players[index].stack>0).length<2)return no('Do rozdania potrzeba co najmniej dwóch graczy z żetonami.');
    if(this.table.players[0].stack<=0) {
      const start=this.table.players.findIndex((player,index)=>this.seats[index]!==null&&player.stack>0);
      const order=[0,1,2,3].map(index=>(index+start)%4);
      this.table.players=order.map(index=>this.table.players[index]);this.seats=order.map(index=>this.seats[index]);
      this.table.dealer=(this.table.dealer-start+4)%4;
      this.table.payouts=order.map(index=>this.table.payouts[index]);this.table.raiseRights=order.map(index=>this.table.raiseRights[index]);
      this.table.winners=this.table.winners.map(index=>(index-start+4)%4);
    }
    const result=dealHand(this.table);
    if(!result.ok)return no(result.reason);
    this.table=result.state;this.changed();return yes;
  }

  private changed(resetDeadline=true) {
    this.version++;
    if(!handActive(this.table)||this.table.actor===null)this.deadline=null;
    else if(resetDeadline||this.deadline===null)this.deadline=this.now+ONLINE_TURN_MS;
  }

  private publicTable(viewer:number):PokerState {
    const state=structuredClone(this.table),order=[0,1,2,3].map(index=>(index+viewer)%4);
    state.players=order.map((canonical,index)=>{
      const player=structuredClone(this.table.players[canonical]);
      if(index!==0&&!(state.phase==='showdown'&&!player.folded))player.hole=player.hole.map(()=>({rank:0,suit:'♠'}));
      return player;
    });
    state.dealer=(state.dealer-viewer+4)%4;state.actor=state.actor===null?null:(state.actor-viewer+4)%4;
    state.winners=state.winners.map(index=>(index-viewer+4)%4);state.payouts=order.map(index=>this.table.payouts[index]);state.raiseRights=order.map(index=>this.table.raiseRights[index]);
    state.deck=[];state.seed=0;
    return state;
  }
}

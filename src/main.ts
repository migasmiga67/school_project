import './style.css';
import { CityView } from './world';
import { createGame, activeVehicle, nearestVehicle, casinoAction, synchronizeOnlineTraffic } from './game';
import type { Input, Point, GameEvent, GameState } from './model';
import { AudioDrive } from './sound';
import { advanceSimulation } from './simulation';
import { OrbitCamera, MouseLook } from './camera-controls';
import { CASINO } from './casino-location';
import { PokerUI } from './poker-ui';
import { MultiplayerClient } from './multiplayer-client';
import { MultiplayerUI } from './multiplayer-ui';
import type { MultiplayerState, OnlinePose } from './multiplayer-model';
import { renderMinimap, TEAM_MAP_COLORS } from './minimap';
import { applyGarage, createGarage, parseGarage, garageAction, GARAGE_LOCATION, type GarageAction } from './garage';
import { GarageUI } from './garage-ui';
import { ActivitiesUI } from './activities-ui';
import { cityEventAt, getCityEnvironment } from './city-life';
import './crew.css';
import './mobile-hud.css';
import './expansion.css';

const $=<T extends HTMLElement=HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
const SAVE_KEY='neon-coast-profile-v1';
let muted=true, cameraMode=0, profileMoney=1250, recordWins=0, bestRace:number|null=null;
let saveAvailable=true;
let casinoReserve=0,escrowOpen=false,casinoNavigation=false,recoveredCasino=0;
let soloState:GameState|null=null,onlineWasPaused=false,networkClock=0,networkReceivedAt=0;
let onlineState:MultiplayerState={status:'offline',message:'',snapshot:null};
let crewLegendSignature='';
let mapNavigation:{remotePlayers:number;route:Point[]}={remotePlayers:0,route:[]};
let soloGarage=createGarage(),garageNavigation=false,panelWasPaused=false,cityClaimPending='',cityClaimRetryAt=0,eventNavigationId='';
const soloCityClaims=new Set<string>();
try {
 const raw=localStorage.getItem(SAVE_KEY);
 if(raw){const data=JSON.parse(raw);if(typeof data.muted==='boolean')muted=data.muted;if(Number.isFinite(data.money)&&data.money>=0&&data.money<1e8)profileMoney=data.money;if(Number.isSafeInteger(data.wins)&&data.wins>=0)recordWins=data.wins;if(typeof data.bestRace==='number'&&data.bestRace>0)bestRace=data.bestRace;if(Number.isSafeInteger(data.pokerReserve)&&data.pokerReserve>=0&&data.pokerReserve<1e8)recoveredCasino=data.pokerReserve;soloGarage=parseGarage(data.garage);}
}catch{saveAvailable=false;}
let state=createGame();state.money=profileMoney+recoveredCasino;state.missionsWon=recordWins;state.bestRace=bestRace;applyGarage(state,soloGarage);
const held=new Set<string>();
let started=false,paused=false,showingHelp=false;
let pulse={interact:false,nextMission:false,reset:false};
let notificationTimer:ReturnType<typeof setTimeout>;
let oldFrame=performance.now(),hudClock=0,mapClock=0;
const audio=new AudioDrive();
const orbit=new OrbitCamera();
$('#app').innerHTML=`<div id="world"></div><div class="vignette"></div><main class="hud hidden" id="hud"><header class="topbar"><div class="brand"><span class="brand-icon">◒</span><div class="brand-name">NEON COAST<small>STREET STORIES</small></div></div><div class="district-pill"><span>SWOBODNA JAZDA</span><strong id="district">OCEAN DRIVE</strong></div><div class="top-right"><div class="wallet"><small>GOTÓWKA</small><strong id="money">$1 250</strong></div><button class="icon-btn" id="sound" title="Włącz dźwięk" aria-label="Włącz dźwięk" aria-pressed="false">♪</button><button class="icon-btn casino-nav" id="casino-nav" title="Wyznacz trasę do kasyna" aria-label="Trasa do kasyna" aria-pressed="false">♠</button><button class="icon-btn online-nav" id="online" title="Gra online" aria-label="Gra online">Online</button><button class="icon-btn" id="help" title="Jak grać" aria-label="Jak grać">?</button><button class="icon-btn" id="pause" title="Pauza (P)" aria-label="Pauza">II</button></div></header><aside id="city-event" class="city-event hidden"><span>NA ULICACH MIASTA</span><strong id="city-event-title"></strong><small id="city-event-meta"></small><button id="city-event-route">Pokaż trasę</button></aside><div class="wanted" id="wanted" aria-label="Poziom pościgu"><span class="wanted-label">POŚCIG</span><span class="star">★</span><span class="star">★</span><span class="star">★</span></div><section class="mission-card"><div class="card-eyebrow"><span id="mission-label">MIEJSKA HISTORIA 01</span><span class="live" id="mission-status">AKTYWNA</span></div><div class="contact"><span class="contact-avatar">N</span><div><small>TWOJA ŁĄCZNICZKA</small><strong>Nova</strong></div></div><h2 id="mission-title">Specjalna przesyłka</h2><p id="mission-instruction">Odbierz paczkę w zaznaczonym miejscu.</p><div class="mission-meta"><span id="mission-distance">◈ 80 m</span><span class="reward" id="mission-reward">+$450</span></div><div class="mission-progress" id="mission-progress"><i></i><i></i></div><div class="escape-bar hidden" id="escape"><i id="escape-fill" style="width:0"></i></div><button class="next-mission hidden" id="mission-next">Następne zlecenie <kbd>M</kbd></button><button class="next-mission crew-start hidden" id="crew-start">Rozpocznij przerzut · M</button><button class="next-mission" id="activities-open">Garaż · napady · wyścigi <kbd>J</kbd></button></section><section class="map-wrap" aria-label="Minimapa"><div class="map-top"><strong id="map-location">Downtown</strong><small>NEON COAST</small></div><div class="map-frame"><canvas id="minimap" width="224" height="200" aria-label="Mapa miasta z pozycją gracza i celem misji"></canvas><span class="map-north">N ↑</span></div><div class="map-bottom"><span id="map-hint">◈ Cel zlecenia</span><strong id="mission-counter">0 UKOŃCZONYCH</strong></div><div id="crew-legend" class="crew-legend hidden" aria-label="Ekipa na minimapie"></div></section><div class="interaction" id="interaction"><kbd>E</kbd><span id="interaction-text">Wysiądź z samochodu</span></div><div class="controls-bar"><span><kbd>W A S D</kbd> <span id="movement-label">Jazda</span></span><span id="handbrake-hint"><kbd>Space</kbd> Ręczny</span><span><kbd>Shift</kbd> <span id="boost-label">Nitro</span></span><span><kbd>Mysz</kbd> Widok</span><span class="optional"><kbd>Kółko</kbd> Zbliżenie</span><span class="optional"><kbd>C</kbd> Kamera</span><span><kbd>?</kbd> Pomoc</span></div><div class="look-hint" id="mouse-hint">Kliknij obraz gry, by rozglądać się myszą · Esc zwalnia kursor · PPM + ruch działa bez blokady</div><span class="time-chip" id="clock">18:42 · ZŁOTA GODZINA</span><section class="speedometer"><div class="speed-main"><strong id="speed">0</strong><span class="speed-unit"><b id="gear">N</b>KM/H</span></div><div class="rpm" id="rpm">${'<i></i>'.repeat(9)}</div><div class="car-name" id="car-name">STRATUS XS · SPORT</div><div class="vehicle-health"><span id="health-label">STAN AUTA</span><span class="bar"><i id="health-bar" style="width:100%"></i></span><span id="health-value">100%</span></div></section><div class="touch-controls" aria-label="Sterowanie dotykowe"><div class="touch-pad"><span></span><button data-hold="w" aria-label="Gaz">▲</button><span></span><button data-hold="a" aria-label="Skręć w lewo">◀</button><button data-hold="s" aria-label="Hamulec">▼</button><button data-hold="d" aria-label="Skręć w prawo">▶</button></div><div class="touch-pad"><button id="touch-enter">E</button><button data-hold=" " aria-label="Ręczny">▰</button><button data-hold="shift" aria-label="Nitro">ϟ</button><button id="touch-ride" aria-label="Wsiądź jako pasażer lub wysiądź">F</button><button id="touch-activities" aria-label="Aktywności">J</button><button id="touch-garage" aria-label="Trasa do garażu">G</button></div></div></main><section class="intro" id="start-menu"><div class="intro-top">ORIGINAL OPEN-WORLD EXPERIENCE</div><span class="intro-side">WYBRZEŻE CZEKA. TY WYBIERASZ DROGĘ.</span><div class="intro-eyebrow">ZACHÓD SŁOŃCA. PEŁNY BAK. NOWY POCZĄTEK.</div><h1>NEON<span>COAST</span></h1><div class="tagline">TWOJE MIASTO. TWOJE HISTORIE.</div><p>Palmy, szybkie auta i sprawy do załatwienia.<br>Wsiadaj, odkryj miasto i podejmij zlecenie.<br>Tylko nie zwracaj na siebie zbyt wiele uwagi.</p><div class="intro-buttons"><button class="primary" id="start-game">WEJDŹ DO MIASTA <span class="arrow">→</span></button><button class="secondary" id="intro-help">STEROWANIE</button><button class="secondary" id="intro-online">GRA ONLINE · 4 GRACZY</button></div><div class="intro-bottom"><div><span>WERSJA 0.1</span> &nbsp; ／ &nbsp; 3D DRIVING SANDBOX</div><div>ORYGINALNY PROTOTYP · SOLO / ONLINE</div></div></section><div class="hint-toast" id="toast" role="status" aria-live="polite"></div><div id="overlay-root"></div><div id="poker-host"></div><div id="online-host"></div><div id="garage-host"></div><div id="activities-host"></div>`;
let view:CityView;
try{view=new CityView($('#world'));}catch(error){fatal(error instanceof Error?error.message:'Błąd uruchamiania grafiki 3D.');throw error;}
const room=new MultiplayerClient();
const mouse=new MouseLook(view.renderer.domElement,orbit,{active:()=>started&&(!paused||poker.active),canLock:()=>!poker.active,onChange:()=>updateMouseHint(),onUnlock:()=>{held.clear();if(started&&!paused)showPause();},onUnavailable:()=>notify('Przeciągnij obraz prawym przyciskiem myszy, aby rozglądać się. Kółko zmienia zbliżenie.')});
const poker=new PokerUI($('#poker-host'),{
 getWallet:()=>state.money,
 buyIn:(amount)=>{
  if(escrowOpen||!Number.isSafeInteger(amount)||amount<=0||state.money<amount)return false;
  state.money-=amount;casinoReserve=amount;escrowOpen=true;persist();updateHUD();return true;
 },
 onReserve:(chips)=>{if(!escrowOpen||!Number.isSafeInteger(chips)||chips<0)return;casinoReserve=chips;persist();updateHUD();},
 onCashOut:cashOut,
 onState:(hand)=>view.setPoker(hand,poker.active),
 onClose:()=>{
  if(escrowOpen)cashOut(casinoReserve);
  view.setPoker(null,false);mouse.release();orbit.setMode(cameraMode,state.player.heading);paused=false;held.clear();pulse={interact:false,nextMission:false,reset:false};oldFrame=performance.now();$('#hud').classList.remove('hidden');updateHUD();
 },
 onMessage:notify,
});
const onlineUI=new MultiplayerUI($('#online-host'),room,{
 onOpen:()=>{onlineWasPaused=paused;paused=true;held.clear();pulse={interact:false,nextMission:false,reset:false};mouse.release();audio.update(0,false);},
 onClose:()=>{paused=onlineWasPaused;held.clear();oldFrame=performance.now();},
 onEnter:()=>{if(started)resume();else start();},
 onMessage:notify,
});
function panelOpen(){panelWasPaused=paused;paused=true;held.clear();pulse={interact:false,nextMission:false,reset:false};mouse.release();audio.update(0,false);}
function panelClose(){paused=panelWasPaused;held.clear();oldFrame=performance.now();}
const garageUI=new GarageUI($('#garage-host'),{
 getGarage:()=>onlineState.snapshot?.garage??soloGarage,getWallet:()=>state.money,onAction:handleGarageAction,isOnline:()=>onlineState.status==='online',
 onOpen:panelOpen,onClose:panelClose,onMessage:notify,
});
const activitiesUI=new ActivitiesUI($('#activities-host'),room,{
 onOpen:panelOpen,onClose:panelClose,onGarageRoute:routeGarage,onStartCrew:startCrewChallenge,onMessage:notify,
});
function nearGarage(){return !state.interior&&!state.player.passengerOf&&Math.hypot(state.player.x-GARAGE_LOCATION.x,state.player.z-GARAGE_LOCATION.z)<=(state.player.mode==='drive'?6:3);}
function routeGarage(){garageNavigation=true;casinoNavigation=false;notify('GPS: MOD SHOP. Podejdź do wejścia lub zatrzymaj własne auto i naciśnij E.');updateHUD();}
function openGarage(){
 if(!nearGarage()){routeGarage();return;}
 if(Math.abs(activeVehicle(state)?.speed??0)>1.5){notify('Zatrzymaj auto przed wjazdem do warsztatu.');return;}
 if(onlineState.snapshot&&(onlineState.snapshot.jobs.active||onlineState.snapshot.challenge.status==='active')){notify('Dokończ zlecenie ekipy przed wizytą w warsztacie.');return;}
 if(state.player.mode==='drive'&&state.player.vehicleId!=='stratus'){notify('Warsztat obsługuje twoje własne auto. Możesz też podejść pieszo.');return;}
 garageUI.open();
}
function deliverSelectedCar(){
 if(state.player.mode==='foot'){
  const car=state.vehicles.find(item=>item.id==='stratus');if(car)Object.assign(car,{x:-16,z:77,heading:0,speed:0,parked:true});
 }
}
function handleGarageAction(action:GarageAction){
 if(!nearGarage()){garageUI.report('Podejdź do warsztatu, aby zmienić samochód.');return;}
 if(onlineState.status==='online'){room.garage(action);return;}
 const result=garageAction(soloGarage,state.money,action);
 if(!result.ok){garageUI.report(result.reason);return;}
 const changed=result.garage.selected!==soloGarage.selected;
 soloGarage=result.garage;state.money=result.wallet;applyGarage(state,soloGarage);if(changed)deliverSelectedCar();
 persist();garageUI.refresh(result.message);updateHUD();
}
function currentPose():OnlinePose {
 const car=activeVehicle(state);
 return {x:state.player.x,z:state.player.z,heading:state.player.heading,mode:state.player.mode,interior:state.interior,seated:poker.onlineMode&&poker.active,passengerOf:state.player.passengerOf??null,vehicle:car?{id:car.id,kind:car.kind,x:car.x,z:car.z,heading:car.heading,color:car.color,speed:car.speed,health:car.health,tuning:car.tuning,label:car.label}:null};
}
function handleOnlineState(next:MultiplayerState) {
 const previous=onlineState;onlineState=next;
 const snapshot=next.snapshot;
 if(next.status==='online'&&snapshot){
  if(!soloState){
   soloState=state;state=createGame();
   const self=snapshot.members.find(member=>member.id===snapshot.youId)!;
   const spawnZ=68-self.slot*7;
   Object.assign(state.vehicles[0],{x:0,z:spawnZ,color:[0xded8cb,0x83c3d5,0xc390c0,0x8fc4a0][self.slot]});
   Object.assign(state.player,{x:0,z:spawnZ});
   state.mission.active=false;state.mission.waypoint=null;
   casinoNavigation=snapshot.challenge.status!=='active';cameraMode=0;orbit.setMode(0,0);
  }
  state.money=snapshot.wallet;networkClock=snapshot.worldTime;networkReceivedAt=performance.now();
  applyGarage(state,snapshot.garage);
  if(previous.snapshot?.garage.selected&&previous.snapshot.garage.selected!==snapshot.garage.selected)deliverSelectedCar();
  const self=snapshot.members.find(member=>member.id===snapshot.youId)!;
  if(self.pose.passengerOf){Object.assign(state.player,{x:self.pose.x,z:self.pose.z,heading:self.pose.heading,mode:'foot',vehicleId:null,passengerOf:self.pose.passengerOf});}
  else if(state.player.passengerOf){Object.assign(state.player,{x:self.pose.x,z:self.pose.z,heading:self.pose.heading,mode:'foot',vehicleId:null,passengerOf:null});}
  const race=snapshot.jobs.race;
  if(race.status==='countdown'&&race.grid){const car=activeVehicle(state);if(car){Object.assign(car,race.grid,{heading:0,speed:0});Object.assign(state.player,race.grid,{heading:0});}}
  const oldJobs=previous.snapshot?.jobs;
  if(snapshot.jobs.active&&oldJobs?.active!==snapshot.jobs.active){garageNavigation=false;casinoNavigation=false;eventNavigationId='';notify(snapshot.jobs.active==='heist'?'Skok na Sapphire: sprawdź swoją rolę w panelu aktywności.':'Wyścig uliczny: podjedź do startu i zgłoś gotowość.');}
  if(snapshot.jobs.heist.eligible&&snapshot.jobs.heist.status==='escape'&&oldJobs?.heist.status!=='escape'){state.wanted=3;state.heat=0;notify('Alarm! Patrol ruszył. Dotrzyjcie razem do kryjówki.');audio.effect('info');}
  if(oldJobs&&snapshot.jobs.heist.status==='completed'&&oldJobs.heist.status!=='completed'){if(snapshot.jobs.heist.eligible){state.wanted=0;state.heat=0;state.police=[];state.arrestProgress=0;audio.effect('reward');}notify(snapshot.jobs.heist.eligible?'Napad zakończony! +$800 do portfela online.':'Ekipa dotarła do kryjówki.');}
  const placing=race.participants.find(person=>person.id===snapshot.youId),oldPlacing=oldJobs?.race.participants.find(person=>person.id===snapshot.youId);
  if(placing?.status==='finished'&&oldPlacing?.status!=='finished')notify(`Meta! Miejsce ${placing.rank}. Nagroda $${placing.prize}. Wyniki w panelu aktywności.`);
  garageUI.refresh(next.message&&next.message!==previous.message?next.message:undefined);
  for(const shared of snapshot.vehicles){
   const car=state.vehicles.find(vehicle=>vehicle.id===shared.id);
   if(car&&car.id!==state.player.vehicleId)Object.assign(car,shared,{speed:0,parked:true});
  }
  const occupied=snapshot.members.find(member=>member.id!==snapshot.youId&&member.pose.mode==='drive'&&member.pose.vehicle?.id===state.player.vehicleId&&member.pose.vehicle?.id!=='stratus');
  if(occupied){
   const self=snapshot.members.find(member=>member.id===snapshot.youId)!;
   Object.assign(state.player,{x:self.pose.x,z:self.pose.z,heading:self.pose.heading,mode:'foot',vehicleId:null});
   notify(`${occupied.name} zajmuje już ten samochód.`);
  }
  view.setOnline(snapshot.members,snapshot.youId);
  const before=previous.snapshot?.code===snapshot.code?previous.snapshot.challenge:null;
  const challenge=snapshot.challenge;
  if(before&&challenge.run>0){
   if(challenge.status==='active'&&(before.status!=='active'||before.run!==challenge.run)){
    casinoNavigation=false;garageNavigation=false;eventNavigationId='';notify('Nova: „Nocny przerzut. Trzy punkty, 150 sekund. Działajcie razem!”');audio.effect('info');
   }else if(before.status==='active'&&challenge.status==='completed'){
    notify(challenge.eligible?'Przerzut zakończony! +$300 do portfela online.':'Ekipa ukończyła przerzut. Dołączysz do nagrody w następnym wyzwaniu.');audio.effect(challenge.eligible?'reward':'info');
   }else if(before.status==='active'&&challenge.status==='failed'){
    notify('Czas minął. Ekipa może ponowić przerzut po krótkiej przerwie.');audio.effect('info');
   }else if(challenge.status==='active'&&challenge.checkpoint>before.checkpoint){
    notify(`Punkt ${challenge.checkpoint}/3 zaliczony. Następny cel czeka na minimapie.`);audio.effect('info');
   }
  }
 }else if(soloState&&next.status!=='connecting'){
  if(poker.onlineMode)poker.closeOnline();
  if(garageUI.active)garageUI.close();if(activitiesUI.active)activitiesUI.close();
  state=soloState;soloState=null;view.setOnline([],'');view.setPoker(null,false);
  held.clear();pulse={interact:false,nextMission:false,reset:false};mouse.release();orbit.setMode(cameraMode,state.player.heading);oldFrame=performance.now();
  if(started&&!onlineUI.active)resume();
  casinoNavigation=false;garageNavigation=false;eventNavigationId='';cityClaimPending='';persist();
  notify(next.message||'Opuściłeś pokój. Wróciłeś do swojej gry solo.');
 }
 if(next.status==='error'&&previous.message!==next.message)notify(next.message);
 if(next.status==='online'&&next.message&&next.message!==previous.message&&!poker.active)notify(next.message);
 updateHUD();
}
function updateOnlineHUD(){
 const snapshot=onlineState.status==='online'?onlineState.snapshot:null;
 $('#online').textContent=snapshot?`${snapshot.members.length}/4`:'Online';
 $('#online').classList.toggle('online-connected',Boolean(snapshot));
 $('#online').title=snapshot?`Pokój ${snapshot.code} · zaproś graczy`:'Gra online';
 $('#money').previousElementSibling!.textContent=snapshot?'PORTFEL ONLINE':'GOTÓWKA';
 $('#crew-start').classList.add('hidden');$('#mission-status').classList.remove('crew-timer','crew-timer-low');
 $('#crew-legend').classList.toggle('hidden',!snapshot);
 const signature=snapshot?JSON.stringify(snapshot.members.map(member=>[member.id,member.name,member.slot,member.pose.interior])):'';
 if(signature!==crewLegendSignature){
  crewLegendSignature=signature;
  $('#crew-legend').replaceChildren(...(snapshot?.members.map(member=>{
   const chip=document.createElement('span');chip.className='crew-member';
   const dot=document.createElement('b');dot.textContent=String(member.slot+1);dot.style.background=member.id===snapshot.youId?'#f7f1dd':TEAM_MAP_COLORS[member.slot];
   const name=document.createElement('span');name.textContent=member.id===snapshot.youId?'Ty':member.name;
   chip.title=`${member.name} · ${member.pose.interior?'w kasynie':'w mieście'}`;chip.append(dot,name);return chip;
  })??[]));
 }
 if(!snapshot)return;
 $('#mission-counter').textContent=`${snapshot.members.length} ONLINE`;
 if(state.interior)return;
 const challenge=snapshot.challenge,active=challenge.status==='active',host=snapshot.hostId===snapshot.youId;
 const seconds=Math.ceil(challenge.remainingMs/1000);
 $('#mission-label').textContent='NOVA · ZLECENIE EKIPY';
 $('#mission-status').textContent=active?`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:challenge.status==='completed'?'ZALICZONE':challenge.status==='failed'?'CZAS MINĄŁ':`${snapshot.members.length}/4 GRACZY`;
 $('#mission-status').classList.toggle('crew-timer',active);$('#mission-status').classList.toggle('crew-timer-low',active&&seconds<=30);
 $('#mission-title').textContent=challenge.status==='completed'?'Dobra robota, ekipo.':'Nocny przerzut';
 $('#mission-instruction').textContent=active?'Przejdźcie lub przejedźcie przez trzy znaczniki. Każdy punkt może zaliczyć dowolna osoba z ekipy.':challenge.status==='completed'?'Trasa zaliczona. Możecie wrócić do kasyna albo przygotować kolejny przerzut.':challenge.status==='failed'?'Tym razem zabrakło czasu. Zbierzcie ekipę i spróbujcie jeszcze raz.':snapshot.members.length<2?'Zaproś znajomego. Odwiedźcie trzy punkty w 150 sekund i zgarnijcie po $300.':'Ekipa jest gotowa. Gospodarz może rozpocząć wspólny przerzut przez miasto.';
 $('#mission-distance').textContent=active&&challenge.target?`Punkt ${challenge.checkpoint+1}/3 · ${Math.round(Math.hypot(challenge.target.x-state.player.x,challenge.target.z-state.player.z))} m`:challenge.status==='completed'?(challenge.eligible?'Nagroda wypłacona':'Następny przerzut czeka'):challenge.status==='failed'?'Spróbujcie ponownie':'3 punkty · 150 sekund';
 $('#mission-reward').textContent=active&&!challenge.eligible?'Pomagasz ekipie':'+$300 / osoba';
 $('#mission-progress').classList.remove('hidden');$('#mission-progress').innerHTML=Array.from({length:3},(_,index)=>`<i class="${index<challenge.checkpoint?'done':''}"></i>`).join('');
 $('#mission-next').classList.add('hidden');$('#escape').classList.add('hidden');
 const button=$<HTMLButtonElement>('#crew-start');button.classList.toggle('hidden',active);
 button.disabled=!host||snapshot.members.length<2||challenge.cooldownMs>0;
 button.textContent=challenge.cooldownMs>0?`Kolejny przerzut za ${Math.ceil(challenge.cooldownMs/1000)} s`:!host?'Gospodarz rozpoczyna zlecenie':snapshot.members.length<2?'Potrzebujesz drugiej osoby':'Rozpocznij przerzut · M';
 if(active&&!casinoNavigation)$('#map-hint').textContent='◆ Trasa ekipy';
}
function startCrewChallenge(){
 const snapshot=onlineState.status==='online'?onlineState.snapshot:null;
 if(!snapshot)return;
 if(snapshot.hostId!==snapshot.youId){notify('Wspólne zlecenie rozpoczyna gospodarz pokoju.');return;}
 if(state.interior){notify('Wyjdź z kasyna, aby rozpocząć przerzut.');return;}
 if(snapshot.members.length<2){notify('Zaproś drugą osobę do wspólnego przerzutu.');return;}
 if(snapshot.challenge.status==='active'){notify('Przerzut już trwa. Wspólny cel czeka na minimapie.');return;}
 if(snapshot.challenge.cooldownMs>0){notify('Ekipa potrzebuje chwili przed kolejnym przerzutem.');return;}
 room.startChallenge();
}
function navigationTarget():Point|undefined {
 if(garageNavigation)return GARAGE_LOCATION;
 const event=cityEventAt(worldSeconds());if(eventNavigationId&&event?.id===eventNavigationId)return event.target;
 if(casinoNavigation)return CASINO.door;
 const jobs=onlineState.snapshot?.jobs;
 if(jobs?.active==='heist')return jobs.heist.target??undefined;
 if(jobs?.active==='race')return jobs.race.target??undefined;
 const challenge=onlineState.snapshot?.challenge;
 return challenge?.status==='active'?challenge.target??undefined:undefined;
}
function interactInput(){
 if(onlineState.snapshot?.jobs.race.status==='countdown'){notify('Poczekaj na sygnał startu.');return;}
 if(state.player.passengerOf){room.exitRide();return;}
 if(nearGarage()){openGarage();return;}
 if(onlineState.snapshot&&state.player.mode==='foot'&&!casinoAction(state)){
  const vehicle=nearestVehicle(state);
  const owner=vehicle?.id!=='stratus'&&onlineState.snapshot.members.find(member=>member.id!==onlineState.snapshot!.youId&&member.pose.vehicle?.id===vehicle?.id&&member.pose.mode==='drive');
  if(owner){notify(`${owner.name} jest za kierownicą tego auta.`);return;}
 }
 pulse.interact=true;
}
function nearestRide(){
 const snapshot=onlineState.snapshot;if(!snapshot||state.interior||state.player.mode!=='foot'||state.player.passengerOf)return;
 return snapshot.members.filter(member=>member.id!==snapshot.youId&&member.pose.mode==='drive'&&member.pose.vehicle&&Math.abs(member.pose.vehicle.speed)<=3&&Math.hypot(member.pose.x-state.player.x,member.pose.z-state.player.z)<=5.5).sort((a,b)=>Math.hypot(a.pose.x-state.player.x,a.pose.z-state.player.z)-Math.hypot(b.pose.x-state.player.x,b.pose.z-state.player.z))[0];
}
function rideInput(){
 if(state.player.passengerOf){room.exitRide();return;}
 const driver=nearestRide();if(driver)room.ride(driver.id);else notify('Podejdź pieszo do zatrzymanego samochodu znajomego i naciśnij F.');
}
function worldSeconds(){return onlineState.status==='online'?networkClock+Math.max(0,performance.now()-networkReceivedAt)/1000:state.time;}
function updateJobsHUD(){
 const jobs=onlineState.snapshot?.jobs;
 $('#activities-open').textContent='Garaż · napady · wyścigi · J';
 if(!jobs?.active||state.interior)return;
 const heist=jobs.active==='heist',job=heist?jobs.heist:jobs.race;
 const seconds=Math.ceil(job.remainingMs/1000),target=job.target;
 $('#mission-label').textContent=heist?'SKOK NA SAPPHIRE':'WYŚCIG ULICZNY';
 $('#mission-status').textContent=jobs.race.status==='countdown'&&!heist?`${Math.ceil(jobs.race.countdownMs/1000)} · START`:`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
 $('#mission-title').textContent=heist?(jobs.heist.status==='gather'?'Przygotujcie skok':jobs.heist.status==='hack'?'Otwórzcie sejf':'Alarm! Do kryjówki!'):(jobs.race.status==='lobby'?'Zbiórka na starcie':jobs.race.status==='countdown'?'Na miejsca!':'Gaz do mety');
 $('#mission-instruction').textContent=job.message;
 $('#mission-distance').textContent=target?`${Math.round(Math.hypot(target.x-state.player.x,target.z-state.player.z))} m · ${heist?({driver:'Kierowca',hacker:'Haker',lookout:'Obserwator',spectator:'Widz'}[jobs.heist.role]):'Własne auto'}`:'Wyniki w panelu aktywności';
 $('#mission-reward').textContent=heist?'+$800 / osoba':'$500 / $300 / $150';
 $('#mission-progress').classList.remove('hidden');
 const participant=jobs.race.participants.find(person=>person.id===onlineState.snapshot!.youId);
 const progress=heist?(jobs.heist.status==='gather'?0:jobs.heist.status==='hack'?1:2):(participant?.checkpoint??0),total=heist?3:4;
 $('#mission-progress').innerHTML=Array.from({length:total},(_,index)=>`<i class="${index<progress?'done':''}"></i>`).join('');
 $('#crew-start').classList.add('hidden');$('#mission-next').classList.add('hidden');
 $('#activities-open').textContent=heist&&jobs.heist.status==='hack'?'Panel hakera / osłona · J':!heist&&jobs.race.status==='lobby'?'Zgłoś gotowość · J':'Role i wyniki · J';
 if(!garageNavigation&&!casinoNavigation)$('#map-hint').textContent=heist?'◆ Cel napadu':'⚑ Trasa wyścigu';
}
function updateCityEvent(){
 const event=cityEventAt(worldSeconds()),claimed=onlineState.snapshot?onlineState.snapshot.cityEventClaimed:Boolean(event&&soloCityClaims.has(event.id));
 const visible=Boolean(event&&!claimed&&!state.interior);
 $('#city-event').classList.toggle('hidden',!visible);
 if(!event||!visible)return;
 $('#city-event-title').textContent=event.title;
 $('#city-event-meta').textContent=`+$${event.reward} · ${Math.max(0,Math.ceil(event.expiresAt-worldSeconds()))} s · ${Math.round(Math.hypot(event.target.x-state.player.x,event.target.z-state.player.z))} m`;
 if(!started||paused||state.player.passengerOf||Math.hypot(event.target.x-state.player.x,event.target.z-state.player.z)>5)return;
 if(onlineState.snapshot){if(performance.now()>cityClaimRetryAt){cityClaimPending=event.id;cityClaimRetryAt=performance.now()+1000;room.claimCityEvent();}}
 else{soloCityClaims.add(event.id);state.money+=event.reward;persist();notify(`${event.title}: +$${event.reward}. Dobra robota!`);audio.effect('reward');}
}
function cashOut(chips:number){if(!escrowOpen||!Number.isSafeInteger(chips)||chips<0)return;escrowOpen=false;casinoReserve=0;state.money+=chips;persist();updateHUD();}
function openPoker(){if(state.interior!=='casino'||poker.active)return;held.clear();pulse={interact:false,nextMission:false,reset:false};paused=true;mouse.release();orbit.setMode(0,0);audio.update(0,false);$('#hud').classList.add('hidden');if(onlineState.status==='online')poker.openOnline(room);else poker.open();}
function updateMouseHint(){ $('#mouse-hint').classList.toggle('hidden',mouse.locked);view.renderer.domElement.classList.toggle('mouse-locked',mouse.locked); }
function fatal(message:string){const box=document.createElement('div');box.className='fatal';box.setAttribute('role','alert');box.textContent=message;const button=document.createElement('button');button.className='primary';button.textContent='Odśwież stronę';button.onclick=()=>location.reload();box.append(button);document.body.append(box);}
function notify(message:string){clearTimeout(notificationTimer);$('#toast').textContent=message;$('#toast').classList.add('show');notificationTimer=setTimeout(()=>$('#toast').classList.remove('show'),4200);}
function persist(){const saved=soloState??state;try{localStorage.setItem(SAVE_KEY,JSON.stringify({money:saved.money,wins:saved.missionsWon,bestRace:saved.bestRace,muted,pokerReserve:casinoReserve,garage:soloGarage}));saveAvailable=true;}catch{saveAvailable=false;}}
async function toggleSound(){muted=!muted;await audio.toggle(!muted);if(!muted&&audio.muted){muted=true;notify('Audio jest niedostępne. Gra działa bez dźwięku.');}persist();updateHUD();}
function district(p:Point):string{if(state.interior==='casino')return CASINO.name;if(p.x>60)return'Ocean Drive';if(p.z<-40)return'North Heights';if(p.x<-40)return'Little Havana';if(p.z>40)return'Southside';return'Downtown';}
function updateCasinoHUD(){
 const action=casinoAction(state),near=nearestVehicle(state),inside=state.interior==='casino';
 $('#interaction').classList.toggle('hidden',state.player.mode==='foot'&&!near&&!action);
 if(action)$('#interaction-text').textContent=action==='enter'?(state.wanted?'Zgub pościg, aby wejść do kasyna':'Wejdź do kasyna Sapphire Club'):action==='exit'?'Wyjdź z kasyna':'Zagraj w Texas Hold’em';
 $('#wanted').classList.toggle('hidden',inside);
 $('#casino-nav').setAttribute('aria-pressed',String(casinoNavigation));
 $('#map-hint').textContent=inside?'♠ Stół · ↳ Wyjście':casinoNavigation?'♠ Trasa do kasyna':'◈ Cel zlecenia · ♠ Kasyno';
 if(inside){
  $('#mission-label').textContent='SAPPHIRE CLUB · KASYNO';$('#mission-status').textContent='OTWARTE';
  $('#mission-title').textContent='Wieczór przy pokerze';$('#mission-instruction').textContent='Podejdź do stołu i naciśnij E. Przy drzwiach możesz wrócić do miasta.';
  $('#mission-distance').textContent='Blindy $5 / $10';$('#mission-reward').textContent='Texas Hold’em';
  $('#mission-progress').classList.add('hidden');$('#mission-next').classList.add('hidden');$('#escape').classList.add('hidden');
  $('#car-name').textContent='SAPPHIRE CLUB · SALA GIER';$('#clock').textContent='♠ SAPPHIRE CLUB';
 }else $('#mission-progress').classList.remove('hidden');
}
function updateHUD(){const passenger=Boolean(state.player.passengerOf),car=activeVehicle(state)??onlineState.snapshot?.members.find(member=>member.id===state.player.passengerOf)?.pose.vehicle;const speed=car&&(state.player.mode==='drive'||passenger)?Math.abs(car.speed)*3.6:0;
 $('.controls-bar').classList.toggle('hidden',passenger);document.querySelectorAll<HTMLButtonElement>('.touch-controls [data-hold]').forEach(button=>button.disabled=passenger);$('#movement-label').textContent=passenger?'Pasażer':state.player.mode==='foot'?'Ruch':'Jazda';$('#boost-label').textContent=state.player.mode==='foot'?'Sprint':'Nitro';$('#handbrake-hint').classList.toggle('hidden',state.player.mode==='foot');
 $('#speed').textContent=String(Math.round(speed));$('#gear').textContent=state.player.mode==='foot'&&!passenger?'—':(car?.speed??0)<-1?'R':speed<2?'N':String(Math.min(5,1+Math.floor(speed/25)));
 $('#money').textContent=`$${state.money.toLocaleString('pl-PL')}`;$('#district').textContent=district(state.player).toUpperCase();$('#map-location').textContent=district(state.player);$('#mission-counter').textContent=`${state.missionsWon} UKOŃCZONYCH`;
 $('#mission-title').textContent=state.mission.title;$('#mission-instruction').textContent=state.mission.instruction;$('#mission-label').textContent=`MIEJSKA HISTORIA 0${['delivery','race','escape'].indexOf(state.mission.kind)+1}`;$('#mission-status').textContent=state.mission.active?'AKTYWNA':state.mission.outcome==='completed'?'WYKONANA':'PRZERWANA';$('#mission-reward').textContent=`+$${state.mission.reward}`;
 const waypoint=state.mission.waypoint;$('#mission-distance').textContent=state.mission.kind==='race'&&state.mission.active?`◷ ${Math.max(0,Math.ceil(state.mission.clock))} s`:waypoint?`◈ ${Math.round(Math.hypot(waypoint.x-state.player.x,waypoint.z-state.player.z))} m`:'◈ Wybierz nowe zlecenie';
 const total=state.mission.kind==='delivery'?2:state.mission.kind==='race'?4:2;$('#mission-progress').innerHTML=Array.from({length:total},(_,i)=>`<i class="${i<state.mission.stage||state.mission.outcome==='completed'?'done':''}"></i>`).join('');$('#mission-next').classList.toggle('hidden',state.mission.active);$('#mission-next').innerHTML=state.mission.outcome==='failed'?'Ponów zlecenie <kbd>M</kbd>':'Następne zlecenie <kbd>M</kbd>';$('#escape').classList.toggle('hidden',state.mission.kind!=='escape'||!state.mission.active);$('#escape-fill').style.width=`${Math.min(100,state.escapeTimer/12*100)}%`;
 $('#wanted').setAttribute('aria-label',`Poziom pościgu: ${state.wanted} z 3`);document.querySelectorAll('#wanted .star').forEach((el,i)=>el.classList.toggle('active',i<state.wanted));$('#wanted .wanted-label').textContent=state.wanted?'POSZUKIWANY':'POŚCIG';
 const near=nearestVehicle(state);$('#interaction').classList.toggle('hidden',state.player.mode==='foot'&&!near);$('#interaction-text').textContent=state.player.mode==='drive'?speed>12?'Zwolnij, aby wysiąść':'Wysiądź z samochodu':`Wsiądź · ${near?.kind==='sport'?'Stratus XS':near?.kind==='sedan'?'Sentinel':'samochód'}`;
 $('#car-name').textContent=state.player.mode==='foot'?'SWOBODNY RUCH · PIESZO':car?.label??(car?.kind==='sport'?'STRATUS XS · SPORT':'SENTINEL · SEDAN');const health=state.player.mode==='drive'||passenger?(car?.health??100):state.player.health;$('#health-label').textContent=state.player.mode==='drive'||passenger?'STAN AUTA':'ZDROWIE';$('#health-value').textContent=`${Math.round(health)}%`;$('#health-bar').style.width=`${health}%`;
 document.querySelectorAll('#rpm i').forEach((el,i)=>el.classList.toggle('filled',i<Math.max(1,Math.ceil(speed/14))));$('#sound').setAttribute('aria-pressed',String(!muted));$('#sound').textContent=muted?'♪':'♫';$('#sound').title=muted?'Włącz dźwięk':'Wycisz dźwięk';$('#sound').setAttribute('aria-label',$('#sound').title);
 updateCasinoHUD();updateOnlineHUD();updateJobsHUD();updateCityEvent();const environment=getCityEnvironment(worldSeconds());if(state.interior!=='casino')$('#clock').textContent=`${environment.clock} · ${environment.period} · ${environment.weather}`;if(garageNavigation&&!state.interior)$('#map-hint').textContent='⚙ Trasa do garażu';if(nearGarage()){$('#interaction').classList.remove('hidden');$('#interaction-text').textContent='Otwórz garaż i tuning';}if(state.player.passengerOf){$('#interaction').classList.remove('hidden');$('#interaction-text').textContent='Jedziesz jako pasażer · E / F — wysiądź po zatrzymaniu';$('#car-name').textContent='WSPÓLNY PRZEJAZD · PASAŻER';}else if(nearestRide()){$('#interaction').classList.remove('hidden');$('#interaction-text').textContent='F — wsiądź jako pasażer znajomego';}
}
const map=$<HTMLCanvasElement>('#minimap').getContext('2d')!;
function drawMap(){
 const snapshot=onlineState.status==='online'?onlineState.snapshot:null;
 const crew=Boolean((snapshot?.challenge.status==='active'||snapshot?.jobs.active)&&!casinoNavigation&&!garageNavigation);
 const event=cityEventAt(worldSeconds()),claimed=snapshot?snapshot.cityEventClaimed:Boolean(event&&soloCityClaims.has(event.id));
 mapNavigation=renderMinimap(map,state,{
  casinoNavigation,onlineMembers:snapshot?.members??[],selfId:snapshot?.youId??'',
  target:navigationTarget()??(state.mission.active?state.mission.waypoint:null),
  targetKind:crew?'crew':casinoNavigation?'casino':'mission',time:state.time,
  cityEvent:claimed?null:event,
 });
}
function showPause(help=false){held.clear();pulse={interact:false,nextMission:false,reset:false};paused=true;mouse.release();showingHelp=help;audio.update(0,false);$('#overlay-root').innerHTML=help?`<section class="overlay"><div class="dialog" role="dialog" aria-modal="true" aria-label="Sterowanie"><span class="eyebrow">NEON COAST · PRZEWODNIK</span><h2>MIASTO BEZ POŚPIECHU.</h2><p>Wykonuj zlecenia lub po prostu odkrywaj wybrzeże. Złoty znacznik i minimapa wskazują cel. Możesz wysiąść i przejąć zaparkowane auto.</p><ul class="keys-list"><li>Pieszo — ruch względem kamery <kbd>W S A D / STRZAŁKI</kbd></li><li>Samochód — gaz / hamulec / skręt <kbd>W S A D</kbd></li><li>Rozglądanie <kbd>MYSZ · KLIKNIJ OBRAZ</kbd></li><li>Obrót bez blokady kursora <kbd>PRZYTRZYMAJ PPM</kbd></li><li>Przybliżanie / oddalanie <kbd>KÓŁKO MYSZY</kbd></li><li>Hamulec ręczny <kbd>SPACJA</kbd></li><li>Nitro / sprint pieszo <kbd>SHIFT</kbd></li><li>Wsiądź / wysiądź (po zwolnieniu) <kbd>E</kbd></li><li>Aktywności, napad i wyścig <kbd>J</kbd></li><li>Garaż / trasa do warsztatu <kbd>G</kbd></li><li>Pasażer znajomego / wyjście <kbd>F</kbd></li><li>Zmień kamerę <kbd>C</kbd></li><li>Zlecenie solo / start przerzutu ekipy <kbd>M</kbd></li><li>Wróć na drogę / naprawa <kbd>R</kbd></li><li>Kasyno — ikona ♠ na minimapie <kbd>E PRZY DRZWIACH / STOLE</kbd></li><li>Pauza <kbd>P / ESC</kbd></li></ul><div class="buttons"><button class="primary" id="resume">ROZUMIEM →</button></div><small>Kolizje i przejmowanie cudzych aut przyciągają policję. Zgub pościg, oddalając się od radiowozów. Prototyp obejmuje swobodną jazdę, eksplorację i trzy rodzaje zleceń.</small></div></section>`:`<section class="overlay"><div class="dialog" role="dialog" aria-modal="true" aria-label="Pauza"><span class="eyebrow">NEON COAST · PAUZA</span><h2>MIASTO POCZEKA.</h2><p>${onlineState.status==='online'?'Pauza zatrzymuje tylko twoją postać. Ekipa i zegar przerzutu grają dalej.<br>':''}Gotówka: $${state.money.toLocaleString('pl-PL')}<br>Ukończone zlecenia: ${state.missionsWon}<br>${state.bestRace?`Najlepszy wyścig: ${state.bestRace.toFixed(1)} s`:'Twój pierwszy rekord wciąż czeka.'}</p><div class="buttons"><button class="primary" id="resume">WRÓĆ NA ULICE →</button><button class="secondary" id="restart">WRÓĆ NA DROGĘ</button><button class="secondary" id="pause-help">STEROWANIE</button></div><small>${saveAvailable?'Gotówka, rekordy i ustawienia zapisują się lokalnie.':'Zapis w tej przeglądarce jest niedostępny.'} Po odświeżeniu zaczynasz nową sesję miasta; pozycja i etap misji nie są zapisywane.</small></div></section>`;
 $('#resume').onclick=resume;$('#restart')?.addEventListener('click',()=>{resume();pulse.reset=true;});$('#pause-help')?.addEventListener('click',()=>showPause(true));$('#resume').focus();persist();}
function resume(){paused=false;showingHelp=false;$('#overlay-root').innerHTML='';held.clear();oldFrame=performance.now();}
function start(){started=true;paused=false;$('#start-menu').classList.add('hidden');$('#hud').classList.remove('hidden');oldFrame=performance.now();if(!muted)void audio.toggle(true);if(recoveredCasino>0){notify(`Zwrócono $${recoveredCasino} niewykorzystanych żetonów ze stołu.`);recoveredCasino=0;}else if(onlineState.snapshot)notify(`Pokój ${onlineState.snapshot.code}. Zaproś znajomych i spotkajcie się w kasynie.`);else notify('Nova: „Mam dla ciebie małą przesyłkę. Kieruj się do złotego znacznika.”');persist();}
function camera(){cameraMode=(cameraMode+1)%3;orbit.setMode(cameraMode,state.player.heading);notify(`Kamera: ${['pościgowa','z lotu ptaka','pierwsza osoba'][cameraMode]}`);}
function handleEvent(event:GameEvent){if(event.kind==='poker'){openPoker();return;}if(event.kind==='interior'){held.clear();pulse={interact:false,nextMission:false,reset:false};casinoNavigation=false;cameraMode=0;orbit.setMode(0,state.player.heading);updateHUD();}notify(event.text);audio.effect(event.kind==='reward'?'reward':event.kind==='damage'||event.kind==='arrest'?'damage':'info');if(event.kind==='reward'||event.kind==='arrest')persist();}
$('#casino-nav').onclick=()=>{if(state.interior==='casino'){notify('Podejdź do stołu i naciśnij E, aby zagrać.');return;}garageNavigation=false;eventNavigationId='';casinoNavigation=!casinoNavigation;notify(casinoNavigation?'GPS: kasyno Sapphire Club. Wejście pieszo, E przy drzwiach.':'GPS: cel aktualnego zlecenia.');updateHUD();};
$('#activities-open').onclick=()=>activitiesUI.open();$('#touch-activities').onclick=()=>activitiesUI.open();$('#touch-garage').onclick=routeGarage;$('#touch-ride').onclick=rideInput;$('#city-event-route').onclick=()=>{const event=cityEventAt(worldSeconds());if(event){eventNavigationId=event.id;garageNavigation=false;casinoNavigation=false;notify(`GPS: ${event.title}.`);}};$('#start-game').onclick=start;$('#intro-help').onclick=()=>showPause(true);$('#help').onclick=()=>showPause(true);$('#pause').onclick=()=>showPause();$('#sound').onclick=()=>{void toggleSound();};$('#mission-next').onclick=()=>{pulse.nextMission=true;};$('#crew-start').onclick=startCrewChallenge;$('#touch-enter').onclick=interactInput;$('#online').onclick=()=>onlineUI.open();$('#intro-online').onclick=()=>onlineUI.open();
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-hold]')){const key=button.dataset.hold!;button.onpointerdown=e=>{button.setPointerCapture(e.pointerId);held.add(key);e.preventDefault();};button.onpointerup=button.onpointercancel=()=>held.delete(key);}
addEventListener('keydown',e=>{
 if(garageUI.active){if(e.key==='Escape'&&!e.repeat){e.preventDefault();garageUI.handleEscape();}return;}
 if(activitiesUI.active){if(e.key==='Escape'&&!e.repeat){e.preventDefault();activitiesUI.handleEscape();}return;}
 if(onlineUI.active){if(e.key==='Escape'&&!e.repeat){e.preventDefault();onlineUI.handleEscape();}return;}
 if(poker.active){if(e.key==='Escape'&&!e.repeat){e.preventDefault();poker.handleEscape();}return;}
 if(e.ctrlKey||e.metaKey||e.altKey)return;
 const key=e.key.toLowerCase();if(started&&!paused&&[' ','arrowup','arrowdown','arrowleft','arrowright'].includes(key))e.preventDefault();
 if(key==='p'||key==='escape'){if(e.repeat)return;if(paused)resume();else if(started)showPause();return;}
 if(paused){if(e.key==='Tab'){const buttons=[...$('#overlay-root').querySelectorAll<HTMLButtonElement>('button')],first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){last?.focus();e.preventDefault();}else if(!e.shiftKey&&document.activeElement===last){first?.focus();e.preventDefault();}}return;}
 if(!started)return;
 if(!e.repeat){if(key==='j'){activitiesUI.open();return;}if(key==='g'){if(nearGarage())openGarage();else routeGarage();return;}if(key==='f'){rideInput();return;}if(key==='e')interactInput();if(key==='m'){if(onlineState.status==='online')startCrewChallenge();else pulse.nextMission=true;}if(key==='r'&&!state.player.passengerOf&&onlineState.snapshot?.jobs.race.status!=='countdown')pulse.reset=true;if(key==='c')camera();if(key==='?'||key==='h')showPause(true);}
 held.add(key);
});
addEventListener('keyup',e=>held.delete(e.key.toLowerCase()));addEventListener('blur',()=>held.clear());document.addEventListener('visibilitychange',()=>{if(document.hidden&&started&&!paused)showPause();});addEventListener('beforeunload',persist);
function input():Input{return{throttle:held.has('w')||held.has('arrowup'),brake:held.has('s')||held.has('arrowdown'),left:held.has('a')||held.has('arrowleft'),right:held.has('d')||held.has('arrowright'),handbrake:held.has(' '),boost:held.has('shift'),sprint:held.has('shift'),interact:pulse.interact,nextMission:pulse.nextMission,reset:pulse.reset,viewHeading:orbit.yaw};}
function frame(now:number){requestAnimationFrame(frame);const dt=Math.min((now-oldFrame)/1000,.2);oldFrame=now;
 if(onlineState.status==='online')synchronizeOnlineTraffic(state,networkClock+Math.max(0,now-networkReceivedAt)/1000);
 orbit.update(state.player,started&&(!paused||poker.active)?dt:0,activeVehicle(state)?.speed??0,mouse.dragging);
 const raceCountdown=onlineState.snapshot?.jobs.race.status==='countdown'&&onlineState.snapshot.jobs.race.grid;
 if(started&&!paused&&!state.player.passengerOf&&!raceCountdown){const before=state.money;const events=advanceSimulation(state,input(),dt);pulse={interact:false,nextMission:false,reset:false};events.forEach(handleEvent);if(onlineState.status==='online'&&state.money<before)room.spend(before-state.money);audio.update(activeVehicle(state)?.speed??0,state.player.mode==='drive');}
 if(state.player.passengerOf||raceCountdown)pulse={interact:false,nextMission:false,reset:false};
 if(onlineState.status==='online')room.updatePose(currentPose());
 if(poker.active)orbit.yaw=Math.max(-1.25,Math.min(1.25,orbit.yaw));
 view.update(state,paused&&!poker.active&&onlineState.status!=='online'?0:dt,cameraMode,orbit,navigationTarget(),Boolean((onlineState.snapshot?.challenge.status==='active'||onlineState.snapshot?.jobs.active)&&!casinoNavigation&&!garageNavigation),worldSeconds());
 hudClock+=dt;mapClock+=dt;if(hudClock>.09){updateHUD();hudClock=0;}if(mapClock>.08){drawMap();mapClock=0;}
}
Object.defineProperty(window,'__NEON_TEST__',{get:()=>({state:structuredClone(state),started,paused,cameraMode,garage:structuredClone(onlineState.snapshot?.garage??soloGarage),garageOpen:garageUI.active,activitiesOpen:activitiesUI.active,city:view.cityLifeSnapshot,cityClaimPending,casino:{pokerOpen:poker.active,poker:structuredClone(poker.snapshot),reserve:casinoReserve},camera:{yaw:orbit.yaw,pitch:orbit.pitch,zoom:orbit.zoom,locked:mouse.locked},online:structuredClone(onlineState),navigation:structuredClone(mapNavigation),rendering:{remotePlayers:view.remotePlayers,view:view.presentation,frames:view.renderFrames,software:view.softwareRendering,calls:view.renderer.info.render.calls,triangles:view.renderer.info.render.triangles}})});
room.subscribe(handleOnlineState);updateHUD();updateMouseHint();drawMap();if(recoveredCasino>0)persist();if(new URLSearchParams(location.search).has('room'))onlineUI.open();requestAnimationFrame(frame);

import './style.css';
import { CityView } from './world';
import { createGame, activeVehicle, nearestVehicle, casinoAction, synchronizeOnlineTraffic } from './game';
import { BUILDINGS, ROADS, type Input, type Point, type GameEvent, type GameState } from './model';
import { AudioDrive } from './sound';
import { advanceSimulation } from './simulation';
import { OrbitCamera, MouseLook } from './camera-controls';
import { CASINO } from './casino-location';
import { PokerUI } from './poker-ui';
import { MultiplayerClient } from './multiplayer-client';
import { MultiplayerUI } from './multiplayer-ui';
import type { MultiplayerState, OnlinePose } from './multiplayer-model';

const $=<T extends HTMLElement=HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
const SAVE_KEY='neon-coast-profile-v1';
let muted=true, cameraMode=0, profileMoney=1250, recordWins=0, bestRace:number|null=null;
let saveAvailable=true;
let casinoReserve=0,escrowOpen=false,casinoNavigation=false,recoveredCasino=0;
let soloState:GameState|null=null,onlineWasPaused=false,networkClock=0,networkReceivedAt=0;
let onlineState:MultiplayerState={status:'offline',message:'',snapshot:null};
try {
 const raw=localStorage.getItem(SAVE_KEY);
 if(raw){const data=JSON.parse(raw);if(typeof data.muted==='boolean')muted=data.muted;if(Number.isFinite(data.money)&&data.money>=0&&data.money<1e8)profileMoney=data.money;if(Number.isSafeInteger(data.wins)&&data.wins>=0)recordWins=data.wins;if(typeof data.bestRace==='number'&&data.bestRace>0)bestRace=data.bestRace;if(Number.isSafeInteger(data.pokerReserve)&&data.pokerReserve>=0&&data.pokerReserve<1e8)recoveredCasino=data.pokerReserve;}
}catch{saveAvailable=false;}
let state=createGame();state.money=profileMoney+recoveredCasino;state.missionsWon=recordWins;state.bestRace=bestRace;
const held=new Set<string>();
let started=false,paused=false,showingHelp=false;
let pulse={interact:false,nextMission:false,reset:false};
let notificationTimer:ReturnType<typeof setTimeout>;
let oldFrame=performance.now(),hudClock=0,mapClock=0;
const audio=new AudioDrive();
const orbit=new OrbitCamera();
$('#app').innerHTML=`<div id="world"></div><div class="vignette"></div><main class="hud hidden" id="hud"><header class="topbar"><div class="brand"><span class="brand-icon">◒</span><div class="brand-name">NEON COAST<small>STREET STORIES</small></div></div><div class="district-pill"><span>SWOBODNA JAZDA</span><strong id="district">OCEAN DRIVE</strong></div><div class="top-right"><div class="wallet"><small>GOTÓWKA</small><strong id="money">$1 250</strong></div><button class="icon-btn" id="sound" title="Włącz dźwięk" aria-label="Włącz dźwięk" aria-pressed="false">♪</button><button class="icon-btn casino-nav" id="casino-nav" title="Wyznacz trasę do kasyna" aria-label="Trasa do kasyna" aria-pressed="false">♠</button><button class="icon-btn online-nav" id="online" title="Gra online" aria-label="Gra online">Online</button><button class="icon-btn" id="help" title="Jak grać" aria-label="Jak grać">?</button><button class="icon-btn" id="pause" title="Pauza (P)" aria-label="Pauza">II</button></div></header><div class="wanted" id="wanted" aria-label="Poziom pościgu"><span class="wanted-label">POŚCIG</span><span class="star">★</span><span class="star">★</span><span class="star">★</span></div><section class="mission-card"><div class="card-eyebrow"><span id="mission-label">MIEJSKA HISTORIA 01</span><span class="live" id="mission-status">AKTYWNA</span></div><div class="contact"><span class="contact-avatar">N</span><div><small>TWOJA ŁĄCZNICZKA</small><strong>Nova</strong></div></div><h2 id="mission-title">Specjalna przesyłka</h2><p id="mission-instruction">Odbierz paczkę w zaznaczonym miejscu.</p><div class="mission-meta"><span id="mission-distance">◈ 80 m</span><span class="reward" id="mission-reward">+$450</span></div><div class="mission-progress" id="mission-progress"><i></i><i></i></div><div class="escape-bar hidden" id="escape"><i id="escape-fill" style="width:0"></i></div><button class="next-mission hidden" id="mission-next">Następne zlecenie <kbd>M</kbd></button></section><section class="map-wrap" aria-label="Minimapa"><div class="map-top"><strong id="map-location">Downtown</strong><small>NEON COAST</small></div><div class="map-frame"><canvas id="minimap" width="224" height="200" aria-label="Mapa miasta z pozycją gracza i celem misji"></canvas><span class="map-north">N ↑</span></div><div class="map-bottom"><span id="map-hint">◈ Cel zlecenia</span><strong id="mission-counter">0 UKOŃCZONYCH</strong></div></section><div class="interaction" id="interaction"><kbd>E</kbd><span id="interaction-text">Wysiądź z samochodu</span></div><div class="controls-bar"><span><kbd>W A S D</kbd> <span id="movement-label">Jazda</span></span><span id="handbrake-hint"><kbd>Space</kbd> Ręczny</span><span><kbd>Shift</kbd> <span id="boost-label">Nitro</span></span><span><kbd>Mysz</kbd> Widok</span><span class="optional"><kbd>Kółko</kbd> Zbliżenie</span><span class="optional"><kbd>C</kbd> Kamera</span><span><kbd>?</kbd> Pomoc</span></div><div class="look-hint" id="mouse-hint">Kliknij obraz gry, by rozglądać się myszą · Esc zwalnia kursor · PPM + ruch działa bez blokady</div><span class="time-chip" id="clock">18:42 · ZŁOTA GODZINA</span><section class="speedometer"><div class="speed-main"><strong id="speed">0</strong><span class="speed-unit"><b id="gear">N</b>KM/H</span></div><div class="rpm" id="rpm">${'<i></i>'.repeat(9)}</div><div class="car-name" id="car-name">STRATUS XS · SPORT</div><div class="vehicle-health"><span id="health-label">STAN AUTA</span><span class="bar"><i id="health-bar" style="width:100%"></i></span><span id="health-value">100%</span></div></section><div class="touch-controls" aria-label="Sterowanie dotykowe"><div class="touch-pad"><span></span><button data-hold="w" aria-label="Gaz">▲</button><span></span><button data-hold="a" aria-label="Skręć w lewo">◀</button><button data-hold="s" aria-label="Hamulec">▼</button><button data-hold="d" aria-label="Skręć w prawo">▶</button></div><div class="touch-pad"><button id="touch-enter">E</button><button data-hold=" " aria-label="Ręczny">▰</button><button data-hold="shift" aria-label="Nitro">ϟ</button></div></div></main><section class="intro" id="start-menu"><div class="intro-top">ORIGINAL OPEN-WORLD EXPERIENCE</div><span class="intro-side">WYBRZEŻE CZEKA. TY WYBIERASZ DROGĘ.</span><div class="intro-eyebrow">ZACHÓD SŁOŃCA. PEŁNY BAK. NOWY POCZĄTEK.</div><h1>NEON<span>COAST</span></h1><div class="tagline">TWOJE MIASTO. TWOJE HISTORIE.</div><p>Palmy, szybkie auta i sprawy do załatwienia.<br>Wsiadaj, odkryj miasto i podejmij zlecenie.<br>Tylko nie zwracaj na siebie zbyt wiele uwagi.</p><div class="intro-buttons"><button class="primary" id="start-game">WEJDŹ DO MIASTA <span class="arrow">→</span></button><button class="secondary" id="intro-help">STEROWANIE</button><button class="secondary" id="intro-online">GRA ONLINE · 4 GRACZY</button></div><div class="intro-bottom"><div><span>WERSJA 0.1</span> &nbsp; ／ &nbsp; 3D DRIVING SANDBOX</div><div>ORYGINALNY PROTOTYP · SOLO / ONLINE</div></div></section><div class="hint-toast" id="toast" role="status" aria-live="polite"></div><div id="overlay-root"></div><div id="poker-host"></div><div id="online-host"></div>`;
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
function currentPose():OnlinePose {
 const car=activeVehicle(state);
 return {x:state.player.x,z:state.player.z,heading:state.player.heading,mode:state.player.mode,interior:state.interior,seated:poker.onlineMode&&poker.active,vehicle:car?{id:car.id,kind:car.kind,x:car.x,z:car.z,heading:car.heading,color:car.color,speed:car.speed,health:car.health}:null};
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
   casinoNavigation=true;cameraMode=0;orbit.setMode(0,0);
  }
  state.money=snapshot.wallet;networkClock=snapshot.worldTime;networkReceivedAt=performance.now();
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
 }else if(soloState&&next.status!=='connecting'){
  if(poker.onlineMode)poker.closeOnline();
  state=soloState;soloState=null;view.setOnline([],'');view.setPoker(null,false);
  held.clear();pulse={interact:false,nextMission:false,reset:false};mouse.release();orbit.setMode(cameraMode,state.player.heading);oldFrame=performance.now();
  if(started&&!onlineUI.active)resume();
  casinoNavigation=false;persist();
  notify(next.message||'Opuściłeś pokój. Wróciłeś do swojej gry solo.');
 }
 if(next.status==='error'&&previous.message!==next.message)notify(next.message);
 updateHUD();
}
function updateOnlineHUD(){
 const snapshot=onlineState.snapshot,connected=onlineState.status==='online'&&snapshot;
 $('#online').textContent=connected?`${snapshot.members.length}/4`:'Online';
 $('#online').classList.toggle('online-connected',Boolean(connected));
 $('#online').title=connected?`Pokój ${snapshot.code} · zaproś graczy`:'Gra online';
 if(!connected||state.interior)return;
 $('#mission-label').textContent='NEON COAST · ONLINE';$('#mission-status').textContent=`${snapshot.members.length}/4 GRACZY`;
 $('#mission-title').textContent='Wspólna noc w mieście';$('#mission-instruction').textContent='Odkrywaj miasto ze znajomymi. W kasynie możecie zagrać razem w pokera.';
 $('#mission-distance').textContent=`Pokój ${snapshot.code}`;$('#mission-reward').textContent='♠ Texas Hold’em';
 $('#mission-progress').classList.add('hidden');$('#mission-next').classList.add('hidden');
 $('#mission-counter').textContent=`${snapshot.members.length} ONLINE`;
}
function interactInput(){
 if(onlineState.snapshot&&state.player.mode==='foot'&&!casinoAction(state)){
  const vehicle=nearestVehicle(state);
  const owner=vehicle?.id!=='stratus'&&onlineState.snapshot.members.find(member=>member.id!==onlineState.snapshot!.youId&&member.pose.vehicle?.id===vehicle?.id&&member.pose.mode==='drive');
  if(owner){notify(`${owner.name} jest za kierownicą tego auta.`);return;}
 }
 pulse.interact=true;
}
function cashOut(chips:number){if(!escrowOpen||!Number.isSafeInteger(chips)||chips<0)return;escrowOpen=false;casinoReserve=0;state.money+=chips;persist();updateHUD();}
function openPoker(){if(state.interior!=='casino'||poker.active)return;held.clear();pulse={interact:false,nextMission:false,reset:false};paused=true;mouse.release();orbit.setMode(0,0);audio.update(0,false);$('#hud').classList.add('hidden');if(onlineState.status==='online')poker.openOnline(room);else poker.open();}
function updateMouseHint(){ $('#mouse-hint').classList.toggle('hidden',mouse.locked);view.renderer.domElement.classList.toggle('mouse-locked',mouse.locked); }
function fatal(message:string){const box=document.createElement('div');box.className='fatal';box.setAttribute('role','alert');box.textContent=message;const button=document.createElement('button');button.className='primary';button.textContent='Odśwież stronę';button.onclick=()=>location.reload();box.append(button);document.body.append(box);}
function notify(message:string){clearTimeout(notificationTimer);$('#toast').textContent=message;$('#toast').classList.add('show');notificationTimer=setTimeout(()=>$('#toast').classList.remove('show'),4200);}
function persist(){const saved=soloState??state;try{localStorage.setItem(SAVE_KEY,JSON.stringify({money:saved.money,wins:saved.missionsWon,bestRace:saved.bestRace,muted,pokerReserve:casinoReserve}));saveAvailable=true;}catch{saveAvailable=false;}}
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
function updateHUD(){const car=activeVehicle(state);const speed=car&&state.player.mode==='drive'?Math.abs(car.speed)*3.6:0;
 $('#movement-label').textContent=state.player.mode==='foot'?'Ruch':'Jazda';$('#boost-label').textContent=state.player.mode==='foot'?'Sprint':'Nitro';$('#handbrake-hint').classList.toggle('hidden',state.player.mode==='foot');
 $('#speed').textContent=String(Math.round(speed));$('#gear').textContent=state.player.mode==='foot'?'—':(car?.speed??0)<-1?'R':speed<2?'N':String(Math.min(5,1+Math.floor(speed/25)));
 $('#money').textContent=`$${state.money.toLocaleString('pl-PL')}`;$('#district').textContent=district(state.player).toUpperCase();$('#map-location').textContent=district(state.player);$('#mission-counter').textContent=`${state.missionsWon} UKOŃCZONYCH`;
 $('#mission-title').textContent=state.mission.title;$('#mission-instruction').textContent=state.mission.instruction;$('#mission-label').textContent=`MIEJSKA HISTORIA 0${['delivery','race','escape'].indexOf(state.mission.kind)+1}`;$('#mission-status').textContent=state.mission.active?'AKTYWNA':state.mission.outcome==='completed'?'WYKONANA':'PRZERWANA';$('#mission-reward').textContent=`+$${state.mission.reward}`;
 const waypoint=state.mission.waypoint;$('#mission-distance').textContent=state.mission.kind==='race'&&state.mission.active?`◷ ${Math.max(0,Math.ceil(state.mission.clock))} s`:waypoint?`◈ ${Math.round(Math.hypot(waypoint.x-state.player.x,waypoint.z-state.player.z))} m`:'◈ Wybierz nowe zlecenie';
 const total=state.mission.kind==='delivery'?2:state.mission.kind==='race'?4:2;$('#mission-progress').innerHTML=Array.from({length:total},(_,i)=>`<i class="${i<state.mission.stage||state.mission.outcome==='completed'?'done':''}"></i>`).join('');$('#mission-next').classList.toggle('hidden',state.mission.active);$('#mission-next').innerHTML=state.mission.outcome==='failed'?'Ponów zlecenie <kbd>M</kbd>':'Następne zlecenie <kbd>M</kbd>';$('#escape').classList.toggle('hidden',state.mission.kind!=='escape'||!state.mission.active);$('#escape-fill').style.width=`${Math.min(100,state.escapeTimer/12*100)}%`;
 $('#wanted').setAttribute('aria-label',`Poziom pościgu: ${state.wanted} z 3`);document.querySelectorAll('#wanted .star').forEach((el,i)=>el.classList.toggle('active',i<state.wanted));$('#wanted .wanted-label').textContent=state.wanted?'POSZUKIWANY':'POŚCIG';
 const near=nearestVehicle(state);$('#interaction').classList.toggle('hidden',state.player.mode==='foot'&&!near);$('#interaction-text').textContent=state.player.mode==='drive'?speed>12?'Zwolnij, aby wysiąść':'Wysiądź z samochodu':`Wsiądź · ${near?.kind==='sport'?'Stratus XS':near?.kind==='sedan'?'Sentinel':'samochód'}`;
 $('#car-name').textContent=state.player.mode==='foot'?'SWOBODNY RUCH · PIESZO':car?.kind==='sport'?'STRATUS XS · SPORT':'SENTINEL · SEDAN';const health=state.player.mode==='drive'?(car?.health??100):state.player.health;$('#health-label').textContent=state.player.mode==='drive'?'STAN AUTA':'ZDROWIE';$('#health-value').textContent=`${Math.round(health)}%`;$('#health-bar').style.width=`${health}%`;
 document.querySelectorAll('#rpm i').forEach((el,i)=>el.classList.toggle('filled',i<Math.max(1,Math.ceil(speed/14))));$('#sound').setAttribute('aria-pressed',String(!muted));$('#sound').textContent=muted?'♪':'♫';$('#sound').title=muted?'Włącz dźwięk':'Wycisz dźwięk';$('#sound').setAttribute('aria-label',$('#sound').title);
 updateCasinoHUD();updateOnlineHUD();const minutes=18*60+42+Math.floor(state.time/5);if(state.interior!=='casino')$('#clock').textContent=`${Math.floor(minutes/60)%24}:${String(minutes%60).padStart(2,'0')} · ZŁOTA GODZINA`;
}
const map=$<HTMLCanvasElement>('#minimap').getContext('2d')!;
const mapPos=(p:Point)=>({x:(p.x+104)/224*224,y:(p.z+104)/208*200});
function drawMap(){
 if(state.interior==='casino'){
  map.fillStyle='#1a2631';map.fillRect(0,0,224,200);map.fillStyle='#344e50';map.fillRect(16,12,192,176);
  map.strokeStyle='#cbb581';map.lineWidth=2;map.strokeRect(16,12,192,176);
  const table={x:112,y:78};map.fillStyle='#236c62';map.beginPath();map.ellipse(table.x,table.y,31,17,0,0,Math.PI*2);map.fill();map.fillStyle='#efdcb3';map.font='bold 13px Arial';map.fillText('♠',108,83);
  map.fillStyle='#e2b47e';map.fillRect(100,181,24,8);
  const x=112+state.player.x*8.4,y=94+state.player.z*8.4;map.save();map.translate(x,y);map.rotate(state.player.heading);map.fillStyle='#ffffff';map.beginPath();map.moveTo(0,-6);map.lineTo(-4,4);map.lineTo(4,4);map.closePath();map.fill();map.restore();return;
 }
 map.fillStyle='#263f45';map.fillRect(0,0,224,200);map.fillStyle='#75aeb6';map.fillRect(201,0,23,200);map.fillStyle='#c8b78b';map.fillRect(196,0,7,200);
 map.strokeStyle='#87968b';map.lineWidth=8;for(const road of ROADS){const c=mapPos({x:road,z:road});map.beginPath();map.moveTo(c.x,0);map.lineTo(c.x,200);map.stroke();map.beginPath();map.moveTo(0,c.y);map.lineTo(198,c.y);map.stroke();}
 map.fillStyle='#345b4d';const park=mapPos({x:-32,z:-32});map.fillRect(park.x,park.y,24,24);map.fillStyle='#b4b59b';for(const b of BUILDINGS){const p=mapPos({x:b.x-b.halfX,z:b.z-b.halfZ});map.fillRect(p.x,p.y,b.halfX*2,b.halfZ*2*200/208);map.fillStyle='#869b8b';map.fillRect(p.x+3,p.y+3,b.halfX*2-6,b.halfZ*2*200/208-6);map.fillStyle='#b4b59b';}
 const target=casinoNavigation?CASINO.door:state.mission.waypoint;
 if(target){const near=(v:number)=>ROADS.reduce((a,b)=>Math.abs(b-v)<Math.abs(a-v)?b:a);const start=state.player, first={x:near(start.x),z:near(start.z)},last={x:near(target.x),z:near(target.z)};const points=[start,first,{x:last.x,z:first.z},last,target].map(mapPos);map.strokeStyle='#ffd19a';map.lineWidth=2;map.lineJoin='round';map.beginPath();points.forEach((p,i)=>i?map.lineTo(p.x,p.y):map.moveTo(p.x,p.y));map.stroke();const p=mapPos(target);map.strokeStyle='#ffe0a1';map.lineWidth=1.5;map.beginPath();map.arc(p.x,p.y,6+Math.sin(state.time*3),0,Math.PI*2);map.stroke();map.fillStyle='#ffe0a1';map.beginPath();map.arc(p.x,p.y,3,0,Math.PI*2);map.fill();}
 const club=mapPos(CASINO.door);map.fillStyle='#d8b6ff';map.beginPath();map.arc(club.x,club.y,6,0,Math.PI*2);map.fill();map.fillStyle='#36234b';map.font='bold 10px Arial';map.fillText('♠',club.x-3.5,club.y+3.5);
 for(const police of state.police){const p=mapPos(police);map.fillStyle=Math.sin(state.time*10)>0?'#ff7b7b':'#79bfff';map.beginPath();map.arc(p.x,p.y,3,0,Math.PI*2);map.fill();}
 for(const v of state.vehicles){if(v.id===state.player.vehicleId)continue;const p=mapPos(v);map.fillStyle='#d4e2d488';map.fillRect(p.x-1,p.y-1,2,2);}
 const p=mapPos(state.player);map.save();map.translate(p.x,p.y);map.rotate(state.player.heading);map.fillStyle='#ffffff';map.strokeStyle='#183c41';map.lineWidth=2;map.beginPath();map.moveTo(0,-6);map.lineTo(-4,5);map.lineTo(0,3);map.lineTo(4,5);map.closePath();map.stroke();map.fill();map.restore();
}
function showPause(help=false){held.clear();pulse={interact:false,nextMission:false,reset:false};paused=true;mouse.release();showingHelp=help;audio.update(0,false);$('#overlay-root').innerHTML=help?`<section class="overlay"><div class="dialog" role="dialog" aria-modal="true" aria-label="Sterowanie"><span class="eyebrow">NEON COAST · PRZEWODNIK</span><h2>MIASTO BEZ POŚPIECHU.</h2><p>Wykonuj zlecenia lub po prostu odkrywaj wybrzeże. Złoty znacznik i minimapa wskazują cel. Możesz wysiąść i przejąć zaparkowane auto.</p><ul class="keys-list"><li>Pieszo — ruch względem kamery <kbd>W S A D / STRZAŁKI</kbd></li><li>Samochód — gaz / hamulec / skręt <kbd>W S A D</kbd></li><li>Rozglądanie <kbd>MYSZ · KLIKNIJ OBRAZ</kbd></li><li>Obrót bez blokady kursora <kbd>PRZYTRZYMAJ PPM</kbd></li><li>Przybliżanie / oddalanie <kbd>KÓŁKO MYSZY</kbd></li><li>Hamulec ręczny <kbd>SPACJA</kbd></li><li>Nitro / sprint pieszo <kbd>SHIFT</kbd></li><li>Wsiądź / wysiądź (po zwolnieniu) <kbd>E</kbd></li><li>Zmień kamerę <kbd>C</kbd></li><li>Następne zlecenie <kbd>M</kbd></li><li>Wróć na drogę / naprawa <kbd>R</kbd></li><li>Kasyno — ikona ♠ na minimapie <kbd>E PRZY DRZWIACH / STOLE</kbd></li><li>Pauza <kbd>P / ESC</kbd></li></ul><div class="buttons"><button class="primary" id="resume">ROZUMIEM →</button></div><small>Kolizje i przejmowanie cudzych aut przyciągają policję. Zgub pościg, oddalając się od radiowozów. Prototyp obejmuje swobodną jazdę, eksplorację i trzy rodzaje zleceń.</small></div></section>`:`<section class="overlay"><div class="dialog" role="dialog" aria-modal="true" aria-label="Pauza"><span class="eyebrow">NEON COAST · PAUZA</span><h2>MIASTO POCZEKA.</h2><p>Gotówka: $${state.money.toLocaleString('pl-PL')}<br>Ukończone zlecenia: ${state.missionsWon}<br>${state.bestRace?`Najlepszy wyścig: ${state.bestRace.toFixed(1)} s`:'Twój pierwszy rekord wciąż czeka.'}</p><div class="buttons"><button class="primary" id="resume">WRÓĆ NA ULICE →</button><button class="secondary" id="restart">WRÓĆ NA DROGĘ</button><button class="secondary" id="pause-help">STEROWANIE</button></div><small>${saveAvailable?'Gotówka, rekordy i ustawienia zapisują się lokalnie.':'Zapis w tej przeglądarce jest niedostępny.'} Po odświeżeniu zaczynasz nową sesję miasta; pozycja i etap misji nie są zapisywane.</small></div></section>`;
 $('#resume').onclick=resume;$('#restart')?.addEventListener('click',()=>{resume();pulse.reset=true;});$('#pause-help')?.addEventListener('click',()=>showPause(true));$('#resume').focus();persist();}
function resume(){paused=false;showingHelp=false;$('#overlay-root').innerHTML='';held.clear();oldFrame=performance.now();}
function start(){started=true;paused=false;$('#start-menu').classList.add('hidden');$('#hud').classList.remove('hidden');oldFrame=performance.now();if(!muted)void audio.toggle(true);if(recoveredCasino>0){notify(`Zwrócono $${recoveredCasino} niewykorzystanych żetonów ze stołu.`);recoveredCasino=0;}else if(onlineState.snapshot)notify(`Pokój ${onlineState.snapshot.code}. Zaproś znajomych i spotkajcie się w kasynie.`);else notify('Nova: „Mam dla ciebie małą przesyłkę. Kieruj się do złotego znacznika.”');persist();}
function camera(){cameraMode=(cameraMode+1)%3;orbit.setMode(cameraMode,state.player.heading);notify(`Kamera: ${['pościgowa','z lotu ptaka','pierwsza osoba'][cameraMode]}`);}
function handleEvent(event:GameEvent){if(event.kind==='poker'){openPoker();return;}if(event.kind==='interior'){held.clear();pulse={interact:false,nextMission:false,reset:false};casinoNavigation=false;cameraMode=0;orbit.setMode(0,state.player.heading);updateHUD();}notify(event.text);audio.effect(event.kind==='reward'?'reward':event.kind==='damage'||event.kind==='arrest'?'damage':'info');if(event.kind==='reward'||event.kind==='arrest')persist();}
$('#casino-nav').onclick=()=>{if(state.interior==='casino'){notify('Podejdź do stołu i naciśnij E, aby zagrać.');return;}casinoNavigation=!casinoNavigation;notify(casinoNavigation?'GPS: kasyno Sapphire Club. Wejście pieszo, E przy drzwiach.':'GPS: cel aktualnego zlecenia.');updateHUD();};
$('#start-game').onclick=start;$('#intro-help').onclick=()=>showPause(true);$('#help').onclick=()=>showPause(true);$('#pause').onclick=()=>showPause();$('#sound').onclick=()=>{void toggleSound();};$('#mission-next').onclick=()=>{pulse.nextMission=true;};$('#touch-enter').onclick=interactInput;$('#online').onclick=()=>onlineUI.open();$('#intro-online').onclick=()=>onlineUI.open();
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-hold]')){const key=button.dataset.hold!;button.onpointerdown=e=>{button.setPointerCapture(e.pointerId);held.add(key);e.preventDefault();};button.onpointerup=button.onpointercancel=()=>held.delete(key);}
addEventListener('keydown',e=>{
 if(onlineUI.active){if(e.key==='Escape'&&!e.repeat){e.preventDefault();onlineUI.handleEscape();}return;}
 if(poker.active){if(e.key==='Escape'&&!e.repeat){e.preventDefault();poker.handleEscape();}return;}
 if(e.ctrlKey||e.metaKey||e.altKey)return;
 const key=e.key.toLowerCase();if(started&&!paused&&[' ','arrowup','arrowdown','arrowleft','arrowright'].includes(key))e.preventDefault();
 if(key==='p'||key==='escape'){if(e.repeat)return;if(paused)resume();else if(started)showPause();return;}
 if(paused){if(e.key==='Tab'){const buttons=[...$('#overlay-root').querySelectorAll<HTMLButtonElement>('button')],first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){last?.focus();e.preventDefault();}else if(!e.shiftKey&&document.activeElement===last){first?.focus();e.preventDefault();}}return;}
 if(!started)return;
 if(!e.repeat){if(key==='e')interactInput();if(key==='m'&&onlineState.status!=='online')pulse.nextMission=true;if(key==='r')pulse.reset=true;if(key==='c')camera();if(key==='?'||key==='h')showPause(true);}
 held.add(key);
});
addEventListener('keyup',e=>held.delete(e.key.toLowerCase()));addEventListener('blur',()=>held.clear());document.addEventListener('visibilitychange',()=>{if(document.hidden&&started&&!paused)showPause();});addEventListener('beforeunload',persist);
function input():Input{return{throttle:held.has('w')||held.has('arrowup'),brake:held.has('s')||held.has('arrowdown'),left:held.has('a')||held.has('arrowleft'),right:held.has('d')||held.has('arrowright'),handbrake:held.has(' '),boost:held.has('shift'),sprint:held.has('shift'),interact:pulse.interact,nextMission:pulse.nextMission,reset:pulse.reset,viewHeading:orbit.yaw};}
function frame(now:number){requestAnimationFrame(frame);const dt=Math.min((now-oldFrame)/1000,.2);oldFrame=now;
 if(onlineState.status==='online')synchronizeOnlineTraffic(state,networkClock+Math.max(0,now-networkReceivedAt)/1000);
 orbit.update(state.player,started&&(!paused||poker.active)?dt:0,activeVehicle(state)?.speed??0,mouse.dragging);
 if(started&&!paused){const before=state.money;const events=advanceSimulation(state,input(),dt);pulse={interact:false,nextMission:false,reset:false};events.forEach(handleEvent);if(onlineState.status==='online'&&state.money<before)room.spend(before-state.money);audio.update(activeVehicle(state)?.speed??0,state.player.mode==='drive');}
 if(onlineState.status==='online')room.updatePose(currentPose());
 if(poker.active)orbit.yaw=Math.max(-1.25,Math.min(1.25,orbit.yaw));
 view.update(state,paused&&!poker.active&&onlineState.status!=='online'?0:dt,cameraMode,orbit,casinoNavigation?CASINO.door:undefined);
 hudClock+=dt;mapClock+=dt;if(hudClock>.09){updateHUD();hudClock=0;}if(mapClock>.08){drawMap();mapClock=0;}
}
Object.defineProperty(window,'__NEON_TEST__',{get:()=>({state:structuredClone(state),started,paused,cameraMode,casino:{pokerOpen:poker.active,poker:structuredClone(poker.snapshot),reserve:casinoReserve},camera:{yaw:orbit.yaw,pitch:orbit.pitch,zoom:orbit.zoom,locked:mouse.locked},online:structuredClone(onlineState),rendering:{remotePlayers:view.remotePlayers,view:view.presentation,frames:view.renderFrames,software:view.softwareRendering,calls:view.renderer.info.render.calls,triangles:view.renderer.info.render.triangles}})});
room.subscribe(handleOnlineState);updateHUD();updateMouseHint();drawMap();if(recoveredCasino>0)persist();if(new URLSearchParams(location.search).has('room'))onlineUI.open();requestAnimationFrame(frame);

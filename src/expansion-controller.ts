import { CareerUI, type VisitHomeId } from './career-ui';
import { CONTACTS, CREW_BASE, HOMES, HOME_ROOM, homeColliders, homeStreetExit, awardReputation, careerAction, careerTarget, createCrewBase, parseCareer, reputationTier, type CareerAction, type CareerEffect, type CareerState } from './career';
import { HomeView } from './home-view';
import { CasinoGames } from './casino-games';
import { CasinoGamesUI } from './casino-games-ui';
import { casinoStationAt, type CasinoStation } from './casino-games-location';
import { CityEvents, type CityEventAction } from './city-events';
import { CityEventsUI } from './city-events-ui';
import { CityEventsView } from './city-events-view';
import type { CasinoGameAction } from './casino-games';
import type { GarageState } from './garage';
import type { GameState, Input, Point } from './model';
import type { MultiplayerSession, MultiplayerState, OnlinePose } from './multiplayer-model';
import type { CityView } from './world';
import './new-features.css';

interface ExpansionContext {
 getState():GameState; getRoom():MultiplayerState; session:MultiplayerSession; view:CityView;
 getGarage():GarageState; selectCar(id:GarageState['selected']):void;
 getPose():OnlinePose; getTime():number; getPaused():boolean; getStarted():boolean;
 onOpen():void; onClose():void; onMessage(text:string):void; onSave():void;
 onRoute():void; onPlanning():void; onInterior():void;
}
const SOLO='solo';
const near=(a:Point,b:Point,r=3)=>Math.hypot(a.x-b.x,a.z-b.z)<=r;
const visitHome=(value:unknown):value is VisitHomeId=>value==='canal'||value==='loft'||value==='crew';

/** Connects the same rules to a local profile and host-owned online snapshots. */
export class CityExpansion {
 readonly careerUI:CareerUI;
 readonly casinoUI:CasinoGamesUI;
 readonly eventsUI:CityEventsUI;
 private soloCareer:CareerState;
 private readonly sessionKey=crypto.randomUUID();
 private readonly casino=new CasinoGames();
 private readonly events=new CityEvents();
 private readonly eventsView=new CityEventsView();
 private readonly homeView:HomeView;
 private soloHome:VisitHomeId|null=null;
 private homeReturn:GameState['player']|null=null;
 private renderedHome:VisitHomeId|null=null;
 private effectVersion=-1;
 private onlineHome:VisitHomeId|null=null;
 private route:Point|null=null;
 private routeLabel='';
 private eventRoute=false;
 private contractRoute=false;
 private lastContractCheck=0;
 private lastInside=false;
 private lastEventId:string|null=null;
 private readonly toolbar:HTMLElement;
 private readonly homeHint:HTMLElement;
 private readonly contactHud:HTMLElement;

 constructor(private readonly ctx:ExpansionContext,initialCareer:unknown){
  this.soloCareer=parseCareer(initialCareer);
  const storedHome=this.soloCareer.storedCars[ctx.getGarage().selected],storedCar=ctx.getState().vehicles.find(car=>car.id==='stratus');
  if(storedHome&&storedCar){Object.assign(storedCar,HOMES[storedHome].parking,{speed:0,parked:true});if(ctx.getState().player.vehicleId==='stratus')Object.assign(ctx.getState().player,{x:storedCar.x+3,z:storedCar.z,mode:'foot',vehicleId:null});}
  this.homeView=new HomeView(ctx.view.softwareRendering);ctx.view.addCityObject(this.eventsView.group);
  const makeHost=()=>{const host=document.createElement('div');document.querySelector('#app')!.append(host);return host;};
  this.careerUI=new CareerUI(makeHost(),{
   getCareer:()=>this.career,getWallet:()=>ctx.getState().money,getGarage:ctx.getGarage,
   getBase:()=>ctx.getRoom().snapshot?.crewBase??createCrewBase(),isOnline:()=>this.online,isHost:()=>this.isHost,
   getHome:()=>this.homeId,getPosition:()=>ctx.getState().player,getTime:ctx.getTime,
   onAction:action=>this.careerAction(action),onBaseAction:action=>ctx.session.crewBase(action),
   onRoute:(target,label)=>this.navigate(target,label),onEnterHome:home=>this.enterHome(home),onPlanning:()=>this.plan(),
   onOpen:ctx.onOpen,onClose:ctx.onClose,onMessage:ctx.onMessage,
  });
  this.casinoUI=new CasinoGamesUI(makeHost(),{
   getState:()=>ctx.getRoom().snapshot?.casinoGames??this.casino.snapshot(),getWallet:()=>ctx.getState().money,
   onAction:action=>this.casinoAction(action),getTournament:()=>ctx.getRoom().snapshot?.tournament??null,
   onTournament:action=>ctx.session.tournament(action),isOnline:()=>this.online,isHost:()=>this.isHost,
   getSelfId:()=>ctx.getRoom().snapshot?.youId??SOLO,
   onOpen:ctx.onOpen,onClose:()=>{ctx.view.setPoker(null,false);ctx.onClose();},onMessage:ctx.onMessage,
  });
  this.eventsUI=new CityEventsUI(makeHost(),{
   getSnapshot:()=>this.cityActivity,onAction:action=>this.eventAction(action),
   onRoute:target=>this.navigate(target,this.cityActivity.title,true),
   onOpen:ctx.onOpen,onClose:ctx.onClose,onMessage:ctx.onMessage,
  });
  this.toolbar=document.createElement('nav');this.toolbar.className='expansion-toolbar';this.toolbar.setAttribute('aria-label','Kontakty, kasyno i wydarzenia');
  this.toolbar.innerHTML='<button id="career-open">Kontakty i domy <kbd>L</kbd></button><button id="city-activities-open">Wydarzenia <kbd>B</kbd></button><button id="casino-games-open">Gry kasynowe <kbd>K</kbd></button><span id="career-reputation"></span>';
  document.querySelector('#hud')!.append(this.toolbar);
  this.toolbar.querySelector('#career-open')!.addEventListener('click',()=>this.openCareer());
  this.toolbar.querySelector('#city-activities-open')!.addEventListener('click',()=>this.openEvents());
  this.toolbar.querySelector('#casino-games-open')!.addEventListener('click',()=>this.openCasino());
  this.homeHint=document.createElement('aside');this.homeHint.className='home-hint hidden';this.homeHint.id='home-status';document.querySelector('#hud')!.append(this.homeHint);
  this.contactHud=document.createElement('aside');this.contactHud.className='contact-objective hidden';this.contactHud.id='contact-objective';document.querySelector('#hud')!.append(this.contactHud);
  this.events.update(this.soloMembers(),0);
 }
 get online(){return this.ctx.getRoom().status==='online'&&Boolean(this.ctx.getRoom().snapshot);}
 get isHost(){const room=this.ctx.getRoom().snapshot;return Boolean(room&&room.youId===room.hostId);}
 get career(){return this.ctx.getRoom().snapshot?.career??this.soloCareer;}
 get savedCareer(){return this.soloCareer;}
 get hasExplicitRoute(){return Boolean(this.route||this.eventRoute);}
 awardSolo(source:string,reputation:number){if(!this.online){this.soloCareer=awardReputation(this.soloCareer,source,reputation);}}
 get homeId():VisitHomeId|null {const room=this.ctx.getRoom().snapshot;if(this.online&&room){const value=room.members.find(member=>member.id===room.youId)?.pose.homeId;return visitHome(value)?value:null;}return this.soloHome;}
 get cityActivity(){return this.ctx.getRoom().snapshot?.cityActivities??this.events.snapshot(SOLO);}
 get active(){return this.careerUI.active||this.casinoUI.active||this.eventsUI.active;}
 get snapshot(){return{career:structuredClone(this.career),home:this.homeId,careerOpen:this.careerUI.active,casinoOpen:this.casinoUI.active,casinoStation:this.casinoUI.activeStation,casinoGames:this.ctx.getRoom().snapshot?.casinoGames??this.casino.snapshot(),cityActivities:this.cityActivity,eventsOpen:this.eventsUI.active};}
 get target():Point|undefined {if(this.homeId)return undefined;if(this.eventRoute)return this.cityActivity.target??undefined;if(this.route&&this.contractRoute)return careerTarget(this.career)??undefined;return this.route??careerTarget(this.career)??undefined;}
 clearRoute(){this.route=null;this.eventRoute=false;this.contractRoute=false;}
 private navigate(target:Point,label:string,eventRoute=false){this.eventRoute=eventRoute;const current=careerTarget(this.career);this.contractRoute=Boolean(!eventRoute&&current&&Math.hypot(target.x-current.x,target.z-current.z)<.01);this.ctx.onRoute();this.route={...target};this.routeLabel=label;this.ctx.onMessage(`GPS: ${label}.`);}
 openCareer(){if(!this.active)this.careerUI.open();}
 openEvents(){if(!this.active)this.eventsUI.open();}
 openCasino(station?:CasinoStation){
  if(this.active)return;
  const state=this.ctx.getState();
  if(state.interior!=='casino'){this.ctx.onMessage('Wejdź pieszo do Sapphire Club. Blackjack i ruletka czekają po bokach sali, turniej przy lewej ścianie.');return;}
  const available=casinoStationAt(state.player);
  if(!available){this.ctx.onMessage('Podejdź do stanowiska: blackjack po lewej, ruletka po prawej, turniej przy lewej ścianie.');return;}
  this.casinoUI.open(station??available);
 }
 handleKey(event:KeyboardEvent):boolean {
  if(this.active){if(event.key==='Escape'&&!event.repeat){event.preventDefault();if(this.careerUI.active)this.careerUI.close();else if(this.casinoUI.active)this.casinoUI.close();else this.eventsUI.close();}return true;}
  if(event.ctrlKey||event.metaKey||event.altKey||event.repeat||!this.ctx.getStarted()||this.ctx.getPaused())return false;
  const key=event.key.toLowerCase();if(key==='l'){this.openCareer();return true;}if(key==='b'){this.openEvents();return true;}if(key==='k'){this.openCasino();return true;}return false;
 }
 private soloMembers(){return[{id:SOLO,name:'Ty',pose:{...this.ctx.getPose(),homeId:this.soloHome}}];}
 private careerAction(action:CareerAction){
  if((action.type==='rest'||action.type==='repairCar')&&this.ctx.getState().wanted>0){const message='Najpierw zgub pościg.';this.careerUI.report(message);this.ctx.onMessage(message);return;}
  if(this.online){this.ctx.session.career(action);return;}
  const state=this.ctx.getState(),homeId=this.homeId;
  const result=careerAction(this.soloCareer,state.money,action,{pose:{...state.player,interior:homeId?'home':state.interior},now:this.ctx.getTime(),homeId:homeId==='crew'?null:homeId,garageOwned:this.ctx.getGarage().owned,selectedCar:this.ctx.getGarage().selected,vehicleId:state.player.vehicleId,vehicleSpeed:state.vehicles.find(car=>car.id===state.player.vehicleId)?.speed??0,wanted:state.wanted});
  if(!result.ok){this.careerUI.report(result.reason);this.ctx.onMessage(result.reason);return;}
  this.soloCareer=result.career;state.money=result.wallet;
  this.applyEffect(result.effect,'home' in action?action.home:null);
  if(action.type==='contractStart'||result.effect?.completedContract){this.route=null;this.eventRoute=false;this.ctx.onRoute();}
  if(action.type==='buyHome'){this.navigate(HOMES[action.home].door,HOMES[action.home].name);}
  this.ctx.onSave();this.careerUI.refresh(result.message);this.ctx.onMessage(result.message);
 }
 private applyEffect(effect:CareerEffect|undefined|null,home:'canal'|'loft'|null){
  if(!effect)return;const state=this.ctx.getState(),car=state.vehicles.find(item=>item.id==='stratus');
  if(effect.restoreHealth)state.player.health=100;
  if(effect.repairCar&&car)car.health=100;
  if(effect.storedCar&&car&&home){
   Object.assign(car,HOMES[home].parking,{speed:0,parked:true});
   if(state.player.vehicleId==='stratus')Object.assign(state.player,{x:car.x+3,z:car.z,mode:'foot',vehicleId:null});
  }
  if(effect.retrievedCar&&car&&home){this.ctx.selectCar(effect.retrievedCar);Object.assign(car,HOMES[home].parking,{heading:0,speed:0,parked:true});}
 }
 private casinoAction(action:CasinoGameAction){
  if(this.online){this.ctx.session.casinoGame(action);return;}
  const state=this.ctx.getState();if(state.interior!=='casino')return;
  const result=this.casino.command(action,state.money);if(!result.ok){this.casinoUI.report(result.reason);return;}
  state.money=result.wallet;this.ctx.onSave();this.casinoUI.report(result.message);
 }
 private eventAction(action:CityEventAction){
  if(this.online){this.ctx.session.cityActivity(action);return;}
  const result=this.events.command(SOLO,action,this.soloMembers(),this.ctx.getTime()*1000);
  if(!result.ok)this.ctx.onMessage(result.reason);else{this.eventRoute=true;this.ctx.onRoute();this.ctx.onMessage(this.cityActivity.instruction);}
  this.eventsUI.refresh();
 }
 private homeDoor(id:VisitHomeId){return id==='crew'?CREW_BASE.door:HOMES[id].door;}
 private enterHome(id:VisitHomeId){
  const state=this.ctx.getState();
  if(!near(state.player,this.homeDoor(id),3.5)||state.player.mode!=='foot'||state.interior){this.navigate(this.homeDoor(id),id==='crew'?CREW_BASE.name:HOMES[id].name);return;}
  if(state.wanted){this.ctx.onMessage('Zgub pościg, zanim wejdziesz do mieszkania.');return;}
  if(this.online){this.ctx.session.home({kind:'enter',home:id});return;}
  if(id==='crew'||!this.career.ownedHomes.includes(id)){this.ctx.onMessage('Najpierw kup ten lokal w panelu kontaktów i domów.');return;}
  this.homeReturn={...state.player};this.soloHome=id;Object.assign(state.player,HOME_ROOM.entry,{heading:0,mode:'foot',vehicleId:null});this.ctx.onInterior();this.syncHome();
 }
 private exitHome(){
  if(this.online){this.ctx.session.home({kind:'exit'});return;}
  const state=this.ctx.getState();if(!this.soloHome)return;
  Object.assign(state.player,this.homeReturn??{},homeStreetExit(this.soloHome),{mode:'foot',vehicleId:null});this.soloHome=null;this.homeReturn=null;this.ctx.onInterior();this.syncHome();
 }
 private plan(){
  const home=this.homeId;
  if(!home||!near(this.ctx.getState().player,HOME_ROOM.planning,3)){this.ctx.onMessage('Podejdź do stołu planowania we własnym mieszkaniu lub bazie ekipy.');return;}
  if(this.careerUI.active)this.careerUI.close();
  if(this.online&&home==='crew')this.ctx.onPlanning();else this.openCareer();
 }
 interact():boolean {
  const state=this.ctx.getState(),home=this.homeId;
  if(home){if(near(state.player,HOME_ROOM.exit,1.1))this.exitHome();else if(near(state.player,HOME_ROOM.planning,3))this.plan();else this.openCareer();return true;}
  if(state.interior==='casino'&&state.player.mode==='foot'){const station=casinoStationAt(state.player);if(station){this.openCasino(station);return true;}}
  if(!state.interior&&state.player.mode==='foot'){
   const door=([...Object.keys(HOMES),'crew'] as VisitHomeId[]).find(id=>near(state.player,this.homeDoor(id),3));
   if(door){if((door==='crew'&&this.ctx.getRoom().snapshot?.crewBase.owned)||(door!=='crew'&&this.career.ownedHomes.includes(door)))this.enterHome(door);else this.openCareer();return true;}
  }
  const activity=this.cityActivity;
  if(!state.interior&&activity.canInteract&&activity.id){this.eventAction({kind:'interact',eventId:activity.id});return true;}
  return false;
 }
 roomChanged(next:MultiplayerState,previous:MultiplayerState){
  const snapshot=next.snapshot;
  if(next.status==='online'&&snapshot){
   const pose=snapshot.members.find(member=>member.id===snapshot.youId)?.pose;
   const nextHome=visitHome(pose?.homeId)?pose.homeId:null;
   if(nextHome!==this.onlineHome&&pose){Object.assign(this.ctx.getState().player,{x:pose.x,z:pose.z,heading:pose.heading,mode:pose.mode,vehicleId:pose.vehicle?.id??null});this.onlineHome=nextHome;this.ctx.onInterior();}
   if(snapshot.careerEffect.version!==this.effectVersion){
    this.effectVersion=snapshot.careerEffect.version;const effect=snapshot.careerEffect.effect;this.applyEffect(effect,snapshot.careerEffect.home);
    if(effect&&this.careerUI.active)this.careerUI.report(effect.restoreHealth?'Odpocząłeś. Zdrowie przywrócone.':effect.repairCar?'Własny samochód naprawiony.':effect.storedCar?'Samochód zabezpieczony przy mieszkaniu.':effect.retrievedCar?'Samochód czeka przy wyjeździe.':'Zlecenie zakończone.');
   }
   if(previous.snapshot?.career.activeContract&&!snapshot.career.activeContract){this.route=null;this.ctx.onMessage('Zlecenie kontaktu zakończone. Sprawdź reputację i portfel.');}
   if(this.careerUI.active)this.careerUI.refresh(next.message||undefined);
   if(this.casinoUI.active)this.casinoUI.report(next.message||'');
  }else if(previous.status==='online'&&next.status!=='connecting'){
   this.onlineHome=null;this.effectVersion=-1;this.route=null;this.eventRoute=false;
   this.careerUI.close();this.casinoUI.close();this.eventsUI.close();
  }
  this.syncHome();
 }
 private syncHome(){
  const home=this.homeId;
  if(home)this.homeView.update(home,this.career,this.ctx.getRoom().snapshot?.crewBase);
  if(home!==this.renderedHome){this.renderedHome=home;this.ctx.view.setHome(home,home?this.homeView.group:null);this.route=null;}
 }
 step(dt:number,input:Input,canMove:boolean){
  const state=this.ctx.getState(),home=this.homeId;
  const stored=this.career.storedCars[this.ctx.getGarage().selected];
  if(stored){const car=state.vehicles.find(item=>item.id==='stratus');if(car)Object.assign(car,HOMES[stored].parking,{speed:0,parked:true});if(state.player.vehicleId==='stratus')Object.assign(state.player,{mode:'foot',vehicleId:null});}
  if(home&&canMove){
   const f=Number(input.throttle)-Number(input.brake),r=Number(input.right)-Number(input.left),yaw=input.viewHeading??0;
   const x=Math.sin(yaw)*f+Math.cos(yaw)*r,z=-Math.cos(yaw)*f+Math.sin(yaw)*r,n=Math.hypot(x,z),speed=input.sprint?5:3.2;
   if(n){const move=(axis:'x'|'z',amount:number)=>{const value=state.player[axis]+amount;const next={...state.player,[axis]:value};const b=HOME_ROOM.bounds;const blocked=homeColliders(home,this.career,this.ctx.getRoom().snapshot?.crewBase).some(c=>Math.abs(next.x-c.x)<c.halfX+.45&&Math.abs(next.z-c.z)<c.halfZ+.45);if(!blocked&&next.x>b.minX+.5&&next.x<b.maxX-.5&&next.z>b.minZ+.5&&next.z<b.maxZ-.5)state.player[axis]=value;};move('x',x/n*speed*dt);move('z',z/n*speed*dt);state.player.heading=Math.atan2(x,-z);}
  }
  if(!this.online){
   this.events.update(this.soloMembers(),this.ctx.getTime()*1000);
   for(const credit of this.events.drainCredits()){state.money+=credit.amount;this.soloCareer=awardReputation(this.soloCareer,`event:${this.sessionKey}:${credit.eventId}`,80);this.ctx.onMessage(`Wydarzenie ukończone: +$${credit.amount}, +80 reputacji.`);this.ctx.onSave();}
   const contract=this.soloCareer.activeContract;
   if(contract&&canMove&&!home&&this.ctx.getTime()-this.lastContractCheck>.12){this.lastContractCheck=this.ctx.getTime();const target=careerTarget(this.soloCareer);if(this.ctx.getTime()>=contract.deadline||target&&near(state.player,target,5))this.careerAction({type:'contractVisit'});}
   if(this.lastInside&&state.interior!=='casino'){const hand=this.casino.snapshot();if(hand.blackjack.status==='playing')this.casino.command({kind:'blackjackForfeit',version:hand.version},state.money);}
  }
  this.lastInside=state.interior==='casino';const activity=this.cityActivity;
  if(this.eventRoute&&(activity.status==='completed'||activity.status==='expired'))this.clearRoute();
  if(activity.id!==this.lastEventId&&activity.id){this.lastEventId=activity.id;if(this.ctx.getStarted())this.ctx.onMessage(`${activity.title} · nagroda $${activity.reward}. Naciśnij B, aby dołączyć.`);}
  this.eventsView.update(activity,Boolean(home||state.interior),dt);
  this.syncHome();
  if(this.casinoUI.active&&this.casinoUI.activeStation==='tournament'){const hand=this.ctx.getRoom().snapshot?.tournament.poker;this.ctx.view.setPoker(hand??null,Boolean(hand));}
 }
 missionReward(){const state=this.ctx.getState();if(!this.online&&state.missionsWon>0){this.soloCareer=awardReputation(this.soloCareer,`mission:${state.missionsWon}`,50);this.ctx.onSave();}}
 updateHUD(){
  const state=this.ctx.getState(),home=this.homeId,room=this.ctx.getRoom().snapshot;
  const rank=this.toolbar.querySelector('#career-reputation')!;rank.textContent=`${this.career.reputation} REP · ${reputationTier(this.career.reputation)}`;
  const contract=this.career.activeContract;
  this.contactHud.classList.toggle('hidden',!contract||Boolean(home||state.interior));
  if(contract){const def=CONTACTS[contract.id];this.contactHud.textContent=`${def.contact}: ${def.objectives[contract.stage].instruction} · ${Math.max(0,Math.ceil(contract.deadline-this.ctx.getTime()))} s`;}
  this.homeHint.classList.toggle('hidden',!home);
  if(home){
   this.homeHint.textContent=`${home==='crew'?CREW_BASE.name:HOMES[home].name} · E przy drzwiach: wyjście · E przy stole: planowanie`;
   const set=(id:string,text:string)=>{const node=document.getElementById(id);if(node)node.textContent=text;};
   set('district',home==='crew'?'DOCKHOUSE':HOMES[home].name.toUpperCase());set('map-location','Wnętrze mieszkania');set('mission-title','Twoje miejsce w mieście');set('mission-instruction','Podejdź do stołu planowania albo naciśnij L, aby zarządzać wyposażeniem i parkingiem.');set('mission-label','KRYJÓWKA · WNĘTRZE 3D');set('mission-status','W DOMU');set('car-name','WNĘTRZE · SWOBODNY RUCH');set('clock','⌂ KRYJÓWKA');
   set('mission-distance','Stół planowania · E');set('mission-reward','Kontakty · L');set('map-hint','⌂ Wyjście · Stół planowania');
   document.querySelector('#wanted')?.classList.add('hidden');document.querySelector('#city-event')?.classList.add('hidden');document.querySelector('#interaction')?.classList.remove('hidden');
   document.querySelector('#mission-progress')?.classList.add('hidden');document.querySelector('#escape')?.classList.add('hidden');
   document.querySelector('#mission-next')?.classList.add('hidden');document.querySelector('#crew-start')?.classList.add('hidden');
   set('interaction-text',near(state.player,HOME_ROOM.exit,1.1)?'Wyjdź z mieszkania':near(state.player,HOME_ROOM.planning,3)?'Podejdź do planu napadu':'Kontakty, wyposażenie i parking');
  }else if(!state.interior){
   const place=([...Object.keys(HOMES),'crew'] as VisitHomeId[]).find(id=>near(state.player,this.homeDoor(id),3));
   if(place&&state.player.mode==='foot'){document.querySelector('#interaction')?.classList.remove('hidden');document.querySelector('#interaction-text')!.textContent=place==='crew'?'Wejdź do bazy / zobacz ofertę':'Wejdź do mieszkania / zobacz ofertę';}
   if(state.pursuit&&state.wanted){const label=document.querySelector('#wanted .wanted-label');if(label)label.textContent=state.pursuit.status==='hidden'?`UKRYCIE ${Math.min(6,Math.floor(state.pursuit.concealmentSeconds))}/6`:state.pursuit.status==='search'?'TRWAJĄ POSZUKIWANIA':'WIDZI CIĘ PATROL';}
  }else{const station=casinoStationAt(state.player);if(station){document.querySelector('#interaction')?.classList.remove('hidden');document.querySelector('#interaction-text')!.textContent=station==='blackjack'?'Zagraj w blackjacka':station==='roulette'?'Zagraj w ruletkę':'Turniej pokera ze znajomymi';}}
  if(!home&&this.route)document.querySelector('#map-hint')!.textContent=`⌂ ${this.routeLabel}`;
  if(!home&&!state.interior&&this.cityActivity.canInteract){document.querySelector('#interaction')?.classList.remove('hidden');document.querySelector('#interaction-text')!.textContent=this.cityActivity.instruction;}
  if(this.careerUI.active)this.careerUI.refresh();this.casinoUI.refresh();this.eventsUI.refresh();
  if(room?.cityActivities.canInteract&&!home&&!state.interior){document.querySelector('#interaction')?.classList.remove('hidden');document.querySelector('#interaction-text')!.textContent=room.cityActivities.instruction;}
 }
 drawHomeMap(ctx:CanvasRenderingContext2D):boolean {
  if(!this.homeId)return false;const state=this.ctx.getState();ctx.save();ctx.scale(ctx.canvas.width/224,ctx.canvas.height/200);ctx.fillStyle='#162434';ctx.fillRect(0,0,224,200);ctx.fillStyle='#29474e';ctx.fillRect(18,14,188,174);ctx.strokeStyle='#aad4bb';ctx.lineWidth=2;ctx.strokeRect(18,14,188,174);
  const point=(p:Point)=>({x:112+p.x*12,y:90+p.z*12});const desk=point(HOME_ROOM.planning);ctx.fillStyle='#cbaa71';ctx.fillRect(desk.x-21,desk.y-10,42,20);const exit=point(HOME_ROOM.exit);ctx.fillStyle='#8fe0c1';ctx.fillRect(exit.x-12,exit.y,24,5);
  const room=this.ctx.getRoom().snapshot;for(const member of room?.members??[]){if(member.id===room?.youId||member.pose.homeId!==this.homeId)continue;const p=point(member.pose);ctx.fillStyle='#9ec7ff';ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill();}
  const p=point(state.player);ctx.fillStyle='#ffdf9c';ctx.beginPath();ctx.arc(p.x,p.y,5,0,Math.PI*2);ctx.fill();ctx.restore();return true;
 }
}

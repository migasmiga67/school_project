import { appearanceAction, parseAppearance, type AppearanceAction, type AppearanceState } from './appearance';
import { AppearanceUI } from './appearance-ui';
import { HostPhone, type PhoneAction } from './phone';
import { PHONE_DESTINATIONS, PhoneUI } from './phone-ui';
import { CampaignController, type CampaignAction } from './campaign';
import { CampaignUI } from './campaign-ui';
import { Factions, type FactionAction } from './factions';
import { FactionsUI } from './factions-ui';
import { FactionsView } from './factions-view';
import { BIKE_LOCATION, DOCK, MobilityTrials, mobilityPrompt, type MobilityTrialAction } from './mobility';
import { MobilityUI } from './mobility-ui';
import { GARAGE_CARS, type GarageState } from './garage';
import type { GameState, Point } from './model';
import type { MultiplayerSession, MultiplayerState, OnlinePose } from './multiplayer-model';
import type { CityView } from './world';
import './stories.css';

interface StoriesContext {
 getState():GameState;getRoom():MultiplayerState;session:MultiplayerSession;view:CityView;
 getPose():OnlinePose;getGarage():GarageState;getTime():number;getStarted():boolean;getPaused():boolean;getHome():string|null;
 getReputation():number;isStored():boolean;award(source:string,reputation:number):void;
 onOpen():void;onClose():void;onMessage(text:string):void;onSave():void;onRoute():void;
 onContacts():void;onActivities():void;
}
const SOLO='solo';
const object=(value:unknown):value is Record<string,unknown>=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));

/** Story, style and social systems share the existing solo/room wallet boundary. */
export class CityStories {
 readonly phoneUI:PhoneUI;readonly appearanceUI:AppearanceUI;readonly factionsUI:FactionsUI;readonly campaignUI:CampaignUI;readonly mobilityUI:MobilityUI;
 private appearance:AppearanceState;
 private readonly phone=new HostPhone(SOLO);
 private readonly factions:Factions;
 private readonly campaign:CampaignController;
 private readonly trials=new MobilityTrials();
 private readonly factionView=new FactionsView();
 private readonly sessionKey=crypto.randomUUID();
 private route:Point|null=null;private routeLabel='';private routeKind:'fixed'|'campaign'|'faction'|'trial'='fixed';private deliveryVersion=-1;
 private savedSignature='';private saveClock=0;
 private previousCampaign='idle';private previousFaction='idle';private previousTrial='idle';

 constructor(private ctx:StoriesContext,initial:unknown){
  const saved=object(initial)?initial:{};this.appearance=parseAppearance(saved.appearance);this.factions=new Factions(saved.factions,SOLO);this.campaign=new CampaignController(SOLO,saved.campaign);
  const host=()=>{const div=document.createElement('div');document.querySelector('#app')!.append(div);return div;};
  this.appearanceUI=new AppearanceUI(host(),{getAppearance:()=>this.currentAppearance,getWallet:()=>ctx.getState().money,isOnline:()=>this.online,onAction:action=>this.appearanceAction(action),onOpen:ctx.onOpen,onClose:ctx.onClose,onMessage:ctx.onMessage});
  this.factionsUI=new FactionsUI(host(),{getSnapshot:()=>this.faction,onAction:action=>this.factionAction(action),onRoute:(p,label)=>this.navigate(p,label),onOpen:ctx.onOpen,onClose:ctx.onClose,onMessage:ctx.onMessage});
  this.campaignUI=new CampaignUI(host(),{getSnapshot:()=>this.story,onAction:action=>this.campaignAction(action),onRoute:p=>this.navigate(p,this.story.title),onOpen:ctx.onOpen,onClose:ctx.onClose,onMessage:ctx.onMessage});
  this.mobilityUI=new MobilityUI(host(),{getSnapshot:()=>this.trial,getMounted:()=>{const state=ctx.getState();return state.player.mode==='drive'?state.vehicles.find(car=>car.id===state.player.vehicleId)??null:null;},onAction:action=>this.mobilityAction(action),onRoute:(p,label)=>this.navigate(p,label),onOpen:ctx.onOpen,onClose:ctx.onClose,onMessage:ctx.onMessage});
  this.phoneUI=new PhoneUI(host(),{
   getSnapshot:()=>this.phoneSnapshot,getWallet:()=>ctx.getState().money,isOnline:()=>this.online,getSelfId:()=>ctx.getRoom().snapshot?.youId??SOLO,
   getPosition:()=>ctx.getState().player,getReputation:ctx.getReputation,getCarName:()=>GARAGE_CARS[ctx.getGarage().selected].name,
   getDestinations:()=>[...PHONE_DESTINATIONS,{id:'dock',name:'Przystań TideRunner',point:DOCK.land,icon:'≈'},{id:'bike',name:'Motocykl Vortex R',point:BIKE_LOCATION,icon:'◉'}],
   onAction:action=>this.phoneAction(action),onRoute:(p,label)=>this.navigate(p,label),onContacts:ctx.onContacts,onActivities:ctx.onActivities,
   onAppearance:()=>this.appearanceUI.open(),onFactions:()=>this.factionsUI.open(),onCampaign:()=>this.campaignUI.open(),onMobility:()=>this.mobilityUI.open(),
   onOpen:ctx.onOpen,onClose:ctx.onClose,onMessage:ctx.onMessage,
  });
  ctx.view.addCityObject(this.factionView.group);
  const button=document.createElement('button');button.id='phone-open';button.innerHTML='Telefon <kbd>T</kbd>';button.onclick=()=>this.openPhone();document.querySelector('.expansion-toolbar')!.append(button);
  this.factions.update(this.members(),0);this.campaign.update(this.members(),0);this.phone.update(this.members(),0);this.savedSignature=JSON.stringify(this.saved);
 }
 get online(){return this.ctx.getRoom().status==='online'&&Boolean(this.ctx.getRoom().snapshot);}
 get currentAppearance(){return this.ctx.getRoom().snapshot?.appearance??this.appearance;}
 get faction(){return this.ctx.getRoom().snapshot?.factions??this.factions.snapshot(SOLO);}
 get story(){return this.ctx.getRoom().snapshot?.campaign??this.campaign.snapshot(SOLO);}
 get trial(){return this.ctx.getRoom().snapshot?.mobilityTrial??this.trials.snapshot(SOLO);}
 get phoneSnapshot(){return this.ctx.getRoom().snapshot?.phone??this.phone.snapshot(SOLO);}
 get saved(){return{appearance:this.appearance,factions:this.factions.save(SOLO),campaign:this.campaign.save()};}
 get active(){return this.phoneUI.active||this.appearanceUI.active||this.factionsUI.active||this.campaignUI.active||this.mobilityUI.active;}
 get snapshot(){return{appearance:structuredClone(this.currentAppearance),phone:this.phoneSnapshot,factions:this.faction,campaign:this.story,mobilityTrial:this.trial,phoneOpen:this.phoneUI.active,appearanceOpen:this.appearanceUI.active,factionsOpen:this.factionsUI.active,campaignOpen:this.campaignUI.active,mobilityOpen:this.mobilityUI.active};}
 get target():Point|undefined {
  if(this.ctx.getHome())return undefined;
  if(this.route&&this.routeKind!=='fixed')return(this.routeKind==='campaign'?this.story.target:this.routeKind==='faction'?this.faction.job.target:this.trial.target)??undefined;
  return this.route??(this.story.status==='active'?this.story.target: null)??(this.faction.job.status==='active'?this.faction.job.target:null)??(this.trial.status==='running'?this.trial.target:null)??undefined;
 }
 clearRoute(){this.route=null;this.routeKind='fixed';}
 private navigate(point:Point,label:string){this.ctx.onRoute();const same=(other:Point|null)=>Boolean(other&&Math.hypot(point.x-other.x,point.z-other.z)<.01);this.routeKind=same(this.story.target)?'campaign':same(this.faction.job.target)?'faction':same(this.trial.target)?'trial':'fixed';this.route={...point};this.routeLabel=label;this.ctx.onMessage(`GPS: ${label}.`);}
 openPhone(){if(!this.active)this.phoneUI.open();}
 handleKey(event:KeyboardEvent):boolean {
  const visible=[this.phoneUI,this.appearanceUI,this.factionsUI,this.campaignUI,this.mobilityUI].find(ui=>ui.active);
  if(visible){if(event.key==='Escape'&&!event.repeat){event.preventDefault();visible.handleEscape();}return true;}
  if(!this.ctx.getStarted()||this.ctx.getPaused()||event.repeat||event.ctrlKey||event.metaKey||event.altKey)return false;
  const key=event.key.toLowerCase();if(key==='t'){this.openPhone();return true;}if(key==='v'){this.appearanceUI.open();return true;}if(key==='z'){this.factionsUI.open();return true;}if(key==='y'){this.campaignUI.open();return true;}return false;
 }
 private members(){return[{id:SOLO,name:'Ty',pose:this.ctx.getPose()}];}
 private crewBusy(){const snap=this.ctx.getRoom().snapshot;return Boolean(snap&&(snap.jobs.active||snap.challenge.status==='active'||snap.tournament.status==='playing'));}
 private appearanceAction(action:AppearanceAction){
  if(this.online){this.ctx.session.appearance(action);return;}
  const result=appearanceAction(this.appearance,this.ctx.getState().money,action);
  if(!result.ok){this.appearanceUI.report(result.reason);return;}
  this.appearance=result.appearance;this.ctx.getState().money=result.wallet;this.appearanceUI.report(result.message);this.flush();
 }
 private phoneAction(action:PhoneAction){
  const state=this.ctx.getState();
  if(action.kind==='requestCar'&&state.wanted){this.phoneUI.report('Zgub pościg, zanim zamówisz własne auto.');return;}
  if(this.online){this.ctx.session.phone(action);return;}
  if(action.kind==='chat'||action.kind==='invite'||action.kind==='acceptInvite'||action.kind==='declineInvite'||action.kind==='cancelInvite'){this.phoneUI.report('Czat i zaproszenia działają po dołączeniu do pokoju online.');return;}
  const result=this.phone.command(SOLO,action,this.members(),state.money,this.ctx.getTime()*1000,{stored:this.ctx.isStored(),busy:this.story.status==='active'||this.faction.job.status==='active'||this.trial.status==='running',wanted:state.wanted});
  if(!result.ok){this.phoneUI.report(result.reason);return;}state.money=result.wallet;
  if(result.delivery)this.applyDelivery(result.delivery);this.phoneUI.report(result.message);this.ctx.onSave();
 }
 private applyDelivery(target:Point&{heading:number}){const car=this.ctx.getState().vehicles.find(vehicle=>vehicle.id==='stratus');if(car)Object.assign(car,target,{speed:0,parked:true});}
 private factionAction(action:FactionAction){
  if(action.kind==='start'&&(this.crewBusy()||this.story.status==='active'||this.trial.status==='running')){this.factionsUI.report('Najpierw zakończ bieżące zlecenie lub próbę czasową.');return;}
  if(this.online){this.ctx.session.faction(action);return;}
  const result=this.factions.command(SOLO,action,this.members(),this.ctx.getTime()*1000);
  if(!result.ok){this.factionsUI.report(result.reason);return;}if(action.kind==='start'){this.ctx.onRoute();this.route=null;}
  this.factionsUI.report(action.kind==='join'?'Dołączyłeś do frakcji. Wybierz zlecenie w zakładce Robota.':this.faction.job.message);this.flush();
 }
 private campaignAction(action:CampaignAction){
  if(['start','continue','retry'].includes(action.kind)&&(this.crewBusy()||this.faction.job.status==='active'||this.trial.status==='running')){this.campaignUI.report('Najpierw zakończ aktywność ekipy, frakcji lub próbę czasową.');return;}
  if(this.online){this.ctx.session.campaign(action);return;}
  const result=this.campaign.command(SOLO,action,this.members(),this.ctx.getTime()*1000);
  if(!result.ok){this.campaignUI.report(result.reason);return;}this.ctx.onRoute();this.route=null;this.campaignUI.report(result.message);this.flush();
 }
 private mobilityAction(action:MobilityTrialAction){
  if(action.kind==='start'&&(this.crewBusy()||this.story.status==='active'||this.faction.job.status==='active')){this.mobilityUI.report('Najpierw zakończ bieżące zlecenie.');return;}
  if(this.online){this.ctx.session.mobilityTrial(action);return;}
  const result=this.trials.command(SOLO,action,this.members(),this.ctx.getTime()*1000);
  if(!result.ok){this.mobilityUI.report(result.reason);return;}this.ctx.onRoute();this.route=null;this.mobilityUI.report(this.trial.message);
 }
 interact():boolean {
  if(this.faction.job.status==='active'&&this.faction.job.canInteract){this.factionAction({kind:'interact'});return true;}
  return false;
 }
 roomChanged(next:MultiplayerState,previous:MultiplayerState){
  const snapshot=next.snapshot;
  if(next.status==='online'&&snapshot){
   if(snapshot.deliveryEffect.version!==this.deliveryVersion){this.deliveryVersion=snapshot.deliveryEffect.version;if(snapshot.deliveryEffect.target){this.applyDelivery(snapshot.deliveryEffect.target);this.phoneUI.report('Twój samochód czeka na pobliskiej ulicy.');}}
   if(next.message&&next.message!==previous.message){this.phoneUI.report(next.message);this.appearanceUI.report(next.message);this.factionsUI.report(next.message);this.campaignUI.report(next.message);this.mobilityUI.report(next.message);}
   if(snapshot.campaign.status==='active'&&previous.snapshot?.campaign.status!=='active'||snapshot.factions.job.status==='active'&&previous.snapshot?.factions.job.status!=='active'||snapshot.mobilityTrial.status==='running'&&previous.snapshot?.mobilityTrial.status!=='running'){this.ctx.onRoute();this.route=null;}
  }else if(previous.status==='online'&&next.status!=='connecting'){
   this.deliveryVersion=-1;this.route=null;for(const ui of[this.phoneUI,this.appearanceUI,this.factionsUI,this.campaignUI,this.mobilityUI])ui.close();
  }
 }
 step(dt:number){
  const state=this.ctx.getState(),now=this.ctx.getTime()*1000;
  if(!this.online){
   const members=this.members();this.phone.update(members,now);this.factions.update(members,now);this.campaign.update(members,now);this.trials.update(members,now);
   const credits=[...this.factions.drainCredits(),...this.campaign.drainCredits(),...this.trials.drainCredits().map(credit=>({...credit,reputation:40,sourceId:`${credit.sourceId}:${this.sessionKey}`}))];
   for(const credit of credits){state.money+=credit.amount;this.ctx.award(credit.sourceId,credit.reputation);this.ctx.onMessage(credit.reputation?`Zlecenie ukończone: +$${credit.amount}, +${credit.reputation} reputacji.`:`Dochód frakcji: +$${credit.amount}.`);}
   this.saveClock+=dt;if(credits.length||this.saveClock>.3){this.saveClock=0;this.flush(credits.length>0);}
  }
  this.ctx.view.setAppearance(this.currentAppearance);
  this.factionView.update(this.faction,Boolean(state.interior||this.ctx.getHome()),dt);
  const campaign=this.story,job=this.faction.job,trial=this.trial;
  if(campaign.status!==this.previousCampaign){if(['interlude','choice','completed','failed'].includes(campaign.status)&&campaign.status!=='idle')this.ctx.onMessage(campaign.message);this.previousCampaign=campaign.status;this.route=null;}
  if(job.status!==this.previousFaction){if(job.status==='completed'||job.status==='failed')this.ctx.onMessage(job.message);this.previousFaction=job.status;if(job.status!=='active')this.route=null;}
  if(trial.status!==this.previousTrial){if(trial.status==='completed'||trial.status==='failed')this.ctx.onMessage(trial.message);this.previousTrial=trial.status;if(trial.status!=='running')this.route=null;}
 }
 private flush(force=false){if(this.online)return;const signature=JSON.stringify(this.saved);if(force||signature!==this.savedSignature){this.savedSignature=signature;this.ctx.onSave();}}
 updateHUD(){
  const state=this.ctx.getState();this.phoneUI.refresh();this.appearanceUI.refresh();this.factionsUI.refresh();this.campaignUI.refresh();this.mobilityUI.refresh();
  if(this.ctx.getHome()||state.interior)return;
  const set=(id:string,text:string)=>{const node=document.getElementById(id);if(node)node.textContent=text;};
  const campaign=this.story,job=this.faction.job,trial=this.trial;
  if(campaign.status==='active'||job.status==='active'||trial.status==='running'){
   const story=campaign.status==='active',faction=!story&&job.status==='active',remaining=story?campaign.remainingMs:faction?job.remainingMs:trial.remainingMs;
   set('mission-label',story?`FABUŁA · ROZDZIAŁ ${campaign.chapter+1}/5`:faction?'FRAKCJE · WPŁYWY':'PRÓBA CZASOWA');set('mission-title',story?campaign.title:faction?'Pod twoją flagą':trial.course==='boat'?'Puchar Ocean Drive':'Motocyklowy objazd');
   set('mission-instruction',story?campaign.instruction:faction?job.message:trial.message);set('mission-status',`${Math.floor(remaining/60000)}:${String(Math.ceil(remaining/1000)%60).padStart(2,'0')}`);set('mission-reward',`+$${story?campaign.reward:faction?job.reward:trial.reward}`);
   set('mission-distance',story?`Cel ${campaign.objective+1}/${campaign.objectiveCount}`:faction?`Kontrola: ${job.progress}%`:`Punkt ${trial.checkpoint}/${trial.total}`);
   document.querySelector('#mission-next')?.classList.add('hidden');document.querySelector('#crew-start')?.classList.add('hidden');document.querySelector('#mission-progress')?.classList.add('hidden');document.querySelector('#escape')?.classList.add('hidden');
  }
  if(this.route)set('map-hint',this.routeLabel);
  const prompt=mobilityPrompt(state);if(prompt){document.querySelector('#interaction')?.classList.remove('hidden');set('interaction-text',prompt);}
  if(job.canInteract){document.querySelector('#interaction')?.classList.remove('hidden');set('interaction-text','Frakcja · potwierdź cel / rozpocznij przejęcie');}
  if(state.vehicles.find(vehicle=>vehicle.id===state.player.vehicleId)?.kind==='boat'){set('district','OCEAN DRIVE · ZATOKA');set('map-location','Ocean Drive · woda');set('car-name','TIDERUNNER · MOTORÓWKA');}
 }
}

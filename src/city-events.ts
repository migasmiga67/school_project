import type { Point } from './model';
import type { OnlinePose } from './multiplayer-model';

export const CITY_ACTIVITY_FIRST_MS = 45000;
export const CITY_ACTIVITY_PERIOD_MS = 240000;
export const CITY_ACTIVITY_DURATION_MS = 180000;
export const CONVOY_INTERCEPT_MS = 3000;
export const WANTED_VEHICLE_ID = 'parked-3';
export type CityActivityKind = 'convoy' | 'wanted' | 'courier';
export type CityActivityStatus = 'upcoming' | 'available' | 'active' | 'completed' | 'expired';
export type CityActivityStage = 'pickup' | 'checkpoint' | 'delivery';
export interface CityEventMember { id:string; name:string; pose:OnlinePose }
export interface CityEventAction { kind:'join'|'interact'|'abandon'; eventId:string }
export type CityEventResult = {ok:true}|{ok:false;reason:string};
export interface ConvoyPose extends Point { heading:number; speed:number }
export interface CityEventsSnapshot {
  id:string|null; kind:CityActivityKind|null; status:CityActivityStatus; stage:CityActivityStage|null;
  title:string; instruction:string; reward:number; remainingMs:number; nextInMs:number;
  joined:boolean; eligible:boolean; canJoin:boolean; canInteract:boolean;
  participants:{id:string;name:string;progress:number}[];
  holderId:string|null; holderName:string|null; winnerId:string|null; winnerName:string|null;
  target:Point|null; pickup:Point|null; checkpoint:Point|null; drop:Point|null;
  convoy:ConvoyPose|null; vehicleId:string|null; progress:number;
}
export interface CityActivityCredit { id:string; amount:number; eventId:string }
interface Definition { kind:CityActivityKind; title:string; reward:number; pickup:Point; checkpoint:Point; drop:Point }
const DEFINITIONS:readonly Definition[] = [
  {kind:'convoy',title:'Konwój na wybrzeżu',reward:650,pickup:{x:80,z:40},checkpoint:{x:0,z:-80},drop:{x:-80,z:0}},
  {kind:'wanted',title:'Poszukiwany Sentinel',reward:550,pickup:{x:-75,z:-44},checkpoint:{x:-80,z:40},drop:{x:0,z:80}},
  {kind:'courier',title:'Przesyłka: pierwszy na mecie',reward:450,pickup:{x:40,z:0},checkpoint:{x:40,z:80},drop:{x:-40,z:80}},
];
const yes:CityEventResult={ok:true};
const no=(reason:string):CityEventResult=>({ok:false,reason});
const near=(a:Point,b:Point,radius:number)=>Math.hypot(a.x-b.x,a.z-b.z)<=radius;
const finite=(now:number)=>Number.isFinite(now)&&now>=0;
const outdoor=(person:CityEventMember)=>person.pose.interior===null&&!person.pose.seated&&!person.pose.passengerOf&&!(person.pose as OnlinePose&{homeId?:string|null}).homeId;
const driving=(person:CityEventMember)=>outdoor(person)&&person.pose.mode==='drive'&&person.pose.vehicle!==null&&person.pose.vehicle.health>0;
const slow=(person:CityEventMember)=>outdoor(person)&&Math.abs(person.pose.vehicle?.speed??0)<=3;
const clone=<T>(value:T):T=>structuredClone(value);

/** A moving route on real streets. The same clock produces the same convoy in every browser. */
export function convoyPose(elapsedSeconds:number):ConvoyPose {
  const seconds=Number.isFinite(elapsedSeconds)?Math.max(0,elapsedSeconds):0;
  const route=[{x:80,z:40},{x:80,z:-80},{x:-80,z:-80},{x:-80,z:80},{x:80,z:80}];
  let remaining=seconds*7%640;
  for(let i=0;i<route.length;i++){
    const from=route[i],to=route[(i+1)%route.length],distance=Math.hypot(to.x-from.x,to.z-from.z);
    if(remaining<=distance)return {x:from.x+(to.x-from.x)*remaining/distance,z:from.z+(to.z-from.z)*remaining/distance,heading:Math.atan2(to.x-from.x,-(to.z-from.z)),speed:7};
    remaining-=distance;
  }
  return {...route[0],heading:0,speed:7};
}

/** Host-owned event state; clients submit intent, never rewards or elapsed progress. */
export class CityEvents {
  private epoch:number|null=null;
  private now=0;
  private lastUpdate=0;
  private run=-1;
  private status:CityActivityStatus='upcoming';
  private stage:CityActivityStage='pickup';
  private definition:Definition=DEFINITIONS[0];
  private members=new Map<string,CityEventMember>();
  private participants=new Map<string,{name:string;progress:number;engaged:boolean}>();
  private holderId:string|null=null;
  private winnerId:string|null=null;
  private winnerName:string|null=null;
  private frozenConvoy:ConvoyPose|null=null;
  private wantedLastKnown:Point={...DEFINITIONS[1].pickup};
  private credits:CityActivityCredit[]=[];

  update(members:CityEventMember[],nowMs:number):void {
    if(!finite(nowMs))return;
    const oldNow=this.now;
    this.now=Math.max(this.now,nowMs);
    if(this.epoch===null)this.epoch=this.now;
    this.members=new Map(members.map(person=>[person.id,clone(person)]));
    const wantedDriver=members.find(person=>person.pose.vehicle?.id===WANTED_VEHICLE_ID&&outdoor(person));
    if(wantedDriver)this.wantedLastKnown={x:wantedDriver.pose.vehicle!.x,z:wantedDriver.pose.vehicle!.z};
    const elapsed=this.now-this.epoch;
    if(elapsed<CITY_ACTIVITY_FIRST_MS){this.lastUpdate=this.now;return;}
    const run=Math.floor((elapsed-CITY_ACTIVITY_FIRST_MS)/CITY_ACTIVITY_PERIOD_MS);
    if(run!==this.run){this.start(run);this.lastUpdate=this.now;}
    const dt=Math.min(250,Math.max(0,this.now-Math.max(oldNow,this.lastUpdate)));
    this.lastUpdate=this.now;
    if(this.status==='completed'||this.status==='expired')return;
    if(this.now>=this.deadline()){
      this.status='expired';this.holderId=null;return;
    }
    for(const id of this.participants.keys())if(!this.members.has(id))this.participants.delete(id);
    if(this.holderId&&!this.participants.has(this.holderId))this.releaseCargo();
    if(this.definition.kind==='convoy'&&!this.holderId){
      const target=this.currentConvoy();
      for(const [id,participant] of this.participants){
        const person=this.members.get(id)!;
        if(!participant.engaged||!this.canIntercept(person,target)){participant.progress=0;continue;}
        participant.progress=Math.min(CONVOY_INTERCEPT_MS,participant.progress+dt);
        if(participant.progress>=CONVOY_INTERCEPT_MS){this.takeCargo(id);break;}
      }
    }
    if(this.holderId&&this.stage==='checkpoint'){
      const holder=this.members.get(this.holderId)!;
      if(this.validCarrier(holder)&&near(holder.pose,this.definition.checkpoint,6))this.stage='delivery';
    }
    if(this.participants.size>0&&this.status==='available')this.status='active';
  }

  command(id:string,action:CityEventAction,members:CityEventMember[],nowMs:number):CityEventResult {
    if(!finite(nowMs))return no('Niepoprawny czas wydarzenia.');
    this.update(members,nowMs);
    const person=this.members.get(id);
    if(!person)return no('Nie należysz do tej sesji miasta.');
    if(!action||typeof action!=='object'||!['join','interact','abandon'].includes(action.kind)||typeof action.eventId!=='string')return no('Niepoprawna akcja wydarzenia.');
    if(action.eventId!==this.eventId()||!['available','active'].includes(this.status))return no('To wydarzenie nie jest już aktywne.');
    if(action.kind==='abandon'){
      if(!this.participants.has(id))return no('Nie uczestniczysz w tym wydarzeniu.');
      this.participants.delete(id);if(this.holderId===id)this.releaseCargo();return yes;
    }
    if(!outdoor(person))return no('Wyjdź na ulicę i opuść miejsce pasażera.');
    if(action.kind==='join'){
      if(this.participants.has(id))return no('Już uczestniczysz w tym wydarzeniu.');
      if(this.holderId)return no('Ładunek jest już w drodze. Obserwuj finał albo zaczekaj na kolejne wydarzenie.');
      this.participants.set(id,{name:person.name,progress:0,engaged:false});this.status='active';return yes;
    }
    if(!this.participants.has(id))return no('Najpierw dołącz do wydarzenia.');
    if(this.holderId&&this.holderId!==id)return no('Inny gracz przewozi ładunek.');
    if(this.stage==='pickup'){
      if(this.definition.kind==='convoy'){
        if(!this.canIntercept(person,this.currentConvoy()))return no('Jedź obok konwoju, w promieniu 8 metrów, z prędkością do 43 km/h.');
        this.participants.get(id)!.engaged=true;return yes;
      }
      if(this.definition.kind==='wanted'){
        if(!driving(person)||person.pose.vehicle?.id!==WANTED_VEHICLE_ID||!slow(person))return no('Przejmij wskazanego Sentinela i zatrzymaj go, aby potwierdzić odbiór.');
      }else if(!slow(person)||!near(person.pose,this.definition.pickup,5))return no('Zatrzymaj się przy przesyłce i odbierz ją.');
      this.takeCargo(id);return yes;
    }
    if(this.stage==='checkpoint')return no('Najpierw przejedź przez punkt kontrolny na minimapie.');
    if(!this.validCarrier(person)||!slow(person)||!near(person.pose,this.definition.drop,6))return no('Dostarcz ładunek do celu i zatrzymaj się.');
    this.status='completed';this.winnerId=id;this.winnerName=person.name;
    this.credits.push({id,amount:this.definition.reward,eventId:this.eventId()!});return yes;
  }

  snapshot(viewerId:string):CityEventsSnapshot {
    const nextAt=(this.epoch??this.now)+CITY_ACTIVITY_FIRST_MS+(this.run+1)*CITY_ACTIVITY_PERIOD_MS;
    const person=this.members.get(viewerId),participant=this.participants.get(viewerId),live=this.status==='available'||this.status==='active';
    const pickup=this.definition.kind==='convoy'?this.currentConvoy():this.definition.kind==='wanted'?this.wantedLocation():this.definition.pickup;
    const target=!live?null:this.stage==='pickup'?pickup:this.stage==='checkpoint'?this.definition.checkpoint:this.definition.drop;
    const eligible=Boolean(participant),isHolder=this.holderId===viewerId;
    const canInteract=Boolean(live&&person&&participant&&(!this.holderId||isHolder)&&outdoor(person)&&(
      this.stage==='pickup'?(this.definition.kind==='convoy'?this.canIntercept(person,this.currentConvoy()):this.definition.kind==='wanted'?driving(person)&&person.pose.vehicle?.id===WANTED_VEHICLE_ID&&slow(person):slow(person)&&near(person.pose,pickup,5)):
      this.stage==='delivery'&&this.validCarrier(person)&&slow(person)&&near(person.pose,this.definition.drop,6)));
    return clone({id:this.eventId(),kind:this.run<0?null:this.definition.kind,status:this.status,stage:this.run<0?null:this.stage,title:this.run<0?'Wydarzenia miasta':this.definition.title,
      instruction:this.instruction(viewerId),reward:this.run<0?0:this.definition.reward,remainingMs:live?Math.max(0,this.deadline()-this.now):0,nextInMs:Math.max(0,nextAt-this.now),
      joined:eligible,eligible,canJoin:Boolean(live&&!eligible&&!this.holderId&&person&&outdoor(person)),canInteract,
      participants:[...this.participants].map(([id,p])=>({id,name:p.name,progress:Math.round(p.progress/CONVOY_INTERCEPT_MS*100)})),
      holderId:this.holderId,holderName:this.holderId?this.members.get(this.holderId)?.name??null:null,winnerId:this.winnerId,winnerName:this.winnerName,
      target:target?{x:target.x,z:target.z}:null,pickup:this.run<0?null:{x:pickup.x,z:pickup.z},checkpoint:this.run<0?null:this.definition.checkpoint,drop:this.run<0?null:this.definition.drop,
      convoy:this.run>=0&&this.definition.kind==='convoy'?this.currentConvoy():null,vehicleId:this.definition.kind==='wanted'?WANTED_VEHICLE_ID:null,progress:participant?Math.round(participant.progress/CONVOY_INTERCEPT_MS*100):0});
  }

  drainCredits():CityActivityCredit[]{const credits=this.credits;this.credits=[];return credits;}
  private eventId(){return this.run<0?null:`activity-${this.run}-${this.definition.kind}`;}
  private startsAt(){return (this.epoch??this.now)+CITY_ACTIVITY_FIRST_MS+this.run*CITY_ACTIVITY_PERIOD_MS;}
  private deadline(){return this.startsAt()+CITY_ACTIVITY_DURATION_MS;}
  private start(run:number){
    this.run=run;this.definition=DEFINITIONS[run%DEFINITIONS.length];this.status='available';this.stage='pickup';
    this.participants.clear();this.holderId=null;this.winnerId=null;this.winnerName=null;this.frozenConvoy=null;
  }
  private currentConvoy(){return this.frozenConvoy??convoyPose((this.now-this.startsAt())/1000);}
  private wantedLocation():Point {return this.wantedLastKnown;}
  private canIntercept(person:CityEventMember,target:Point){return driving(person)&&Math.abs(person.pose.vehicle!.speed)<=12&&near(person.pose,target,8);}
  private validCarrier(person:CityEventMember){
    return this.definition.kind==='wanted'?driving(person)&&person.pose.vehicle!.id===WANTED_VEHICLE_ID&&person.pose.vehicle!.health>=30:
      this.definition.kind==='convoy'?driving(person):outdoor(person);
  }
  private takeCargo(id:string){
    this.holderId=id;this.stage='checkpoint';if(this.definition.kind==='convoy')this.frozenConvoy={...this.currentConvoy(),speed:0};
  }
  private releaseCargo(){
    this.holderId=null;this.stage='pickup';this.frozenConvoy=null;
    for(const p of this.participants.values()){p.progress=0;p.engaged=false;}
  }
  private instruction(viewerId:string){
    if(this.run<0)return 'Konwoje, poszukiwane auta i dostawy pojawiają się cyklicznie. Każdy finał ma jednego zwycięzcę.';
    if(this.status==='expired')return 'Czas minął. Ładunek został wycofany; następne wydarzenie rozpocznie się za chwilę.';
    if(this.status==='completed')return `${this.winnerName??'Gracz'} dostarczył ładunek i otrzymał $${this.definition.reward}.`;
    if(!this.participants.has(viewerId))return this.holderId?'Ładunek jest już w drodze. Możesz obserwować pozostałych graczy.':'Dołącz, aby ścigać się o jedną nagrodę. Odbiór → punkt kontrolny → dostawa.';
    if(this.holderId&&this.holderId!==viewerId)return `${this.members.get(this.holderId)?.name??'Inny gracz'} przejął ładunek. Obserwuj finał lub zrezygnuj.`;
    if(this.stage==='checkpoint')return 'Ładunek jest twój. Przejedź przez punkt kontrolny; następnie zawieź go do odbiorcy.';
    if(this.stage==='delivery')return this.definition.kind==='wanted'?'Dostarcz wskazanego Sentinela w stanie co najmniej 30%, zatrzymaj się i potwierdź dostawę.':'Zatrzymaj się przy odbiorcy i potwierdź dostawę, aby otrzymać nagrodę.';
    if(this.definition.kind==='convoy')return 'Dogoń konwój. Zacznij przejęcie i utrzymaj się obok przez 3 sekundy, jadąc do 43 km/h.';
    if(this.definition.kind==='wanted')return 'Odnajdź oznaczonego Sentinela. Wsiądź za kierownicę, zatrzymaj się i potwierdź przejęcie.';
    return 'Dotrzyj pierwszy do przesyłki i potwierdź odbiór. Tylko jeden gracz może ją przewieźć.';
  }
}

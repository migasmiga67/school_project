import type { GameState, Input, Point, Vehicle } from './model';
import type { OnlinePose } from './multiplayer-model';

export const WATER_BOUNDS={minX:118,maxX:190,minZ:-92,maxZ:92};
export const DOCK={land:{x:96,z:20},mooring:{x:124,z:26},radius:10};
export const BIKE_LOCATION:Readonly<Point>={x:4.5,z:82};
export interface BikeRamp extends Point {id:string;heading:number;width:number;length:number;height:number}
export const BIKE_RAMPS:readonly BikeRamp[]=[
 {id:'ocean-ramp',x:44,z:55,heading:0,width:3.2,length:8,height:1.5},
 {id:'downtown-ramp',x:-4,z:-6,heading:Math.PI,width:3.2,length:7,height:1.25},
];
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const near=(a:Point,b:Point,radius:number)=>Math.hypot(a.x-b.x,a.z-b.z)<=radius;
const wrap=(value:number)=>Math.atan2(Math.sin(value),Math.cos(value));
const momentum=new WeakMap<Vehicle,Point>();
const flight=new WeakMap<Vehicle,{ramp:string|null;airborne:boolean}>();
export function resetMobilityMotion(vehicle:Vehicle){momentum.delete(vehicle);flight.delete(vehicle);vehicle.airHeight=0;vehicle.airVelocity=0;vehicle.lean=0;}

/** Boats keep momentum during a turn and coast much longer than road vehicles. */
export function advanceBoat(boat:Vehicle,input:Input,dt:number):boolean {
 if(!Number.isFinite(dt)||dt<=0)return false;dt=Math.min(dt,.05);
 const acceleration=input.throttle?(input.boost?10:7.5):input.brake?(boat.speed>1?-8:-3.5):-Math.sign(boat.speed)*Math.min(Math.abs(boat.speed)/Math.max(dt,.001),.6+Math.abs(boat.speed)*.035);
 boat.speed=clamp(boat.speed+acceleration*dt,-6,input.boost?32:26);
 if(input.handbrake)boat.speed*=Math.exp(-dt*1.8);
 const target=Number(input.right)-Number(input.left);boat.steer+=(target-boat.steer)*Math.min(1,dt*2.7);
 boat.heading=wrap(boat.heading+boat.steer*Math.min(Math.abs(boat.speed)/6,1)*Math.sign(boat.speed||1)*dt*.82);
 const desired={x:Math.sin(boat.heading)*boat.speed,z:-Math.cos(boat.heading)*boat.speed};
 const drift=momentum.get(boat)??{...desired};
 const blend=1-Math.exp(-dt*2.8);drift.x+=(desired.x-drift.x)*blend;drift.z+=(desired.z-drift.z)*blend;
 const x=boat.x+drift.x*dt,z=boat.z+drift.z*dt;
 boat.x=clamp(x,WATER_BOUNDS.minX+1.4,WATER_BOUNDS.maxX-1.4);boat.z=clamp(z,WATER_BOUNDS.minZ+2.5,WATER_BOUNDS.maxZ-2.5);
 const boundary=x!==boat.x||z!==boat.z;
 if(boundary){boat.speed*=.4;drift.x*=.25;drift.z*=.25;}
 momentum.set(boat,drift);boat.wheelPhase+=boat.speed*dt;
 return boundary;
}

/** Ramps launch a real ballistic arc. Airborne bikes can clear low street obstacles. */
export function advanceBikeFlight(bike:Vehicle,dt:number):{launched:boolean;landed:boolean} {
 if(!Number.isFinite(dt)||dt<=0)return{launched:false,landed:false};dt=Math.min(dt,.05);
 let current=flight.get(bike);if(!current){current={ramp:null,airborne:false};flight.set(bike,current);}
 let launched=false,landed=false;
 bike.lean=(bike.lean??0)+(bike.steer*.36-(bike.lean??0))*Math.min(1,dt*7);
 if(current.airborne){
  bike.airVelocity=(bike.airVelocity??0)-14*dt;bike.airHeight=Math.max(0,(bike.airHeight??0)+bike.airVelocity*dt);
  if(bike.airHeight<=0){bike.airHeight=0;bike.airVelocity=0;current.airborne=false;current.ramp=null;landed=true;}
  return{launched,landed};
 }
 const ramp=BIKE_RAMPS.find(candidate=>{
  const dx=bike.x-candidate.x,dz=bike.z-candidate.z;
  const across=dx*Math.cos(candidate.heading)+dz*Math.sin(candidate.heading),along=dx*Math.sin(candidate.heading)-dz*Math.cos(candidate.heading);
  return Math.abs(across)<=candidate.width/2&&along>=-candidate.length/2-1&&along<=candidate.length/2+2&&Math.cos(bike.heading-candidate.heading)>.7;
 });
 if(ramp){
  const along=(bike.x-ramp.x)*Math.sin(ramp.heading)-(bike.z-ramp.z)*Math.cos(ramp.heading);
  if(along<ramp.length/2){current.ramp=ramp.id;bike.airHeight=clamp((along+ramp.length/2)/ramp.length,0,1)*ramp.height;}
  else if(current.ramp===ramp.id&&bike.speed>=9){current.airborne=true;current.ramp=null;bike.airHeight=ramp.height;bike.airVelocity=5+bike.speed*.11;launched=true;}
  else{current.ramp=null;bike.airHeight=0;}
 }else{current.ramp=null;bike.airHeight=0;}
 return{launched,landed};
}

export function canBoardDockBoat(player:Point,boat:Pick<Vehicle,'x'|'z'|'kind'|'health'>):boolean {
 return boat.kind==='boat'&&boat.health>0&&near(player,DOCK.land,3.5)&&near(boat,DOCK.mooring,DOCK.radius);
}
export function canDisembarkBoat(boat:Point):boolean{return near(boat,DOCK.mooring,DOCK.radius);}
export function boatBoardAction(state:GameState):boolean{return state.player.mode==='foot'&&!state.interior&&state.vehicles.some(vehicle=>canBoardDockBoat(state.player,vehicle));}
export function mobilityPrompt(state:GameState):string|null {
 const current=state.player.mode==='drive'?state.vehicles.find(vehicle=>vehicle.id===state.player.vehicleId):null;
 if(current?.kind==='boat')return Math.abs(current.speed)>3?'Zwolnij przed cumowaniem':canDisembarkBoat(current)?'Wysiądź na przystani':'Wróć do pomostu przy boi, aby wysiąść';
 if(current?.kind==='bike')return (current.airHeight??0)>.35?'Skok motocyklem · poczekaj na lądowanie':'Zsiądź z motocykla po zatrzymaniu';
 if(boatBoardAction(state))return 'Wejdź na pomost i wsiądź do motorówki';
 if(state.player.mode==='foot'&&!state.interior&&state.vehicles.some(vehicle=>vehicle.kind==='bike'&&vehicle.health>0&&near(vehicle,state.player,4)))return 'Wsiądź na motocykl Vortex R';
 return null;
}

export type MobilityCourse='bike'|'boat';
export interface MobilityCourseDefinition {kind:MobilityCourse;name:string;start:Point;checkpoints:readonly Point[];durationMs:number;reward:number}
export const MOBILITY_COURSES:Record<MobilityCourse,MobilityCourseDefinition>={
 bike:{kind:'bike',name:'Motocyklowy objazd',start:{x:0,z:80},checkpoints:[{x:40,z:80},{x:40,z:40},{x:0,z:40},{x:0,z:80}],durationMs:90000,reward:350},
 boat:{kind:'boat',name:'Puchar Ocean Drive',start:{...DOCK.mooring},checkpoints:[{x:150,z:55},{x:176,z:20},{x:150,z:-45},{...DOCK.mooring}],durationMs:120000,reward:500},
};
export type MobilityAction={kind:'start';course:MobilityCourse}|{kind:'cancel'};
export type MobilityTrialAction=MobilityAction;
export interface MobilityMember {id:string;pose:OnlinePose}
export interface MobilityTrialSnapshot {
 status:'idle'|'running'|'completed'|'failed';course:MobilityCourse|null;run:number;checkpoint:number;total:number;
 remainingMs:number;cooldownMs:number;target:Point|null;reward:number;bestMs:number|null;lastTimeMs:number|null;message:string;
}
export interface MobilityCredit {id:string;amount:number;sourceId:string}
interface Trial {status:MobilityTrialSnapshot['status'];course:MobilityCourse;run:number;checkpoint:number;startedAt:number;readyAt:number;lastTimeMs:number|null;bestMs:number|null;message:string}
const validNow=(now:number)=>Number.isFinite(now)&&now>=0;
const mounted=(member:MobilityMember|undefined,course:MobilityCourse)=>Boolean(member&&member.pose.mode==='drive'&&member.pose.vehicle?.kind===course&&member.pose.vehicle.health>0&&!member.pose.interior&&!member.pose.homeId&&!member.pose.passengerOf&&!member.pose.seated);

/** The host owns clocks, checkpoint order and awards. Each person has a separate attempt. */
export class MobilityTrials {
 private now=0;private readonly trials=new Map<string,Trial>();private credits:MobilityCredit[]=[];
 command(id:string,action:MobilityAction,members:MobilityMember[],nowMs:number):{ok:true}|{ok:false;reason:string}{
  const no=(reason:string)=>({ok:false as const,reason});if(!validNow(nowMs))return no('Nieprawidłowy zegar wyścigu.');
  this.update(members,nowMs);const member=members.find(person=>person.id===id);if(!member)return no('Nie należysz do tej sesji.');
  if(!action||typeof action!=='object')return no('Niepoprawna próba czasowa.');const current=this.trials.get(id);
  if(action.kind==='cancel'){
   if(current?.status!=='running')return no('Nie masz aktywnej próby czasowej.');this.fail(current,'Próba czasowa anulowana.');return{ok:true};
  }
  if(action.kind!=='start'||(action.course!=='bike'&&action.course!=='boat'))return no('Nieznana trasa.');
  if(current?.status==='running')return no('Najpierw zakończ bieżącą próbę.');
  if(current&&this.now<current.readyAt)return no('Poczekaj chwilę przed kolejnym startem.');
  const course=MOBILITY_COURSES[action.course];
  if(!mounted(member,action.course)||!near(member.pose,course.start,10))return no(action.course==='bike'?'Wsiądź na motocykl i podjedź do startu przy południowej alei.':'Wsiądź do motorówki i wróć do boi przy pomoście.');
  this.trials.set(id,{status:'running',course:action.course,run:(current?.run??0)+1,checkpoint:0,startedAt:this.now,readyAt:0,lastTimeMs:null,bestMs:current?.course===action.course?current.bestMs:null,message:'START! Zaliczenia punktów we wskazanej kolejności.'});
  return{ok:true};
 }
 update(members:MobilityMember[],nowMs:number):void {
  if(!validNow(nowMs))return;this.now=Math.max(this.now,nowMs);const people=new Map(members.map(member=>[member.id,member]));
  for(const[id,trial]of this.trials){
   if(trial.status!=='running')continue;const course=MOBILITY_COURSES[trial.course],member=people.get(id);
   if(this.now>=trial.startedAt+course.durationMs){this.fail(trial,'Czas minął. Wróć na start i spróbuj ponownie.');continue;}
   if(!mounted(member,trial.course)){this.fail(trial,'Opuściłeś pojazd lub sesję. Próba została przerwana.');continue;}
   const target=course.checkpoints[trial.checkpoint];if(!near(member!.pose,target,trial.course==='boat'?7:6))continue;
   trial.checkpoint++;
   if(trial.checkpoint===course.checkpoints.length){
    trial.status='completed';trial.lastTimeMs=this.now-trial.startedAt;trial.bestMs=Math.min(trial.bestMs??Infinity,trial.lastTimeMs);trial.readyAt=this.now+15000;trial.message=`Trasa ukończona w ${(trial.lastTimeMs/1000).toFixed(2)} s. Nagroda $${course.reward}.`;
    this.credits.push({id,amount:course.reward,sourceId:`mobility:${trial.course}:${trial.run}`});
   }else trial.message=`Punkt ${trial.checkpoint}/${course.checkpoints.length}. Jedź do następnego znacznika.`;
  }
 }
 snapshot(id:string):MobilityTrialSnapshot {
  const trial=this.trials.get(id);if(!trial)return{status:'idle',course:null,run:0,checkpoint:0,total:4,remainingMs:0,cooldownMs:0,target:null,reward:0,bestMs:null,lastTimeMs:null,message:'Dwie trasy: motocykl na ulicach i motorówka na oceanie.'};
  const course=MOBILITY_COURSES[trial.course],running=trial.status==='running';
  return{status:trial.status,course:trial.course,run:trial.run,checkpoint:trial.checkpoint,total:course.checkpoints.length,remainingMs:running?Math.max(0,Math.ceil(trial.startedAt+course.durationMs-this.now)):0,cooldownMs:Math.max(0,Math.ceil(trial.readyAt-this.now)),target:running?{...course.checkpoints[trial.checkpoint]}:null,reward:course.reward,bestMs:trial.bestMs,lastTimeMs:trial.lastTimeMs,message:trial.message};
 }
 drainCredits(){const credits=this.credits;this.credits=[];return credits;}
 private fail(trial:Trial,message:string){trial.status='failed';trial.readyAt=this.now+15000;trial.message=message;}
}

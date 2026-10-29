import type { Point } from './model';
import type { OnlinePose } from './multiplayer-model';

export type FactionId='tide'|'ember'|'circuit';
export type DistrictId='downtown'|'harbor'|'heights';
export type FactionJobKind='courier'|'transmitter'|'capture';
export interface FactionDefinition {id:FactionId;name:string;color:number;motto:string;description:string}
export const FACTIONS:Record<FactionId,FactionDefinition>={
 tide:{id:'tide',name:'Tide Runners',color:0x7bd8cb,motto:'Wybrzeże należy do ludzi.',description:'Kurierzy i portowi kierowcy. Walczą o ulice uczciwie wykonaną robotą.'},
 ember:{id:'ember',name:'Ember Syndicate',color:0xee9179,motto:'Zostaw po sobie znak.',description:'Nocna ekipa z zachodnich dzielnic. Liczy się odwaga i kontrola terenu.'},
 circuit:{id:'circuit',name:'Circuit Collective',color:0xaaa0ed,motto:'Informacja daje przewagę.',description:'Hakerzy i zwiadowcy. Przechwytują nadajniki i budują własną sieć kontaktów.'},
};
export interface DistrictDefinition {id:DistrictId;name:string;center:Point;pickup:Point;delivery:Point;relay:Point;escape:Point}
/** Every objective is on a street or reachable pavement outside BUILDINGS. */
export const DISTRICTS:Record<DistrictId,DistrictDefinition>={
 downtown:{id:'downtown',name:'Downtown',center:{x:0,z:0},pickup:{x:-40,z:0},delivery:{x:40,z:0},relay:{x:34,z:20},escape:{x:0,z:40}},
 harbor:{id:'harbor',name:'Southside Docks',center:{x:40,z:80},pickup:{x:0,z:80},delivery:{x:80,z:40},relay:{x:60,z:74},escape:{x:-40,z:80}},
 heights:{id:'heights',name:'North Heights',center:{x:0,z:-80},pickup:{x:-80,z:-40},delivery:{x:40,z:-80},relay:{x:-20,z:-74},escape:{x:0,z:-40}},
};
export const FACTION_JOB_DURATION_MS=180000;
export const FACTION_JOB_COOLDOWN_MS=20000;
export const FACTION_CAPTURE_MS=10000;
export const FACTION_TRANSMITTER_MS=6000;
export const FACTION_INCOME_MS=60000;
export const FACTION_INCOME_PER_DISTRICT=40;
export const FACTION_SWITCH_MS=120000;
export const FACTION_JOBS:Record<FactionJobKind,{name:string;reward:number;reputation:number;influence:number;loyalty:number;requires:number}>={
 courier:{name:'Trasa pod twoją flagą',reward:220,reputation:25,influence:12,loyalty:30,requires:0},
 transmitter:{name:'Przejęcie nadajnika',reward:280,reputation:35,influence:18,loyalty:40,requires:30},
 capture:{name:'Kontrola dzielnicy',reward:380,reputation:50,influence:25,loyalty:50,requires:60},
};
export interface FactionProfile {faction:FactionId|null;loyalty:number;completedJobs:number;serial:number;incomeSerial:number}
export interface DistrictInfluence {influence:Record<FactionId,number>}
export interface FactionWorld {districts:Record<DistrictId,DistrictInfluence>}
export interface FactionSave {profile:FactionProfile;world:FactionWorld}
export interface FactionMember {id:string;name:string;pose:OnlinePose}
export type FactionAction={kind:'join';faction:FactionId}|{kind:'start';job:FactionJobKind;district:DistrictId}|{kind:'interact'|'cancel'};
export type FactionResult={ok:true}|{ok:false;reason:string};
export interface FactionCredit {id:string;amount:number;reputation:number;sourceId:string}
export interface FactionDistrictSnapshot {id:DistrictId;name:string;center:Point;influence:Record<FactionId,number>;controller:FactionId|null;contested:boolean}
export interface FactionJobSnapshot {
 status:'idle'|'active'|'completed'|'failed';run:number;kind:FactionJobKind|null;district:DistrictId|null;
 stage:'pickup'|'delivery'|'channel'|'escape'|'control'|null;target:Point|null;progress:number;holding:boolean;contested:boolean;canInteract:boolean;
 remainingMs:number;cooldownMs:number;reward:number;message:string;
}
export interface FactionsSnapshot {
 profile:FactionProfile;districts:FactionDistrictSnapshot[];members:{id:string;name:string;faction:FactionId|null}[];
 bonusPercent:number;incomePerMinute:number;nextIncomeMs:number;switchCooldownMs:number;job:FactionJobSnapshot;
}
interface JobRuntime {status:FactionJobSnapshot['status'];run:number;kind:FactionJobKind|null;district:DistrictId|null;stage:FactionJobSnapshot['stage'];startedAt:number;deadline:number;readyAt:number;progress:number;holding:boolean;contested:boolean;reward:number;message:string}
interface PersonRuntime {profile:FactionProfile;job:JobRuntime;switchReadyAt:number;incomeReadyAt:number}
const factionIds:FactionId[]=['tide','ember','circuit'],districtIds:DistrictId[]=['downtown','harbor','heights'],jobIds:FactionJobKind[]=['courier','transmitter','capture'];
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
const faction=(value:unknown):value is FactionId=>factionIds.includes(value as FactionId);
const district=(value:unknown):value is DistrictId=>districtIds.includes(value as DistrictId);
const jobKind=(value:unknown):value is FactionJobKind=>jobIds.includes(value as FactionJobKind);
const integer=(value:unknown,max=1000000)=>Number.isSafeInteger(value)&&Number(value)>=0&&Number(value)<=max;
const finite=(value:number)=>Number.isFinite(value)&&value>=0;
const clone=<T>(value:T):T=>structuredClone(value);
const yes:FactionResult={ok:true};
const no=(reason:string):FactionResult=>({ok:false,reason});
const near=(a:Point,b:Point,radius=5)=>Math.hypot(a.x-b.x,a.z-b.z)<=radius;
const outdoors=(person:FactionMember)=>person.pose.interior===null&&!person.pose.homeId&&!person.pose.seated&&!person.pose.passengerOf;
const onFoot=(person:FactionMember)=>outdoors(person)&&person.pose.mode==='foot';
const slow=(person:FactionMember)=>outdoors(person)&&Math.abs(person.pose.vehicle?.speed??0)<=3;
export function createFactionProfile():FactionProfile{return{faction:null,loyalty:0,completedJobs:0,serial:0,incomeSerial:0};}
export function createFactionWorld():FactionWorld{return{districts:Object.fromEntries(districtIds.map(id=>[id,{influence:{tide:0,ember:0,circuit:0}}])) as FactionWorld['districts']};}
export function parseFactionSave(value:unknown):FactionSave {
 const profile=createFactionProfile(),world=createFactionWorld();
 if(!record(value))return{profile,world};
 if(record(value.profile)){
  if(faction(value.profile.faction))profile.faction=value.profile.faction;
  for(const key of ['loyalty','completedJobs','serial','incomeSerial'] as const)if(integer(value.profile[key],key==='loyalty'?10000:1000000))profile[key]=Number(value.profile[key]);
  if(!profile.faction)profile.loyalty=0;
 }
 if(record(value.world)&&record(value.world.districts))for(const id of districtIds){const source=value.world.districts[id];if(record(source)&&record(source.influence))for(const team of factionIds)if(integer(source.influence[team],100))world.districts[id].influence[team]=Number(source.influence[team]);}
 return{profile,world};
}
export function districtController(influence:Record<FactionId,number>):FactionId|null {
 const order=[...factionIds].sort((a,b)=>influence[b]-influence[a]);
 return influence[order[0]]>=35&&influence[order[0]]-influence[order[1]]>=10?order[0]:null;
}
const emptyJob=():JobRuntime=>({status:'idle',run:0,kind:null,district:null,stage:null,startedAt:0,deadline:0,readyAt:0,progress:0,holding:false,contested:false,reward:0,message:'Wybierz frakcję i wykonuj zlecenia, aby zdobywać wpływy.'});

/** The host owns territory, clocks and awards. Commands only express a player's intent. */
export class Factions {
 private now=0;
 private lastUpdate:number|null=null;
 private members=new Map<string,FactionMember>();
 private people=new Map<string,PersonRuntime>();
 private readonly world:FactionWorld;
 private readonly restored:FactionProfile;
 private restoreAvailable=true;
 private credits:FactionCredit[]=[];
 constructor(saved?:unknown,private readonly soloId='solo'){const parsed=parseFactionSave(saved);this.world=parsed.world;this.restored=parsed.profile;}

 update(members:FactionMember[],nowMs:number):void {
  if(!finite(nowMs))return;
  this.now=Math.max(this.now,nowMs);const dt=this.lastUpdate===null?0:Math.min(1000,Math.max(0,this.now-this.lastUpdate));this.lastUpdate=this.now;
  this.members=new Map(members.map(person=>[person.id,clone(person)]));
  for(const id of this.people.keys())if(!this.members.has(id))this.people.delete(id);
  for(const person of this.members.values()){
   if(!this.people.has(person.id)){
    const profile=person.id===this.soloId&&this.restoreAvailable?clone(this.restored):createFactionProfile();
    if(person.id===this.soloId)this.restoreAvailable=false;
    this.people.set(person.id,{profile,job:emptyJob(),switchReadyAt:0,incomeReadyAt:this.now+FACTION_INCOME_MS});
   }
   const runtime=this.people.get(person.id)!;
   this.advanceJob(person,runtime,dt);
   if(this.now>=runtime.incomeReadyAt){
    runtime.incomeReadyAt=this.now+FACTION_INCOME_MS;
    const owned=this.ownedBy(runtime.profile.faction);
    if(owned>0&&runtime.profile.loyalty>=60){runtime.profile.incomeSerial++;this.credits.push({id:person.id,amount:owned*FACTION_INCOME_PER_DISTRICT,reputation:0,sourceId:`faction-income-${runtime.profile.incomeSerial}`});}
   }
  }
 }
 command(id:string,action:FactionAction,members:FactionMember[],nowMs:number):FactionResult {
  if(!finite(nowMs))return no('Niepoprawny zegar frakcji.');this.update(members,nowMs);
  const person=this.members.get(id),runtime=this.people.get(id);
  if(!person||!runtime)return no('Nie należysz do tej sesji.');
  if(!record(action))return no('Nieznana akcja frakcji.');
  if(action.kind==='join'){
   if(!faction(action.faction))return no('Wybierz znaną frakcję.');
   if(runtime.job.status==='active')return no('Najpierw zakończ lub anuluj zlecenie frakcji.');
   if(runtime.profile.faction===action.faction)return no('Już należysz do tej frakcji.');
   if(this.now<runtime.switchReadyAt)return no('Poczekaj przed kolejną zmianą frakcji.');
   runtime.profile.faction=action.faction;runtime.profile.loyalty=0;runtime.switchReadyAt=this.now+FACTION_SWITCH_MS;
   runtime.job.message=`Dołączono do ${FACTIONS[action.faction].name}. Pierwsza trasa kurierska jest dostępna.`;return yes;
  }
  if(action.kind==='start'){
   if(!runtime.profile.faction)return no('Najpierw wybierz frakcję.');
   if(!jobKind(action.job)||!district(action.district))return no('Wybierz zlecenie i dzielnicę.');
   if(runtime.job.status==='active')return no('Masz już aktywne zlecenie frakcji.');
   if(this.now<runtime.job.readyAt)return no('Odczekaj chwilę przed następnym zleceniem.');
   if(!outdoors(person))return no('Wyjdź na ulicę, aby rozpocząć zlecenie frakcji.');
   const def=FACTION_JOBS[action.job];
   if(runtime.profile.loyalty<def.requires)return no(`To zadanie wymaga ${def.requires} lojalności wobec wybranej frakcji.`);
   runtime.profile.serial++;runtime.job={...emptyJob(),status:'active',run:runtime.profile.serial,kind:action.job,district:action.district,stage:action.job==='courier'?'pickup':action.job==='transmitter'?'channel':'control',startedAt:this.now,deadline:this.now+FACTION_JOB_DURATION_MS,reward:Math.floor(def.reward*(100+this.ownedBy(runtime.profile.faction)*3)/100),message:action.job==='courier'?'Odbierz przesyłkę w wybranej dzielnicy. Zatrzymaj się i użyj E.':action.job==='transmitter'?'Podejdź pieszo do nadajnika i rozpocznij przejęcie.':'Podejdź pieszo do centrum dzielnicy i rozpocznij dziesięciosekundową kontrolę.'};return yes;
  }
  if(action.kind==='cancel'){
   if(runtime.job.status!=='active')return no('Nie masz aktywnego zlecenia frakcji.');
   this.fail(runtime,'Zlecenie anulowane. Wpływy i nagroda nie zostały przyznane.');return yes;
  }
  if(action.kind!=='interact')return no('Nieznana akcja frakcji.');
  const job=runtime.job;if(job.status!=='active'||!job.kind||!job.district)return no('Najpierw rozpocznij zlecenie frakcji.');
  const target=this.target(job)!;
  if(!near(person.pose,target)||!outdoors(person))return no('Dotrzyj do aktualnego celu frakcji.');
  if(job.stage==='pickup'){
   if(!slow(person))return no('Zatrzymaj się przy przesyłce.');job.stage='delivery';job.message='Przesyłka odebrana. Dostarcz ją do drugiego punktu i potwierdź po zatrzymaniu.';return yes;
  }
  if(job.stage==='delivery'||job.stage==='escape'){
   if(!slow(person))return no('Zatrzymaj się, aby potwierdzić wykonanie zadania.');this.complete(person,runtime);return yes;
  }
  if(!onFoot(person))return no('Wysiądź i podejdź pieszo do znacznika.');
  if(job.holding)return no('Przejęcie już trwa. Pozostań przy znaczniku.');
  job.holding=true;job.message=job.stage==='control'?'Utrzymaj punkt przez 10 sekund. Rywal z innej frakcji przerywa kontrolę.':'Przechwytywanie nadajnika: pozostań pieszo przy urządzeniu przez 6 sekund.';return yes;
 }
 snapshot(viewerId:string):FactionsSnapshot {
  const runtime=this.people.get(viewerId),profile=runtime?.profile??createFactionProfile(),job=runtime?.job??emptyJob();
  const owned=this.ownedBy(profile.faction);
  const person=this.members.get(viewerId),target=job.status==='active'?this.target(job):null;
  const canInteract=Boolean(person&&target&&!job.holding&&near(person.pose,target)&&outdoors(person)&&((job.stage==='control'||job.stage==='channel')?onFoot(person):slow(person)));
  return clone({profile,districts:districtIds.map(id=>{const influence=this.world.districts[id].influence,controller=districtController(influence);return{id,name:DISTRICTS[id].name,center:{...DISTRICTS[id].center},influence:{...influence},controller,contested:!controller&&factionIds.filter(team=>influence[team]>=20).length>1};}),members:[...this.members.values()].map(person=>({id:person.id,name:person.name,faction:this.people.get(person.id)?.profile.faction??null})),bonusPercent:owned*3,incomePerMinute:profile.loyalty>=60?owned*FACTION_INCOME_PER_DISTRICT:0,nextIncomeMs:runtime?Math.max(0,runtime.incomeReadyAt-this.now):FACTION_INCOME_MS,switchCooldownMs:runtime?Math.max(0,runtime.switchReadyAt-this.now):0,job:{status:job.status,run:job.run,kind:job.kind,district:job.district,stage:job.stage,target,progress:Math.round(job.progress/(job.kind==='capture'?FACTION_CAPTURE_MS:FACTION_TRANSMITTER_MS)*100),holding:job.holding,contested:job.contested,canInteract,remainingMs:job.status==='active'?Math.max(0,job.deadline-this.now):0,cooldownMs:job.status==='active'?0:Math.max(0,job.readyAt-this.now),reward:job.reward,message:job.message}});
 }
 save(viewerId:string):FactionSave{return clone({profile:this.people.get(viewerId)?.profile??this.restored,world:this.world});}
 drainCredits():FactionCredit[]{const credits=this.credits;this.credits=[];return credits;}
 private ownedBy(team:FactionId|null){return team?districtIds.filter(id=>districtController(this.world.districts[id].influence)===team).length:0;}
 private target(job:JobRuntime):Point|null {if(!job.district)return null;const area=DISTRICTS[job.district];return job.stage==='pickup'?area.pickup:job.stage==='delivery'?area.delivery:job.stage==='channel'?area.relay:job.stage==='escape'?area.escape:job.stage==='control'?area.center:null;}
 private advanceJob(person:FactionMember,runtime:PersonRuntime,dt:number){
  const job=runtime.job;if(job.status!=='active')return;
  if(this.now>=job.deadline){this.fail(runtime,'Czas zlecenia frakcji minął.');return;}
  if(!job.holding||!job.kind||!job.district)return;
  const rival=job.kind==='capture'&&[...this.members.values()].some(other=>other.id!==person.id&&outdoors(other)&&this.people.get(other.id)?.profile.faction&&this.people.get(other.id)!.profile.faction!==runtime.profile.faction&&near(other.pose,this.target(job)!,8));
  const present=onFoot(person)&&near(person.pose,this.target(job)!);
  job.contested=Boolean(rival);
  if(!present||rival){job.progress=0;job.message=rival?'Rywal znajduje się w strefie. Kontrola przerwana — odsuńcie się od siebie lub poczekaj na jego odjazd.':'Opuściłeś znacznik. Postęp przejęcia został wyzerowany.';return;}
  job.message=job.kind==='capture'?'Kontrola dzielnicy: utrzymaj pozycję pieszo przez 10 sekund bez obecności rywala.':'Przechwytywanie nadajnika: pozostań pieszo przy urządzeniu przez 6 sekund.';
  job.progress=Math.min(job.kind==='capture'?FACTION_CAPTURE_MS:FACTION_TRANSMITTER_MS,job.progress+dt);
  if(job.progress<(job.kind==='capture'?FACTION_CAPTURE_MS:FACTION_TRANSMITTER_MS))return;
  if(job.kind==='capture')this.complete(person,runtime);else{job.stage='escape';job.holding=false;job.progress=0;job.message='Nadajnik przejęty. Wyjdź z dzielnicy do punktu przekazania i potwierdź zakończenie.';}
 }
 private fail(runtime:PersonRuntime,message:string){runtime.job.status='failed';runtime.job.holding=false;runtime.job.progress=0;runtime.job.readyAt=this.now+FACTION_JOB_COOLDOWN_MS;runtime.job.message=message;}
 private complete(person:FactionMember,runtime:PersonRuntime){
  const job=runtime.job,team=runtime.profile.faction;if(job.status!=='active'||!job.kind||!job.district||!team)return;
  const def=FACTION_JOBS[job.kind],influence=this.world.districts[job.district].influence;
  influence[team]=Math.min(100,influence[team]+def.influence);for(const rival of factionIds)if(rival!==team)influence[rival]=Math.max(0,influence[rival]-Math.ceil(def.influence/3));
  runtime.profile.loyalty=Math.min(10000,runtime.profile.loyalty+def.loyalty);runtime.profile.completedJobs++;job.status='completed';job.holding=false;job.contested=false;job.readyAt=this.now+FACTION_JOB_COOLDOWN_MS;
  job.message=`Zlecenie wykonane: +$${job.reward}, +${def.reputation} reputacji, +${def.influence} wpływów w ${DISTRICTS[job.district].name}.`;
  this.credits.push({id:person.id,amount:job.reward,reputation:def.reputation,sourceId:`faction-${job.run}-${team}-${job.district}-${job.kind}`});
 }
}

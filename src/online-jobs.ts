import { CASINO } from './casino-location';
import type { Point } from './model';
import type { OnlinePose } from './multiplayer-model';

export const HEIST_DURATION_MS=240000;
export const HEIST_REWARD=800;
export const JOB_COOLDOWN_MS=20000;
export const RACE_LOBBY_MS=60000;
export const RACE_DURATION_MS=180000;
export const RACE_COUNTDOWN_MS=3000;
export const RACE_STAGING:Readonly<Point>={x:0,z:80};
export const HEIST_SAFEHOUSE:Readonly<Point>={x:-80,z:0};
export const RACE_CHECKPOINTS:readonly Readonly<Point>[]=[{x:0,z:40},{x:40,z:40},{x:40,z:80},{x:0,z:80}];
export const RACE_PRIZES:readonly number[]=[500,300,150,100];
export interface JobMember {id:string;name:string;pose:OnlinePose}
export type JobAction={kind:'heistStart'}|{kind:'heistInteract'}|{kind:'heistHack';symbol:number}|{kind:'raceStart'}|{kind:'raceReady'};
export type JobResult={ok:true}|{ok:false;reason:string};
export type HeistStatus='idle'|'gather'|'hack'|'escape'|'completed'|'failed';
export interface HeistSnapshot {
 status:HeistStatus;run:number;remainingMs:number;cooldownMs:number;reward:number;eligible:boolean;
 role:'driver'|'hacker'|'lookout'|'spectator';driverId:string|null;hackerId:string|null;
 gathered:string[];progress:number;alarm:number;sequence:number[];target:Point|null;message:string;
}
export type RaceStatus='idle'|'lobby'|'countdown'|'running'|'completed'|'failed';
export interface RaceParticipant {
 id:string;name:string;checkpoint:number;finishedMs:number|null;rank:number|null;
 status:'waiting'|'ready'|'racing'|'finished'|'dnf'|'spectator';prize:number;
}
export interface RaceSnapshot {
 status:RaceStatus;run:number;remainingMs:number;countdownMs:number;cooldownMs:number;
 eligible:boolean;canReady:boolean;ready:string[];participants:RaceParticipant[];
 target:Point|null;grid:Point|null;message:string;
}
export interface JobsSnapshot {active:'heist'|'race'|null;heist:HeistSnapshot;race:RaceSnapshot}
const yes:JobResult={ok:true};
const no=(reason:string):JobResult=>({ok:false,reason});
const finite=(value:number)=>Number.isFinite(value)&&value>=0;
const near=(a:Point,b:Point,radius:number)=>Math.hypot(a.x-b.x,a.z-b.z)<=radius;
const outdoors=(member:JobMember)=>member.pose.interior===null&&!member.pose.seated;
const driving=(member:JobMember)=>outdoors(member)&&member.pose.mode==='drive'&&!member.pose.passengerOf&&member.pose.vehicle!==null;
const clone=<T>(value:T):T=>structuredClone(value);
const grid=(index:number):Point=>({x:index%2===0?-3:3,z:index<2?82:88});
const heistActive=(status:HeistStatus)=>status==='gather'||status==='hack'||status==='escape';
const raceActive=(status:RaceStatus)=>status==='lobby'||status==='countdown'||status==='running';
const sequence=()=>Array.from(crypto.getRandomValues(new Uint8Array(3)),value=>value%4);

/** The room host owns job clocks, private hacking symbols and one-shot awards.
 * Position updates must already be validated by RoomAuthority. */
export class OnlineJobs {
 private now=0;
 private members=new Map<string,JobMember>();
 private credits:{id:string;amount:number}[]=[];
 private heistStatus:HeistStatus='idle';
 private heistRun=0;
 private heistDeadline=0;
 private heistReadyAt=0;
 private heistEligible=new Set<string>();
 private hackerId:string|null=null;
 private gathered:string[]=[];
 private prepared=new Set<string>();
 private symbols:number[]=[];
 private progress=0;
 private alarm=0;
 private heistMessage='Zbierz ekipę przy wejściu do Sapphire Club.';
 private raceStatus:RaceStatus='idle';
 private raceRun=0;
 private raceLobbyDeadline=0;
 private raceCountdownAt=0;
 private raceStartedAt=0;
 private raceDeadline=0;
 private raceReadyAt=0;
 private raceCohort=new Set<string>();
 private raceLocked=new Set<string>();
 private ready=new Set<string>();
 private racers:RaceParticipant[]=[];
 private raceMessage='Ustawcie samochody przy starcie na południowej alei.';

 constructor(private readonly hostId:string){}
 get busy(){return heistActive(this.heistStatus)||raceActive(this.raceStatus);}

 command(id:string,action:JobAction,members:JobMember[],now:number):JobResult {
  if(!finite(now))return no('Niepoprawny czas zlecenia.');
  this.advance(members,now);
  const member=this.members.get(id);
  if(!member)return no('Nie należysz do tego pokoju.');
  if(!action||typeof action!=='object')return no('Niepoprawna akcja zlecenia.');
  if(action.kind==='heistStart'||action.kind==='raceStart'){
   if(id!==this.hostId)return no('Wspólne zlecenie rozpoczyna gospodarz.');
   if(this.busy)return no('Najpierw dokończcie bieżące zlecenie ekipy.');
   if(this.members.size<2)return no('Potrzebujesz co najmniej dwóch graczy w pokoju.');
   if(!outdoors(member))return no('Wyjdź z kasyna, aby rozpocząć zlecenie.');
   if(action.kind==='heistStart'){
    if(this.now<this.heistReadyAt)return no('Poczekaj przed następnym napadem.');
    this.heistStatus='gather';this.heistRun++;this.heistDeadline=this.now+HEIST_DURATION_MS;
    this.heistEligible=new Set(this.members.keys());
    this.hackerId=[...this.members.keys()].find(memberId=>memberId!==this.hostId)!;
    this.gathered=[];this.prepared.clear();this.symbols=sequence();this.progress=0;this.alarm=0;
    this.heistMessage='Kierowca i haker: spotkajcie się przy wejściu Sapphire Club i potwierdźcie przygotowanie.';
   }else{
    if(this.now<this.raceReadyAt)return no('Poczekaj przed następnym wyścigiem.');
    this.raceStatus='lobby';this.raceRun++;this.raceLobbyDeadline=this.now+RACE_LOBBY_MS;
    this.raceCohort=new Set(this.members.keys());this.raceLocked.clear();this.ready.clear();
    this.racers=[...this.members.values()].map(person=>({id:person.id,name:person.name,checkpoint:0,finishedMs:null,rank:null,status:'waiting',prize:0}));
    this.raceMessage='Podjedź własnym autem do startu (0, 80) i zgłoś gotowość. Potrzeba dwóch kierowców.';
   }
   return yes;
  }
  if(action.kind==='heistInteract'){
   if(!heistActive(this.heistStatus)||!this.heistEligible.has(id))return no('Nie uczestniczysz w aktywnym napadzie.');
   if(this.heistStatus==='escape')return no('Alarm! Jedźcie razem do kryjówki.');
   if(!outdoors(member)||!near(member.pose,CASINO.door,8))return no('Podejdź do wejścia Sapphire Club.');
   if(this.heistStatus==='hack')return no(id===this.hackerId?'Wprowadź trzy symbole pokazane w panelu hakera.':'Osłaniaj hakera, aż otworzy sejf.');
   if(!near(member.pose,CASINO.door,6))return no('Podejdź bliżej wejścia, aby potwierdzić przygotowanie.');
   if(this.prepared.has(id))return no('Masz potwierdzone przygotowanie. Zaczekaj na drugą rolę przy wejściu.');
   this.prepared.add(id);this.heistMessage=`Przygotowanie potwierdzone: ${member.name}. Kierowca i haker muszą być razem przy wejściu.`;
   this.advanceHeist();return yes;
  }
  if(action.kind==='heistHack'){
   if(this.heistStatus!=='hack')return no('Panel sejfu nie jest teraz aktywny.');
   if(id!==this.hackerId||!this.heistEligible.has(id))return no('Tylko wyznaczony haker może otworzyć sejf.');
   if(!outdoors(member)||member.pose.mode!=='foot'||member.pose.passengerOf||!near(member.pose,CASINO.door,8))return no('Haker musi stać pieszo przy wejściu Sapphire Club.');
   if(!Number.isInteger(action.symbol)||action.symbol<0||action.symbol>3)return no('Nieznany symbol panelu.');
   if(action.symbol!==this.symbols[this.progress]){
    this.alarm++;this.progress=0;
    if(this.alarm>=3)this.failHeist('Sejf został zablokowany po trzech pomyłkach.');
    else this.heistMessage=`Błędny symbol. Alarm ${this.alarm}/3. Zacznij sekwencję od początku.`;
    return yes;
   }
   this.progress++;
   if(this.progress===3){this.heistStatus='escape';this.alarm=3;this.heistMessage='Sejf otwarty! Alarm: jedźcie do kryjówki. Kierowca musi prowadzić, a co najmniej dwie osoby dotrzeć na miejsce.';}
   else this.heistMessage=`Panel hakera: ${this.progress}/3 poprawnych symboli.`;
   return yes;
  }
  if(action.kind==='raceReady'){
   if(this.raceStatus!=='lobby'&&this.raceStatus!=='countdown')return no('Nie trwa przygotowanie do wyścigu.');
   if(!this.raceCohort.has(id))return no('Dołączysz do następnego wyścigu.');
   if(this.ready.has(id))return no('Masz już zgłoszoną gotowość.');
   if(!driving(member)||member.pose.vehicle?.id!=='stratus'||!near(member.pose,RACE_STAGING,12))return no('Podjedź własnym autem do startu (0, 80). Pasażer nie może startować.');
   this.ready.add(id);this.racer(id)!.status='ready';
   if(this.raceStatus==='lobby'&&this.ready.size>=2){this.raceStatus='countdown';this.raceCountdownAt=this.now+RACE_COUNTDOWN_MS;this.raceMessage='Na miejsca! Trzy sekundy do startu — nie ruszaj przed sygnałem.';}
   return yes;
  }
  return no('Nieznana akcja zlecenia.');
 }

 update(members:JobMember[],now:number):{credits:{id:string;amount:number}[]} {
  this.advance(members,now);
  const credits=this.credits;this.credits=[];return {credits};
 }

 snapshot(viewerId:string,now:number):JobsSnapshot {
  const time=finite(now)?Math.max(this.now,now):this.now;
  const heistLive=heistActive(this.heistStatus),raceLive=raceActive(this.raceStatus);
  const participant=this.racer(viewerId),member=this.members.get(viewerId);
  const personalGrid=this.raceStatus==='countdown'&&this.ready.has(viewerId)?grid(this.racers.findIndex(racer=>racer.id===viewerId)):null;
  const raceTarget=this.raceStatus==='running'&&participant?.status==='racing'?RACE_CHECKPOINTS[participant.checkpoint]:this.raceStatus==='lobby'||this.raceStatus==='countdown'?RACE_STAGING:null;
  return clone({
   active:heistLive?'heist':raceLive?'race':null,
   heist:{status:this.heistStatus,run:this.heistRun,remainingMs:heistLive?Math.max(0,Math.ceil(this.heistDeadline-time)):0,cooldownMs:heistLive?0:Math.max(0,Math.ceil(this.heistReadyAt-time)),reward:HEIST_REWARD,eligible:this.heistEligible.has(viewerId),role:!this.heistEligible.has(viewerId)?'spectator':viewerId===this.hostId?'driver':viewerId===this.hackerId?'hacker':'lookout',driverId:this.heistRun?this.hostId:null,hackerId:this.hackerId,gathered:this.gathered,progress:this.progress,alarm:this.alarm,sequence:this.heistStatus==='hack'&&viewerId===this.hackerId?[...this.symbols]:[],target:heistLive?(this.heistStatus==='escape'?HEIST_SAFEHOUSE:CASINO.door):null,message:this.heistMessage},
   race:{status:this.raceStatus,run:this.raceRun,remainingMs:this.raceStatus==='running'?Math.max(0,Math.ceil(this.raceDeadline-time)):this.raceStatus==='lobby'?Math.max(0,Math.ceil(this.raceLobbyDeadline-time)):0,countdownMs:this.raceStatus==='countdown'?Math.max(0,Math.ceil(this.raceCountdownAt-time)):0,cooldownMs:raceLive?0:Math.max(0,Math.ceil(this.raceReadyAt-time)),eligible:this.raceStatus==='running'||this.raceStatus==='completed'||this.raceStatus==='failed'?this.raceLocked.has(viewerId):this.raceCohort.has(viewerId),canReady:Boolean(member&&(this.raceStatus==='lobby'||this.raceStatus==='countdown')&&this.raceCohort.has(viewerId)&&!this.ready.has(viewerId)&&driving(member)&&member.pose.vehicle?.id==='stratus'&&near(member.pose,RACE_STAGING,12)),ready:[...this.ready],participants:this.racers,target:raceTarget?{...raceTarget}:null,grid:personalGrid,message:this.raceMessage},
  });
 }

 private advance(members:JobMember[],now:number){
  if(!finite(now))return;
  this.now=Math.max(this.now,now);
  this.members=new Map(members.map(member=>[member.id,clone(member)]));
  for(const id of this.heistEligible)if(!this.members.has(id))this.heistEligible.delete(id);
  for(const id of this.raceCohort)if(!this.members.has(id))this.raceCohort.delete(id);
  this.advanceHeist();this.advanceRace();
 }
 private advanceHeist(){
  if(!heistActive(this.heistStatus))return;
  if(this.now>=this.heistDeadline){this.failHeist('Czas napadu minął. Ekipa musi przygotować nowy plan.');return;}
  if(!this.members.has(this.hostId)||this.heistEligible.size<2){this.failHeist('Napad przerwany: zabrakło połączonych uczestników.');return;}
  if((this.heistStatus==='gather'||this.heistStatus==='hack')&&(!this.hackerId||!this.heistEligible.has(this.hackerId))){
   this.hackerId=[...this.heistEligible].find(id=>id!==this.hostId)??null;
   if(!this.hackerId){this.failHeist('Haker opuścił ekipę.');return;}
   this.symbols=sequence();this.progress=0;this.heistMessage='Nowy haker przejmuje panel. Sekwencja została zmieniona.';
  }
  if(this.heistStatus==='gather'){
   this.gathered=[...this.heistEligible].filter(id=>{const member=this.members.get(id);return this.prepared.has(id)&&member&&outdoors(member)&&near(member.pose,CASINO.door,6);});
   if(this.gathered.includes(this.hostId)&&this.gathered.includes(this.hackerId!)){
    this.heistStatus='hack';this.heistMessage='Haker: wprowadź sekwencję. Kierowca przygotowuje auto do ucieczki.';
   }
  }else if(this.heistStatus==='escape'){
   const driver=this.members.get(this.hostId)!;
   const arrived=[...this.heistEligible].filter(id=>{const member=this.members.get(id);return member&&outdoors(member)&&near(member.pose,HEIST_SAFEHOUSE,8);});
   if(driving(driver)&&arrived.includes(this.hostId)&&arrived.length>=2){
    this.heistStatus='completed';this.heistReadyAt=this.now+JOB_COOLDOWN_MS;this.heistMessage='Skok udany! Ekipa zgubiła ślad przy kryjówce. Nagroda $800 na osobę.';
    for(const id of this.heistEligible)if(this.members.has(id))this.credits.push({id,amount:HEIST_REWARD});
   }
  }
 }
 private failHeist(message:string){this.heistStatus='failed';this.heistReadyAt=this.now+JOB_COOLDOWN_MS;this.heistMessage=message;}
 private racer(id:string){return this.racers.find(racer=>racer.id===id);}
 private advanceRace(){
  if(!raceActive(this.raceStatus))return;
  if(!this.members.has(this.hostId)){this.failRace('Gospodarz opuścił wyścig.');return;}
  if(this.raceStatus==='lobby'||this.raceStatus==='countdown'){
   for(const id of this.ready){
    const member=this.members.get(id);
    if(!member||!this.raceCohort.has(id)||!driving(member)||member.pose.vehicle?.id!=='stratus'||!near(member.pose,RACE_STAGING,12)){
     this.ready.delete(id);const racer=this.racer(id);if(racer)racer.status=this.raceCohort.has(id)?'waiting':'dnf';
    }
   }
   if(this.raceStatus==='countdown'&&this.ready.size<2){this.raceStatus='lobby';this.raceMessage='Zabrakło kierowców na starcie. Zgłoście gotowość ponownie.';}
   if(this.raceStatus==='lobby'&&this.now>=this.raceLobbyDeadline){this.failRace('Czas zgłoszeń minął. Potrzeba co najmniej dwóch gotowych kierowców.');return;}
   if(this.raceStatus==='countdown'&&this.now>=this.raceCountdownAt){
    for(const racer of this.racers){
     const member=this.members.get(racer.id),at=this.racers.indexOf(racer);
     if(this.ready.has(racer.id)&&member&&driving(member)&&near(member.pose,grid(at),3)){
      this.raceLocked.add(racer.id);racer.status='racing';
     }else racer.status=this.ready.has(racer.id)?'dnf':'spectator';
    }
    if(this.raceLocked.size<2){this.failRace('Falstart lub brak dwóch samochodów na miejscach startowych.');return;}
    this.raceStatus='running';this.raceStartedAt=this.raceCountdownAt;this.raceDeadline=this.raceStartedAt+RACE_DURATION_MS;
    this.raceMessage='START! Zaliczenie punktów po kolei; nagrody $500 / $300 / $150 / $100.';
   }
   return;
  }
  for(const racer of this.racers){
   if(racer.status!=='racing')continue;
   const member=this.members.get(racer.id);
   if(!member){racer.status='dnf';continue;}
   if(this.now>=this.raceDeadline){racer.status='dnf';continue;}
   if(!driving(member)||member.pose.vehicle?.id!=='stratus')continue;
   const target=RACE_CHECKPOINTS[racer.checkpoint];
   if(!target||!near(member.pose,target,6))continue;
   racer.checkpoint++;
   if(racer.checkpoint===RACE_CHECKPOINTS.length){
    racer.status='finished';racer.finishedMs=this.now-this.raceStartedAt;
    racer.rank=this.racers.filter(person=>person.status==='finished').length;
    racer.prize=RACE_PRIZES[racer.rank-1]??0;this.credits.push({id:racer.id,amount:racer.prize});
   }
  }
  if(!this.racers.some(racer=>racer.status==='racing')){
   this.raceStatus=this.racers.some(racer=>racer.status==='finished')?'completed':'failed';this.raceReadyAt=this.now+JOB_COOLDOWN_MS;
   this.raceMessage=this.raceStatus==='completed'?'Wyścig zakończony. Nagrody trafiły do portfeli online.':'Nikt nie ukończył trasy przed upływem czasu.';
  }
 }
 private failRace(message:string){
  this.raceStatus='failed';this.raceReadyAt=this.now+JOB_COOLDOWN_MS;this.raceMessage=message;
  for(const racer of this.racers)if(racer.status==='racing'||racer.status==='ready'||racer.status==='waiting')racer.status='dnf';
 }
}

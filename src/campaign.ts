import type { Point } from './model';
import type { OnlinePose } from './multiplayer-model';

export type TruthChoice='publish'|'bargain';
export type LoyaltyChoice='crew'|'self';
export type CampaignEnding='dawn'|'crown'|'horizon';
export type CampaignAction={kind:'start'|'continue'|'retry'|'restart'|'abandon'}|{kind:'choice';choice:TruthChoice|LoyaltyChoice};
export interface CampaignMember {id:string;name:string;pose:OnlinePose}
export interface CampaignState {
 version:1;completed:number;rewardedChapters:number[];truth:TruthChoice|null;loyalty:LoyaltyChoice|null;
 ending:CampaignEnding|null;finishedRuns:number;
}
export interface CampaignObjective {target:Point;instruction:string;mode:'any'|'foot'|'drive';stopped?:boolean;holdMs?:number}
export interface CampaignChapter {title:string;contact:string;summary:string;dialogue:string[];reward:number;reputation:number;durationMs:number;objectives:CampaignObjective[]}
export interface CampaignCredit {id:string;amount:number;reputation:number;sourceId:string}
export type CampaignResult={ok:true;message:string}|{ok:false;reason:string};
export interface CampaignSnapshot {
 status:'idle'|'active'|'interlude'|'choice'|'completed'|'failed';chapter:number;total:5;title:string;contact:string;summary:string;
 dialogue:string[];journal:{chapter:number;title:string;completed:boolean}[];objective:number;objectiveCount:number;instruction:string;
 target:Point|null;remainingMs:number;holdMs:number;holdRequiredMs:number;reward:number;reputation:number;rewardAvailable:boolean;
 eligible:boolean;participants:{id:string;name:string}[];canHostControl:boolean;decision:'truth'|'loyalty'|null;
 choices:{id:TruthChoice|LoyaltyChoice;title:string;description:string}[];truth:TruthChoice|null;loyalty:LoyaltyChoice|null;
 ending:CampaignEnding|null;endingTitle:string|null;endingText:string|null;message:string;
}
export const CAMPAIGN_ENDINGS:Record<CampaignEnding,{title:string;text:string}>= {
 dawn:{title:'Świt nad Neon Coast',text:'Dowody trafiają do mieszkańców. Nova, Milo i Vera zostają razem, a układ traci władzę nad portem. Po raz pierwszy wybrzeże należy do ludzi, którzy tu żyją.'},
 crown:{title:'Korona wybrzeża',text:'Sprzedajesz archiwum i zachowujesz portowe udziały dla siebie. Miasto zapamięta twoje imię, ale przy dawnym stole ekipy jedno miejsce pozostaje puste.'},
 horizon:{title:'Za linią horyzontu',text:'Żadna strona nie dostaje pełnej kontroli nad archiwum. Zacierasz ślady i wybierasz własną drogę. W radiu milkną syreny, a nad zatoką wstaje nowy dzień.'},
};
const objective=(x:number,z:number,instruction:string,mode:CampaignObjective['mode']='any',extra:Pick<CampaignObjective,'stopped'|'holdMs'>={}):CampaignObjective=>({target:{x,z},instruction,mode,...extra});

/** Five linked chapters share the city's real streets and contacts. */
export function campaignChapter(chapter:number,truth:TruthChoice|null,loyalty:LoyaltyChoice|null):CampaignChapter {
 const common:CampaignChapter[]=[
  {title:'Sygnał spod neonu',contact:'Nova',summary:'Zwykła paczka ujawnia ślad portowego układu. Nova prosi o dyskrecję.',dialogue:['Nova: „To nie kolejna przesyłka. Ktoś zaszyfrował w niej listę właścicieli całego portu.”','Nova: „Spotkajmy się pieszo przy zachodniej alei. Potem odbierz paczkę samochodem i wróć pod skrzynkę kontaktową.”'],reward:200,reputation:50,durationMs:240000,objectives:[objective(-40,40,'Podejdź pieszo na spotkanie z Novą.','foot'),objective(-80,40,'Podjedź pojazdem do magazynu i zatrzymaj się po paczkę.','drive',{stopped:true}),objective(-40,0,'Wysiądź i przekaż paczkę do skrzynki kontaktowej.','foot')]},
  {title:'Archiwum cieni',contact:'Vera',summary:'Vera zna hasło do archiwum. To, co odkryjecie, zmieni wybrzeże.',dialogue:['Vera: „Nazwiska to za mało. Potrzebuję oryginalnego rejestru przelewów.”','Vera: „Zbierz dokumenty pieszo. Samochodem dowieź je do anteny na północy, ale nie ruszaj podczas kopiowania.”'],reward:250,reputation:60,durationMs:240000,objectives:[objective(40,-40,'Podejdź pieszo do informatorskiej skrzynki Very.','foot'),objective(40,-80,'Odbierz kopię rejestru przy północnym skrzyżowaniu.','foot'),objective(-40,-80,'Zatrzymaj pojazd przy antenie na 5 sekund.','drive',{stopped:true,holdMs:5000})]},
  {title:'Portowy dług',contact:'Milo',summary:truth==='bargain'?'Wybraliście negocjacje. Milo szuka zabezpieczenia na wypadek zdrady.':'Wybraliście ujawnienie prawdy. Milo pomaga uruchomić niezależny nadajnik.',dialogue:truth==='bargain'?['Milo: „Jeżeli mamy się targować, potrzebujemy własnej karty przetargowej.”','Milo: „Zabezpiecz klucz, ukryj go przy zachodniej kryjówce, potem spotkajmy się na wybrzeżu.”']:['Milo: „Żeby mieszkańcy usłyszeli prawdę, musimy utrzymać nadajnik.”','Milo: „Podejdź do serwisowej skrzynki i nie ruszaj się przy nadajniku przez osiem sekund.”'],reward:300,reputation:70,durationMs:260000,objectives:truth==='bargain'?[objective(-80,-40,'Podejdź pieszo po klucz do negocjacji.','foot'),objective(-80,0,'Pozostań pieszo przy kryjówce przez 8 sekund.','foot',{holdMs:8000}),objective(80,40,'Dowieź klucz pojazdem do Milo i zatrzymaj się.','drive',{stopped:true})]:[objective(80,0,'Podejdź pieszo do skrzynki serwisowej nadajnika.','foot'),objective(80,-40,'Utrzymaj pozycję pieszo przy nadajniku przez 8 sekund.','foot',{holdMs:8000}),objective(0,-80,'Dowieź kopię transmisji i zatrzymaj pojazd.','drive',{stopped:true})]},
  {title:'Ostatnia noc ekipy',contact:'Nova i Milo',summary:'Układ składa ostatnią ofertę. Zanim odpowiesz, zabezpiecz drogę dla swoich ludzi.',dialogue:['Nova: „Nie musimy kończyć tego samotnie. Milo przygotował samochody przy południowej alei.”','Milo: „Odbierz pakiet, przejedź wybrzeżem i sprawdź pieszo punkt ewakuacji. Potem zdecydujesz, czy zostajesz z ekipą.”'],reward:350,reputation:80,durationMs:240000,objectives:[objective(0,80,'Podejdź pieszo na zbiórkę z Milo.','foot'),objective(80,80,'Przejedź pojazdem przez punkt na południu Ocean Drive.','drive'),objective(80,40,'Sprawdź pieszo punkt ewakuacji przez 5 sekund.','foot',{holdMs:5000})]},
  {title:'Cena wybrzeża',contact:'Vera',summary:'Ostatni kurs rozstrzygnie, kto napisze historię Neon Coast.',dialogue:loyalty==='self'?['Vera: „Wybrałeś własną drogę. Nie będę cię zatrzymywać, ale dopilnuj ostatniej dostawy.”','Vera: „Weź pakiet, zostaw kopię przy skrzynce i zatrzymaj się na końcu trasy.”']:['Vera: „Ekipa czeka. Odbierz pakiet i zostaw kopię dowodów po drodze.”','Vera: „Na końcu trasy utrzymaj zatrzymany pojazd przez osiem sekund. Tym razem wrócimy wszyscy.”'],reward:600,reputation:120,durationMs:300000,objectives:[objective(-40,40,'Odbierz finałowy pakiet: zatrzymaj pojazd przy zachodniej alei.','drive',{stopped:true}),objective(-40,-40,'Podejdź pieszo do skrzynki i zostaw kopię archiwum.','foot'),objective(loyalty==='self'?80:-80,loyalty==='self'?-80:0,'Zatrzymaj pojazd przy ostatnim odbiorcy na 8 sekund.','drive',{stopped:true,holdMs:8000})]},
 ];
 return structuredClone(common[Math.max(0,Math.min(4,Math.floor(chapter)))]);
}
const record=(v:unknown):v is Record<string,unknown>=>Boolean(v&&typeof v==='object'&&!Array.isArray(v));
const integer=(v:unknown,min=0,max=1000000)=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
const truthChoice=(v:unknown):v is TruthChoice=>v==='publish'||v==='bargain';
const loyaltyChoice=(v:unknown):v is LoyaltyChoice=>v==='crew'||v==='self';
const endingFor=(truth:TruthChoice|null,loyalty:LoyaltyChoice|null):CampaignEnding=>truth==='publish'&&loyalty==='crew'?'dawn':truth==='bargain'&&loyalty==='self'?'crown':'horizon';
export function createCampaign():CampaignState{return{version:1,completed:0,rewardedChapters:[],truth:null,loyalty:null,ending:null,finishedRuns:0};}
/** Only completed chapters persist. Timed objectives restart safely after reloading. */
export function parseCampaign(value:unknown):CampaignState {
 const state=createCampaign();if(!record(value))return state;
 if(integer(value.completed,0,5))state.completed=Number(value.completed);
 if(Array.isArray(value.rewardedChapters))state.rewardedChapters=[...new Set(value.rewardedChapters.filter(v=>integer(v,0,4)) as number[])].sort();
 if(state.completed>=2&&truthChoice(value.truth))state.truth=value.truth;
 if(state.completed>=4&&loyaltyChoice(value.loyalty))state.loyalty=value.loyalty;
 // A malformed saved branch cannot skip a decision or reach an ending.
 if(state.completed>2&&!state.truth)state.completed=2;
 if(state.completed>4&&!state.loyalty)state.completed=4;
 if(state.completed<4)state.loyalty=null;
 if(integer(value.finishedRuns))state.finishedRuns=Number(value.finishedRuns);
 if(state.completed===5&&state.truth&&state.loyalty)state.ending=endingFor(state.truth,state.loyalty);
 return state;
}
const outdoor=(member:CampaignMember)=>member.pose.interior===null&&!member.pose.homeId&&!member.pose.seated&&!member.pose.passengerOf;
const near=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z)<=5;
const finite=(v:number)=>Number.isFinite(v)&&v>=0;
const no=(reason:string):CampaignResult=>({ok:false,reason});

/** Shared campaign clocks and awards belong to the host; poses contain no rewards. */
export class CampaignController {
 private state:CampaignState;
 private status:CampaignSnapshot['status']='idle';
 private now=0;private lastUpdate=0;private deadline=0;private objective=0;private holdMs=0;private holder:string|null=null;
 private members=new Map<string,CampaignMember>();private previous=new Map<string,Point>();private eligible=new Set<string>();
 private credits:CampaignCredit[]=[];private message='Nova czeka na pierwszy sygnał. Rozpocznij kampanię, kiedy będziesz gotowy.';
 constructor(private readonly hostId:string,saved?:unknown){this.state=parseCampaign(saved);this.status=this.restingStatus();}
 save():CampaignState{return structuredClone(this.state);}
 update(members:CampaignMember[],nowMs:number):void {
  if(!finite(nowMs)||nowMs<this.now)return;const dt=Math.min(250,Math.max(0,nowMs-this.lastUpdate));this.now=nowMs;this.lastUpdate=this.now;
  const old=this.members;this.members=new Map(members.map(person=>[person.id,structuredClone(person)]));
  this.previous=new Map([...old].map(([id,person])=>[id,{x:person.pose.x,z:person.pose.z}]));
  if(this.status!=='active')return;
  if(this.now>=this.deadline){this.fail('Czas rozdziału minął. Możesz ponowić ten rozdział bez utraty wcześniejszych wyborów.');return;}
  if(!this.members.has(this.hostId)||![...this.eligible].some(id=>this.members.has(id))){this.fail('Ekipa przerwała wyprawę. Wcześniejsze rozdziały pozostają ukończone.');return;}
  const definition=campaignChapter(this.state.completed,this.state.truth,this.state.loyalty),objective=definition.objectives[this.objective];
  const candidates=[...this.eligible].map(id=>this.members.get(id)).filter((person):person is CampaignMember=>Boolean(person&&this.validObjective(person,objective)));
  if(!candidates.length){this.holdMs=0;this.holder=null;return;}
  if(objective.holdMs){
   const person=candidates.find(candidate=>candidate.id===this.holder)??candidates[0];
   const previous=this.previous.get(person.id),stationary=person.pose.mode==='drive'?Math.abs(person.pose.vehicle?.speed??Infinity)<=1.5:Boolean(previous&&Math.hypot(previous.x-person.pose.x,previous.z-person.pose.z)<=Math.max(.08,dt/1000*.35));
   if(!stationary){this.holdMs=0;this.holder=null;return;}
   if(this.holder!==person.id){this.holder=person.id;this.holdMs=0;}
   this.holdMs=Math.min(objective.holdMs,this.holdMs+dt);
   if(this.holdMs<objective.holdMs)return;
  }
  this.objective++;this.holdMs=0;this.holder=null;
  if(this.objective<definition.objectives.length){this.message=definition.objectives[this.objective].instruction;return;}
  this.finishChapter(definition);
 }
 command(id:string,action:CampaignAction,members:CampaignMember[],nowMs:number):CampaignResult {
  if(!finite(nowMs)||nowMs<this.now)return no('Niepoprawny zegar kampanii.');this.update(members,nowMs);
  if(!this.members.has(id))return no('Nie należysz do tej ekipy.');
  if(id!==this.hostId)return no('Kampanię i wspólne decyzje prowadzi gospodarz. Każdy uczestnik może pomagać przy celach.');
  if(!action||typeof action!=='object'||!['start','continue','retry','restart','abandon','choice'].includes(action.kind))return no('Nieznana akcja dziennika.');
  if(action.kind==='abandon'){
   if(this.status!=='active')return no('Nie trwa rozdział do przerwania.');
   this.fail('Rozdział przerwany. Ukończone części i decyzje są zapisane; możesz później ponowić wyprawę.');return{ok:true,message:this.message};
  }
  if(action.kind==='choice'){
   if(this.status!=='choice')return no('Teraz nie ma decyzji do podjęcia.');
   if(this.state.completed===2&&!this.state.truth&&truthChoice(action.choice))this.state.truth=action.choice;
   else if(this.state.completed===4&&!this.state.loyalty&&loyaltyChoice(action.choice))this.state.loyalty=action.choice;
   else return no('Wybierz jedną z odpowiedzi bieżącej rozmowy.');
   this.status='interlude';this.message='Decyzja zapisana. Przygotujcie się do kolejnego rozdziału.';return{ok:true,message:this.message};
  }
  if(action.kind==='restart'){
   if(this.status!=='completed')return no('Nową historię możesz rozpocząć po zakończeniu kampanii.');
   const claimed=this.state.rewardedChapters,runs=this.state.finishedRuns;this.state=createCampaign();this.state.rewardedChapters=claimed;this.state.finishedRuns=runs;this.status='idle';this.message='Nowa wersja historii jest gotowa. Wcześniej wypłacone nagrody nie są przyznawane ponownie.';return{ok:true,message:this.message};
  }
  if(this.status==='active')return no('Najpierw ukończcie bieżący rozdział.');
  if(this.status==='choice')return no('Najpierw odpowiedz w rozmowie, aby ustalić dalszą trasę.');
  if(this.status==='completed')return no('Historia została zakończona. Możesz rozpocząć ją ponownie bez ponownego farmienia nagród.');
  if(action.kind==='start'&&this.status!=='idle'||action.kind==='continue'&&this.status!=='interlude'||action.kind==='retry'&&this.status!=='failed')return no('Ta akcja nie pasuje do bieżącego etapu historii.');
  const host=this.members.get(id)!;if(!outdoor(host))return no('Wyjdź na ulicę, aby rozpocząć rozdział.');
  const definition=campaignChapter(this.state.completed,this.state.truth,this.state.loyalty);
  this.status='active';this.objective=0;this.holdMs=0;this.holder=null;this.lastUpdate=this.now;this.deadline=this.now+definition.durationMs;this.eligible=new Set(this.members.keys());this.message=definition.objectives[0].instruction;
  return{ok:true,message:`${definition.contact}: ${this.message}`};
 }
 snapshot(viewerId:string):CampaignSnapshot {
  const chapter=Math.min(4,this.state.completed),definition=campaignChapter(chapter,this.state.truth,this.state.loyalty),task=this.status==='active'?definition.objectives[this.objective]:null;
  const decision=this.status==='choice'?(this.state.completed===2?'truth':'loyalty'):null;
  const ending=this.state.ending?CAMPAIGN_ENDINGS[this.state.ending]:null;
  return{status:this.status,chapter,total:5,title:definition.title,contact:definition.contact,summary:definition.summary,dialogue:definition.dialogue,
   journal:Array.from({length:5},(_,index)=>({chapter:index,title:campaignChapter(index,this.state.truth,this.state.loyalty).title,completed:index<this.state.completed})),
   objective:this.objective,objectiveCount:definition.objectives.length,instruction:task?.instruction??this.message,target:task?{...task.target}:null,remainingMs:this.status==='active'?Math.max(0,this.deadline-this.now):0,holdMs:this.holdMs,holdRequiredMs:task?.holdMs??0,
   reward:definition.reward,reputation:definition.reputation,rewardAvailable:!this.state.rewardedChapters.includes(chapter),eligible:this.eligible.has(viewerId),participants:[...this.eligible].flatMap(id=>{const person=this.members.get(id);return person?[{id,name:person.name}]:[];}),canHostControl:viewerId===this.hostId,
   decision,choices:decision==='truth'?[{id:'publish',title:'Ujawnić archiwum',description:'Pomóż mieszkańcom poznać prawdę i uruchom niezależny nadajnik.'},{id:'bargain',title:'Negocjować z układem',description:'Zabezpiecz klucz i wykorzystaj archiwum jako kartę przetargową.'}]:decision==='loyalty'?[{id:'crew',title:'Zostać z ekipą',description:'Zabezpiecz wspólną ucieczkę i podziel się ostatnią decyzją z przyjaciółmi.'},{id:'self',title:'Wybrać własną drogę',description:'Zatrzymaj kontrolę nad pakietem i sam zdecyduj o przyszłości.'}]:[],truth:this.state.truth,loyalty:this.state.loyalty,
   ending:this.state.ending,endingTitle:ending?.title??null,endingText:ending?.text??null,message:this.message};
 }
 drainCredits():CampaignCredit[]{const credits=this.credits;this.credits=[];return credits;}
 private restingStatus():CampaignSnapshot['status']{return this.state.completed===5?'completed':this.state.completed===2&&!this.state.truth||this.state.completed===4&&!this.state.loyalty?'choice':this.state.completed===0?'idle':'interlude';}
 private validObjective(person:CampaignMember,objective:CampaignObjective){return outdoor(person)&&near(person.pose,objective.target)&&(objective.mode==='any'||person.pose.mode===objective.mode)&&(person.pose.mode!=='drive'||Boolean(person.pose.vehicle&&person.pose.vehicle.health>0))&&(!objective.stopped||Math.abs(person.pose.vehicle?.speed??0)<=1.5);}
 private fail(message:string){this.status='failed';this.message=message;this.holdMs=0;this.holder=null;}
 private finishChapter(definition:CampaignChapter){
  const chapter=this.state.completed;
  if(!this.state.rewardedChapters.includes(chapter)){
   this.state.rewardedChapters.push(chapter);
   for(const id of this.eligible)if(this.members.has(id))this.credits.push({id,amount:definition.reward,reputation:definition.reputation,sourceId:`campaign:chapter:${chapter}`});
  }
  this.state.completed++;this.objective=0;
  if(this.state.completed===5){this.state.ending=endingFor(this.state.truth,this.state.loyalty);this.state.finishedRuns++;this.status='completed';this.message=CAMPAIGN_ENDINGS[this.state.ending].text;}
  else{this.status=this.restingStatus();this.message=this.status==='choice'?'Ekipa czeka na twoją decyzję. Otwórz dziennik i wybierz odpowiedź.':'Rozdział ukończony. Przygotujcie się do dalszej części historii.';}
 }
}

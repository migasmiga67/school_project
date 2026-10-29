import type { Point, Collider } from './model';
import type { GarageCarId } from './garage';

export type HomeId = 'canal' | 'loft';
export type FurnitureId = 'sofa' | 'neon' | 'workbench';
export type ContractId = 'nova' | 'milo' | 'vera';
export interface HomeDefinition { id:HomeId; name:string; price:number; reputation:number; door:Point; parking:Point; description:string }
export const HOMES:Record<HomeId,HomeDefinition> = {
  canal:{id:'canal',name:'Mieszkanie nad kanałem',price:900,reputation:0,door:{x:-60,z:34},parking:{x:-60,z:40},description:'Pierwsza własna kryjówka, miejsce na auta i stół do planowania.'},
  loft:{id:'loft',name:'Loft Ocean View',price:2600,reputation:200,door:{x:60,z:-74},parking:{x:60,z:-80},description:'Przestronny apartament nad oceanem dla znanych twarzy wybrzeża.'},
};
export const FURNITURE:Record<FurnitureId,{name:string;price:number;description:string}> = {
  sofa:{name:'Strefa odpoczynku',price:160,description:'Odpoczynek we własnym mieszkaniu przywraca zdrowie.'},
  neon:{name:'Neon salonu',price:120,description:'Zmienione oświetlenie salonu i własny neon ekipy.'},
  workbench:{name:'Stanowisko mechanika',price:300,description:'Naprawiaj własny samochód przy mieszkaniu za $35.'},
};
export interface ContractDefinition { id:ContractId; contact:string; title:string; reputation:number; reward:number; xp:number; duration:number; objectives:{target:Point;instruction:string;onFoot?:boolean}[] }
export const CONTACTS:Record<ContractId,ContractDefinition> = {
 nova:{id:'nova',contact:'Nova · łączniczka',title:'Paczka bez pytań',reputation:0,reward:300,xp:60,duration:150,objectives:[{target:{x:-40,z:40},instruction:'Odbierz paczkę przy zachodniej alei.'},{target:{x:40,z:-40},instruction:'Dostarcz paczkę do północnego skrzyżowania.'}]},
 milo:{id:'milo',contact:'Milo · kierowca portowy',title:'Portowy objazd',reputation:100,reward:450,xp:90,duration:180,objectives:[{target:{x:80,z:40},instruction:'Odbierz dokumenty na Ocean Drive.'},{target:{x:80,z:-80},instruction:'Zalicz punkt przy północnym porcie.'},{target:{x:-40,z:-80},instruction:'Oddaj dokumenty przy magazynach.'}]},
 vera:{id:'vera',contact:'Vera · informatorka',title:'Cichy zwiad',reputation:300,reward:650,xp:120,duration:180,objectives:[{target:{x:40,z:0},instruction:'Podejdź pieszo i sprawdź punkt przy centrali.',onFoot:true},{target:{x:-40,z:-40},instruction:'Podejdź pieszo do skrzynki informatora.',onFoot:true},{target:{x:-80,z:0},instruction:'Przekaż raport przy zachodniej kryjówce.'}]},
};
export interface ActiveContract { id:ContractId; run:number; stage:number; startedAt:number; deadline:number }
export interface CareerState {
 reputation:number; awarded:string[]; ownedHomes:HomeId[]; furniture:Partial<Record<HomeId,FurnitureId[]>>;
 storedCars:Partial<Record<GarageCarId,HomeId>>; activeContract:ActiveContract|null; contractSerial:number; completedContracts:number;
}
export interface CareerContext { pose?:Point&{mode?:'foot'|'drive';interior?:string|null;passengerOf?:string|null}; now?:number; homeId?:HomeId|null; garageOwned?:readonly GarageCarId[]; selectedCar?:GarageCarId; vehicleId?:string|null; vehicleSpeed?:number; wanted?:number; busy?:boolean }
export type CareerAction =
 | {type:'buyHome';home:HomeId}
 | {type:'furnish';home:HomeId;item:FurnitureId}
 | {type:'storeCar';home:HomeId;car:GarageCarId}
 | {type:'retrieveCar';home:HomeId;car:GarageCarId}
 | {type:'repairCar';home:HomeId}
 | {type:'rest';home:HomeId}
 | {type:'contractStart';contract:ContractId}
 | {type:'contractVisit'}
 | {type:'contractCancel'};
export interface CareerEffect { storedCar?:GarageCarId; retrievedCar?:GarageCarId; repairCar?:boolean; restoreHealth?:boolean; completedContract?:ContractId }
export type CareerResult = {ok:true;career:CareerState;wallet:number;message:string;effect?:CareerEffect}|{ok:false;reason:string};
export interface CrewBaseState { owned:boolean; furniture:FurnitureId[]; purchasedBy:string|null }
export type CrewBaseAction = {type:'buy'}|{type:'furnish';item:FurnitureId};
export const CREW_BASE = {name:'Baza ekipy · Dockhouse',price:1800,door:{x:-60,z:-74},parking:{x:-60,z:-80}};
export function homeStreetExit(id:HomeId|'crew'):Point&{heading:number}{const door=id==='crew'?CREW_BASE.door:HOMES[id].door;return{x:door.x,z:door.z+(id==='canal'?1.8:-1.8),heading:id==='canal'?Math.PI:0};}
export const HOME_ROOM = {bounds:{minX:-7.5,maxX:7.5,minZ:-6,maxZ:7.5},entry:{x:0,z:5.5},exit:{x:0,z:6.7},planning:{x:0,z:-3.5},sofa:{x:-5,z:0}};
export const HOME_COLLIDERS:readonly Collider[] = [{x:0,z:-3.5,halfX:1.8,halfZ:1},{x:-5,z:0,halfX:1.1,halfZ:1.9},{x:5.5,z:-3.7,halfX:1,halfZ:1.5}];
const homeIds:HomeId[]=['canal','loft'],furnitureIds:FurnitureId[]=['sofa','neon','workbench'],carIds:GarageCarId[]=['stratus','sentinel','comet'];
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
const home=(value:unknown):value is HomeId=>homeIds.includes(value as HomeId);
const furniture=(value:unknown):value is FurnitureId=>furnitureIds.includes(value as FurnitureId);
const car=(value:unknown):value is GarageCarId=>carIds.includes(value as GarageCarId);
const contact=(value:unknown):value is ContractId=>value==='nova'||value==='milo'||value==='vera';
const integer=(value:unknown,min=0,max=1000000)=>Number.isSafeInteger(value)&&Number(value)>=min&&Number(value)<=max;
const validSource=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=100&&/^[A-Za-z0-9:_-]+$/.test(value);
export function createCareer():CareerState{return{reputation:0,awarded:[],ownedHomes:[],furniture:{},storedCars:{},activeContract:null,contractSerial:0,completedContracts:0};}
/** Profile parsing rejects malformed progress; a partially completed contract never resumes after reload. */
export function parseCareer(value:unknown):CareerState {
 const result=createCareer();if(!record(value))return result;
 if(integer(value.reputation,0,100000))result.reputation=Number(value.reputation);
 if(Array.isArray(value.awarded))result.awarded=[...new Set(value.awarded.filter(validSource))].slice(0,4096);
 if(Array.isArray(value.ownedHomes))result.ownedHomes=homeIds.filter(id=>(value.ownedHomes as unknown[]).includes(id));
 for(const id of result.ownedHomes){const items=record(value.furniture)?value.furniture[id]:null;result.furniture[id]=Array.isArray(items)?furnitureIds.filter(item=>items.includes(item)):[];}
 if(record(value.storedCars))for(const id of carIds){const place=value.storedCars[id];if(home(place)&&result.ownedHomes.includes(place))result.storedCars[id]=place;}
 if(integer(value.contractSerial))result.contractSerial=Number(value.contractSerial);
 if(integer(value.completedContracts))result.completedContracts=Number(value.completedContracts);
 return result;
}
/** Runtime copies preserve an active, validated mission; persisted profiles deliberately do not. */
function copyCareer(value:CareerState):CareerState {
 const result=parseCareer(value),active=value?.activeContract;
 if(active&&contact(active.id)&&integer(active.run,1)&&integer(active.stage,0,CONTACTS[active.id].objectives.length-1)&&Number.isFinite(active.startedAt)&&active.startedAt>=0&&Number.isFinite(active.deadline)&&active.deadline>active.startedAt)result.activeContract={...active};
 return result;
}
export function reputationTier(value:number){return value>=600?'Legenda wybrzeża':value>=300?'Zaufany partner':value>=100?'Znana twarz':'Nowy na wybrzeżu';}
/** Called by game/host awards only. Client commands never supply reputation or money. */
export function awardReputation(value:CareerState,sourceId:string,amount:number):CareerState {
 const career=copyCareer(value);
 if(!validSource(sourceId)||!integer(amount,1,1000)||career.awarded.includes(sourceId)||career.awarded.length>=4096)return career;
 career.awarded.push(sourceId);career.reputation=Math.min(100000,career.reputation+amount);return career;
}
const nearHome=(id:HomeId,context:CareerContext)=>context.homeId===id||Boolean(context.pose&&!context.pose.interior&&!context.pose.passengerOf&&Math.hypot(context.pose.x-HOMES[id].door.x,context.pose.z-HOMES[id].door.z)<=9);
export function careerTarget(career:CareerState):Point|null {const c=career.activeContract;return c?{...CONTACTS[c.id].objectives[c.stage].target}:null;}
export function careerAction(value:CareerState,wallet:number,action:CareerAction,context:CareerContext={}):CareerResult {
 const no=(reason:string):CareerResult=>({ok:false,reason});
 if(!integer(wallet,0,100000000))return no('Nieprawidłowy portfel.');
 if(!record(action))return no('Nieznana akcja kariery.');
 let career=copyCareer(value),cost=0,message='',effect:CareerEffect|undefined;
 if(action.type==='buyHome'){
  if(!home(action.home))return no('Nieznany lokal.');const item=HOMES[action.home];
  if(career.ownedHomes.includes(action.home))return no('Ten lokal już należy do ciebie.');
  if(career.reputation<item.reputation)return no(`Potrzebujesz ${item.reputation} reputacji, aby kupić ten lokal.`);
  cost=item.price;if(wallet<cost)return no(`Zakup lokalu kosztuje $${cost}.`);
  career.ownedHomes.push(action.home);career.furniture[action.home]=[];message=`Kupiono: ${item.name}. GPS prowadzi do twoich drzwi.`;
 }else if(action.type==='furnish'){
  if(!home(action.home)||!career.ownedHomes.includes(action.home))return no('Najpierw kup ten lokal.');
  if(!furniture(action.item))return no('Nieznane wyposażenie.');
  const items=career.furniture[action.home]??[];if(items.includes(action.item))return no('To wyposażenie już stoi w mieszkaniu.');
  cost=FURNITURE[action.item].price;if(wallet<cost)return no(`Wyposażenie kosztuje $${cost}.`);
  career.furniture[action.home]=[...items,action.item];message=`Dodano: ${FURNITURE[action.item].name}.`;
 }else if(action.type==='storeCar'||action.type==='retrieveCar'){
  if(!home(action.home)||!career.ownedHomes.includes(action.home))return no('Najpierw kup ten lokal.');
  if(!car(action.car)||!context.garageOwned?.includes(action.car))return no('Ten samochód nie należy do ciebie.');
  if(context.busy||!nearHome(action.home,context))return no('Przyjedź do własnego mieszkania po zakończeniu zlecenia ekipy.');
  if(action.type==='storeCar'){
   if(context.selectedCar!==action.car)return no('Wybierz ten samochód w garażu przed zaparkowaniem.');
   if(context.homeId||context.pose?.mode!=='drive'||context.pose.interior||context.vehicleId&&context.vehicleId!=='stratus'||Number.isFinite(context.vehicleSpeed)&&Math.abs(context.vehicleSpeed!)>1.5)return no('Podjedź własnym samochodem do mieszkania i zatrzymaj go przed zaparkowaniem.');
   if(career.storedCars[action.car])return no('Ten samochód jest już zaparkowany w mieszkaniu.');
   career.storedCars[action.car]=action.home;effect={storedCar:action.car};message='Samochód zaparkowany bezpiecznie przy mieszkaniu.';
  }else{
   if(career.storedCars[action.car]!==action.home)return no('Tego samochodu nie ma w tym mieszkaniu.');
   delete career.storedCars[action.car];effect={retrievedCar:action.car};message='Samochód czeka przy wyjeździe z mieszkania.';
  }
 }else if(action.type==='repairCar'||action.type==='rest'){
  if(!home(action.home)||!career.ownedHomes.includes(action.home)||!nearHome(action.home,context))return no('Wróć do własnego mieszkania.');
  const item=action.type==='rest'?'sofa':'workbench';
  if(!career.furniture[action.home]?.includes(item))return no(`Najpierw kup wyposażenie: ${FURNITURE[item].name}.`);
  if((context.wanted??0)>0||context.busy)return no('Najpierw zgub pościg i zakończ aktywność ekipy.');
  cost=action.type==='repairCar'?35:0;if(wallet<cost)return no('Naprawa kosztuje $35.');
  effect=action.type==='repairCar'?{repairCar:true}:{restoreHealth:true};message=action.type==='repairCar'?'Własny samochód naprawiony.':'Odpocząłeś. Zdrowie przywrócone.';
 }else if(action.type==='contractStart'){
  if(!contact(action.contract))return no('Nieznany kontakt.');
  if(career.activeContract)return no('Najpierw ukończ albo anuluj bieżące zlecenie kontaktu.');
  if(context.busy)return no('Najpierw ukończ aktywność ekipy.');
  const def=CONTACTS[action.contract];if(career.reputation<def.reputation)return no(`Kontakt odblokuje się przy ${def.reputation} reputacji.`);
  const now=context.now;if(!Number.isFinite(now)||now!<0)return no('Nieprawidłowy zegar zlecenia.');
  career.contractSerial++;career.activeContract={id:action.contract,run:career.contractSerial,stage:0,startedAt:now!,deadline:now!+def.duration};message=`${def.contact}: ${def.objectives[0].instruction}`;
 }else if(action.type==='contractCancel'){
  if(!career.activeContract)return no('Nie masz aktywnego zlecenia kontaktu.');career.activeContract=null;message='Zlecenie kontaktu anulowane.';
 }else if(action.type==='contractVisit'){
  const active=career.activeContract;if(!active)return no('Nie masz aktywnego zlecenia kontaktu.');
  const now=context.now;if(!Number.isFinite(now)||now!<active.startedAt)return no('Nieprawidłowy zegar zlecenia.');
  if(now!>=active.deadline){career.activeContract=null;return{ok:true,career,wallet,message:'Czas zlecenia kontaktu minął. Możesz spróbować ponownie.'};}
  const def=CONTACTS[active.id],objective=def.objectives[active.stage],pose=context.pose;
  if(!pose||pose.interior||pose.passengerOf||Math.hypot(pose.x-objective.target.x,pose.z-objective.target.z)>5||objective.onFoot&&pose.mode!=='foot')return no(objective.onFoot?'Podejdź pieszo do wskazanego punktu.':'Dotrzyj do wskazanego punktu.');
  active.stage++;
  if(active.stage===def.objectives.length){
   career.activeContract=null;career.completedContracts++;career=awardReputation(career,`contract:${def.id}:${active.run}`,def.xp);cost=-def.reward;effect={completedContract:def.id};message=`${def.title}: +$${def.reward} i +${def.xp} reputacji.`;
  }else message=def.objectives[active.stage].instruction;
 }else return no('Nieznana akcja kariery.');
 return{ok:true,career,wallet:wallet-cost,message,...(effect?{effect}:{})};
}
export function homeColliders(homeId:HomeId|'crew',career:CareerState,base?:CrewBaseState):readonly Collider[]{
 const items=homeId==='crew'?(base?.furniture??[]):(career.furniture[homeId]??[]);
 return items.includes('workbench')?[...HOME_COLLIDERS,{x:4.9,z:3.4,halfX:1.35,halfZ:.65}]:HOME_COLLIDERS;
}
export function createCrewBase():CrewBaseState{return{owned:false,furniture:[],purchasedBy:null};}
export function parseCrewBase(value:unknown):CrewBaseState {
 if(!record(value)||value.owned!==true)return createCrewBase();
 return{owned:true,furniture:Array.isArray(value.furniture)?furnitureIds.filter(item=>(value.furniture as unknown[]).includes(item)):[],purchasedBy:typeof value.purchasedBy==='string'?value.purchasedBy.slice(0,128):null};
}
export function crewBaseAction(value:CrewBaseState,wallet:number,action:CrewBaseAction,actor:string,isHost:boolean):{ok:true;base:CrewBaseState;wallet:number;message:string}|{ok:false;reason:string}{
 if(!integer(wallet,0,100000000)||!record(action))return{ok:false,reason:'Niepoprawna akcja bazy.'};
 if(!isHost)return{ok:false,reason:'Wspólną bazą zarządza gospodarz pokoju.'};
 const base=parseCrewBase(value);let cost=0,message='';
 if(action.type==='buy'){
  if(base.owned)return{ok:false,reason:'Baza już należy do ekipy.'};cost=CREW_BASE.price;
  if(wallet<cost)return{ok:false,reason:`Baza ekipy kosztuje $${cost}.`};base.owned=true;base.purchasedBy=actor;message='Dockhouse kupiony. Cała ekipa może wejść do wspólnej bazy.';
 }else if(action.type==='furnish'){
  if(!base.owned||!furniture(action.item))return{ok:false,reason:'Najpierw kup bazę i wybierz wyposażenie.'};
  if(base.furniture.includes(action.item))return{ok:false,reason:'Baza ma już to wyposażenie.'};cost=FURNITURE[action.item].price;
  if(wallet<cost)return{ok:false,reason:`Wyposażenie kosztuje $${cost}.`};base.furniture.push(action.item);message=`Baza: ${FURNITURE[action.item].name}.`;
 }else return{ok:false,reason:'Nieznana akcja bazy.'};
 return{ok:true,base,wallet:wallet-cost,message};
}

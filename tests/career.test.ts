import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/model';
import { CONTACTS, CREW_BASE, HOMES, awardReputation, careerAction, careerTarget, createCareer, createCrewBase, crewBaseAction, homeColliders, homeStreetExit, parseCareer, parseCrewBase, reputationTier, type CareerState, type CareerContext, type CareerAction } from '../src/career';

const success=(state:CareerState,wallet:number,action:CareerAction,context:CareerContext={})=>{
 const result=careerAction(state,wallet,action,context);expect(result.ok,result.ok?'':result.reason).toBe(true);if(!result.ok)throw new Error(result.reason);return result;
};
function finishContract(career=createCareer(),wallet=0,contract:'nova'|'milo'|'vera'='nova',now=0){
 let result=success(career,wallet,{type:'contractStart',contract},{now});
 for(const step of CONTACTS[contract].objectives)result=success(result.career,result.wallet,{type:'contractVisit'},{pose:{...step.target,mode:'foot',interior:null},now:++now});
 return result;
}
describe('career and contacts',()=>{
 it('creates independent blank profiles and handles damaged persisted data',()=>{
  const a=createCareer(),b=createCareer();a.awarded.push('changed');expect(b.awarded).toEqual([]);
  expect(parseCareer(null)).toEqual(b);expect(parseCareer({reputation:Infinity,ownedHomes:['fake'],storedCars:{stratus:'loft'},contractSerial:-1})).toEqual(b);
  const parsed=parseCareer({reputation:120,awarded:['city:1','city:1','<script>'],ownedHomes:['canal','canal','fake'],furniture:{canal:['sofa','fake','sofa']},storedCars:{stratus:'canal',sentinel:'fake'},completedContracts:2,contractSerial:4,activeContract:{id:'nova',run:1,stage:1,startedAt:0,deadline:150}});
  expect(parsed).toMatchObject({reputation:120,awarded:['city:1'],ownedHomes:['canal'],furniture:{canal:['sofa']},storedCars:{stratus:'canal'},completedContracts:2,contractSerial:4,activeContract:null});
 });
 it('deduplicates reputation without mutating source state or breaking active missions',()=>{
  const base=success(createCareer(),0,{type:'contractStart',contract:'nova'},{now:1}).career;
  const first=awardReputation(base,'heist:1',100);expect(first.reputation).toBe(100);expect(base.reputation).toBe(0);expect(first.activeContract).toEqual(base.activeContract);
  expect(awardReputation(first,'heist:1',100)).toEqual(first);
  expect(awardReputation(first,'bad<id',100)).toEqual(first);expect(awardReputation(first,'race:1',-1)).toEqual(first);
 });
 it('requires actual sequential objectives and pays once',()=>{
  const begin=success(createCareer(),10,{type:'contractStart',contract:'nova'},{now:0});
  expect(careerTarget(begin.career)).toEqual(CONTACTS.nova.objectives[0].target);
  expect(careerAction(begin.career,10,{type:'contractVisit'},{now:1,pose:{...CONTACTS.nova.objectives[1].target}}).ok).toBe(false);
  const result=finishContract();expect(result.wallet).toBe(300);expect(result.career.reputation).toBe(60);expect(result.career.completedContracts).toBe(1);expect(result.career.activeContract).toBeNull();expect(result.effect?.completedContract).toBe('nova');
  expect(careerAction(result.career,result.wallet,{type:'contractVisit'},{now:4,pose:CONTACTS.nova.objectives[1].target}).ok).toBe(false);
 });
 it('unlocks contacts by earning reputation and supports repeatable jobs',()=>{
  expect(careerAction(createCareer(),0,{type:'contractStart',contract:'milo'},{now:0}).ok).toBe(false);
  const first=finishContract(),second=finishContract(first.career,first.wallet,'nova',5);
  expect(second.career.reputation).toBe(120);expect(second.career.contractSerial).toBe(2);expect(second.wallet).toBe(600);
  const milo=finishContract(second.career,second.wallet,'milo',10);expect(milo.wallet).toBe(1050);expect(milo.career.reputation).toBe(210);
  expect(reputationTier(0)).toBe('Nowy na wybrzeżu');expect(reputationTier(120)).toBe('Znana twarz');expect(reputationTier(300)).toBe('Zaufany partner');expect(reputationTier(600)).toBe('Legenda wybrzeża');
 });
 it('enforces foot objectives, outdoors and no passenger progress',()=>{
  const career=awardReputation(createCareer(),'earned',300),begin=success(career,0,{type:'contractStart',contract:'vera'},{now:0});
  const target=CONTACTS.vera.objectives[0].target;
  for(const pose of [{...target,mode:'drive' as const},{...target,mode:'foot' as const,interior:'casino'},{...target,mode:'foot' as const,passengerOf:'driver'}])expect(careerAction(begin.career,0,{type:'contractVisit'},{now:1,pose}).ok).toBe(false);
  expect(success(begin.career,0,{type:'contractVisit'},{now:1,pose:{...target,mode:'foot'}}).career.activeContract?.stage).toBe(1);
 });
 it('expires and cancels contracts without rewards, rejects backward time and overlaps',()=>{
  const begin=success(createCareer(),7,{type:'contractStart',contract:'nova'},{now:10});
  expect(careerAction(begin.career,7,{type:'contractStart',contract:'nova'},{now:12}).ok).toBe(false);
  expect(careerAction(begin.career,7,{type:'contractVisit'},{now:9,pose:CONTACTS.nova.objectives[0].target}).ok).toBe(false);
  const expired=success(begin.career,7,{type:'contractVisit'},{now:160});expect(expired.career.activeContract).toBeNull();expect(expired.wallet).toBe(7);
  const cancelled=success(begin.career,7,{type:'contractCancel'});expect(cancelled.career.activeContract).toBeNull();expect(cancelled.career.reputation).toBe(0);
  expect(careerAction(createCareer(),0,{type:'contractStart',contract:'nova'},{now:0,busy:true}).ok).toBe(false);
 });
});
describe('homes and furniture',()=>{
 it('charges purchases atomically, rejects insufficient money and reputation',()=>{
  const blank=createCareer();expect(careerAction(blank,899,{type:'buyHome',home:'canal'}).ok).toBe(false);expect(blank.ownedHomes).toEqual([]);
  const bought=success(blank,1000,{type:'buyHome',home:'canal'});expect(bought.wallet).toBe(100);expect(bought.career.ownedHomes).toEqual(['canal']);
  expect(careerAction(bought.career,3000,{type:'buyHome',home:'canal'}).ok).toBe(false);expect(careerAction(blank,3000,{type:'buyHome',home:'loft'}).ok).toBe(false);
  const ranked=awardReputation(bought.career,'reputation:1',200),loft=success(ranked,3000,{type:'buyHome',home:'loft'});expect(loft.wallet).toBe(400);expect(loft.career.ownedHomes).toEqual(['canal','loft']);
 });
 it('makes furniture purchases permanent and gives usable rest/mechanic actions',()=>{
  let result=success(createCareer(),1500,{type:'buyHome',home:'canal'});
  expect(careerAction(result.career,result.wallet,{type:'rest',home:'canal'},{homeId:'canal'}).ok).toBe(false);
  result=success(result.career,result.wallet,{type:'furnish',home:'canal',item:'sofa'});expect(result.wallet).toBe(440);
  expect(success(result.career,result.wallet,{type:'rest',home:'canal'},{homeId:'canal'}).effect).toEqual({restoreHealth:true});
  expect(careerAction(result.career,result.wallet,{type:'rest',home:'canal'},{homeId:'canal',wanted:1}).ok).toBe(false);
  expect(careerAction(result.career,result.wallet,{type:'furnish',home:'canal',item:'sofa'}).ok).toBe(false);
  result=success(result.career,result.wallet,{type:'furnish',home:'canal',item:'workbench'});
  const repair=success(result.career,result.wallet,{type:'repairCar',home:'canal'},{homeId:'canal'});expect(repair.wallet).toBe(105);expect(repair.effect).toEqual({repairCar:true});
  expect(homeColliders('canal',result.career).length).toBe(4);expect(homeColliders('canal',createCareer()).length).toBe(3);
  expect(parseCareer(JSON.parse(JSON.stringify(result.career)))).toEqual(result.career);
 });
 it('stores only owned selected cars locally and retrieves them once',()=>{
  const bought=success(createCareer(),1500,{type:'buyHome',home:'canal'}),context:CareerContext={pose:{...HOMES.canal.door,mode:'drive'},garageOwned:['stratus','sentinel'],selectedCar:'stratus',vehicleId:'stratus',vehicleSpeed:0};
  expect(careerAction(bought.career,bought.wallet,{type:'storeCar',home:'canal',car:'sentinel'},context).ok).toBe(false);
  expect(careerAction(bought.career,bought.wallet,{type:'storeCar',home:'canal',car:'stratus'},{...context,pose:{x:0,z:0,mode:'drive'}}).ok).toBe(false);
  expect(careerAction(bought.career,bought.wallet,{type:'storeCar',home:'canal',car:'stratus'},{...context,vehicleSpeed:10}).ok).toBe(false);
  const stored=success(bought.career,bought.wallet,{type:'storeCar',home:'canal',car:'stratus'},context);expect(stored.career.storedCars).toEqual({stratus:'canal'});expect(stored.effect).toEqual({storedCar:'stratus'});
  expect(careerAction(stored.career,stored.wallet,{type:'storeCar',home:'canal',car:'stratus'},context).ok).toBe(false);
  const retrieved=success(stored.career,stored.wallet,{type:'retrieveCar',home:'canal',car:'stratus'},context);expect(retrieved.career.storedCars).toEqual({});expect(retrieved.effect).toEqual({retrievedCar:'stratus'});
  expect(careerAction(retrieved.career,retrieved.wallet,{type:'retrieveCar',home:'canal',car:'stratus'},context).ok).toBe(false);
 });
 it('places every entrance outside building colliders and within city bounds',()=>{
  for(const point of ['canal','loft','crew'].map(id=>homeStreetExit(id as 'canal'|'loft'|'crew')))expect(BUILDINGS.some(b=>Math.abs(point.x-b.x)<b.halfX+.55&&Math.abs(point.z-b.z)<b.halfZ+.55)).toBe(false);
  for(const place of [...Object.values(HOMES),CREW_BASE]){
   expect(BUILDINGS.some(b=>Math.abs(place.door.x-b.x)<b.halfX+.55&&Math.abs(place.door.z-b.z)<b.halfZ+.55)).toBe(false);
   expect(Math.abs(place.door.x)).toBeLessThan(96);expect(Math.abs(place.door.z)).toBeLessThan(96);
  }
 });
 it('rejects invalid commands, costs and wallets',()=>{
  for(const amount of [-1,NaN,Infinity,1.5])expect(careerAction(createCareer(),amount,{type:'buyHome',home:'canal'}).ok).toBe(false);
  expect(careerAction(createCareer(),1000,{type:'cheat'} as unknown as CareerAction).ok).toBe(false);
  expect(careerAction(createCareer(),1000,null as unknown as CareerAction).ok).toBe(false);
 });
});
describe('shared crew base',()=>{
 it('allows host to buy and furnish one shared base with atomic payments',()=>{
  expect(crewBaseAction(createCrewBase(),2000,{type:'buy'},'guest',false).ok).toBe(false);
  expect(crewBaseAction(createCrewBase(),1700,{type:'buy'},'host',true).ok).toBe(false);
  const bought=crewBaseAction(createCrewBase(),2200,{type:'buy'},'host',true);expect(bought.ok).toBe(true);if(!bought.ok)return;
  expect(bought.wallet).toBe(400);expect(bought.base).toEqual({owned:true,furniture:[],purchasedBy:'host'});
  const furnished=crewBaseAction(bought.base,bought.wallet,{type:'furnish',item:'neon'},'host',true);expect(furnished.ok).toBe(true);if(!furnished.ok)return;
  expect(furnished.wallet).toBe(280);expect(furnished.base.furniture).toEqual(['neon']);expect(bought.base.furniture).toEqual([]);
  expect(crewBaseAction(furnished.base,furnished.wallet,{type:'furnish',item:'neon'},'host',true).ok).toBe(false);
  expect(crewBaseAction(furnished.base,5000,{type:'buy'},'host',true).ok).toBe(false);
  expect(parseCrewBase({owned:true,furniture:['neon','hack'],purchasedBy:'host'})).toEqual(furnished.base);
 });
});

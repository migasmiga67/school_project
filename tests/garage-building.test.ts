import {describe,expect,it} from 'vitest';
import {activeVehicle,createGame,step,updateGarageAccess} from '../src/game';
import {advanceSimulation} from '../src/simulation';
import {GARAGE_BUILDING,GARAGE_CAR_CLEARANCE,GARAGE_FOOT_CLEARANCE,advanceGarageGate,atGarageServiceDesk,createGarageGate,garageGateCollision,garageServiceAvailable,garageSolidCollision,isGarageBuildingCollider,isInsideGarageBay,type GarageGateState,type GarageVisitor} from '../src/garage-building';
import type {GameState,Input} from '../src/model';
const idle:Input={throttle:false,brake:false,left:false,right:false,handbrake:false,boost:false,sprint:false,interact:false,nextMission:false,reset:false};
function carAt(z:number,x=-20):GameState {
 const state=createGame(),car=activeVehicle(state)!;state.vehicles=[car];state.mission.active=false;
 Object.assign(car,{x,z,heading:0,speed:0});Object.assign(state.player,{x,z,heading:0});return state;
}
function advance(state:GameState,seconds:number,input:Partial<Input>={}){for(let i=0;i<Math.round(seconds*60);i++)step(state,{...idle,...input},1/60);}
function moveCarTo(state:GameState,target:number,reverse=false){
 const car=activeVehicle(state)!;
 for(let frame=0;frame<1200&&(reverse?car.z<target:car.z>target);frame++){
  const slow=Math.abs(car.speed)<4;
  step(state,{...idle,throttle:!reverse&&slow,brake:reverse&&slow},1/60);
 }
}
describe('world-space garage shell and services',()=>{
 it('opens only the correct parcel while retaining solid wings, back wall and workshop props',()=>{
  expect(isGarageBuildingCollider({x:-20,z:60,halfX:12,halfZ:12})).toBe(true);
  expect(isGarageBuildingCollider({x:20,z:60,halfX:12,halfZ:12})).toBe(false);
  expect(garageSolidCollision({x:-20,z:64},1.5)).toBe(false);
  for(const point of[{x:-28,z:64},{x:-12,z:64},{x:-20,z:52},{x:-20,z:57},{x:-23.4,z:58.7}])expect(garageSolidCollision(point,.5)).toBe(true);
  expect(isInsideGarageBay(GARAGE_BUILDING.service)).toBe(true);
  expect(garageServiceAvailable({x:-20,z:74},1.5)).toBe(true);
  expect(garageServiceAvailable(GARAGE_BUILDING.service,1.5)).toBe(true);
  expect(garageServiceAvailable({x:-28,z:64})).toBe(false);
  expect(garageServiceAvailable({x:-20,z:85})).toBe(false);
  expect(atGarageServiceDesk(GARAGE_BUILDING.desk)).toBe(true);
  expect(atGarageServiceDesk({x:-20,z:70})).toBe(false);
 });
 it('checks a complete rotated vehicle body and its nose instead of only its center circle',()=>{
  const straight={x:-23.1,z:64,heading:0};expect(garageSolidCollision(straight,1.5)).toBe(false);
  expect(garageSolidCollision({x:-23.1,z:64},1.5,Math.PI/2)).toBe(true);
  expect(garageSolidCollision({x:-20,z:60},1.5)).toBe(false);
  expect(garageSolidCollision({x:-20,z:59.9},1.5)).toBe(true);
  expect(garageGateCollision({x:-20,z:74.9},1.5,createGarageGate())).toBe(true);
  expect(garageGateCollision({x:-20,z:76},1.5,createGarageGate())).toBe(false);
 });
 it('keeps the door physical until there is enough height for a person or a car',()=>{
  expect(garageGateCollision({x:-20,z:72.9},.55,{openness:GARAGE_FOOT_CLEARANCE-.001,holdUntil:0})).toBe(true);
  expect(garageGateCollision({x:-20,z:72.9},.55,{openness:GARAGE_FOOT_CLEARANCE,holdUntil:0})).toBe(false);
  expect(garageGateCollision({x:-20,z:74.9},1.5,{openness:GARAGE_CAR_CLEARANCE-.001,holdUntil:0})).toBe(true);
  expect(garageGateCollision({x:-20,z:74.9},1.5,{openness:GARAGE_CAR_CLEARANCE,holdUntil:0})).toBe(false);
 });
});
describe('automatic safety gate',()=>{
 it('opens gradually for an approaching driver, holds for a long car tail, and closes after departure',()=>{
  const visitor:GarageVisitor={x:-20,z:89,mode:'drive',speed:4};let gate=createGarageGate();
  gate=advanceGarageGate(gate,.1,.1,[visitor]);expect(gate.openness).toBeGreaterThan(0);expect(gate.openness).toBeLessThan(.1);
  for(let i=2;i<=16;i++)gate=advanceGarageGate(gate,i*.1,.1,[visitor]);expect(gate.openness).toBe(1);
  const tail:GarageVisitor={x:-20,z:76,mode:'drive',radius:2.8};
  for(let i=17;i<=55;i++)gate=advanceGarageGate(gate,i*.1,.1,[],[tail]);expect(gate.openness).toBe(1);
  for(let i=56;i<=110;i++)gate=advanceGarageGate(gate,i*.1,.1,[]);expect(gate.openness).toBe(0);
 });
 it('reopens safely for remote visitors without relying on renderer state or global collision context',()=>{
  const before:GarageGateState={openness:.75,holdUntil:0};
  const next=advanceGarageGate(before,10,.1,[{x:-20,z:72.4,mode:'drive',radius:2.8}]);
  expect(next.openness).toBeGreaterThan(before.openness);expect(before).toEqual({openness:.75,holdUntil:0});
  const state=carAt(100,0);state.garageVisitors=[{x:-20,z:80,mode:'drive',speed:0}];updateGarageAccess(state,.2,5);
  expect(state.garageGate!.openness).toBeGreaterThan(0);
  const closed=carAt(100,0);updateGarageAccess(closed,.2,5);expect(closed.garageGate!.openness).toBe(0);
 });
 it('anticipates a fast approach without holding for a driver already moving away',()=>{
  const toward=advanceGarageGate(undefined,1,.1,[{x:-20,z:110,mode:'drive',heading:0,speed:24}]);
  const away=advanceGarageGate(undefined,1,.1,[{x:-20,z:110,mode:'drive',heading:Math.PI,speed:24}]);
  expect(toward.openness).toBeGreaterThan(0);expect(away.openness).toBe(0);
 });
 it('advances identically in a detached forecast and at different render rates',()=>{
  const fast=carAt(86),slow=structuredClone(fast);
  for(let i=0;i<120;i++)advanceSimulation(fast,idle,1/60);
  for(let i=0;i<20;i++)advanceSimulation(slow,idle,.1);
  expect(slow.garageGate!.openness).toBeCloseTo(fast.garageGate!.openness,10);
  expect(slow.garageGate!.holdUntil).toBeCloseTo(fast.garageGate!.holdUntil,10);
 });
 it('expires a paused online hold after resuming an older local clock and preserves detached forecasts',()=>{
  const before:GarageGateState={openness:1,holdUntil:82.5,clock:80};
  const paused=advanceGarageGate(before,100,.2,[{x:-20,z:80,mode:'drive'}]);
  expect(paused.clock).toBe(100);expect(paused.holdUntil).toBe(102.5);
  let live=paused,forecast=structuredClone(paused);
  for(let frame=1;frame<=270;frame++){
   live=advanceGarageGate(live,80+frame/60,1/60,[]);
   forecast=advanceGarageGate(forecast,80+frame/60,1/60,[]);
   expect(forecast).toEqual(live);
   if(frame===135)expect(live.openness).toBe(1);
  }
  expect(live.openness).toBe(0);expect(live.clock).toBeCloseTo(104.5,8);
  expect(before).toEqual({openness:1,holdUntil:82.5,clock:80});
 });
});
describe('legal drive-in, walking and departure',()=>{
 it('lets a real car enter, stop at the service pad, leave the car and walk out',()=>{
  const state=carAt(89),car=activeVehicle(state)!;
  moveCarTo(state,62.5);
  expect(car.z).toBeLessThan(63);expect(car.z).toBeGreaterThan(60);expect(car.health).toBe(100);expect(state.wanted).toBe(0);
  expect(isInsideGarageBay(car)).toBe(true);expect(garageServiceAvailable(car,1.5)).toBe(true);expect(state.garageGate!.openness).toBe(1);
  Object.assign(car,{speed:0});step(state,{...idle,interact:true},1/60);
  expect(state.player.mode).toBe('foot');expect(isInsideGarageBay(state.player)).toBe(true);expect(garageSolidCollision(state.player,.55)).toBe(false);
  advance(state,5.5,{brake:true});expect(state.player.z).toBeGreaterThan(79);
  advance(state,5);expect(state.garageGate!.openness).toBe(0);expect(isInsideGarageBay(car)).toBe(true);
 });
 it('can reverse out of the workshop while side wings and rear fixtures remain solid',()=>{
  const state=carAt(62),car=activeVehicle(state)!;moveCarTo(state,81,true);
  expect(car.z).toBeGreaterThan(80);expect(car.health).toBe(100);expect(state.wanted).toBe(0);
  const foot=carAt(77,-29);Object.assign(foot.player,{mode:'foot',vehicleId:null});advance(foot,3,{throttle:true});
  expect(foot.player.z).toBeGreaterThanOrEqual(72.5);expect(foot.player.z).toBeLessThan(77);
 });
});

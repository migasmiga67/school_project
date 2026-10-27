import { describe, expect, it } from 'vitest';
import { activeVehicle, createGame, nearestVehicle, step, missionStart } from '../src/game';
import { BUILDINGS, WORLD_BOUNDS } from '../src/model';
import type { GameEvent, GameState, Input, Vehicle } from '../src/model';

const idle = (): Input => ({ throttle:false, brake:false, left:false, right:false, handbrake:false, boost:false, sprint:false, interact:false, nextMission:false, reset:false });
function advance(state: GameState, seconds: number, input: Partial<Input> = {}): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i=0;i<Math.ceil(seconds/0.05);i++) events.push(...step(state,{...idle(),...input},0.05));
  return events;
}
function clearTraffic(state: GameState): Vehicle {
  const vehicle = activeVehicle(state)!;
  state.vehicles=[vehicle]; state.police=[];
  return vehicle;
}
function place(state: GameState, x: number, z: number, heading=0, speed=0) {
  Object.assign(state.player,{x,z,heading});
  const vehicle=activeVehicle(state);
  if(vehicle)Object.assign(vehicle,{x,z,heading,speed});
}
function officer(x: number,z: number): Vehicle {
 return {id:'police-test',kind:'police',x,z,heading:0,speed:0,color:0xffffff,parked:false,health:100,owned:false,steer:0,wheelPhase:0};
}

describe('driving and collision rules',()=>{
 it('starts with an owned vehicle and a live courier contract',()=>{
  const state=createGame();const car=activeVehicle(state)!;
  expect(state.player.mode).toBe('drive');expect(car.owned).toBe(true);expect(car.kind).toBe('sport');
  expect(state.money).toBe(1250);expect(state.player.health).toBe(100);expect(state.vehicles.length).toBeGreaterThanOrEqual(10);
  expect(state.mission.active).toBe(true);expect(state.mission.kind).toBe('delivery');expect(state.mission.waypoint).toEqual({x:-40,z:0});
 });
 it('accelerates north at heading zero and synchronizes the player with the car',()=>{
  const state=createGame();const car=clearTraffic(state);const z=car.z;
  advance(state,1,{throttle:true});expect(car.z).toBeLessThan(z-.5);expect(car.speed).toBeGreaterThan(0);
  expect(state.player.x).toBeCloseTo(car.x);expect(state.player.z).toBeCloseTo(car.z);
 });
 it('turns left while driving and can brake to reverse',()=>{
  const state=createGame();const car=clearTraffic(state);advance(state,.8,{throttle:true});
  advance(state,.5,{throttle:true,left:true});expect(Math.sin(car.heading)).toBeLessThan(0);
  place(state,0,60,0,8);advance(state,2,{brake:true});expect(car.speed).toBeLessThan(0);
 });
 it('keeps boost and reverse speed bounded',()=>{
  const state=createGame();const car=clearTraffic(state);advance(state,2.5,{throttle:true,boost:true});
  expect(car.speed).toBeLessThanOrEqual(35.001);expect(car.speed).toBeGreaterThan(0);
  place(state,0,0,0,-9);advance(state,.5,{brake:true});expect(car.speed).toBeGreaterThanOrEqual(-9.001);
 });
 it('does not tunnel through the face of a building',()=>{
  const state=createGame();const car=clearTraffic(state);place(state,20,38,0,20);
  const events=advance(state,.8,{throttle:true});
  const block=BUILDINGS.find(b=>b.x===20&&b.z===20)!;
  expect(car.z).toBeGreaterThanOrEqual(block.z+block.halfZ);
  expect(events.some(e=>e.kind==='damage')).toBe(true);expect(car.health).toBeLessThan(100);
 });
 it('keeps a fast car inside the world boundary',()=>{
  const state=createGame();const car=clearTraffic(state);place(state,0,-95,0,30);advance(state,.5,{throttle:true});
  expect(car.z).toBeGreaterThanOrEqual(WORLD_BOUNDS.minZ);expect(car.z).toBeLessThanOrEqual(WORLD_BOUNDS.maxZ);
 });
 it('clamps oversized or invalid frame times instead of producing invalid coordinates',()=>{
  const state=createGame();const car=clearTraffic(state);const before=car.z;
  step(state,{...idle(),throttle:true},10);expect(Math.abs(car.z-before)).toBeLessThan(2);
  for(const dt of [Number.NaN,Number.POSITIVE_INFINITY,-1,0])step(state,idle(),dt);
  for(const value of [state.player.x,state.player.z,car.x,car.z,car.heading,car.speed,state.time])expect(Number.isFinite(value)).toBe(true);
 });
 it('recovers a damaged vehicle with reset and keeps the session playable',()=>{
  const state=createGame();const car=clearTraffic(state);car.health=5;place(state,0,0,0,0);
  step(state,{...idle(),reset:true},.016);
  expect(activeVehicle(state)?.health).toBe(100);expect(state.player.health).toBe(100);expect(Number.isFinite(state.player.x)).toBe(true);
 });
});

describe('walking and entering vehicles',()=>{
 it('exits a stopped car and can re-enter the nearest owned car',()=>{
  const state=createGame();const car=clearTraffic(state);
  step(state,{...idle(),interact:true},.016);expect(state.player.mode).toBe('foot');expect(state.player.vehicleId).toBeNull();
  expect(nearestVehicle(state)?.id).toBe(car.id);
  step(state,{...idle(),interact:true},.016);expect(state.player.mode).toBe('drive');expect(state.player.vehicleId).toBe(car.id);expect(state.wanted).toBe(0);
 });
 it('refuses to exit at unsafe speed',()=>{
  const state=createGame();const car=clearTraffic(state);car.speed=15;
  step(state,{...idle(),interact:true},.016);expect(state.player.mode).toBe('drive');
 });
 it('can enter a nearby civilian vehicle and gains police attention for theft',()=>{
  const state=createGame();const car=clearTraffic(state);car.owned=false;
  state.player.mode='foot';state.player.vehicleId=null;state.player.x=car.x+2;state.player.z=car.z;
  step(state,{...idle(),interact:true},.016);expect(state.player.vehicleId).toBe(car.id);expect(state.wanted).toBeGreaterThan(0);
 });
 it('does not offer a police car or a car farther than interaction range',()=>{
  const state=createGame();state.player.mode='foot';state.player.vehicleId=null;state.player.x=0;state.player.z=0;
  state.vehicles=[{...state.vehicles[0],x:20,z:20}];state.police=[officer(1,0)];expect(nearestVehicle(state)).toBeUndefined();
 });
 it('moves on foot, with sprint faster than walking',()=>{
  const walk=createGame();clearTraffic(walk);walk.player.mode='foot';walk.player.vehicleId=null;walk.player.x=0;walk.player.z=0;
  const sprint=structuredClone(walk);advance(walk,1,{throttle:true});advance(sprint,1,{throttle:true,sprint:true});
  expect(Math.hypot(sprint.player.x,sprint.player.z)).toBeGreaterThan(Math.hypot(walk.player.x,walk.player.z));
 });
});


describe('camera-relative movement',()=>{
 function pedestrian(): GameState {
  const state=createGame();clearTraffic(state);
  Object.assign(state.player,{mode:'foot',vehicleId:null,x:0,z:0,heading:0});
  return state;
 }
 it('walks forward toward the view direction at 90 and 180 degrees',()=>{
  const east=pedestrian(),south=pedestrian();
  advance(east,1,{throttle:true,viewHeading:Math.PI/2});
  advance(south,1,{throttle:true,viewHeading:Math.PI});
  expect(east.player.x).toBeCloseTo(3.2,8);expect(east.player.z).toBeCloseTo(0,8);
  expect(east.player.heading).toBeCloseTo(Math.PI/2,8);
  expect(south.player.x).toBeCloseTo(0,8);expect(south.player.z).toBeCloseTo(3.2,8);
 });
 it('strafes left or right and walks backward relative to a rotated view',()=>{
  const left=pedestrian(),right=pedestrian(),backward=pedestrian();
  advance(left,1,{left:true,viewHeading:Math.PI/2});
  advance(right,1,{right:true,viewHeading:Math.PI/2});
  advance(backward,1,{brake:true,viewHeading:Math.PI/2});
  expect(left.player.x).toBeCloseTo(0,8);expect(left.player.z).toBeCloseTo(-3.2,8);
  expect(right.player.x).toBeCloseTo(0,8);expect(right.player.z).toBeCloseTo(3.2,8);
  expect(backward.player.x).toBeCloseTo(-3.2,8);expect(backward.player.z).toBeCloseTo(0,8);
 });
 it('normalizes diagonal walking and sprinting independently of camera bearing',()=>{
  const walk=pedestrian(),sprint=pedestrian();
  advance(walk,1,{throttle:true,right:true,viewHeading:Math.PI/2});
  advance(sprint,1,{throttle:true,right:true,sprint:true,viewHeading:Math.PI/2});
  expect(walk.player.x).toBeCloseTo(3.2/Math.SQRT2,8);
  expect(walk.player.z).toBeCloseTo(3.2/Math.SQRT2,8);
  expect(Math.hypot(walk.player.x,walk.player.z)).toBeCloseTo(3.2,8);
  expect(Math.hypot(sprint.player.x,sprint.player.z)).toBeCloseTo(6,8);
 });
 it('preserves vehicle steering and acceleration when the mouse view points elsewhere',()=>{
  const forwardView=createGame(),sideView=createGame();clearTraffic(forwardView);clearTraffic(sideView);
  advance(forwardView,1,{throttle:true,left:true,viewHeading:0});
  advance(sideView,1,{throttle:true,left:true,viewHeading:Math.PI/2});
  expect(sideView.player).toEqual(forwardView.player);
  expect(activeVehicle(sideView)).toEqual(activeVehicle(forwardView));
 });
 it('uses the original forward bearing for missing or nonfinite view values',()=>{
  for(const viewHeading of [undefined,NaN,Infinity,-Infinity]){
   const state=pedestrian();advance(state,1,{throttle:true,viewHeading});
   expect(state.player.x).toBeCloseTo(0,8);expect(state.player.z).toBeCloseTo(-3.2,8);
   expect(Number.isFinite(state.player.heading)).toBe(true);
  }
 });
 it('still blocks camera-relative movement at a building face',()=>{
  const state=pedestrian();state.player.x=38;state.player.z=20;
  advance(state,3,{throttle:true,viewHeading:-Math.PI/2});
  expect(state.player.x).toBeGreaterThanOrEqual(32.5);
  expect(state.player.z).toBeCloseTo(20,8);
 });
});

describe('mission and pursuit progression',()=>{
 it('requires a vehicle at courier checkpoints and rewards delivery exactly once',()=>{
  const state=createGame();const car=clearTraffic(state);state.player.mode='foot';state.player.vehicleId=null;state.player.x=-40;state.player.z=0;
  step(state,idle(),.016);expect(state.mission.stage).toBe(0);
  state.player.mode='drive';state.player.vehicleId=car.id;place(state,-40,0);step(state,idle(),.016);
  expect(state.mission.stage).toBe(1);expect(state.mission.waypoint).toEqual({x:80,z:-40});
  place(state,80,-40);const events=step(state,idle(),.016);
  expect(state.mission.active).toBe(false);expect(state.mission.outcome).toBe('completed');expect(state.money).toBe(1700);expect(state.missionsWon).toBe(1);expect(events.some(e=>e.kind==='reward')).toBe(true);
  advance(state,.5);expect(state.money).toBe(1700);expect(state.missionsWon).toBe(1);
 });
 it('starts the race after a completed delivery and times out without a reward',()=>{
  const state=createGame();clearTraffic(state);place(state,-40,0);step(state,idle(),.016);place(state,80,-40);step(state,idle(),.016);
  missionStart(state);expect(state.mission.kind).toBe('race');expect(state.mission.active).toBe(true);
  state.mission.clock=.01;const money=state.money;step(state,idle(),.05);
  expect(state.mission.active).toBe(false);expect(state.mission.outcome).toBe('failed');expect(state.money).toBe(money);expect(state.missionsWon).toBe(1);
  missionStart(state);expect(state.mission.kind).toBe('race');expect(state.mission.clock).toBe(120);expect(state.mission.outcome).toBeUndefined();
 });
 it('continues from delivery to race after restoring lifetime mission statistics',()=>{
  for(const restoredWins of [1,2,8]){
   const state=createGame();clearTraffic(state);state.missionsWon=restoredWins;
   place(state,-40,0);step(state,idle(),.016);place(state,80,-40);step(state,idle(),.016);
   expect(state.missionsWon).toBe(restoredWins+1);expect(state.mission.outcome).toBe('completed');
   missionStart(state);expect(state.mission.kind).toBe('race');expect(state.mission.outcome).toBeUndefined();
  }
 });
 it('marks interrupted races and escapes as failed, then retries the same story',()=>{
  const state=createGame();clearTraffic(state);
  place(state,-40,0);step(state,idle(),.016);place(state,80,-40);step(state,idle(),.016);missionStart(state);
  step(state,{...idle(),reset:true},.016);
  expect(state.mission.kind).toBe('race');expect(state.mission.outcome).toBe('failed');expect(state.mission.active).toBe(false);
  missionStart(state);expect(state.mission.kind).toBe('race');expect(state.mission.outcome).toBeUndefined();
  for(const point of [{x:80,z:80},{x:-80,z:80},{x:-80,z:-80},{x:80,z:-80}]){
   place(state,point.x,point.z);step(state,idle(),.016);
  }
  missionStart(state);expect(state.mission.kind).toBe('escape');
  step(state,{...idle(),reset:true},.016);
  expect(state.mission.outcome).toBe('failed');expect(state.mission.active).toBe(false);
  missionStart(state);expect(state.mission.kind).toBe('escape');expect(state.mission.outcome).toBeUndefined();expect(state.wanted).toBe(2);
 });
 it('completes a four-checkpoint race then a successful escape with normal rewards',()=>{
  const state=createGame();clearTraffic(state);
  place(state,-40,0);step(state,idle(),.016);place(state,80,-40);step(state,idle(),.016);
  missionStart(state);expect(state.mission.kind).toBe('race');
  for(const point of [{x:80,z:80},{x:-80,z:80},{x:-80,z:-80},{x:80,z:-80}]){
   expect(state.mission.waypoint).toEqual(point);place(state,point.x,point.z);step(state,idle(),.016);
  }
  expect(state.mission.active).toBe(false);expect(state.missionsWon).toBe(2);expect(state.money).toBe(2400);expect(state.bestRace).toBeGreaterThan(0);
  missionStart(state);expect(state.mission.kind).toBe('escape');expect(state.wanted).toBe(2);
  // Isolate the hideout hold with pursuers at legitimate distant road nodes.
  // The separate pursuit test covers police movement and attention decay.
  place(state,-80,0);state.police=[officer(80,80),{...officer(80,-80),id:'police-second'}];
  const events=advance(state,12.5);
  expect(state.mission.active).toBe(false);expect(state.missionsWon).toBe(3);expect(state.money).toBe(3300);expect(state.wanted).toBe(0);expect(events.some(e=>e.kind==='reward')).toBe(true);
 });
 it('clears wanted attention when police remain far away long enough',()=>{
  const state=createGame();clearTraffic(state);place(state,80,80);state.wanted=1;state.heat=1;state.escapeTimer=0;state.police=[officer(-80,-80)];
  advance(state,13);
  expect(state.wanted).toBe(0);expect(state.police).toHaveLength(0);
 });
 it('routes police between parallel streets via intersections instead of cutting through a block',()=>{
  const state=createGame();clearTraffic(state);place(state,40,20);
  state.wanted=1;state.police=[officer(0,20)];
  const suspect={x:40,z:20};let nearest=Infinity;
  for(let frame=0;frame<160;frame++){
   step(state,idle(),.05);
   for(const cop of state.police){
    nearest=Math.min(nearest,Math.hypot(cop.x-suspect.x,cop.z-suspect.z));
    expect(BUILDINGS.some(b=>cop.x>b.x-b.halfX&&cop.x<b.x+b.halfX&&cop.z>b.z-b.halfZ&&cop.z<b.z+b.halfZ)).toBe(false);
   }
  }
  expect(nearest).toBeLessThan(3);
 });
 it('arrests a stationary nearby suspect, charges a fine, then resets pursuit',()=>{
  const state=createGame();clearTraffic(state);state.player.mode='foot';state.player.vehicleId=null;state.player.x=0;state.player.z=0;
  state.wanted=1;state.heat=1;state.police=[officer(1.5,0)];
  const events=advance(state,4);
  expect(events.some(e=>e.kind==='arrest')).toBe(true);expect(state.wanted).toBe(0);expect(state.money).toBeLessThan(1250);expect(state.player.health).toBe(100);
 });
});

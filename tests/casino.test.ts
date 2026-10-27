import { describe, expect, it } from 'vitest';
import { activeVehicle, casinoAction, createGame, missionStart, nearestVehicle, step } from '../src/game';
import { CASINO } from '../src/casino-location';
import { advanceSimulation } from '../src/simulation';
import type { GameEvent, GameState, Input } from '../src/model';

const idle: Input = { throttle:false,brake:false,left:false,right:false,handbrake:false,boost:false,sprint:false,interact:false,nextMission:false,reset:false };
function tick(state:GameState,input:Partial<Input>={},delta=.05) { return step(state,{...idle,...input},delta); }
function advance(state:GameState,seconds:number,input:Partial<Input>={}) {
  const events:GameEvent[]=[];
  for(let i=0;i<Math.ceil(seconds/.05);i++)events.push(...tick(state,input));
  return events;
}
function atDoor() {
  const state=createGame();
  Object.assign(state.player,CASINO.door,{mode:'foot',vehicleId:null,heading:0});
  return state;
}
function enter() {
  const state=atDoor();tick(state,{interact:true});
  expect(state.interior).toBe('casino');
  return state;
}

describe('casino portals and interactions',()=>{
  it('starts outdoors and offers the casino only to a pedestrian near its door',()=>{
    const state=createGame();expect(state.interior).toBeNull();expect(casinoAction(state)).toBeNull();
    Object.assign(state.player,CASINO.door);expect(casinoAction(state)).toBeNull();
    Object.assign(state.player,{mode:'foot',vehicleId:null});expect(casinoAction(state)).toBe('enter');
    state.player.x+=4;expect(casinoAction(state)).toBeNull();
  });
  it('first exits a parked car at the door, then enters the casino on the next E',()=>{
    const state=createGame(),car=activeVehicle(state)!;
    Object.assign(car,{x:20,z:75,speed:0});Object.assign(state.player,{x:20,z:75});
    const first=tick(state,{interact:true});
    expect(state.interior).toBeNull();expect(state.player.mode).toBe('foot');
    expect(first.some(event=>event.kind==='interior')).toBe(false);
    expect(casinoAction(state)).toBe('enter');
    const second=tick(state,{interact:true});
    expect(state.interior).toBe('casino');expect(second.some(event=>event.kind==='interior')).toBe(true);
    expect(car.parked).toBe(true);expect(car.x).toBe(20);expect(car.z).toBe(75);
  });
  it('enters once per interaction pulse without spending money or re-exiting in substeps',()=>{
    const state=atDoor(),money=state.money;
    const events=advanceSimulation(state,{...idle,interact:true},.2);
    expect(state.interior).toBe('casino');expect(state.player.x).toBe(CASINO.entry.x);expect(state.player.z).toBe(CASINO.entry.z);
    expect(state.player.mode).toBe('foot');expect(state.player.vehicleId).toBeNull();expect(state.money).toBe(money);
    expect(events.filter(event=>event.kind==='interior')).toHaveLength(1);
  });
  it('denies entry during a pursuit before trying to enter a nearby civilian car',()=>{
    const state=atDoor();state.wanted=1;
    Object.assign(state.vehicles[0],CASINO.door,{owned:false});
    const events=tick(state,{interact:true});
    expect(state.interior).toBeNull();expect(state.player.mode).toBe('foot');expect(state.player.vehicleId).toBeNull();
    expect(events.some(event=>event.text.includes('Zgub pościg'))).toBe(true);expect(state.money).toBe(1250);
  });
  it('returns outside through the exit with a single portal event',()=>{
    const state=enter();Object.assign(state.player,CASINO.exit);
    expect(casinoAction(state)).toBe('exit');
    const events=tick(state,{interact:true});
    expect(state.interior).toBeNull();expect(state.player.mode).toBe('foot');expect(state.player.x).toBe(CASINO.door.x);
    expect(state.player.z).toBeCloseTo(CASINO.door.z+1.8);expect(state.player.heading).toBe(Math.PI);
    expect(events.filter(event=>event.kind==='interior')).toHaveLength(1);expect(state.money).toBe(1250);
  });
  it('opens poker only near the table without changing the wallet in the simulation',()=>{
    const state=enter();
    expect(casinoAction(state)).toBe('exit');
    advance(state,1.3,{throttle:true,viewHeading:0});
    expect(casinoAction(state)).toBe('poker');
    const events=tick(state,{interact:true});
    expect(events.filter(event=>event.kind==='poker')).toHaveLength(1);
    expect(state.interior).toBe('casino');expect(state.money).toBe(1250);
  });
  it('does not offer or enter a city vehicle while in the casino',()=>{
    const state=enter();Object.assign(state.player,{x:9,z:0});Object.assign(state.vehicles[0],{x:9,z:0});
    expect(casinoAction(state)).toBeNull();expect(nearestVehicle(state)).toBeUndefined();
    const events=tick(state,{interact:true});
    expect(state.player.mode).toBe('foot');expect(state.player.vehicleId).toBeNull();expect(state.interior).toBe('casino');
    expect(events.some(event=>event.kind==='info')).toBe(true);
  });
});

describe('walkable casino and suspended city',()=>{
  it('blocks the poker table and keeps camera-relative walking within room walls',()=>{
    const state=enter();advance(state,8,{throttle:true,viewHeading:0});
    expect(state.player.z).toBeGreaterThanOrEqual(CASINO.table.z+CASINO.tableCollider.halfZ+.55-1e-8);
    Object.assign(state.player,{x:7,z:6.5});advance(state,5,{throttle:true,viewHeading:Math.PI/2});
    expect(state.player.x).toBeCloseTo(CASINO.bounds.maxX-.55);expect(state.player.z).toBeCloseTo(6.5);
    advance(state,10,{brake:true,viewHeading:0});
    expect(state.player.z).toBeCloseTo(CASINO.bounds.maxZ-.55);
    advance(state,10,{left:true,viewHeading:0});
    expect(state.player.x).toBeCloseTo(CASINO.bounds.minX+.55);
  });
  it('does not apply unrelated city building colliders to local indoor coordinates',()=>{
    const state=enter();Object.assign(state.player,{x:8.5,z:8});
    advance(state,.2,{throttle:true,viewHeading:Math.PI/2});
    expect(state.player.x).toBeGreaterThan(8.8);expect(state.player.z).toBe(8);
  });
  it('freezes the city traffic and race clock indoors, then resumes after exiting',()=>{
    const state=atDoor();state.mission.active=false;state.mission.outcome='completed';missionStart(state);
    expect(state.mission.kind).toBe('race');tick(state,{interact:true});
    const vehicles=structuredClone(state.vehicles),clock=state.mission.clock,time=state.time;
    advance(state,3);
    expect(state.vehicles).toEqual(vehicles);expect(state.mission.clock).toBe(clock);expect(state.time).toBeCloseTo(time+3);
    Object.assign(state.player,CASINO.exit);tick(state,{interact:true});advance(state,.5);
    expect(state.interior).toBeNull();expect(state.mission.clock).toBeLessThan(clock);expect(state.vehicles).not.toEqual(vehicles);
  });
  it('does not advance or start a mission through M while indoors',()=>{
    const state=enter();state.mission.active=false;state.mission.outcome='completed';
    const before=structuredClone(state.mission);
    expect(missionStart(state)[0].kind).toBe('info');expect(state.mission).toEqual(before);
    tick(state,{nextMission:true});expect(state.mission).toEqual(before);expect(state.wanted).toBe(0);
  });
  it('returns to the indoor entrance for free instead of repairing the outdoor car',()=>{
    const state=enter();Object.assign(state.player,{x:-8,z:-7,health:63});state.vehicles[0].health=22;
    const events=tick(state,{reset:true});
    expect(state.interior).toBe('casino');expect(state.player.x).toBe(CASINO.entry.x);expect(state.player.z).toBe(CASINO.entry.z);
    expect(state.player.health).toBe(63);expect(state.vehicles[0].health).toBe(22);expect(state.money).toBe(1250);
    expect(events.some(event=>event.text.includes('wejścia kasyna'))).toBe(true);
  });
});

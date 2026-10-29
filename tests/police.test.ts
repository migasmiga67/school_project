import { describe, expect, it } from 'vitest';
import { activeVehicle, createGame, POLICE_SAFEHOUSE, step } from '../src/game';
import { BUILDINGS, type GameState, type Input, type Vehicle } from '../src/model';

const idle:Input={throttle:false,brake:false,left:false,right:false,handbrake:false,boost:false,sprint:false,interact:false,nextMission:false,reset:false};
const cop=(id:string,x:number,z:number):Vehicle=>({id,kind:'police',x,z,heading:0,speed:0,color:0xffffff,parked:false,health:100,owned:false,steer:0,wheelPhase:0});
function emptyCity(){
  const state=createGame();state.vehicles=[activeVehicle(state)!];state.mission.active=false;state.mission.waypoint=null;return state;
}
function place(state:GameState,x:number,z:number,speed=0){
  Object.assign(state.player,{x,z});const car=activeVehicle(state);if(car)Object.assign(car,{x,z,speed});
}
function advance(state:GameState,seconds:number){
  for(let i=0;i<Math.ceil(seconds/.05);i++)step(state,idle,.05);
}

describe('expanded police pursuits',()=>{
  it('runs two ambient patrols along roads without making the player wanted',()=>{
    const state=emptyCity();step(state,idle,.05);
    const first=structuredClone(state.pursuit!.patrols);expect(first).toHaveLength(2);
    advance(state,1);
    expect(state.wanted).toBe(0);expect(state.police).toEqual([]);expect(state.pursuit!.status).toBe('clear');
    for(const patrol of state.pursuit!.patrols){
      expect(patrol).not.toMatchObject({x:first.find(item=>item.id===patrol.id)!.x,z:first.find(item=>item.id===patrol.id)!.z});
      expect(BUILDINGS.some(building=>Math.abs(patrol.x-building.x)<building.halfX&&Math.abs(patrol.z-building.z)<building.halfZ)).toBe(false);
    }
  });
  it('spawns roadblocks ahead at level two and makes their barriers physical',()=>{
    const state=emptyCity();place(state,0,0);state.wanted=2;state.police=[cop('one',-80,-80),cop('two',80,-80)];
    step(state,idle,.05);
    const block=state.pursuit!.roadblocks[0];expect(block).toBeDefined();expect(Math.hypot(block.x,block.z)).toBeGreaterThanOrEqual(28);
    place(state,block.x,block.z+block.halfZ+1.6,20);
    const before=state.player.z,car=activeVehicle(state)!,health=car.health;
    const events=step(state,idle,.05);
    expect(car.z).toBeCloseTo(before);expect(car.speed).toBeLessThan(0);expect(car.health).toBeLessThan(health);
    expect(events.some(event=>event.kind==='damage')).toBe(true);
  });
  it('leaves an actual driveable shoulder beside a roadblock',()=>{
    const state=emptyCity();place(state,0,0);state.wanted=2;state.police=[cop('one',-80,-80),cop('two',80,-80)];step(state,idle,.05);
    const block=state.pursuit!.roadblocks[0];
    place(state,block.x+6,block.z+5,15);const car=activeVehicle(state)!,before=car.z;
    advance(state,.5);
    expect(car.z).toBeLessThan(before-2);expect(car.health).toBe(100);
  });
  it('uses the helicopter to spot a suspect and respects building cover',()=>{
    const visible=emptyCity();place(visible,0,40);visible.wanted=3;
    visible.police=[cop('one',-80,-80),cop('two',80,-80),cop('three',80,80)];
    visible.pursuit!.helicopter={x:0,z:50,heading:0,spotted:false,searching:true};
    step(visible,idle,.05);
    expect(visible.pursuit!.helicopter!.spotted).toBe(true);expect(visible.pursuit!.status).toBe('pursuit');expect(visible.heat).toBe(0);

    const covered=emptyCity();place(covered,40,20);covered.wanted=3;
    covered.police=[cop('one',-80,-80),cop('two',80,-80),cop('three',-80,80)];
    covered.pursuit!.helicopter={x:0,z:20,heading:0,spotted:false,searching:true};
    step(covered,idle,.05);
    expect(covered.pursuit!.helicopter!.spotted).toBe(false);expect(covered.pursuit!.helicopter!.searching).toBe(true);
    expect(covered.pursuit!.status).toBe('search');expect(covered.heat).toBeGreaterThan(0);
  });
  it('searches the last reported block rather than following a hidden suspect',()=>{
    const state=emptyCity();place(state,40,20);state.wanted=1;state.police=[cop('one',0,20)];
    step(state,idle,.05);place(state,0,-40);
    advance(state,2.8);
    // Last report was on the east street, so the patrol turns east at (0, 0).
    // A patrol following the current hidden coordinate would continue north.
    expect(state.police[0].x).toBeGreaterThan(10);expect(Math.abs(state.police[0].z)).toBeLessThan(.5);
    expect(state.pursuit!.status).toBe('search');
  });
  it('lets a stopped unseen player wait out a chase at the marked safehouse',()=>{
    const state=emptyCity();place(state,POLICE_SAFEHOUSE.x,POLICE_SAFEHOUSE.z);state.wanted=2;
    state.police=[cop('one',80,80),cop('two',80,-80)];
    advance(state,1);expect(state.pursuit!.hidden).toBe(true);expect(state.pursuit!.status).toBe('hidden');
    advance(state,5.1);
    expect(state.wanted).toBe(0);expect(state.pursuit!.roadblocks).toEqual([]);expect(state.pursuit!.status).toBe('clear');
  });
  it('reports the concealment dwell separately from earlier time out of sight',()=>{
    const state=emptyCity();place(state,-80,25);state.wanted=2;state.heat=4;
    state.police=[cop('one',80,80),cop('two',80,-80)];
    step(state,idle,.05);expect(state.pursuit!.concealmentSeconds).toBe(0);
    place(state,POLICE_SAFEHOUSE.x,POLICE_SAFEHOUSE.z);step(state,idle,.05);
    expect(state.pursuit!.hidden).toBe(true);expect(state.pursuit!.searchSeconds).toBeGreaterThan(4);
    expect(state.pursuit!.concealmentSeconds).toBeCloseTo(.05);
  });
  it('does not let the safehouse erase an active visual tail or hide a moving car',()=>{
    const tailed=emptyCity();place(tailed,POLICE_SAFEHOUSE.x,POLICE_SAFEHOUSE.z);tailed.wanted=1;tailed.police=[cop('one',-80,25)];
    advance(tailed,1);expect(tailed.pursuit!.hidden).toBe(false);expect(tailed.pursuit!.visible).toBe(true);expect(tailed.wanted).toBe(1);
    const moving=emptyCity();place(moving,POLICE_SAFEHOUSE.x,POLICE_SAFEHOUSE.z,5);moving.wanted=1;moving.police=[cop('one',80,80)];
    step(moving,idle,.05);expect(moving.pursuit!.hidden).toBe(false);
  });
  it('removes helicopter and roadblocks when attention decays below their level',()=>{
    const state=emptyCity();place(state,-80,-80);state.wanted=3;state.heat=11.99;
    state.police=[cop('one',80,80),cop('two',40,80),cop('three',80,40)];
    state.pursuit!.helicopter={x:80,z:80,heading:0,spotted:false,searching:true};
    step(state,idle,.05);expect(state.wanted).toBe(2);expect(state.pursuit!.helicopter).toBeNull();
    state.heat=11.99;step(state,idle,.05);expect(state.wanted).toBe(1);expect(state.pursuit!.roadblocks).toEqual([]);
  });
});

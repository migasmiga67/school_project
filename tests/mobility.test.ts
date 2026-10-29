import { describe,expect,it } from 'vitest';
import { activeVehicle,createGame,nearestVehicle,step } from '../src/game';
import { BIKE_RAMPS,DOCK,MOBILITY_COURSES,MobilityTrials,WATER_BOUNDS,advanceBoat,canBoardDockBoat,type MobilityMember } from '../src/mobility';
import type { GameState,Input,Vehicle } from '../src/model';

const idle=():Input=>({throttle:false,brake:false,left:false,right:false,handbrake:false,boost:false,sprint:false,interact:false,nextMission:false,reset:false});
function advance(s:GameState,seconds:number,input:Partial<Input>={}){const events=[];for(let i=0;i<Math.ceil(seconds/.05);i++)events.push(...step(s,{...idle(),...input},.05));return events;}
function mounted(kind:'sport'|'bike'|'boat',x=0,z=60,speed=0){const state=createGame(),car=state.vehicles.find(vehicle=>vehicle.kind===kind)!;state.vehicles=[car];Object.assign(car,{x,z,heading:0,speed,parked:true});Object.assign(state.player,{x,z,heading:0,mode:'drive',vehicleId:car.id});return{state,car};}
function board(){const state=createGame();Object.assign(state.player,DOCK.land,{mode:'foot',vehicleId:null});step(state,{...idle(),interact:true},.05);return state;}

describe('motorcycle and motorboat gameplay',()=>{
 it('boards the real water vehicle from a reachable shore entrance and disembarks safely',()=>{
  const state=createGame(),boat=state.vehicles.find(vehicle=>vehicle.id==='boat-1')!;
  Object.assign(state.player,DOCK.land,{mode:'foot',vehicleId:null});
  expect(canBoardDockBoat(state.player,boat)).toBe(true);expect(nearestVehicle(state)?.id).toBe('boat-1');
  step(state,{...idle(),interact:true},.05);expect(activeVehicle(state)?.kind).toBe('boat');expect(state.player.x).toBeGreaterThan(118);
  step(state,{...idle(),interact:true},.05);expect(state.player.mode).toBe('foot');expect(state.player.x).toBe(DOCK.land.x);expect(state.player.z).toBe(DOCK.land.z);expect(state.wanted).toBe(0);
 });
 it('rejects abandoning the boat at sea, while recovery returns the shared boat to its mooring',()=>{
  const state=board(),boat=activeVehicle(state)!;Object.assign(boat,{x:166,z:-40,speed:0});Object.assign(state.player,{x:166,z:-40});
  const events=step(state,{...idle(),interact:true},.05);expect(state.player.mode).toBe('drive');expect(state.player.vehicleId).toBe('boat-1');expect(events.some(event=>event.text.includes('Wróć do pomostu'))).toBe(true);
  step(state,{...idle(),reset:true},.05);expect(state.player.vehicleId).toBe('stratus');expect(boat.x).toBe(DOCK.mooring.x);expect(boat.z).toBe(DOCK.mooring.z);expect(boat.speed).toBe(0);expect(state.money).toBe(1150);
 });
 it('keeps boats in navigable water and preserves a separate walking shoreline boundary',()=>{
  const {state,car}=mounted('boat',WATER_BOUNDS.minX+1.4,0,24);car.heading=-Math.PI/2;state.player.heading=car.heading;
  advance(state,2,{throttle:true});expect(car.x).toBeGreaterThanOrEqual(WATER_BOUNDS.minX+1.4);expect(car.x).toBeGreaterThan(100);
  Object.assign(car,{x:150,z:WATER_BOUNDS.maxZ-2.5,heading:Math.PI,speed:28});Object.assign(state.player,{x:car.x,z:car.z});advance(state,.5,{throttle:true});expect(car.z).toBeLessThanOrEqual(WATER_BOUNDS.maxZ-2.5);
  const foot=createGame();Object.assign(foot.player,DOCK.land,{mode:'foot',vehicleId:null});advance(foot,2,{right:true});expect(foot.player.x).toBeLessThan(98);expect(foot.player.mode).toBe('foot');
 });
 it('gives the boat coasting inertia and lateral drift through turns',()=>{
  const boat=mounted('boat',150,0,20),car=mounted('sport',0,60,20);advance(boat.state,1);advance(car.state,1);
  expect(boat.car.speed).toBeGreaterThan(car.car.speed+3);
  Object.assign(boat.car,{x:150,z:0,heading:0,speed:15});
  let dx=0,dz=0;for(let i=0;i<20;i++){const before={x:boat.car.x,z:boat.car.z};advanceBoat(boat.car,{...idle(),right:true,throttle:true},.05);dx=boat.car.x-before.x;dz=boat.car.z-before.z;}
  const travelHeading=Math.atan2(dx,-dz);expect(boat.car.heading).toBeGreaterThan(.2);expect(travelHeading).toBeLessThan(boat.car.heading-.03);
 });
 it('accelerates and steers a motorcycle differently from a road car',()=>{
  const bike=mounted('bike'),car=mounted('sport');advance(bike.state,1,{throttle:true});advance(car.state,1,{throttle:true});expect(bike.car.speed).toBeGreaterThan(car.car.speed+3);
  const bikeTurn=mounted('bike',0,60,15),carTurn=mounted('sport',0,60,15);advance(bikeTurn.state,.3,{left:true});advance(carTurn.state,.3,{left:true});expect(Math.abs(bikeTurn.car.heading)).toBeGreaterThan(Math.abs(carTurn.car.heading)*1.2);
 });
 it('lets the narrower motorcycle pass a gap that blocks a car',()=>{
  const bike=mounted('bike',7,40,12),car=mounted('sport',7,40,12);advance(bike.state,1,{throttle:true});advance(car.state,1,{throttle:true});expect(bike.car.z).toBeLessThan(30);expect(car.car.z).toBeGreaterThan(32);
 });
 it('launches from a real ramp, prevents dismounting in the air and lands again',()=>{
  const ramp=BIKE_RAMPS[0],{state,car}=mounted('bike',ramp.x,ramp.z+6,18);let max=0,launched=false,blockedDismount=false;
  for(let i=0;i<70;i++){
   const inAir=(car.airHeight??0)>2&&!blockedDismount;const events=step(state,{...idle(),throttle:true,interact:inAir},.05);
   if(inAir){expect(state.player.vehicleId).toBe(car.id);blockedDismount=events.some(event=>event.text.includes('Poczekaj na lądowanie'));}
   launched ||= events.some(event=>event.text.includes('Skok!'));max=Math.max(max,car.airHeight??0);
  }
  expect(launched).toBe(true);expect(blockedDismount).toBe(true);expect(max).toBeGreaterThan(3);expect(car.airHeight).toBe(0);
 });
});

const member=(id:string,kind:'bike'|'boat',x:number,z:number):MobilityMember=>({id,pose:{x,z,heading:0,mode:'drive',interior:null,homeId:null,seated:false,vehicle:{id:kind==='boat'?'boat-1':'bike-1',kind,x,z,heading:0,speed:5,color:0xffffff,health:100}}});
describe('host-owned vehicle time trials',()=>{
 it.each(['bike','boat'] as const)('requires the right vehicle and ordered checkpoints for %s, awarding one payout',kind=>{
  const trials=new MobilityTrials(),course=MOBILITY_COURSES[kind],person=member('player',kind,course.start.x,course.start.z);
  expect(trials.command('player',{kind:'start',course:kind},[person],0).ok).toBe(true);
  let now=1000;
  // Finishing location alone cannot skip the course.
  const finish=course.checkpoints.at(-1)!;Object.assign(person.pose,finish);Object.assign(person.pose.vehicle!,finish);trials.update([person],now);expect(trials.snapshot('player').checkpoint).toBe(0);
  for(const target of course.checkpoints){Object.assign(person.pose,target);Object.assign(person.pose.vehicle!,target);trials.update([person],now+=1000);}
  expect(trials.snapshot('player').status).toBe('completed');expect(trials.drainCredits()).toEqual([{id:'player',amount:course.reward,sourceId:`mobility:${kind}:1`}]);
  trials.update([person],now+100);expect(trials.drainCredits()).toEqual([]);expect(trials.command('player',{kind:'start',course:kind},[person],now+200).ok).toBe(false);
 });
 it('rejects wrong vehicle, remote starts and passenger participation',()=>{
  const trials=new MobilityTrials(),person=member('player','bike',0,80);
  expect(trials.command('player',{kind:'start',course:'boat'},[person],0).ok).toBe(false);
  person.pose.x=70;expect(trials.command('player',{kind:'start',course:'bike'},[person],0).ok).toBe(false);
  person.pose.x=0;person.pose.passengerOf='friend';expect(trials.command('player',{kind:'start',course:'bike'},[person],0).ok).toBe(false);
 });
 it('fails a disconnected attempt and rejects expired or cancelled awards',()=>{
  const person=member('player','bike',0,80),trials=new MobilityTrials();trials.command('player',{kind:'start',course:'bike'},[person],0);
  trials.update([],1000);expect(trials.snapshot('player').status).toBe('failed');expect(trials.drainCredits()).toEqual([]);
  trials.command('player',{kind:'start',course:'bike'},[person],16000);expect(trials.snapshot('player').status).toBe('running');
  trials.update([person],106000);expect(trials.snapshot('player').status).toBe('failed');expect(trials.drainCredits()).toEqual([]);
  trials.command('player',{kind:'start',course:'bike'},[person],122000);trials.command('player',{kind:'cancel'},[person],123000);expect(trials.snapshot('player').status).toBe('failed');expect(trials.drainCredits()).toEqual([]);
 });
});

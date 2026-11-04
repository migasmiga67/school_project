import {describe,expect,it} from 'vitest';
import {CITY_TRAFFIC_LOOPS,clearCitySegment} from '../src/city-map';
import {TRAFFIC_SIGNALS,SIGNAL_CYCLE_SECONDS,signalAt,nextSignalOpening,signalAxis} from '../src/traffic-signals';
import {ambientTrafficPose,crossingGates,pedestrianTrafficPose,sampleTrafficPath,signalAwareProgress,trafficRoute} from '../src/traffic-flow';
import {activeVehicle,createGame,step,synchronizeOnlineTraffic} from '../src/game';
import {advanceSimulation} from '../src/simulation';
import type{GameState,Input} from '../src/model';
const idle:Input={throttle:false,brake:false,left:false,right:false,handbrake:false,boost:false,sprint:false,interact:false,nextMission:false,reset:false};
const ambient=(state:GameState)=>state.vehicles.filter(car=>car.id.startsWith('traffic-'));

describe('shared junction signals',()=>{
 it('never gives crossing axes or pedestrians conflicting green phases',()=>{
  expect(TRAFFIC_SIGNALS.length).toBeGreaterThan(20);
  for(const signal of TRAFFIC_SIGNALS)for(let time=0;time<SIGNAL_CYCLE_SECONDS*2;time+=.25){
   const state=signalAt(signal.id,time);
   expect(state.primary==='green'&&state.secondary==='green').toBe(false);
   if(state.pedestrian){expect(state.primary).toBe('red');expect(state.secondary).toBe('red');}
   expect(state.remaining).toBeGreaterThan(0);
   expect(signalAt(signal.id,time+SIGNAL_CYCLE_SECONDS)).toEqual(state);
  }
 });
 it('uses actual street tangents for both directions and finds a complete legal opening',()=>{
  for(const signal of TRAFFIC_SIGNALS){
   expect(signalAxis(signal,signal.axisHeading)).toBe(0);expect(signalAxis(signal,signal.axisHeading+Math.PI)).toBe(0);
   expect(signalAxis(signal,signal.axisHeading+Math.PI/2)).toBe(1);
   for(let time=0;time<80;time+=3.7){
    const opening=nextSignalOpening(signal.id,time,signal.axisHeading,'vehicle',4);
    expect(opening).toBeGreaterThanOrEqual(time);expect(opening-time).toBeLessThan(SIGNAL_CYCLE_SECONDS);
    expect(signalAt(signal.id,opening,signal.axisHeading).phase).toBe('green');
    expect(signalAt(signal.id,opening+3.99,signal.axisHeading).phase).toBe('green');
   }
  }
 });
});

describe('analytic ambient traffic',()=>{
 it('holds a car spawned exactly at a red stop line rather than skipping that gate',()=>{
  const route=CITY_TRAFFIC_LOOPS[0],gate=crossingGates(route,'vehicle').find(gate=>nextSignalOpening(gate.signalId,0,gate.heading,'vehicle',4)>0)!;
  expect(gate).toBeDefined();
  const pose=signalAwareProgress(route,gate.at,8,0);
  expect(pose.progress).toBeCloseTo(gate.at,8);expect(pose.speed).toBe(0);expect(pose.waiting).toBe(true);expect(pose.signalId).toBe(gate.signalId);
 });
 it('brakes smoothly, waits, and crosses only after a sufficiently long green interval',()=>{
  let waits=0,brakes=0,crossings=0;
  for(let index=0;index<16;index++){
   const route=trafficRoute(index),gates=crossingGates(route,'vehicle');let before=ambientTrafficPose(index,0);
   for(let time=.2;time<=300;time+=.2){
    const after=ambientTrafficPose(index,time);
    expect(after.progress).toBeGreaterThanOrEqual(before.progress-1e-6);
    expect(after.progress-before.progress).toBeLessThanOrEqual((8+index%4)*.2+1e-5);
    expect(clearCitySegment(after,after,1.4)).toBe(true);
    if(after.waiting)waits++;if(after.speed<before.speed-.05)brakes++;
    const routeLength=route.reduce((sum,p,i)=>sum+Math.hypot(p.x-route[(i+1)%route.length].x,p.z-route[(i+1)%route.length].z),0);
    for(const gate of gates){
     const lap=Math.floor(before.progress/routeLength),at=gate.at+lap*routeLength;
     for(const target of[at+.01,at+routeLength+.01])if(target>before.progress+1e-6&&target<=after.progress+1e-6){
      const crossedAt=time-.2+(target-before.progress)/(after.progress-before.progress)*.2;
      expect(signalAt(gate.signalId,crossedAt+.001,gate.heading).phase,JSON.stringify({index,time,crossedAt,gate,before,after})).toBe('green');crossings++;
     }
    }
    before=after;
   }
  }
  expect(waits).toBeGreaterThan(100);expect(brakes).toBeGreaterThan(100);expect(crossings).toBeGreaterThan(50);
 });
 it('seeks a long-lived room without retaining an ever-growing simulation history',()=>{
  const early=Array.from({length:16},(_,i)=>ambientTrafficPose(i,72.125));
  for(let index=0;index<16;index++){
   const future=ambientTrafficPose(index,1_000_000_000);
   expect(Number.isFinite(future.x+future.z+future.speed+future.progress)).toBe(true);
   expect(future.progress).toBeGreaterThan(early[index].progress);
   expect(clearCitySegment(future,future,1.4)).toBe(true);
   expect(ambientTrafficPose(index,72.125)).toEqual(early[index]);
  }
 });
 it('gives every pedestrian a stable shared pose that can wait at crossings',()=>{
  let waiting=0;
  for(let i=0;i<64;i++)for(let time=0;time<180;time+=3){
   const pose=pedestrianTrafficPose(i,time);expect(clearCitySegment(pose,pose,.6)).toBe(true);
   if(pose.signalId){waiting++;expect(pose.waiting).toBe(true);expect(pose.speed).toBe(0);}
   expect(pedestrianTrafficPose(i,time)).toEqual(pose);
  }
  expect(waiting).toBeGreaterThan(100);
 });
});

describe('ambient yielding and forecasts',()=>{
 it('retains route delays in a detached snapshot and advances identically at different rendering rates',()=>{
  const live=createGame();live.mission.active=false;
  for(let frame=0;frame<120;frame++)advanceSimulation(live,idle,1/60);
  const forecast=structuredClone(live);synchronizeOnlineTraffic(forecast,forecast.time);
  for(let frame=0;frame<120;frame++)advanceSimulation(live,idle,1/60);
  for(let frame=0;frame<20;frame++)advanceSimulation(forecast,idle,.1);
  expect(forecast.time).toBeCloseTo(live.time,8);
  for(let i=0;i<ambient(live).length;i++){
   const actual=ambient(live)[i],predicted=ambient(forecast)[i];
   expect(predicted.x).toBeCloseTo(actual.x,7);expect(predicted.z).toBeCloseTo(actual.z,7);expect(predicted.speed).toBeCloseTo(actual.speed,7);
  }
 });
 it('slows and stops before a car blocking its lane, then moves after it clears',()=>{
  const state=createGame(),lead=activeVehicle(state)!,car=state.vehicles.find(v=>v.id==='traffic-0')!;
  state.vehicles=[lead,car];state.mission.active=false;
  Object.assign(lead,{x:car.x+9,z:car.z,heading:Math.PI/2,speed:0});Object.assign(state.player,{x:lead.x,z:lead.z,mode:'foot',vehicleId:null});
  for(let i=0;i<120;i++)step(state,idle,1/60);
  expect(car.speed).toBeLessThan(.1);expect(Math.hypot(car.x-lead.x,car.z-lead.z)).toBeGreaterThan(4.4);expect(car.health).toBe(100);
  Object.assign(lead,{x:95,z:95});Object.assign(state.player,{x:95,z:95});
  const stopped={x:car.x,z:car.z};for(let i=0;i<120;i++)step(state,idle,1/60);
  expect(Math.hypot(car.x-stopped.x,car.z-stopped.z)).toBeGreaterThan(1);
 });
});

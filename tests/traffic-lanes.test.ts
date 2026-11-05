import {describe,expect,it} from 'vitest';
import {CITY_JUNCTIONS,CITY_STREETS,clearCitySegment} from '../src/city-map';
import {ambientTrafficPose,crossingGates,patrolTrafficPose,routeLength,sampleTrafficPath,trafficRoute} from '../src/traffic-flow';
import {createDrivingLane,drivingLaneOffset,routeDrivingLanes} from '../src/traffic-lanes';
import {activeVehicle,createGame,step} from '../src/game';
import type {Input,Point} from '../src/model';

const idle:Input={throttle:false,brake:false,left:false,right:false,handbrake:false,boost:false,sprint:false,interact:false,nextMission:false,reset:false};
const angle=(value:number)=>Math.atan2(Math.sin(value),Math.cos(value));
const direction=(a:Point,b:Point)=>Math.atan2(b.x-a.x,-(b.z-a.z));

describe('right-hand traffic lanes',()=>{
  it('separates opposing directions and selects the width of the travelled street at a crossing',()=>{
    const east=createDrivingLane([{x:-60,z:0},{x:20,z:0}],false),west=createDrivingLane([{x:20,z:0},{x:-60,z:0}],false);
    expect(east).toEqual([{x:-60,z:2.75},{x:20,z:2.75}]);expect(west).toEqual([{x:20,z:-2.75},{x:-60,z:-2.75}]);
    const north=createDrivingLane([{x:0,z:60},{x:0,z:-20}],false);
    expect(north).toEqual([{x:3,z:60},{x:3,z:-20}]);
    expect(east[0].z-west[0].z).toBeGreaterThan(2.3*2);
  });
  it('fits a full-width car between the centre marking and kerb on each street width',()=>{
    for(const street of CITY_STREETS){
      const offset=drivingLaneOffset(street.width);
      expect(offset-1.1).toBeGreaterThan(0);expect(offset+1.1).toBeLessThan(street.width/2);
    }
  });
  it('rounds turns continuously and keeps every traffic loop clear of building colliders',()=>{
    for(const index of[0,1,8,9,10]){
      const path=trafficRoute(index),total=routeLength(path);expect(path.length).toBeGreaterThan(10);
      for(let segment=0;segment<path.length;segment++){
        const a=path[segment],b=path[(segment+1)%path.length],c=path[(segment+2)%path.length];
        expect(clearCitySegment(a,b,1.4),`${index}: segment ${segment}`).toBe(true);
        expect(Math.abs(angle(direction(b,c)-direction(a,b))),`${index}: turn ${segment}`).toBeLessThan(.25);
      }
      for(let progress=0;progress<total;progress+=.75){
        const pose=sampleTrafficPath(path,progress),right={x:Math.cos(pose.heading),z:Math.sin(pose.heading)},forward={x:Math.sin(pose.heading),z:-Math.cos(pose.heading)};
        for(const side of[-1,1])for(const end of[-1,1]){
          const corner={x:pose.x+right.x*side*1.1+forward.x*end*2.45,z:pose.z+right.z*side*1.1+forward.z*end*2.45};
          expect(clearCitySegment(corner,corner,.03),JSON.stringify({index,progress,corner})).toBe(true);
        }
      }
    }
  });
  it('retains signals for offset lanes and leaves the bumper outside the crossing',()=>{
    for(const index of[0,1,8,9,10]){
      const route=trafficRoute(index),gates=crossingGates(route,'vehicle');expect(gates.length).toBeGreaterThan(2);
      for(const gate of gates){
        const stop=sampleTrafficPath(route,gate.at);expect(Number.isFinite(stop.x+stop.z+gate.clearance)).toBe(true);
        expect(gate.clearance).toBeGreaterThan(13);expect(Math.abs(angle(stop.heading-gate.heading))).toBeLessThan(.01);
      }
    }
    let waits=0;for(let seconds=0;seconds<180;seconds+=.25)for(const index of[0,1])if(patrolTrafficPose(index,seconds).waiting)waits++;
    expect(waits).toBeGreaterThan(100);
  });
  it('makes a patrol queue behind an occupied lane instead of driving through a stopped car',()=>{
    const state=createGame();state.mission.active=false;state.vehicles=[activeVehicle(state)!];step(state,idle,1/60);
    const patrol=state.pursuit!.patrols[0],blocker=state.vehicles[0];
    Object.assign(blocker,{x:patrol.x+Math.sin(patrol.heading)*9,z:patrol.z-Math.cos(patrol.heading)*9,heading:patrol.heading,speed:0});
    Object.assign(state.player,{mode:'foot',vehicleId:null,x:95,z:95});
    for(let frame=0;frame<180;frame++)step(state,idle,1/60);
    expect(patrol.speed).toBeLessThan(.1);expect(Math.hypot(patrol.x-blocker.x,patrol.z-blocker.z)).toBeGreaterThanOrEqual(5.35);expect(blocker.health).toBe(100);
    Object.assign(blocker,{x:95,z:95});const before={x:patrol.x,z:patrol.z};
    for(let frame=0;frame<180;frame++)step(state,idle,1/60);
    expect(Math.hypot(patrol.x-before.x,patrol.z-before.z)).toBeGreaterThan(1);
  });
  it('gives pursuing police a safe lane route around a block and a final approach to the suspect',()=>{
    const route=routeDrivingLanes({x:0,z:20},{x:40,z:20});
    expect(route[0]).toEqual({x:0,z:20});expect(route.at(-1)).toEqual({x:40,z:20});
    for(let index=1;index<route.length;index++)expect(clearCitySegment(route[index-1],route[index],1.4)).toBe(true);
    const midpoints=route.slice(1).map((point,index)=>({x:(point.x+route[index].x)/2,z:(point.z+route[index].z)/2}));
    expect(midpoints.some(point=>point.z>2&&point.z<4&&point.x>10&&point.x<30)).toBe(true);
    const moving=Array.from({length:16},(_,index)=>ambientTrafficPose(index,25));
    expect(moving.every(pose=>Number.isFinite(pose.x+pose.z+pose.heading))).toBe(true);
  });
  it('keeps emergency lane approaches clear throughout every connected junction',()=>{
    for(const junction of CITY_JUNCTIONS){
      const route=routeDrivingLanes({x:0,z:68},junction);expect(route.length,junction.id).toBeGreaterThan(1);
      for(let index=1;index<route.length;index++)expect(clearCitySegment(route[index-1],route[index],1.4),`${junction.id}: ${index}`).toBe(true);
    }
  });
});

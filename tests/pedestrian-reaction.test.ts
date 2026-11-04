import {describe,expect,it} from 'vitest';
import {cityLifeBudget,pedestrianReaction} from '../src/pedestrian-reaction';
import {clearCitySegment} from '../src/city-map';
import {pedestrianPose,PEDESTRIAN_COUNT} from '../src/city-life';
import {pedestrianTrafficPose} from '../src/traffic-flow';

describe('pedestrian presentation safety',()=>{
 it('uses the simulation timeline at every display quality, including stopped crossing poses',()=>{
  for(let index=0;index<PEDESTRIAN_COUNT;index+=3)for(const seconds of[0,16,35,70,190])expect(pedestrianPose(index,seconds)).toEqual(pedestrianTrafficPose(index,seconds));
 });
 it('steps away from an approaching car without mutating its route or the vehicle',()=>{
  const person={x:0,z:0},vehicles=[{id:'car',x:0,z:4,heading:0,speed:8}],before=structuredClone({person,vehicles});
  const reaction=pedestrianReaction(person,vehicles);
  expect(reaction.alert).toBeGreaterThan(.5);expect(reaction.gesture).toBeGreaterThan(0);expect(Math.abs(reaction.x)+Math.abs(reaction.z)).toBeGreaterThan(.5);
  expect(clearCitySegment(person,{x:person.x+reaction.x,z:person.z+reaction.z},.42)).toBe(true);
  expect({person,vehicles}).toEqual(before);
 });
 it('does not react to parked, receding, distant or water vehicles',()=>{
  for(const vehicle of[
   {x:0,z:4,heading:0,speed:0},
   {x:0,z:-4,heading:0,speed:8},
   {x:20,z:4,heading:0,speed:8},
   {x:0,z:4,heading:0,speed:8,kind:'boat'},
  ])expect(pedestrianReaction({x:0,z:0},[vehicle])).toEqual({x:0,z:0,alert:0,gesture:0});
 });
 it('chooses the free side when the preferred escape would enter a building',()=>{
  const person={x:-72.5,z:-60},reaction=pedestrianReaction(person,[{x:person.x,z:person.z+4,heading:0,speed:8}]);
  expect(reaction.alert).toBeGreaterThan(0);expect(reaction.x).toBeLessThan(0);
  expect(clearCitySegment(person,{x:person.x+reaction.x,z:person.z+reaction.z},.42)).toBe(true);
 });
 it('limits visible people and rain without changing the full simulation population',()=>{
  expect(cityLifeBudget('low',false)).toMatchObject({pedestrians:24,rainDrops:96});
  expect(cityLifeBudget('medium',false)).toMatchObject({pedestrians:40,rainDrops:240});
  expect(cityLifeBudget('high',false)).toMatchObject({pedestrians:64,rainDrops:480});
  for(const quality of['low','medium','high']as const)expect(cityLifeBudget(quality,true).rainDrops).toBeLessThanOrEqual(128);
 });
});

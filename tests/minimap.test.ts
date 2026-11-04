import { describe, expect, it } from 'vitest';
import { CASINO } from '../src/casino-location';
import { CITY_BUILDINGS, CITY_JUNCTIONS, CITY_STREETS, clearCitySegment, nearestStreet } from '../src/city-map';
import type { Point } from '../src/model';
import { neighborhoodProjection, planRoadRoute } from '../src/minimap';
import { PHONE_DESTINATIONS } from '../src/phone-ui';
import { WORLD_LANDMARKS } from '../src/world-layout';

const length = (points: Point[]) => points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.z - points[index].z), 0);
const between = (a:Point,b:Point,t:number):Point=>({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
function expectClearRoute(start:Point,target:Point){
 const route=planRoadRoute(start,target);
 expect(route[0]).toEqual(start);expect(route.at(-1)).toEqual(target);
 for(let index=1;index<route.length;index++){
  const a=route[index-1],b=route[index];
  expect(clearCitySegment(a,b),`blocked GPS segment ${JSON.stringify([a,b])}`).toBe(true);
  // Only the first and last legs may leave a street to reach an entrance.
  if(index>1&&index<route.length-1)for(const t of [.2,.5,.8])expect(nearestStreet(between(a,b,t))!.distance).toBeLessThan(1e-5);
 }
 return route;
}

describe('street GPS', () => {
 it('continues along a street segment without snapping back to a junction',()=>{
  const segment=CITY_STREETS.flatMap(street=>street.points.slice(1).map((point,index)=>[street.points[index],point] as const)).find(([a,b])=>Math.hypot(b.x-a.x,b.z-a.z)>15)!;
  const start=between(...segment,.3),target=between(...segment,.7),route=planRoadRoute(start,target);
  expect(route).toEqual([start,target]);
  expect(length(route)).toBeCloseTo(Math.hypot(target.x-start.x,target.z-start.z));
 });
 it('reaches the casino entrance and every phone destination through clear streets',()=>{
  const start={x:0,z:68};
  expectClearRoute(start,CASINO.door);
  for(const from of PHONE_DESTINATIONS)for(const to of PHONE_DESTINATIONS)expectClearRoute(from.point,to.point);
 });
 it('follows diagonal streets without forcing axis-aligned turns',()=>{
  const segment=CITY_STREETS.flatMap(street=>street.points.slice(1).map((point,index)=>[street.points[index],point] as const)).find(([a,b])=>Math.abs(b.x-a.x)>3&&Math.abs(b.z-a.z)>3)!;
  expect(segment).toBeDefined();
  const start=between(...segment,.25),target=between(...segment,.75),route=expectClearRoute(start,target);
  expect(length(route)).toBeCloseTo(Math.hypot(target.x-start.x,target.z-start.z));
  expect(route.some((point,index)=>index>0&&Math.abs(point.x-route[index-1].x)>1&&Math.abs(point.z-route[index-1].z)>1)).toBe(true);
 });
 it('can reach curved streets and leave dead ends through their actual junctions',()=>{
  const curved=CITY_STREETS.find(street=>street.points.length>4&&street.points.slice(2).some((point,index)=>{
   const a=street.points[index],b=street.points[index+1];return Math.abs((b.x-a.x)*(point.z-b.z)-(b.z-a.z)*(point.x-b.x))>1e-3;
  }));
  expect(curved).toBeDefined();
  const curvePoint=curved!.points[Math.floor(curved!.points.length/2)];
  expectClearRoute({x:0,z:68},curvePoint);
  const deadEnds=CITY_JUNCTIONS.filter(junction=>junction.degree===1);
  expect(deadEnds.length).toBeGreaterThan(0);
  for(const end of deadEnds)expectClearRoute({x:end.x,z:end.z},curvePoint);
 });
 it('does not mutate endpoints, returns detached points and rejects invalid or blocked positions',()=>{
  const start=Object.freeze({x:0,z:68}),target=Object.freeze({...CASINO.door});
  const route=expectClearRoute(start,target);route[0].x+=1;
  expect(start).toEqual({x:0,z:68});expect(planRoadRoute(start,target)[0]).toEqual(start);
  expect(planRoadRoute({x:NaN,z:0},target)).toEqual([]);
  expect(planRoadRoute(start,{x:0,z:Infinity})).toEqual([]);
  expect(planRoadRoute(CITY_BUILDINGS[0],target)).toEqual([]);
 });
 it('keeps the same neighborhood scale and centers the player in every district',()=>{
  for(const place of WORLD_LANDMARKS){const project=neighborhoodProjection(place.point);expect(project(place.point)).toEqual({x:112,y:100});expect(project({x:place.point.x+40,z:place.point.z}).x).toBeCloseTo(156.8);expect(project({x:place.point.x,z:place.point.z-40}).y).toBeCloseTo(55.2);}
 });
});

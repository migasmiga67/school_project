import {describe,expect,it} from 'vitest';
import {BUILDINGS,CITY_BUILDINGS,CITY_JUNCTIONS,CITY_SPACES,CITY_STREETS,ROAD_NODES,WORLD_BOUNDS,clearCitySegment,nearestStreet,routeStreets} from '../src/city-map';
import type {Point} from '../src/model';

const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);

describe('shared irregular street graph',()=>{
  it('contains genuine curves, different widths, alleys, T junctions and culdesacs',()=>{
    expect(new Set(CITY_STREETS.map(street=>street.width)).size).toBeGreaterThan(5);
    expect(CITY_STREETS.some(street=>street.kind==='alley'&&street.width<7)).toBe(true);
    for(const id of ['westwood-boulevard','financial-ring','port-ring']){
      const street=CITY_STREETS.find(street=>street.id===id)!;
      const headings=street.points.slice(1).map((p,i)=>Math.atan2(p.x-street.points[i].x,p.z-street.points[i].z));
      expect(headings.length).toBeGreaterThan(20);
      expect(headings.some(heading=>Math.abs(Math.sin(heading)*Math.cos(heading))>.1)).toBe(true);
    }
    expect(CITY_JUNCTIONS.filter(junction=>junction.degree===1).length).toBeGreaterThanOrEqual(4);
    expect(CITY_JUNCTIONS.some(junction=>junction.degree===3)).toBe(true);
    for(const kind of ['park','plaza','parking','loading'])expect(CITY_SPACES.some(space=>space.kind===kind)).toBe(true);
  });

  it('keeps every road segment and graph node clear for cars',()=>{
    for(const street of CITY_STREETS)for(let i=1;i<street.points.length;i++){
      expect(clearCitySegment(street.points[i-1],street.points[i],1.5),`${street.id} segment ${i}`).toBe(true);
    }
    for(const p of ROAD_NODES){
      expect(nearestStreet(p)!.distance).toBeLessThan(.001);
      expect(clearCitySegment(p,p,1.5)).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(WORLD_BOUNDS.minX+1.5);expect(p.x).toBeLessThanOrEqual(WORLD_BOUNDS.maxX-1.5);
      expect(p.z).toBeGreaterThanOrEqual(WORLD_BOUNDS.minZ+1.5);expect(p.z).toBeLessThanOrEqual(WORLD_BOUNDS.maxZ-1.5);
    }
  });

  it('connects every real junction to the core without inventing shortcuts across parcels',()=>{
    for(const junction of CITY_JUNCTIONS){
      const start={x:0,z:68},route=routeStreets(start,junction);
      expect(route[0],junction.id).toEqual(start);expect(route.at(-1),junction.id).toEqual({x:junction.x,z:junction.z});
      for(let i=1;i<route.length;i++){
        expect(clearCitySegment(route[i-1],route[i],1.4),junction.id).toBe(true);
        const steps=Math.max(1,Math.ceil(distance(route[i-1],route[i])/3));
        for(let j=0;j<=steps;j++){
          const t=j/steps,p={x:route[i-1].x+(route[i].x-route[i-1].x)*t,z:route[i-1].z+(route[i].z-route[i-1].z)*t};
          expect(nearestStreet(p)!.distance,junction.id).toBeLessThan(.001);
        }
      }
    }
  });

  it('routes around a financial building instead of connecting aligned parallel roads',()=>{
    const start={x:-40,z:-120},target={x:-40,z:-160};
    expect(clearCitySegment(start,target,1.4)).toBe(false);
    const route=routeStreets(start,target);
    expect(route.length).toBeGreaterThan(3);
    expect(route.slice(1).reduce((sum,p,i)=>sum+distance(route[i],p),0)).toBeGreaterThan(60);
    for(let i=1;i<route.length;i++)expect(clearCitySegment(route[i-1],route[i],1.4)).toBe(true);
  });

  it('uses the visible building bodies as colliders and leaves public spaces open',()=>{
    expect(BUILDINGS).toEqual(CITY_BUILDINGS.map(({x,z,halfX,halfZ})=>({x,z,halfX,halfZ})));
    expect(new Set(CITY_BUILDINGS.map(building=>`${building.halfX},${building.halfZ}`)).size).toBeGreaterThan(12);
    for(const district of ['westwood','financial','port','south-bay'])expect(CITY_BUILDINGS.some(building=>building.district===district)).toBe(true);
    for(const space of CITY_SPACES){
      const xs=space.points.map(p=>p.x),zs=space.points.map(p=>p.z);
      expect(BUILDINGS.some(b=>b.x+b.halfX>Math.min(...xs)&&b.x-b.halfX<Math.max(...xs)&&b.z+b.halfZ>Math.min(...zs)&&b.z-b.halfZ<Math.max(...zs)),space.id).toBe(false);
    }
    // A diagonal approach through the original block must also be rejected.
    expect(clearCitySegment({x:0,z:0},{x:40,z:40})).toBe(false);
    expect(routeStreets({x:20,z:20},{x:0,z:0})).toEqual([]);
  });
});

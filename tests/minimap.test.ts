import { describe, expect, it } from 'vitest';
import { CASINO } from '../src/casino-location';
import { BUILDINGS, ROAD_X, ROAD_Z, type Point } from '../src/model';
import { neighborhoodProjection, planRoadRoute } from '../src/minimap';
import { WORLD_LANDMARKS } from '../src/world-layout';

const length = (points: Point[]) => points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.z - points[index].z), 0);

describe('street GPS', () => {
  it('continues straight on the current street without snapping back to an intersection', () => {
    const route = planRoadRoute({ x: 0, z: 68 }, { x: 0, z: 40 });
    expect(route).toEqual([{ x: 0, z: 68 }, { x: 0, z: 40 }]);
    expect(length(route)).toBe(28);
  });
  it('reaches the casino entrance from the adjacent boulevard', () => {
    const start = { x: 0, z: 68 }, route = planRoadRoute(start, CASINO.door);
    expect(route[0]).toEqual(start); expect(route.at(-1)).toEqual(CASINO.door);
    expect(route.at(-2)).toEqual({ x: CASINO.door.x, z: 80 });
    expect(length(route)).toBe(38);
  });
  it('routes across city blocks along road centers, never diagonally through buildings', () => {
    const positions = [{ x: 0, z: 68 }, { x: -80, z: 80 }, { x: 80, z: -80 }, { x: 4, z: 75 }, { x: -45, z: -5 }, { x: 96, z: 90 }];
    for (const start of positions) for (const target of positions) {
      const route = planRoadRoute(start, target);
      expect(route[0]).toEqual(start); expect(route.at(-1)).toEqual(target);
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1], b = route[i];
        expect(a.x === b.x || a.z === b.z).toBe(true);
        if (i > 1 && i < route.length - 1) expect(ROAD_X.includes(a.x) && a.x === b.x || ROAD_Z.includes(a.z) && a.z === b.z).toBe(true);
        const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 2);
        for (let step = 0; step <= steps; step++) {
          const t = steps ? step / steps : 0, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
          expect(BUILDINGS.some(building => Math.abs(x - building.x) < building.halfX && Math.abs(z - building.z) < building.halfZ)).toBe(false);
        }
      }
    }
  });
  it('does not mutate player or goal positions and ignores invalid coordinates', () => {
    const start = Object.freeze({ x: 3, z: 40 }), target = Object.freeze({ x: 80, z: -40 });
    expect(planRoadRoute(start, target).at(-1)).toEqual(target);
    expect(planRoadRoute({ x: NaN, z: 0 }, target)).toEqual([]);
    expect(planRoadRoute(start, { x: 0, z: Infinity })).toEqual([]);
  });
  it('connects the expanded western, northern and southern districts along the actual road grid',()=>{
    const positions=[{x:0,z:68},...WORLD_LANDMARKS.map(place=>place.point)];
    for(const start of positions)for(const target of positions){
      const route=planRoadRoute(start,target);
      expect(route[0]).toEqual(start);expect(route.at(-1)).toEqual(target);
      for(let i=1;i<route.length;i++){
        const a=route[i-1],b=route[i];expect(a.x===b.x||a.z===b.z).toBe(true);
        if(i>1&&i<route.length-1)expect(a.x===b.x&&ROAD_X.includes(a.x)||a.z===b.z&&ROAD_Z.includes(a.z)).toBe(true);
        const steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z));
        for(let step=0;step<=steps;step++){const t=steps?step/steps:0,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;expect(BUILDINGS.some(block=>Math.abs(x-block.x)<block.halfX&&Math.abs(z-block.z)<block.halfZ)).toBe(false);}
      }
    }
  });
  it('keeps the same neighborhood scale and centers the player in every district',()=>{
    for(const place of WORLD_LANDMARKS){const project=neighborhoodProjection(place.point);expect(project(place.point)).toEqual({x:112,y:100});expect(project({x:place.point.x+40,z:place.point.z}).x).toBeCloseTo(156.8);expect(project({x:place.point.x,z:place.point.z-40}).y).toBeCloseTo(55.2);}
  });
});

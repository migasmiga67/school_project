import { describe, expect, it } from 'vitest';
import { CASINO } from '../src/casino-location';
import { BUILDINGS, ROADS, type Point } from '../src/model';
import { planRoadRoute } from '../src/minimap';

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
        if (i > 1 && i < route.length - 1) expect(ROADS.includes(a.x) && a.x === b.x || ROADS.includes(a.z) && a.z === b.z).toBe(true);
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
});

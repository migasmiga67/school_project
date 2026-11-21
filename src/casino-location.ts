import type { Point, Collider } from './model';
export const CASINO = {
  name: 'Sapphire Club',
  center: {x:20,z:60} as Point,
  door: {x:20,z:74} as Point,
  exit: {x:0,z:8.4} as Point,
  entry: {x:0,z:6.5} as Point,
  table: {x:0,z:-2} as Point,
  bounds: {minX:-10.5,maxX:10.5,minZ:-8.5,maxZ:9.5},
  tableCollider: {x:0,z:-2,halfX:3.5,halfZ:1.8} as Collider,
  /** The hall sits inside the tower's ground floor: world = local + offset. */
  offset: {x:20,z:61.9} as Point,
  /** Half width of the walk-through doorway in the front wall. */
  doorHalf: 1.85,
  /** Bar, cashier cage and slot rows; the stations stay clear of them. */
  furniture: [
    {x:9.8,z:-5.6,halfX:.32,halfZ:2.6},
    {x:-10.1,z:-.6,halfX:.4,halfZ:1.3},
    {x:-2.8,z:-9.1,halfX:1.6,halfZ:.45},{x:2.8,z:-9.1,halfX:1.6,halfZ:.45},
  ] as Collider[],
};
export const casinoToWorld=(p:Point):Point=>({x:p.x+CASINO.offset.x,z:p.z+CASINO.offset.z});
export const worldToCasino=(p:Point):Point=>({x:p.x-CASINO.offset.x,z:p.z-CASINO.offset.z});

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
};

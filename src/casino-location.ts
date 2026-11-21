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
  /** Lift on the right wall of the hall and its landing in the VIP lounge. */
  elevator: {x:9.9,z:6.2} as Point,
  /**
   * The VIP lounge is the floor above the hall. Its walking plane lives at local
   * x 31..49 so poses stay two-dimensional; it is drawn shifted by `shift` and raised by `floor`.
   */
  vip: {
    bounds: {minX:31.5,maxX:48.5,minZ:-9.5,maxZ:6.4},
    shift: -40, floor: 7.4,
    elevator: {x:31.9,z:-.5} as Point,
    colliders: [
      {x:40,z:-3,halfX:2.7,halfZ:1.6},{x:47.9,z:-2.5,halfX:.45,halfZ:3.2},
      {x:36,z:4.9,halfX:1.7,halfZ:.55},{x:44,z:4.9,halfX:1.7,halfZ:.55},{x:33.6,z:-7.6,halfX:1.1,halfZ:1},
    ] as Collider[],
  },
};
/** Which casino floor a local point is on. */
export const onVipFloor=(p:Point)=>p.x>25;
/** Drawing offset of a local casino point: the VIP lounge sits above the hall. */
export const casinoFloor=(p:Point)=>onVipFloor(p)?{dx:CASINO.vip.shift,dy:CASINO.vip.floor}:{dx:0,dy:0};
export const casinoToWorld=(p:Point):Point=>({x:p.x+CASINO.offset.x,z:p.z+CASINO.offset.z});
export const worldToCasino=(p:Point):Point=>({x:p.x-CASINO.offset.x,z:p.z-CASINO.offset.z});

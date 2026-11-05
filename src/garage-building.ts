import type { Collider, Point } from './model';

export interface GarageGateState { openness:number; holdUntil:number;clock?:number }
export interface GarageVisitor extends Point { mode:'foot'|'drive'; speed?:number; heading?:number; radius?:number }

/** One world-space layout is used by the shell, gate, collision and service desk. */
export const GARAGE_BUILDING={
  x:-20,z:60,halfX:12,halfZ:12,
  frontZ:72.4,backZ:56,bayMinX:-24.5,bayMaxX:-15.5,bayHalfX:4.5,
  ceilingHeight:4.4,doorHeight:3.8,
  gate:{x:-20,z:72.4,halfX:4.5,halfZ:.22},
  entrance:{x:-20,z:74},service:{x:-20,z:62},desk:{x:-23,z:60.2},
  wallColliders:[
    {x:-28.25,z:60,halfX:3.75,halfZ:12},
    {x:-11.75,z:60,halfX:3.75,halfZ:12},
    {x:-20,z:52,halfX:4.5,halfZ:4},
  ],
  furnitureColliders:[
    {x:-20,z:57,halfX:3.75,halfZ:.45},
    {x:-23.4,z:58.7,halfX:.4,halfZ:.4},
  ],
} as const;
const staticColliders:readonly Collider[]=[...GARAGE_BUILDING.wallColliders,...GARAGE_BUILDING.furnitureColliders];
export const GARAGE_OPEN_SECONDS=1.4;
export const GARAGE_CLOSE_SECONDS=1.8;
export const GARAGE_HOLD_SECONDS=2.5;
export const GARAGE_CAR_CLEARANCE=.72;
export const GARAGE_FOOT_CLEARANCE=.60;
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const valid=(point:Point)=>Number.isFinite(point.x)&&Number.isFinite(point.z);
const epsilon=1e-7;
export const createGarageGate=():GarageGateState=>({openness:0,holdUntil:0});
export function isGarageBuildingCollider(collider:Collider):boolean {
  return Math.abs(collider.x-GARAGE_BUILDING.x)<epsilon&&Math.abs(collider.z-GARAGE_BUILDING.z)<epsilon
    &&Math.abs(collider.halfX-GARAGE_BUILDING.halfX)<epsilon&&Math.abs(collider.halfZ-GARAGE_BUILDING.halfZ)<epsilon;
}
export const isGarageBuilding=isGarageBuildingCollider;
export function isInsideGarageBay(point:Point,margin=0):boolean {
  return valid(point)&&point.x>=GARAGE_BUILDING.bayMinX+margin&&point.x<=GARAGE_BUILDING.bayMaxX-margin
    &&point.z>=GARAGE_BUILDING.backZ+margin&&point.z<=GARAGE_BUILDING.frontZ-margin;
}
export const insideGarageBay=isInsideGarageBay;

function overlaps(point:Point,collider:Collider,radius:number,heading?:number):boolean {
  if(radius<=.6)return Math.abs(point.x-collider.x)<collider.halfX+radius-epsilon&&Math.abs(point.z-collider.z)<collider.halfZ+radius-epsilon;
  // A car's nose and tail extend beyond the legacy circular road collider.
  // Only the garage uses the complete body, keeping existing street handling.
  const rawHeading=heading??('heading'in point?Number(point.heading):0),angle=Number.isFinite(rawHeading)?rawHeading:0;
  const width=radius<1?.62:1.13,length=radius<1?1.45:2.55,c=Math.cos(angle),s=Math.sin(angle),dx=point.x-collider.x,dz=point.z-collider.z;
  return Math.abs(dx)<collider.halfX+Math.abs(c)*width+Math.abs(s)*length-epsilon
    &&Math.abs(dz)<collider.halfZ+Math.abs(s)*width+Math.abs(c)*length-epsilon
    &&Math.abs(dx*c+dz*s)<width+collider.halfX*Math.abs(c)+collider.halfZ*Math.abs(s)-epsilon
    &&Math.abs(dx*s-dz*c)<length+collider.halfX*Math.abs(s)+collider.halfZ*Math.abs(c)-epsilon;
}
export function garageSolidCollision(point:Point,radius=0,heading?:number):boolean {
  return !valid(point)||staticColliders.some(collider=>overlaps(point,collider,radius,heading));
}
export function garageGateCollision(point:Point,radius:number,gate:GarageGateState|undefined,heading?:number):boolean {
  const needed=radius>.6?GARAGE_CAR_CLEARANCE:GARAGE_FOOT_CLEARANCE;
  return (gate?.openness??0)<needed&&overlaps(point,GARAGE_BUILDING.gate,radius,heading);
}
export function garageServiceAvailable(point:Point,radius=.55):boolean {
  return valid(point)&&(isInsideGarageBay(point)||Math.hypot(point.x-GARAGE_BUILDING.entrance.x,point.z-GARAGE_BUILDING.entrance.z)<=6)
    &&!garageSolidCollision(point,radius);
}
export const canUseGarageService=garageServiceAvailable;
export function atGarageServiceDesk(point:Point):boolean {
  return garageServiceAvailable(point)&&isInsideGarageBay(point)&&Math.hypot(point.x-GARAGE_BUILDING.desk.x,point.z-GARAGE_BUILDING.desk.z)<=2.1;
}
/** The opening is a usable foyer on both sides of the moving gate. */
export function atGarageEntrance(point:Point):boolean {
  return garageServiceAvailable(point)&&point.x>=GARAGE_BUILDING.bayMinX+.55&&point.x<=GARAGE_BUILDING.bayMaxX-.55
    &&Math.abs(point.z-GARAGE_BUILDING.frontZ)<=3.5;
}
export function garageFootServiceInteraction(point:Point,nearbyVehicle=false):boolean {
  if(atGarageServiceDesk(point))return true;
  // In the bay, E beside a vehicle must still let the player get back in.
  if(nearbyVehicle&&isInsideGarageBay(point))return false;
  return atGarageEntrance(point)||!isInsideGarageBay(point)&&garageServiceAvailable(point)
    &&Math.hypot(point.x-GARAGE_BUILDING.entrance.x,point.z-GARAGE_BUILDING.entrance.z)<=3;
}

function requestsOpening(visitor:GarageVisitor):boolean {
  if(!valid(visitor))return false;
  if(isInsideGarageBay(visitor))return true;
  const dx=Math.abs(visitor.x-GARAGE_BUILDING.x),dz=visitor.z-GARAGE_BUILDING.frontZ;
  if(visitor.mode==='foot')return dx<=6&&dz>=-2&&dz<=5;
  const velocity=Number.isFinite(visitor.speed)?visitor.speed!:0;
  const heading=Number.isFinite(visitor.heading)?visitor.heading!:0;
  const approaching=Math.cos(heading)*velocity>0;
  const reach=approaching?clamp(10+Math.abs(velocity)*1.7,18,55):18;
  // An approaching driver can reach the opening before it is fully raised.
  return dx<=8&&dz>=-3&&dz<=reach;
}
function occupiesPassage(visitor:GarageVisitor):boolean {
  if(!valid(visitor))return false;
  const hint=Number.isFinite(visitor.radius)?Math.max(0,visitor.radius!):0;
  const radius=visitor.mode==='drive'?Math.max(2.8,hint):Math.max(.6,hint);
  return Math.abs(visitor.x-GARAGE_BUILDING.gate.x)<=GARAGE_BUILDING.gate.halfX+radius
    &&Math.abs(visitor.z-GARAGE_BUILDING.gate.z)<=GARAGE_BUILDING.gate.halfZ+radius+.65;
}
/** Deterministic, serializable motion. Occupants reopen/hold the door before it lowers. */
export function advanceGarageGate(previous:GarageGateState|undefined,seconds:number,delta:number,visitors:readonly GarageVisitor[],blockers:readonly GarageVisitor[]=[]):GarageGateState {
  const sampled=Number.isFinite(seconds)?Math.max(0,seconds):0,dt=Number.isFinite(delta)?Math.max(0,Math.min(delta,.25)):0;
  // Online time keeps advancing while a local modal pauses state.time. Retain
  // that epoch in the snapshot so resuming cannot extend the safety hold.
  const previousClock=Number.isFinite(previous?.clock)?previous!.clock!:sampled-dt;
  const now=Math.max(sampled,previousClock+dt);
  let openness=clamp(Number.isFinite(previous?.openness)?previous!.openness:0,0,1),holdUntil=Number.isFinite(previous?.holdUntil)?Math.max(0,previous!.holdUntil):0;
  if(visitors.some(requestsOpening)||visitors.some(occupiesPassage)||blockers.some(occupiesPassage))holdUntil=now+GARAGE_HOLD_SECONDS;
  const open=now<holdUntil;
  openness=clamp(openness+(open?dt/GARAGE_OPEN_SECONDS:-dt/GARAGE_CLOSE_SECONDS),0,1);
  return{openness,holdUntil,clock:now};
}

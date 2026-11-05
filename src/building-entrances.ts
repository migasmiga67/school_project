import { CASINO } from './casino-location';
import { CREW_BASE, HOMES } from './career';
import type { Point } from './model';

export type BuildingEntranceId='casino'|'canal'|'loft'|'crew';
export interface BuildingEntrance {
 id:BuildingEntranceId; point:Readonly<Point>; portal:Readonly<Point>;
 width:number;height:number;rotation:number;accent:number;
}
/** The interaction anchors stay unchanged; portal coordinates describe the actual facade. */
export const BUILDING_ENTRANCES:readonly BuildingEntrance[]=[
 {id:'casino',point:CASINO.door,portal:{x:CASINO.center.x,z:CASINO.center.z+12.55},width:4.2,height:3.6,rotation:0,accent:0xd8b56e},
 {id:'canal',point:HOMES.canal.door,portal:{x:HOMES.canal.door.x,z:HOMES.canal.door.z-.35},width:1.5,height:2.8,rotation:0,accent:0x8de5c5},
 {id:'loft',point:HOMES.loft.door,portal:{x:HOMES.loft.door.x,z:HOMES.loft.door.z+.35},width:1.5,height:2.8,rotation:Math.PI,accent:0x9ecbff},
 {id:'crew',point:CREW_BASE.door,portal:{x:CREW_BASE.door.x,z:CREW_BASE.door.z+.35},width:1.5,height:2.8,rotation:Math.PI,accent:0xe6be78},
];
export interface EntranceActor extends Point {
 mode:'foot'|'drive';interior?:string|null;homeId?:string|null;passengerOf?:string|null;
 /** Access is presentation-only; transactions and transitions still validate ownership. */
 access?:readonly BuildingEntranceId[];
}
export interface BuildingDoorState {progress:number;holdSeconds:number;phase:'closed'|'opening'|'open'|'closing'}
export const createBuildingDoorState=():BuildingDoorState=>({progress:0,holdSeconds:0,phase:'closed'});
const unit=(value:number)=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));

export function entranceWantsOpen(entrance:BuildingEntrance,actors:readonly EntranceActor[],alreadyOpen=false):boolean {
 const radius=alreadyOpen?7.2:5.8;
 return actors.some(actor=>{
  if(actor.mode!=='foot'||actor.interior||actor.homeId||actor.passengerOf||!Number.isFinite(actor.x+actor.z))return false;
  if(!(actor.access??['casino']).includes(entrance.id))return false;
  const dx=actor.x-entrance.portal.x,dz=actor.z-entrance.portal.z,c=Math.cos(entrance.rotation),s=Math.sin(entrance.rotation);
  const lateral=c*dx-s*dz,outward=s*dx+c*dz;
  return Math.abs(lateral)<=entrance.width/2+2&&outward>=-.7&&Math.hypot(actor.x-entrance.point.x,actor.z-entrance.point.z)<=radius;
 });
}

/** No wall clock or game mutation: approach, hold and closing are frame-rate independent. */
export function advanceBuildingDoor(previous:Readonly<BuildingDoorState>,wanted:boolean,seconds:number):BuildingDoorState {
 const dt=Number.isFinite(seconds)?Math.max(0,Math.min(.2,seconds)):0;
 const holdSeconds=wanted?1.6:Math.max(0,(Number.isFinite(previous.holdSeconds)?previous.holdSeconds:0)-dt);
 const opening=wanted||holdSeconds>0,progress=unit(unit(previous.progress)+(opening?dt/.35:-dt/.6));
 return{progress,holdSeconds,phase:progress===0?'closed':progress===1?'open':opening?'opening':'closing'};
}

export class BuildingEntranceDoors {
 private readonly states=new Map<BuildingEntranceId,BuildingDoorState>(BUILDING_ENTRANCES.map(entrance=>[entrance.id,createBuildingDoorState()]));
 update(actors:readonly EntranceActor[],dt:number){
  for(const entrance of BUILDING_ENTRANCES){const state=this.states.get(entrance.id)!;this.states.set(entrance.id,advanceBuildingDoor(state,entranceWantsOpen(entrance,actors,state.progress>0),dt));}
 }
 holdOpen(id:BuildingEntranceId,seconds=2){const state=this.states.get(id);if(state&&Number.isFinite(seconds))state.holdSeconds=Math.max(state.holdSeconds,Math.max(0,seconds));}
 get snapshot(){return Object.fromEntries([...this.states].map(([id,state])=>[id,{...state}]))as Record<BuildingEntranceId,BuildingDoorState>;}
}

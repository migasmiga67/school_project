import type { Point } from './model';
import { CITY_BUILDINGS, clearCitySegment } from './city-map';
import { CITY_BENCH_PLACEMENTS,CITY_STREET_SIGN_PLACEMENTS,canPlaceDecoration } from './city-placement';

export interface PedestrianVehicle extends Point {id?:string;heading:number;speed:number;kind?:string}
export interface PedestrianReaction {x:number;z:number;alert:number;gesture:number}
const context={streets:[],junctions:[],buildings:CITY_BUILDINGS,occupied:[...CITY_BENCH_PLACEMENTS,...CITY_STREET_SIGN_PLACEMENTS]};
const safe=(from:Point,to:Point)=>clearCitySegment(from,to,.42)&&canPlaceDecoration({...to,width:.7,depth:.7},context,{buildingPadding:.08,occupiedPadding:.12});

/** A local flinch/step aside is visual only; traffic owns every shared route clock. */
export function pedestrianReaction(person:Point,vehicles:readonly PedestrianVehicle[]):PedestrianReaction {
 let alert=0,offset={x:0,z:0};
 for(const car of vehicles){
  if(car.kind==='boat'||!Number.isFinite(car.x+car.z+car.heading+car.speed)||Math.abs(car.speed)<1)continue;
  const dx=person.x-car.x,dz=person.z-car.z;
  if(dx*dx+dz*dz>144)continue;
  const c=Math.cos(car.heading),s=Math.sin(car.heading),direction=Math.sign(car.speed);
  const forward=(dx*s-dz*c)*direction,lateral=dx*c+dz*s,reach=2.6+Math.min(7,Math.abs(car.speed)*.55);
  if(forward < -2.8||forward>reach||Math.abs(lateral)>2.15)continue;
  const threat=Math.max(.25,(1-Math.abs(lateral)/2.8)*(1-Math.max(0,forward-2)/Math.max(1,reach)));
  if(threat<=alert)continue;
  alert=threat;offset={x:0,z:0};
  const preferred=lateral>=0?1:-1;
  for(const side of[preferred,-preferred]){
   const step=.65+threat*.3,candidate={x:person.x+c*side*step,z:person.z+s*side*step};
   if(safe(person,candidate)){offset={x:c*side*step,z:s*side*step};break;}
  }
 }
 return{...offset,alert,gesture:alert*.95};
}

export function cityLifeBudget(quality:'low'|'medium'|'high',software:boolean){
 const level=quality==='low'?0:quality==='medium'?1:2;
 return{pedestrians:[24,40,64][level],rainDrops:Math.min([96,240,480][level],software?128:480),range:software?[100,115,130][level]:[100,160,Infinity][level]};
}

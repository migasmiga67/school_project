import { CITY_JUNCTIONS, CITY_STREETS, type CityJunction } from './city-map';
import type { Point } from './model';

export type SignalColor='green'|'amber'|'red';
export interface TrafficSignal {id:string;junction:CityJunction;axisHeading:number;offset:number}
export interface SignalState {phase:SignalColor;primary:SignalColor;secondary:SignalColor;pedestrian:boolean;remaining:number}
export const SIGNAL_CYCLE_SECONDS=54;
const hash=(text:string)=>{let value=0;for(const char of text)value=(value*31+char.charCodeAt(0))>>>0;return value;};
const headingAt=(junction:Point,points:readonly Point[])=>{
  let best=Infinity,heading=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz,t=Math.max(0,Math.min(1,((junction.x-a.x)*dx+(junction.z-a.z)*dz)/length));
    const distance=(a.x+dx*t-junction.x)**2+(a.z+dz*t-junction.z)**2;
    if(distance<best){best=distance;heading=Math.atan2(dx,-dz);}
  }return heading;
};
/** Actual junctions and road tangents define the same phases for vehicles and lamps. */
export const TRAFFIC_SIGNALS:readonly TrafficSignal[]=CITY_JUNCTIONS.flatMap(junction=>{
  if(junction.degree<3)return[];
  const roads=CITY_STREETS.filter(road=>junction.streetIds.includes(road.id)&&(road.kind==='boulevard'||road.kind==='avenue')).sort((a,b)=>b.width-a.width);
  if(!roads.length)return[];
  return[{id:junction.id,junction,axisHeading:headingAt(junction,roads[0].points),offset:hash(junction.id)%SIGNAL_CYCLE_SECONDS}];
});
const byId=new Map(TRAFFIC_SIGNALS.map(signal=>[signal.id,signal]));
const resolve=(value:CityJunction|string)=>byId.get(typeof value==='string'?value:value.id);
const elapsed=(signal:TrafficSignal,seconds:number)=>(((Number.isFinite(seconds)?Math.max(0,seconds):0)+signal.offset)%SIGNAL_CYCLE_SECONDS);
export function signalAxis(signal:TrafficSignal,heading:number):0|1{return Math.abs(Math.cos(heading-signal.axisHeading))>=Math.SQRT1_2?0:1;}

export function signalAt(junction:CityJunction|string,seconds:number,heading?:number):SignalState {
  const signal=resolve(junction);if(!signal)return{phase:'green',primary:'green',secondary:'green',pedestrian:false,remaining:Infinity};
  const t=elapsed(signal,seconds),primary:SignalColor=t<14?'green':t<16?'amber':'red',secondary:SignalColor=t>=17&&t<31?'green':t>=31&&t<33?'amber':'red';
  const boundary=t<14?14:t<16?16:t<17?17:t<31?31:t<33?33:t<34?34:54;
  return{phase:heading===undefined||signalAxis(signal,heading)===0?primary:secondary,primary,secondary,pedestrian:t>=34,remaining:boundary-t};
}
export function crossingMayProceed(junction:CityJunction|string,seconds:number){return signalAt(junction,seconds).pedestrian;}
export const canPedestrianCross=crossingMayProceed;
export function signalForPoint(point:Point,maxDistance=18):TrafficSignal|null {
  let best:TrafficSignal|null=null,distance=maxDistance*maxDistance;
  for(const signal of TRAFFIC_SIGNALS){const d=(point.x-signal.junction.x)**2+(point.z-signal.junction.z)**2;if(d<distance){distance=d;best=signal;}}
  return best;
}
/** Find an opening arithmetically; no frame loop or wall clock participates. */
export function nextSignalOpening(id:string,seconds:number,heading:number,mode:'vehicle'|'pedestrian',clearance=0):number {
  const signal=byId.get(id);if(!signal)return seconds;
  const t=elapsed(signal,seconds),start=mode==='pedestrian'?34:signalAxis(signal,heading)===0?0:17,end=mode==='pedestrian'?54:start+14;
  const needed=Math.min(clearance,end-start-.01);
  if(t>=start&&t<=end-needed)return seconds;
  return seconds+(t<start?start-t:SIGNAL_CYCLE_SECONDS-t+start);
}

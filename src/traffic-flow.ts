import { CITY_STREETS,CITY_TRAFFIC_LOOPS,clearCitySegment } from './city-map';
import { SIGNAL_CYCLE_SECONDS,TRAFFIC_SIGNALS,nextSignalOpening } from './traffic-signals';
import { createDrivingLane } from './traffic-lanes';
import type { Point } from './model';

export interface RouteGate {at:number;signalId:string;heading:number;clearance:number}
export interface FlowProgress {progress:number;speed:number;waiting:boolean;signalId:string|null}
export interface TrafficPose extends Point,FlowProgress {heading:number}
type Mode='vehicle'|'pedestrian';
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
const modulo=(n:number,size:number)=>((n%size)+size)%size;
export function routeLength(points:readonly Point[]){return points.reduce((sum,p,i)=>sum+distance(p,points[(i+1)%points.length]),0);}
export function sampleTrafficPath(points:readonly Point[],progress:number):Point&{heading:number}{
  let remaining=modulo(progress,routeLength(points));
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],length=distance(a,b);if(length<1e-7)continue;
    if(remaining<=length)return{x:a.x+(b.x-a.x)*remaining/length,z:a.z+(b.z-a.z)*remaining/length,heading:Math.atan2(b.x-a.x,-(b.z-a.z))};remaining-=length;
  }return{...points[0],heading:0};
}
const gateCache=new WeakMap<readonly Point[],Map<Mode,readonly RouteGate[]>>();
/** A sidewalk can cross a road while remaining several metres from its center. */
export function crossingGates(points:readonly Point[],mode:Mode='pedestrian'):readonly RouteGate[]{
  let modes=gateCache.get(points);if(!modes){modes=new Map();gateCache.set(points,modes);}const saved=modes.get(mode);if(saved)return saved;
  const length=routeLength(points),gates:RouteGate[]=[];
  for(const signal of TRAFFIC_SIGNALS){
    const candidates:{at:number;distance:number;heading:number}[]=[];let walked=0;
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length],dx=b.x-a.x,dz=b.z-a.z,segment=Math.hypot(dx,dz);if(segment<1e-7)continue;
      const t=Math.max(0,Math.min(1,((signal.junction.x-a.x)*dx+(signal.junction.z-a.z)*dz)/(segment*segment))),x=a.x+dx*t,z=a.z+dz*t,d=Math.hypot(x-signal.junction.x,z-signal.junction.z);
      if(d<=(mode==='vehicle'?signal.junction.radius+.35:signal.junction.radius+4))candidates.push({at:walked+t*segment,distance:d,heading:Math.atan2(dx,-dz)});walked+=segment;
    }
    const groups:typeof candidates[]=[];
    for(const candidate of candidates){const group=groups.at(-1);if(group&&candidate.at-group[group.length-1].at<signal.junction.radius*2+5)group.push(candidate);else groups.push([candidate]);}
    // The same rounded junction can straddle the loop's progress origin.
    if(mode==='vehicle'&&groups.length>1&&groups[0][0].at+length-groups[groups.length-1].at(-1)!.at<signal.junction.radius*2+5){groups[0].push(...groups.pop()!);}
    for(const group of groups){
      const closest=group.reduce((a,b)=>b.distance<a.distance?b:a),approach=signal.junction.radius+(mode==='vehicle'?5:1.3);
      if(mode==='pedestrian'){gates.push({at:modulo(closest.at-approach,length),signalId:signal.id,heading:closest.heading,clearance:signal.junction.radius*2+2.6});continue;}
      // Measure the actual lane's entry, including bends. The front bumper
      // stops before the zebra, and the incoming tangent selects its light.
      const boundary=(direction:number,radius:number)=>{
        let travel=0;while(travel<45&&distance(sampleTrafficPath(points,closest.at+travel*direction),signal.junction)<radius)travel+=1;
        let low=Math.max(0,travel-1),high=travel;
        for(let i=0;i<14;i++){const middle=(low+high)/2;if(distance(sampleTrafficPath(points,closest.at+middle*direction),signal.junction)<radius)low=middle;else high=middle;}
        return closest.at+high*direction;
      };
      const entry=boundary(-1,signal.junction.radius+7.8),exit=boundary(1,signal.junction.radius+4),heading=sampleTrafficPath(points,entry).heading;
      gates.push({at:modulo(entry,length),signalId:signal.id,heading,clearance:exit-entry+2.6});
    }
  }
  const result=gates.sort((a,b)=>a.at-b.at).filter((gate,index,list)=>index===0||gate.at-list[index-1].at>.2);
  modes.set(mode,result);return result;
}
export function nextRouteGate(points:readonly Point[],progress:number,mode:Mode='vehicle'):(RouteGate&{distance:number})|null {
  const gates=crossingGates(points,mode);if(!gates.length)return null;const length=routeLength(points),local=modulo(progress,length);
  const gate=gates.find(gate=>gate.at>=local-1e-6)??gates[0];return{...gate,distance:modulo(gate.at-local,length)};
}
interface Motion {fromTime:number;toTime:number;from:number;to:number;speed:number;acceleration:number;signalId:string|null}
interface Cycle {fromTime:number;from:number;duration:number;distance:number}
interface Timeline {motions:Motion[];time:number;progress:number;speed:number;gateIndex:number;states:Map<string,{time:number;progress:number}>;cycle:Cycle|null}
const timelines=new WeakMap<readonly Point[],Map<string,Timeline>>();
function append(timeline:Timeline,duration:number,speed:number,acceleration:number,signalId:string|null){
  if(duration<1e-8)return;
  const to=timeline.progress+speed*duration+.5*acceleration*duration*duration;
  timeline.motions.push({fromTime:timeline.time,toTime:timeline.time+duration,from:timeline.progress,to,speed,acceleration,signalId});timeline.time+=duration;timeline.progress=to;timeline.speed=Math.max(0,speed+acceleration*duration);
}
function movementTime(distance:number,startSpeed:number,cruise:number,acceleration:number){const needed=(cruise*cruise-startSpeed*startSpeed)/(2*acceleration);return distance<needed?(Math.sqrt(startSpeed*startSpeed+2*acceleration*distance)-startSpeed)/acceleration:(cruise-startSpeed)/acceleration+(distance-needed)/cruise;}
function move(timeline:Timeline,distance:number,cruise:number,acceleration:number,stop:boolean){
  if(distance<1e-7)return;
  let start=Math.min(timeline.speed,cruise);
  if(stop)start=Math.min(start,Math.sqrt(2*acceleration*distance));
  const peak=stop?Math.min(cruise,Math.sqrt(acceleration*distance+start*start/2)):Math.min(cruise,Math.sqrt(start*start+2*acceleration*distance));
  const accelerate=Math.max(0,(peak*peak-start*start)/(2*acceleration)),brake=stop?peak*peak/(2*acceleration):0;
  if(peak>start)append(timeline,(peak-start)/acceleration,start,acceleration,null);
  const coast=Math.max(0,distance-accelerate-brake);if(coast>1e-7)append(timeline,coast/peak,peak,0,null);
  if(stop)append(timeline,peak/acceleration,peak,-acceleration,null);
}
/** Cached analytic legs give the same position after a seek, forecast or small steps. */
export function signalAwareProgress(points:readonly Point[],seed:number,speed:number,seconds:number,mode:Mode='vehicle'):FlowProgress {
  const elapsed=Number.isFinite(seconds)?Math.max(0,seconds):0,length=routeLength(points),gates=crossingGates(points,mode),cruise=Math.max(.1,speed);
  if(!gates.length)return{progress:seed+cruise*elapsed,speed:cruise,waiting:false,signalId:null};
  let routes=timelines.get(points);if(!routes){routes=new Map();timelines.set(points,routes);}const key=`${seed}/${cruise}/${mode}`;
  let timeline=routes.get(key);
  if(!timeline){timeline={motions:[],time:0,progress:seed,speed:cruise,gateIndex:gates.findIndex(gate=>gate.at>=modulo(seed,length)-1e-6),states:new Map(),cycle:null};if(timeline.gateIndex<0)timeline.gateIndex=0;routes.set(key,timeline);}
  // Do not extend a timeline whose exact boundary is a few ulps beyond the
  // requested time. A single-gate walk could otherwise repeatedly process a
  // zero-distance opening without advancing time (e.g. 13 - 4e-14 seconds).
  while(timeline.time<=elapsed&&!timeline.cycle){
    const gate=gates[timeline.gateIndex],target=timeline.progress+modulo(gate.at-modulo(timeline.progress,length),length),remaining=target-timeline.progress;
    const acceleration=mode==='vehicle'?3.4:2,arrival=timeline.time+movementTime(remaining,timeline.speed,cruise,acceleration),clearance=mode==='pedestrian'?gate.clearance/cruise+.5:movementTime(gate.clearance+7.4,0,cruise,acceleration)+.3;
    const stop=nextSignalOpening(gate.signalId,arrival,gate.heading,mode,clearance)>arrival+1e-6;
    move(timeline,remaining,cruise,acceleration,stop);
    // Preserve exact progress at every gate, preventing roundoff from choosing a previous lap.
    timeline.progress=target;
    if(stop){const opening=nextSignalOpening(gate.signalId,timeline.time,gate.heading,mode,clearance);append(timeline,opening-timeline.time,0,0,gate.signalId);}
    timeline.gateIndex=(timeline.gateIndex+1)%gates.length;
    if(remaining<1e-6&&timeline.time<=elapsed&&gates.length===1){move(timeline,length,cruise,acceleration,false);}
    // Every red stop aligns the car with an exact opening in the shared54s
    // schedule. Once a gate/phase/speed repeats, retain one cycle forever.
    const stateKey=`${timeline.gateIndex}/${modulo(timeline.time,SIGNAL_CYCLE_SECONDS).toFixed(6)}/${timeline.speed.toFixed(6)}`;
    const prior=timeline.states.get(stateKey);
    if(prior&&timeline.time-prior.time>1e-5&&timeline.progress-prior.progress>length*.5){timeline.cycle={fromTime:prior.time,from:prior.progress,duration:timeline.time-prior.time,distance:timeline.progress-prior.progress};timeline.states.clear();}
    else timeline.states.set(stateKey,{time:timeline.time,progress:timeline.progress});
  }
  let sampleTime=elapsed,progressOffset=0;
  if(timeline.cycle&&elapsed>=timeline.cycle.fromTime){const cycles=Math.floor((elapsed-timeline.cycle.fromTime)/timeline.cycle.duration);sampleTime=elapsed-cycles*timeline.cycle.duration;progressOffset=cycles*timeline.cycle.distance;}
  let low=0,high=timeline.motions.length-1;
  while(low<high){const middle=(low+high)>>1;if(timeline.motions[middle].toTime<=sampleTime)low=middle+1;else high=middle;}
  const leg=timeline.motions[low];if(!leg)return{progress:seed,speed:cruise,waiting:false,signalId:null};
  const dt=Math.max(0,Math.min(leg.toTime-leg.fromTime,sampleTime-leg.fromTime)),actualSpeed=Math.max(0,leg.speed+leg.acceleration*dt);
  return{progress:progressOffset+leg.from+leg.speed*dt+.5*leg.acceleration*dt*dt,speed:actualSpeed,waiting:actualSpeed<.05,signalId:leg.signalId};
}

export const trafficSeed=(index:number)=>index<8?(index%2?index*31+45:index*59+50):(index-8)*61+24;
const laneLoops=CITY_TRAFFIC_LOOPS.map(points=>createDrivingLane(points));
export const trafficRoute=(index:number)=>laneLoops[index<8?index%2:2+(index-8)%3];
export function ambientTrafficPose(index:number,seconds:number):TrafficPose {
  const points=trafficRoute(index),flow=signalAwareProgress(points,trafficSeed(index),8+index%4,seconds);return{...sampleTrafficPath(points,flow.progress),...flow};
}
export function patrolTrafficPose(index:number,seconds:number):TrafficPose {
  const points=laneLoops[index%2],flow=signalAwareProgress(points,index===0?205:63,7,seconds);return{...sampleTrafficPath(points,flow.progress),...flow};
}

export interface PedestrianTrafficRoute {points:readonly Point[];length:number}
const pedestrianRoutes:PedestrianTrafficRoute[]=[];
for(const street of CITY_STREETS){
  if(street.sidewalkWidth<1.2)continue;const length=routeLength(street.points)-distance(street.points[street.points.length-1],street.points[0]),offset=street.width/2+street.sidewalkWidth*.52;
  for(const side of[-1,1]){
    let points:Point[]=[];
    const save=()=>{if(points.length>3){const path=[...points,...points.slice(0,-1).reverse()],total=routeLength(path);if(total>24)pedestrianRoutes.push({points:path,length:total});}points=[];};
    for(let at=3;at<length-2;at+=3){
      const sample=sampleTrafficPath(street.points,at),dx=Math.sin(sample.heading),dz=-Math.cos(sample.heading),p={x:sample.x-dz*offset*side,z:sample.z+dx*offset*side};
      if(!clearCitySegment(p,p,.65)){save();continue;}if(points.length&&!clearCitySegment(points[points.length-1],p,.65))save();points.push(p);
    }save();
  }
}
export const AMBIENT_PEDESTRIAN_ROUTES:readonly PedestrianTrafficRoute[]=pedestrianRoutes;
export const AMBIENT_PEDESTRIAN_COUNT=64;
export function pedestrianTrafficPose(index:number,seconds:number):TrafficPose {
  const person=modulo(Math.floor(index),AMBIENT_PEDESTRIAN_COUNT),route=pedestrianRoutes[Math.floor(person*pedestrianRoutes.length/AMBIENT_PEDESTRIAN_COUNT)],flow=signalAwareProgress(route.points,person*17,1.15+person%4*.1,seconds,'pedestrian');
  return{...sampleTrafficPath(route.points,flow.progress),...flow};
}

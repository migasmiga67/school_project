import { CITY_STREETS, clearCitySegment, nearestStreet, routeStreets } from './city-map';
import type { Point } from './model';

const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
const direction=(a:Point,b:Point)=>{const length=distance(a,b);return{x:(b.x-a.x)/length,z:(b.z-a.z)/length};};
const cross=(a:Point,b:Point)=>a.x*b.z-a.z*b.x;

/** The right-hand lane is halfway between the centre marking and the kerb. */
export function drivingLaneOffset(width:number){return Math.max(1.15,Math.min(4.25,width*.25));}

function segmentOffset(a:Point,b:Point){
  const midpoint={x:(a.x+b.x)/2,z:(a.z+b.z)/2},along=direction(a,b);let best=Infinity,width=11;
  // Direction breaks nearestStreet's tie at a junction: a crossing street must
  // not suddenly change a lane's width or send it across the centre marking.
  for(const street of CITY_STREETS)for(let i=1;i<street.points.length;i++){
    const from=street.points[i-1],to=street.points[i],dx=to.x-from.x,dz=to.z-from.z,length=Math.hypot(dx,dz);
    if(length<1e-6)continue;const alignment=Math.abs((dx*along.x+dz*along.z)/length);if(alignment<.8)continue;
    const t=Math.max(0,Math.min(1,((midpoint.x-from.x)*dx+(midpoint.z-from.z)*dz)/(length*length)));
    const score=Math.hypot(midpoint.x-from.x-dx*t,midpoint.z-from.z-dz*t)+(1-alignment)*1.5;
    if(score<best){best=score;width=street.width;}
  }
  return drivingLaneOffset(width);
}

/** Offset the navigation centreline once; physics and rendering sample this same
 * cached polyline. Tangent joins round a turn instead of snapping a car 90°.
 * Closed paths omit their duplicate endpoint, as sampleTrafficPath closes them. */
export function createDrivingLane(centerline:readonly Point[],closed=true):Point[]{
  const source=centerline.filter((point,index)=>index===0||distance(point,centerline[index-1])>1e-5).map(point=>({...point}));
  if(source.length>1&&distance(source[0],source[source.length-1])<1e-5)source.pop();
  if(source.length<2)return source;
  const count=source.length,segmentCount=closed?count:count-1;
  const segments=Array.from({length:segmentCount},(_,index)=>{
    const a=source[index],b=source[(index+1)%count],along=direction(a,b),offset=segmentOffset(a,b);
    return{along,offset,length:distance(a,b),right:{x:-along.z,z:along.x}};
  });
  const joints=source.map((point,index)=>{
    const before=segments[(index-1+segmentCount)%segmentCount],after=segments[index%segmentCount];
    if(!closed&&(index===0||index===count-1)){
      const edge=index===0?after:before;
      return{x:point.x+edge.right.x*edge.offset,z:point.z+edge.right.z*edge.offset};
    }
    const a={x:point.x+before.right.x*before.offset,z:point.z+before.right.z*before.offset},b={x:point.x+after.right.x*after.offset,z:point.z+after.right.z*after.offset};
    const determinant=cross(before.along,after.along);
    if(Math.abs(determinant)<1e-4)return{x:(a.x+b.x)/2,z:(a.z+b.z)/2};
    const t=cross({x:b.x-a.x,z:b.z-a.z},after.along)/determinant;
    // A hairpin is never allowed to create an unbounded miter.
    const bounded=Math.max(-Math.max(before.offset,after.offset)*2,Math.min(Math.max(before.offset,after.offset)*2,t));
    return{x:a.x+before.along.x*bounded,z:a.z+before.along.z*bounded};
  });
  const result:Point[]=[];
  const add=(point:Point)=>{if(!result.length||distance(result[result.length-1],point)>1e-5)result.push(point);};
  for(let index=0;index<count;index++){
    const joint=joints[index];
    if(!closed&&(index===0||index===count-1)){add(joint);continue;}
    const before=segments[(index-1+segmentCount)%segmentCount],after=segments[index%segmentCount];
    const turn=Math.acos(Math.max(-1,Math.min(1,before.along.x*after.along.x+before.along.z*after.along.z)));
    const radius=Math.min(5,Math.max(3.4,(before.offset+after.offset)*.65));
    const trim=Math.min(radius*Math.tan(turn/2),distance(joints[(index-1+count)%count],joint)*.35,distance(joint,joints[(index+1)%count])*.35);
    if(turn<.015||trim<.025){add(joint);continue;}
    const entry={x:joint.x-before.along.x*trim,z:joint.z-before.along.z*trim},exit={x:joint.x+after.along.x*trim,z:joint.z+after.along.z*trim};
    const steps=Math.max(3,Math.ceil(turn/.09)),bend:Point[]=[];
    for(let step=0;step<=steps;step++){
      const t=step/steps,inverse=1-t;
      bend.push({x:inverse*inverse*entry.x+2*inverse*t*joint.x+t*t*exit.x,z:inverse*inverse*entry.z+2*inverse*t*joint.z+t*t*exit.z});
    }
    // This is also used for open emergency routes near off-road suspects. Keep
    // the safe offset corner when a smoothed bend would clip a building.
    if(bend.every((point,i)=>clearCitySegment(i?bend[i-1]:point,point,1.4)))bend.forEach(add);else add(joint);
  }
  return result;
}

/** Pursuit routing uses the same lanes, while its short final approach may leave
 * the road to reach a suspect. Re-routing starts at the actual car position. */
export function routeDrivingLanes(from:Point,to:Point):Point[]{
  const start=nearestStreet(from),end=nearestStreet(to);if(!start||!end)return[];
  const centerline=routeStreets(start.point,end.point),lane=createDrivingLane(centerline,false);
  if(!lane.length)return[];
  const result=[{...from},...lane];
  // Officers may approach a stopped suspect in the last few metres, but never
  // cut a building corner or abandon the road for a distant hidden coordinate.
  if(distance(lane[lane.length-1],to)<7&&clearCitySegment(lane[lane.length-1],to,1.4))result.push({...to});
  return result;
}

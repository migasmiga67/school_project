import { CITY_BUILDINGS,CITY_JUNCTIONS,CITY_STREETS,WORLD_BOUNDS,type CityStreet } from './city-map';
import { CASINO } from './casino-location';
import { CREW_BASE,HOMES } from './career';
import { GARAGE_LOCATION } from './garage';
import type { Collider,Point } from './model';
import { WORLD_LANDMARKS } from './world-layout';

/** Width is the local X axis, with the same Y rotation used by Three.js. */
export interface DecorationFootprint extends Point {width:number;depth:number;rotation?:number}
export interface AccessClearance extends Point {radius:number;id?:string}
export interface PlacementContext {
  streets:readonly PlacementStreet[];
  buildings:readonly Collider[];
  junctions:readonly (Point&{radius:number;degree?:number})[];
  crossings?:readonly DecorationFootprint[];
  accessAreas?:readonly AccessClearance[];
  occupied?:readonly DecorationFootprint[];
  bounds?:{minX:number;maxX:number;minZ:number;maxZ:number};
}
type PlacementStreet=Pick<CityStreet,'points'|'width'>&Partial<Pick<CityStreet,'kind'|'closed'|'sidewalkWidth'>>;
export interface PlacementOptions {roadPadding?:number;buildingPadding?:number;junctionPadding?:number;accessPadding?:number;occupiedPadding?:number;walkingPadding?:number}
export type PlacementBlocker='invalid'|'bounds'|'road'|'walkway'|'crosswalk'|'junction'|'building'|'access'|'occupied';

export const CITY_ACCESS_CLEARANCES:readonly AccessClearance[]=[
  {id:'casino',...CASINO.door,radius:3.3},{id:'garage',...GARAGE_LOCATION,radius:3.3},
  {id:'canal-home',...HOMES.canal.door,radius:3},{id:'loft-home',...HOMES.loft.door,radius:3},
  {id:'crew-base',...CREW_BASE.door,radius:3},{id:'bank',x:-60,z:-46,radius:3},
  ...WORLD_LANDMARKS.map(landmark=>({id:landmark.id,...landmark.point,radius:2.5})),
];
/** Includes the complete painted crossing, rather than just an intersection radius. */
export const CITY_CROSSWALK_FOOTPRINTS:readonly DecorationFootprint[]=planCrosswalks();
export const CITY_PLACEMENT_CONTEXT:PlacementContext={streets:CITY_STREETS,buildings:CITY_BUILDINGS,junctions:CITY_JUNCTIONS.filter(junction=>junction.degree>=3),crossings:CITY_CROSSWALK_FOOTPRINTS,accessAreas:CITY_ACCESS_CLEARANCES,bounds:WORLD_BOUNDS};
const EPS=1e-7;
const dot=(a:Point,b:Point)=>a.x*b.x+a.z*b.z;
const subtract=(a:Point,b:Point):Point=>({x:a.x-b.x,z:a.z-b.z});
interface WalkingSegment {a:Point;b:Point}
const walkingSegments=new WeakMap<object,readonly WalkingSegment[]>();
interface Bounds {minX:number;maxX:number;minZ:number;maxZ:number}
const footprintBounds=(corners:readonly Point[]):Bounds=>({minX:Math.min(...corners.map(p=>p.x)),maxX:Math.max(...corners.map(p=>p.x)),minZ:Math.min(...corners.map(p=>p.z)),maxZ:Math.max(...corners.map(p=>p.z))});
/** Cheap lower bound avoids full OBB tests for distant road and walking segments. */
function segmentBoundsDistanceSquared(bounds:Bounds,a:Point,b:Point){
  const dx=Math.max(0,Math.min(a.x,b.x)-bounds.maxX,bounds.minX-Math.max(a.x,b.x));
  const dz=Math.max(0,Math.min(a.z,b.z)-bounds.maxZ,bounds.minZ-Math.max(a.z,b.z));return dx*dx+dz*dz;
}

/** Match the sampled sidewalk centre lines used by ambient pedestrians. */
function streetWalkingSegments(street:PlacementStreet):readonly WalkingSegment[]{
  const cached=walkingSegments.get(street);if(cached)return cached;
  const result:WalkingSegment[]=[],sidewalk=street.sidewalkWidth??0;
  if(sidewalk>=1.2){
    const length=street.points.slice(1).reduce((sum,p,index)=>sum+Math.hypot(p.x-street.points[index].x,p.z-street.points[index].z),0),offset=street.width/2+sidewalk*.52;
    for(const side of[-1,1]){
      let previous:Point|null=null;
      for(let distance=3;distance<length-2;distance+=3){
        const sample=streetSample(street.points,distance),point={x:sample.x-sample.dz*offset*side,z:sample.z+sample.dx*offset*side};
        if(previous)result.push({a:previous,b:point});previous=point;
      }
    }
  }
  walkingSegments.set(street,result);return result;
}

export function footprintCorners(footprint:DecorationFootprint):Point[]{
  const angle=footprint.rotation??0,cos=Math.cos(angle),sin=Math.sin(angle);
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>({x:footprint.x+cos*x*footprint.width/2+sin*z*footprint.depth/2,z:footprint.z-sin*x*footprint.width/2+cos*z*footprint.depth/2}));
}
function localPoint(point:Point,footprint:DecorationFootprint):Point {
  const angle=footprint.rotation??0,cos=Math.cos(angle),sin=Math.sin(angle),dx=point.x-footprint.x,dz=point.z-footprint.z;
  return{x:cos*dx-sin*dz,z:sin*dx+cos*dz};
}
function distanceToRectangle(point:Point,footprint:DecorationFootprint){const local=localPoint(point,footprint);return Math.hypot(Math.max(0,Math.abs(local.x)-footprint.width/2),Math.max(0,Math.abs(local.z)-footprint.depth/2));}
function distanceToSegment(point:Point,a:Point,b:Point){const dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz,t=length>EPS?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/length)):0;return Math.hypot(point.x-a.x-dx*t,point.z-a.z-dz*t);}
function segmentEntersRectangle(a:Point,b:Point,footprint:DecorationFootprint){
  const start=localPoint(a,footprint),end=localPoint(b,footprint);let enter=0,leave=1;
  for(const axis of ['x','z']as const){const half=(axis==='x'?footprint.width:footprint.depth)/2,delta=end[axis]-start[axis];if(Math.abs(delta)<EPS){if(Math.abs(start[axis])>half)return false;continue;}const first=(-half-start[axis])/delta,last=(half-start[axis])/delta;enter=Math.max(enter,Math.min(first,last));leave=Math.min(leave,Math.max(first,last));if(enter>leave)return false;}
  return true;
}
/** Exact rectangle-to-segment distance catches crossed edges and long rotated ends. */
export function footprintDistanceToSegment(footprint:DecorationFootprint,a:Point,b:Point):number {
  if(segmentEntersRectangle(a,b,footprint))return 0;
  return Math.min(distanceToRectangle(a,footprint),distanceToRectangle(b,footprint),...footprintCorners(footprint).map(point=>distanceToSegment(point,a,b)));
}
/** Clearance from the whole object, including rotated ends, to every walking lane. */
export function decorationWalkingClearance(footprint:DecorationFootprint,streets:readonly PlacementStreet[]=CITY_STREETS):number {
  let distance=Infinity;const bounds=footprintBounds(footprintCorners(footprint));
  for(const street of streets)for(const segment of streetWalkingSegments(street)){
    if(segmentBoundsDistanceSquared(bounds,segment.a,segment.b)>=distance*distance)continue;
    distance=Math.min(distance,footprintDistanceToSegment(footprint,segment.a,segment.b));
  }
  return distance;
}
function rectanglesOverlap(first:DecorationFootprint,second:DecorationFootprint,padding:number){
  const radius=Math.hypot(first.width/2+padding,first.depth/2+padding)+Math.hypot(second.width/2,second.depth/2);
  if((first.x-second.x)**2+(first.z-second.z)**2>radius*radius)return false;
  const a=footprintCorners({...first,width:first.width+padding*2,depth:first.depth+padding*2}),b=footprintCorners(second);
  for(const rectangle of[a,b])for(let edge=0;edge<2;edge++){
    const delta=subtract(rectangle[edge+1],rectangle[edge]),axis={x:-delta.z,z:delta.x},projectA=a.map(point=>dot(point,axis)),projectB=b.map(point=>dot(point,axis));
    if(Math.max(...projectA)<Math.min(...projectB)-EPS||Math.max(...projectB)<Math.min(...projectA)-EPS)return false;
  }
  return true;
}
function planCrosswalks():DecorationFootprint[]{
  const result:DecorationFootprint[]=[];
  for(const junction of CITY_JUNCTIONS){
    if(junction.degree<3)continue;
    const streets=junction.streetIds.map(id=>CITY_STREETS.find(street=>street.id===id)).filter((street):street is CityStreet=>Boolean(street));
    if(!streets.some(street=>street.kind==='avenue'||street.kind==='boulevard'))continue;
    const approaches:Point[]=[];
    for(const street of streets){
      let nearest=0,distance=Infinity;street.points.forEach((point,index)=>{const next=Math.hypot(point.x-junction.x,point.z-junction.z);if(next<distance){nearest=index;distance=next;}});
      for(const index of[nearest-2,nearest+2]){
        const point=street.points[Math.max(0,Math.min(street.points.length-1,index))],dx=point.x-junction.x,dz=point.z-junction.z,length=Math.hypot(dx,dz);if(length<2)continue;
        const direction={x:dx/length,z:dz/length};if(approaches.some(other=>other.x*direction.x+other.z*direction.z>.9))continue;approaches.push(direction);
        const reach=Math.max(junction.radius+1.9,street.width*.62+1.2);
        result.push({x:junction.x+direction.x*reach,z:junction.z+direction.z*reach,width:street.width,depth:2.6,rotation:Math.atan2(direction.x,direction.z)});
      }
    }
  }
  return result;
}
export function decorationBlocker(footprint:DecorationFootprint,context:PlacementContext=CITY_PLACEMENT_CONTEXT,options:PlacementOptions={}):PlacementBlocker|null {
  if(!Number.isFinite(footprint.x+footprint.z+footprint.width+footprint.depth+(footprint.rotation??0))||footprint.width<=0||footprint.depth<=0)return'invalid';
  const corners=footprintCorners(footprint),bounds=context.bounds,rectangleBounds=footprintBounds(corners);
  if(bounds&&corners.some(point=>point.x<bounds.minX||point.x>bounds.maxX||point.z<bounds.minZ||point.z>bounds.maxZ))return'bounds';
  const roadPadding=options.roadPadding??.35;
  for(const street of context.streets){
    for(let i=1;i<street.points.length;i++){
      const padding=street.width/2+roadPadding;if(segmentBoundsDistanceSquared(rectangleBounds,street.points[i-1],street.points[i])>=padding*padding)continue;
      if(footprintDistanceToSegment(footprint,street.points[i-1],street.points[i])<padding-EPS)return'road';
    }
    // The rendered ribbon has mitered corners, which can extend beyond round segment caps.
    for(let i=1;i<street.points.length-1;i++){
      const before=subtract(street.points[i],street.points[i-1]),after=subtract(street.points[i+1],street.points[i]),length=Math.hypot(before.x,before.z)*Math.hypot(after.x,after.z);
      if(length<EPS)continue;const cosine=Math.max(-1,Math.min(1,dot(before,after)/length)),miter=Math.min(2,1/Math.max(.5,Math.sqrt((1+cosine)/2)));
      if(distanceToRectangle(street.points[i],footprint)<street.width/2*miter+roadPadding-EPS)return'road';
    }
    if(street.kind==='residential'&&!street.closed&&distanceToRectangle(street.points[street.points.length-1],footprint)<street.width*.66+roadPadding-EPS)return'road';
  }
  if(options.walkingPadding!==undefined&&decorationWalkingClearance(footprint,context.streets)<Math.max(0,options.walkingPadding)-EPS)return'walkway';
  for(const crossing of context.crossings??[])if(rectanglesOverlap(footprint,crossing,.35))return'crosswalk';
  for(const junction of context.junctions)if((junction.degree??3)>=3&&distanceToRectangle(junction,footprint)<junction.radius+(options.junctionPadding??2.8)-EPS)return'junction';
  for(const building of context.buildings)if(rectanglesOverlap(footprint,{...building,width:building.halfX*2,depth:building.halfZ*2},options.buildingPadding??.2))return'building';
  for(const access of context.accessAreas??[])if(distanceToRectangle(access,footprint)<access.radius+(options.accessPadding??.25)-EPS)return'access';
  for(const occupied of context.occupied??[])if(rectanglesOverlap(footprint,occupied,options.occupiedPadding??.3))return'occupied';
  return null;
}
export const canPlaceDecoration=(footprint:DecorationFootprint,context:PlacementContext=CITY_PLACEMENT_CONTEXT,options:PlacementOptions={})=>decorationBlocker(footprint,context,options)===null;

export interface StreetDecorationOptions extends PlacementOptions {side?:1|-1;context?:PlacementContext;occupied?:readonly DecorationFootprint[];searchDistance?:number}
/** Search order is stable and never mutates the map, options or occupied footprints. */
export function findStreetDecoration(street:CityStreet,distance:number,width:number,depth:number,options:StreetDecorationOptions={}):DecorationFootprint|null {
  const length=street.points.slice(1).reduce((sum,p,index)=>sum+Math.hypot(p.x-street.points[index].x,p.z-street.points[index].z),0),search=options.searchDistance??12,steps=[0,-4,4,-8,8,-12,12].filter(step=>Math.abs(step)<=search);
  const context=options.context??CITY_PLACEMENT_CONTEXT,withOccupied=options.occupied?{...context,occupied:[...(context.occupied??[]),...options.occupied]}:context;
  for(const step of steps){
    const along=distance+step;if(along<width/2+2||along>length-width/2-2)continue;
    const sample=streetSample(street.points,along),rotation=Math.atan2(-sample.dz,sample.dx);
    for(const side of[options.side??1,-(options.side??1)])for(const outward of[0,.4,.8]){
      const walkingOffset=options.walkingPadding!==undefined&&street.sidewalkWidth>=1.2?street.sidewalkWidth*.52+Math.max(0,options.walkingPadding)+depth/2:0;
      const offset=street.width/2+Math.max(depth/2+.45,street.sidewalkWidth-depth/2-.08,walkingOffset)+outward,footprint={x:sample.x-sample.dz*offset*side,z:sample.z+sample.dx*offset*side,width,depth,rotation:rotation+(side<0?Math.PI:0)};
      if(canPlaceDecoration(footprint,withOccupied,options))return footprint;
    }
  }
  return null;
}
function streetSample(points:readonly Point[],distance:number):Point&{dx:number;dz:number}{let remaining=distance;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.z-a.z);if(remaining<=length||i===points.length-1){const t=Math.min(1,remaining/Math.max(EPS,length));return{x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,dx:(b.x-a.x)/Math.max(EPS,length),dz:(b.z-a.z)/Math.max(EPS,length)};}remaining-=length;}return{...points[0],dx:0,dz:1};}

export interface StreetDecoration extends DecorationFootprint {id:string;streetId:string}
function planBenches():readonly StreetDecoration[]{
  const result:StreetDecoration[]=[];
  for(const street of CITY_STREETS){
    if(street.kind==='alley'||street.kind==='service')continue;
    const length=street.points.slice(1).reduce((sum,p,index)=>sum+Math.hypot(p.x-street.points[index].x,p.z-street.points[index].z),0);
    for(let distance=25,index=0;distance<length-8;distance+=47,index++){
      const footprint=findStreetDecoration(street,distance,2.8,.8,{occupied:result,side:index%2?1:-1,walkingPadding:.55,junctionPadding:4});
      if(footprint)result.push({...footprint,id:`bench-${street.id}-${index}`,streetId:street.id});
    }
  }
  return result;
}
/** The renderer and regression checks consume the identical approved full footprints. */
export const CITY_BENCH_PLACEMENTS=planBenches();
function planStreetSigns():readonly StreetDecoration[]{
  const result:StreetDecoration[]=[];
  for(const street of CITY_STREETS){const footprint=findStreetDecoration(street,20,5.8,.16,{occupied:[...CITY_BENCH_PLACEMENTS,...result]});if(footprint)result.push({...footprint,id:`sign-${street.id}`,streetId:street.id});}
  return result;
}
export const CITY_STREET_SIGN_PLACEMENTS=planStreetSigns();

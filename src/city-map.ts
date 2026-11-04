import type { Collider, Point } from './model';

export type CityDistrict = 'downtown' | 'westwood' | 'financial' | 'port' | 'south-bay';
export interface CityStreet {
  id:string; name:string; kind:'boulevard'|'avenue'|'residential'|'alley'|'service';
  district:CityDistrict; width:number; sidewalkWidth:number; points:readonly Point[]; closed?:boolean;
}
export interface CityBuilding extends Collider {
  id:string; district:CityDistrict;
  style:'tower'|'office'|'courtyard'|'townhouse'|'villa'|'warehouse'|'workshop'|'hotel'|'shop'; height:number;
}
export interface CitySpace { id:string; kind:'park'|'plaza'|'parking'|'loading'; district:CityDistrict; points:readonly Point[] }
export interface CityJunction extends Point { id:string; streetIds:readonly string[]; degree:number; radius:number }
export interface CityStreetProjection { point:Point; street:CityStreet; segment:number; t:number; distance:number; heading:number }

export const WORLD_BOUNDS={minX:-216,maxX:98,minZ:-218,maxZ:218};
/** Historic coordinates remain available to saves and the original mission scripts. */
export const ROADS=[-80,-40,0,40,80];
export const ROAD_X=[-200,-160,-120,...ROADS];
export const ROAD_Z=[-200,-160,-120,...ROADS,120,160,200];
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
const point=(x:number,z:number):Point=>({x,z});
const anchors=(pairs:readonly (readonly [number,number])[])=>pairs.map(([x,z])=>point(x,z));
const EPS=1e-6;

/** Interpolated anchors form the same sampled curves in rendering and navigation. */
function curve(pairs:readonly (readonly [number,number])[],closed=false):Point[] {
  const path=anchors(pairs),result:Point[]=[];
  const at=(index:number)=>closed?path[(index+path.length)%path.length]:path[Math.max(0,Math.min(path.length-1,index))];
  for(let i=0;i<path.length-(closed?0:1);i++){
    const a=at(i-1),b=at(i),c=at(i+1),d=at(i+2),steps=Math.max(3,Math.ceil(distance(b,c)/6));
    for(let j=0;j<steps;j++){
      const t=j/steps,t2=t*t,t3=t2*t;
      const axis=(key:'x'|'z')=>.5*((2*b[key])+(-a[key]+c[key])*t+(2*a[key]-5*b[key]+4*c[key]-d[key])*t2+(-a[key]+3*b[key]-3*c[key]+d[key])*t3);
      result.push(j===0?{...b}:{x:axis('x'),z:axis('z')});
    }
  }
  result.push({...path[closed?0:path.length-1]});return result;
}
const street=(id:string,name:string,kind:CityStreet['kind'],district:CityDistrict,width:number,sidewalkWidth:number,points:Point[],closed=false):CityStreet=>({id,name,kind,district,width,sidewalkWidth,points,closed});
const westRing=curve([[-80,-80],[-112,-86],[-145,-80],[-175,-58],[-190,-25],[-194,10],[-184,40],[-165,66],[-128,82],[-80,80]]);
const northRing=curve([[-80,-120],[-80,-170],[-57,-193],[-12,-200],[35,-191],[63,-173],[80,-160],[80,-120],[40,-114],[0,-120],[-40,-120]],true);
const southRing=curve([[-160,120],[-80,112],[0,120],[56,132],[80,160],[72,192],[32,204],[-24,200],[-80,204],[-132,194],[-166,173],[-178,146]],true);

export const CITY_STREETS:readonly CityStreet[]=[
  ...ROADS.map(x=>street(`core-ns-${x}`,x===80?'Ocean Drive':x===0?'Central Avenue':'Downtown Street','avenue','downtown',x===80||x===0?12:11,x===80||x===0?1.5:2,anchors([[x,-80],[x,80]]))),
  ...ROADS.map(z=>street(`core-ew-${z}`,z===80?'Southside Avenue':z===0?'Neon Avenue':'Downtown Cross Street','avenue','downtown',z===80?12:11,z===80?1.5:2,anchors([[-80,z],[80,z]]))),
  street('westwood-boulevard','Westwood Boulevard','boulevard','westwood',15,2.2,westRing),
  street('westwood-terrace','Park Terrace','residential','westwood',8,1.8,curve([[-80,40],[-116,40],[-144,32],[-160,40],[-184,40]])),
  street('westwood-market','Havana Market Road','avenue','westwood',11,2,curve([[-80,0],[-112,0],[-137,-8],[-166,-4],[-193,0]])),
  street('westwood-grove','Grove Crescent','residential','westwood',7.5,1.5,curve([[-145,-80],[-146,-55],[-150,-31],[-166,-4]])),
  street('westwood-close','Cypress Close','residential','westwood',7,1.6,curve([[-175,-58],[-189,-84],[-202,-99],[-206,-118]])),
  street('westwood-alley','Mercado Passage','alley','westwood',5.5,.7,curve([[-112,-86],[-111,-59],[-112,-31],[-112,0]])),
  street('west-north-link','University Road','avenue','westwood',11,1.8,curve([[-145,-80],[-144,-111],[-130,-133],[-105,-143],[-80,-145]])),
  street('financial-ring','Financial Boulevard','boulevard','financial',17,2.5,northRing,true),
  street('financial-west-link','Exchange Approach','avenue','financial',11,2,anchors([[-80,-80],[-80,-120]])),
  street('financial-central','Central Avenue North','boulevard','financial',14,2,anchors([[0,-80],[0,-120],[0,-158]])),
  street('financial-east-link','Ocean Drive North','boulevard','financial',16,2.5,anchors([[80,-80],[80,-120]])),
  street('financial-cross','Exchange Crescent','avenue','financial',11,2.5,curve([[-80,-170],[-40,-160],[0,-158],[40,-164],[80,-160]])),
  street('financial-garden','Observatory Close','residential','financial',7.5,1.5,curve([[-80,-170],[-102,-183],[-113,-198]])),
  street('financial-lane','Exchange Lane','alley','financial',5.5,.8,anchors([[40,-114],[40,-138],[40,-164]])),
  street('financial-quay','North Quay','avenue','financial',10,1.8,curve([[80,-160],[84,-181],[80,-201]])),
  street('port-ring','Nelson Harbor Road','boulevard','port',16,2,southRing,true),
  street('west-port-link','Canal Road','avenue','westwood',10,1.8,curve([[-184,40],[-188,84],[-178,146]])),
  street('port-west-link','Dockhouse Approach','avenue','port',12,1.8,anchors([[-80,80],[-80,112]])),
  street('port-central-link','South Station Road','avenue','port',12,2,anchors([[0,80],[0,120]])),
  street('south-coast','South Bay Promenade','boulevard','south-bay',16,3,anchors([[80,80],[80,120],[80,160]])),
  street('port-cross','Nelson Dock Road','avenue','port',12,1.6,curve([[-160,120],[-142,142],[-120,160],[-80,172],[-24,168],[32,176],[80,160]])),
  street('port-loading','Container Lane','service','port',7,1,anchors([[-142,142],[-168,147],[-194,147]])),
  street('port-service','Foundry Cut','alley','port',5.5,.6,curve([[-80,112],[-100,134],[-120,160]])),
  street('port-slip','Slipway Close','service','port',8,1,curve([[-80,204],[-105,211],[-124,210]])),
  street('south-bay-lane','Marina Lane','residential','south-bay',8,1.8,curve([[32,176],[30,150],[56,132]])),
];

const rectangle=(x:number,z:number,halfX:number,halfZ:number):Point[]=>anchors([[x-halfX,z-halfZ],[x+halfX,z-halfZ],[x+halfX,z+halfZ],[x-halfX,z+halfZ]]);
export const CITY_SPACES:readonly CitySpace[]=[
  {id:'central-park',kind:'park',district:'downtown',points:rectangle(-20,-20,14,14)},
  {id:'westwood-gardens',kind:'park',district:'westwood',points:rectangle(-166,17,13,10)},
  {id:'westwood-square',kind:'plaza',district:'westwood',points:rectangle(-158,52,9,6)},
  {id:'westwood-parking',kind:'parking',district:'westwood',points:rectangle(-132,14,9,7)},
  {id:'financial-square',kind:'plaza',district:'financial',points:rectangle(-41,-174,12,6)},
  {id:'financial-gardens',kind:'park',district:'financial',points:rectangle(19,-139,8,9)},
  {id:'financial-parking',kind:'parking',district:'financial',points:rectangle(61,-99,10,7)},
  {id:'nelson-yard',kind:'loading',district:'port',points:rectangle(-192,164,12,9)},
  {id:'nelson-parking',kind:'parking',district:'port',points:rectangle(-59,136,14,9)},
  {id:'harbor-square',kind:'plaza',district:'port',points:rectangle(-120,176,9,7)},
  {id:'south-bay-gardens',kind:'park',district:'south-bay',points:rectangle(53,190,10,7)},
  {id:'south-bay-parking',kind:'parking',district:'south-bay',points:rectangle(60,111,10,7)},
];

/** Exact slab test also handles the diagonal approaches used by GPS. */
function intersectsBox(a:Point,b:Point,box:Collider,padding=0):boolean {
  let enter=0,leave=1;
  for(const axis of ['x','z'] as const){
    const half=(axis==='x'?box.halfX:box.halfZ)+padding,low=box[axis]-half+EPS,high=box[axis]+half-EPS,delta=b[axis]-a[axis];
    if(Math.abs(delta)<EPS){if(a[axis]<low||a[axis]>high)return false;continue;}
    const t1=(low-a[axis])/delta,t2=(high-a[axis])/delta;
    enter=Math.max(enter,Math.min(t1,t2));leave=Math.min(leave,Math.max(t1,t2));if(enter>leave)return false;
  }
  return enter<=leave;
}
const originalBuildings:CityBuilding[]=ROADS.slice(0,-1).flatMap((x,ix)=>ROADS.slice(0,-1).filter((_,iz)=>ix!==1||iz!==1).map(z=>({
  id:`original-${x+20}-${z+20}`,x:x+20,z:z+20,halfX:12,halfZ:12,district:'downtown' as const,
  style:(x>=0?'tower':z>=0?'courtyard':'office') as CityBuilding['style'],height:x>=0?27+(z+80)*.12:15+(z+80)*.06,
})));
type Parcel=readonly [number,number,number,number,number,CityBuilding['style']];
const parcels:Record<Exclude<CityDistrict,'downtown'>,readonly Parcel[]>={
  westwood:[[-97,-60,7,10,10,'shop'],[-128,-61,8,9,12,'townhouse'],[-164,-37,7,10,9,'villa'],[-174,-18,6,7,8,'villa'],[-176,6,6,7,8,'villa'],[-205,-25,5,8,9,'townhouse'],[-205,12,5,7,10,'townhouse'],[-96,-21,6,9,10,'shop'],[-130,-27,8,7,10,'townhouse'],[-129,-105,9,6,12,'townhouse'],[-164,-101,8,8,9,'villa'],[-179,-118,9,7,9,'villa'],[-205,-146,6,10,11,'workshop'],[-181,-151,9,9,10,'villa'],[-158,-156,10,9,12,'villa'],[-182,-185,11,10,10,'villa'],[-151,-193,10,9,11,'villa'],[-201,-189,5,12,10,'townhouse'],[-102,19,7,9,11,'shop'],[-104,59,8,8,11,'townhouse'],[-132,61,7,8,9,'villa'],[-164,86,8,8,11,'townhouse'],[-206,64,5,9,8,'villa'],[-207,102,5,10,9,'villa'],[-141,104,9,7,12,'shop'],[-107,94,8,6,12,'townhouse'],[-162,108,7,6,10,'townhouse'],[-154,-118,6,7,9,'villa'],[-105,-118,9,8,13,'office']],
  financial:[[-54,-99,11,7,24,'office'],[-24,-100,9,7,38,'tower'],[23,-98,11,7,32,'office'],[-58,-140,10,7,44,'tower'],[-25,-139,9,7,31,'office'],[61,-139,9,7,36,'tower'],[-23,-181,10,7,51,'tower'],[14,-178,9,7,39,'office'],[53,-184,6,6,28,'office'],[-63,-178,5,6,25,'office'],[-96,-157,5,7,19,'office'],[-123,-175,6,9,21,'office'],[-124,-203,7,6,17,'hotel'],[62,-207,8,5,18,'hotel'],[11,-211,12,4,25,'office']],
  port:[[-151,157,6,8,12,'workshop'],[-157,184,7,7,13,'warehouse'],[-144,209,9,5,11,'workshop'],[-109,191,10,6,14,'warehouse'],[-83,145,9,9,13,'warehouse'],[-35,145,11,8,14,'warehouse'],[-8,146,10,7,12,'warehouse'],[-58,188,13,6,13,'warehouse'],[-20,187,10,5,12,'workshop'],[-195,126,9,7,12,'warehouse'],[-206,183,5,9,10,'workshop'],[-181,199,10,9,13,'warehouse'],[-179,105,6,8,12,'workshop'],[-116,115,10,5,13,'warehouse']],
  'south-bay':[[49,152,7,8,18,'hotel'],[63,174,7,6,20,'hotel'],[10,186,8,6,13,'shop'],[13,143,8,7,17,'hotel'],[45,213,10,3,12,'shop'],[89,190,4,9,14,'hotel'],[91,140,3,8,12,'shop'],[26,96,11,6,15,'hotel']],
};
// Smaller infill bodies make irregular leftover parcels useful without filling their yards.
const infill:Record<keyof typeof parcels,readonly Parcel[]>={
  westwood:[[-167,100,6,5,9,'townhouse'],[-177,-134,6,4,10,'townhouse'],[-100,-61,4,5,8,'townhouse'],[-118,-160,5,4,10,'townhouse'],[-101,-104,6,4,8,'townhouse'],[-148,20,4,5,11,'townhouse'],[-125,-204,6,4,9,'townhouse'],[-130,-191,4,5,11,'townhouse'],[-100,-41,4,6,12,'townhouse'],[-115,19,4,4,13,'townhouse']],
  financial:[[2,-177,4,4,36,'office'],[-14,-178,5,6,38,'tower'],[28,-94,8,4,32,'office'],[-42,-100,5,5,41,'tower'],[61,-139,5,5,49,'tower'],[-29,-139,4,6,34,'office'],[-53,-98,4,5,42,'tower'],[12,-176,4,5,26,'office'],[44,-96,5,5,45,'tower'],[49,-132,4,5,29,'office'],[-41,-140,4,5,34,'office'],[50,-147,4,5,37,'office']],
  port:[[-23,185,6,4,17,'workshop'],[-42,153,12,5,14,'warehouse'],[-118,131,7,4,16,'warehouse'],[-28,138,6,4,11,'workshop'],[-202,121,6,5,11,'workshop'],[-77,185,9,4,15,'warehouse'],[-22,99,5,4,15,'workshop'],[-193,179,5,4,11,'workshop'],[-24,154,4,5,16,'workshop'],[-66,154,4,4,17,'workshop'],[-201,132,7,4,16,'warehouse'],[-149,98,6,6,11,'workshop'],[-45,185,12,4,14,'warehouse'],[-162,207,7,6,12,'warehouse']],
  'south-bay':[[46,95,5,4,16,'hotel'],[42,108,7,4,16,'hotel'],[60,96,6,5,23,'hotel'],[15,158,4,6,15,'hotel'],[47,155,4,4,26,'hotel']],
};
const extensionBuildings:CityBuilding[]=[];
for(const district of Object.keys(parcels) as (keyof typeof parcels)[])for(const [x,z,halfX,halfZ,height,style]of [...parcels[district],...infill[district]]){
  const building:CityBuilding={id:`${district}-${extensionBuildings.length}`,x,z,halfX,halfZ,height,style,district};
  const onStreet=CITY_STREETS.some(road=>road.points.slice(1).some((end,index)=>intersectsBox(road.points[index],end,building,road.width/2+road.sidewalkWidth+.6)));
  const inSpace=CITY_SPACES.some(space=>{
    const xs=space.points.map(p=>p.x),zs=space.points.map(p=>p.z);
    return x+halfX>Math.min(...xs)-1&&x-halfX<Math.max(...xs)+1&&z+halfZ>Math.min(...zs)-1&&z-halfZ<Math.max(...zs)+1;
  });
  const overlaps=[...originalBuildings,...extensionBuildings].some(other=>Math.abs(x-other.x)<halfX+other.halfX+1.5&&Math.abs(z-other.z)<halfZ+other.halfZ+1.5);
  if(!onStreet&&!inSpace&&!overlaps)extensionBuildings.push(building);
}
export const CITY_BUILDINGS:readonly CityBuilding[]=[...originalBuildings,...extensionBuildings];
/** Physics uses the visible building body, without metadata or invisible parcel walls. */
export const BUILDINGS:Collider[]=CITY_BUILDINGS.map(({x,z,halfX,halfZ})=>({x,z,halfX,halfZ}));
export const NATURAL_BLOCKS:Readonly<Point>[]=CITY_SPACES.filter(space=>space.kind==='park').map(space=>({x:space.points.reduce((sum,p)=>sum+p.x,0)/space.points.length,z:space.points.reduce((sum,p)=>sum+p.z,0)/space.points.length}));
export function clearCitySegment(a:Point,b:Point,radius=0):boolean {
  return Number.isFinite(a.x+a.z+b.x+b.z)&&!BUILDINGS.some(building=>intersectsBox(a,b,building,radius));
}

interface Segment {a:Point;b:Point;street:CityStreet;index:number;cuts:number[]}
const segments:Segment[]=CITY_STREETS.flatMap(street=>street.points.slice(1).map((b,index)=>({a:street.points[index],b,street,index,cuts:[0,1]}))).filter(segment=>distance(segment.a,segment.b)>EPS);
const cross=(a:Point,b:Point)=>a.x*b.z-a.z*b.x;
const subtract=(a:Point,b:Point):Point=>({x:a.x-b.x,z:a.z-b.z});
const interpolate=(a:Point,b:Point,t:number):Point=>({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
  const a=segments[i],b=segments[j],r=subtract(a.b,a.a),s=subtract(b.b,b.a),denominator=cross(r,s),offset=subtract(b.a,a.a);
  if(Math.abs(denominator)<EPS)continue;
  const t=cross(offset,s)/denominator,u=cross(offset,r)/denominator;
  if(t>=-EPS&&t<=1+EPS&&u>=-EPS&&u<=1+EPS){a.cuts.push(Math.max(0,Math.min(1,t)));b.cuts.push(Math.max(0,Math.min(1,u)));}
}
interface GraphEdge {a:number;b:number;street:CityStreet;segment:number;length:number}
const graphPoints:Point[]=[],graphEdges:GraphEdge[]=[],nodeIds=new Map<string,number>();
const node=(p:Point)=>{
  const key=`${p.x.toFixed(5)},${p.z.toFixed(5)}`;let id=nodeIds.get(key);
  if(id===undefined){id=graphPoints.length;nodeIds.set(key,id);graphPoints.push({...p});}return id;
};
// Stable ordering gives the historic core the same shortest-path tie breaks.
for(const x of ROADS)for(const z of ROADS)node({x,z});
for(const segment of segments){
  const cuts=[...new Set(segment.cuts.map(t=>Math.round(t*1e8)/1e8))].sort((a,b)=>a-b);
  for(let i=1;i<cuts.length;i++){
    const a=node(interpolate(segment.a,segment.b,cuts[i-1])),b=node(interpolate(segment.a,segment.b,cuts[i]));
    if(a!==b)graphEdges.push({a,b,street:segment.street,segment:segment.index,length:distance(graphPoints[a],graphPoints[b])});
  }
}
const adjacency: {to:number;length:number}[][]=graphPoints.map(()=>[]);
for(const edge of graphEdges){adjacency[edge.a].push({to:edge.b,length:edge.length});adjacency[edge.b].push({to:edge.a,length:edge.length});}
export const ROAD_NODES:Point[]=graphPoints.map(p=>({...p}));
export const CITY_JUNCTIONS:readonly CityJunction[]=graphPoints.flatMap((p,id)=>{
  const incident=graphEdges.filter(edge=>edge.a===id||edge.b===id),streets=[...new Map(incident.map(edge=>[edge.street.id,edge.street])).values()];
  if(adjacency[id].length===2&&streets.length===1)return[];
  return[{...p,id:`junction-${id}`,streetIds:streets.map(road=>road.id),degree:adjacency[id].length,radius:Math.max(...streets.map(road=>road.width/2))}];
});

function projection(p:Point,a:Point,b:Point){
  const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));
  const projected=interpolate(a,b,t);return{point:projected,t,distance:distance(p,projected)};
}
export function nearestStreet(p:Point):CityStreetProjection|null {
  if(!Number.isFinite(p.x)||!Number.isFinite(p.z))return null;
  let best:CityStreetProjection|null=null;
  for(const segment of segments){
    const candidate=projection(p,segment.a,segment.b);
    if(!best||candidate.distance<best.distance)best={...candidate,street:segment.street,segment:segment.index,heading:Math.atan2(segment.b.x-segment.a.x,-(segment.b.z-segment.a.z))};
  }
  return best;
}
interface Entrance {point:Point;edge:GraphEdge;distance:number}
function entrances(p:Point):Entrance[]{
  const candidates:Entrance[]=[];let nearest=Infinity;
  for(const edge of graphEdges){
    const candidate=projection(p,graphPoints[edge.a],graphPoints[edge.b]);
    if(candidate.distance>nearest+EPS||!clearCitySegment(p,candidate.point,.05))continue;
    if(candidate.distance<nearest-EPS){nearest=candidate.distance;candidates.length=0;}
    candidates.push({point:candidate.point,edge,distance:candidate.distance});
  }
  return candidates;
}
function simplify(points:Point[]):Point[]{
  const result:Point[]=[];
  for(const p of points){
    if(result.length&&distance(result[result.length-1],p)<EPS)continue;
    while(result.length>=2){
      const a=result[result.length-2],b=result[result.length-1],ab=subtract(b,a),bc=subtract(p,b);
      if(Math.abs(cross(ab,bc))>EPS||ab.x*bc.x+ab.z*bc.z<0)break;
      result.pop();
    }
    result.push({...p});
  }
  return result;
}
/** A small binary heap keeps routing proportional to the cached graph's edges. */
class RouteQueue {
  private values:{id:number;cost:number}[]=[];
  private before(a:{id:number;cost:number},b:{id:number;cost:number}){return a.cost<b.cost||(a.cost===b.cost&&a.id<b.id);}
  push(id:number,cost:number){
    const item={id,cost};let at=this.values.length;this.values.push(item);
    while(at>0){const parent=(at-1)>>1;if(!this.before(item,this.values[parent]))break;this.values[at]=this.values[parent];at=parent;}this.values[at]=item;
  }
  pop(){
    const first=this.values[0],last=this.values.pop();if(!this.values.length||!last)return first;
    let at=0;
    while(at*2+1<this.values.length){let child=at*2+1;if(child+1<this.values.length&&this.before(this.values[child+1],this.values[child]))child++;
      if(!this.before(this.values[child],last))break;this.values[at]=this.values[child];at=child;}
    this.values[at]=last;return first;
  }
}
/** Cached street adjacency serves GPS, patrols and pursuit without a second map. */
export function routeStreets(from:Point,to:Point):Point[]{
  if(!Number.isFinite(from.x+from.z+to.x+to.z))return[];
  if(distance(from,to)<EPS)return[{x:from.x,z:from.z}];
  const starts=entrances(from),goals=entrances(to);if(!starts.length||!goals.length)return[];
  let best:Point[]=[],bestLength=Infinity;
  for(const start of starts){
    const distances=graphPoints.map(()=>Infinity),previous=graphPoints.map(()=>-1),visited=new Uint8Array(graphPoints.length),queue=new RouteQueue();
    distances[start.edge.a]=start.distance+distance(start.point,graphPoints[start.edge.a]);
    distances[start.edge.b]=start.distance+distance(start.point,graphPoints[start.edge.b]);
    queue.push(start.edge.a,distances[start.edge.a]);queue.push(start.edge.b,distances[start.edge.b]);
    for(let item=queue.pop();item;item=queue.pop()){
      const current=item.id;if(visited[current])continue;visited[current]=1;
      for(const edge of adjacency[current]){
        const cost=distances[current]+edge.length;
        if(cost<distances[edge.to]-EPS){distances[edge.to]=cost;previous[edge.to]=current;queue.push(edge.to,cost);}
      }
    }
    for(const goal of goals){
      if(start.edge===goal.edge){
        const cost=start.distance+distance(start.point,goal.point)+goal.distance;
        if(cost<bestLength){bestLength=cost;best=simplify([from,start.point,goal.point,to]);}
      }
      for(const end of [goal.edge.a,goal.edge.b]){
        const cost=distances[end]+distance(graphPoints[end],goal.point)+goal.distance;
        if(cost>=bestLength-EPS)continue;
        const middle:Point[]=[];let current=end;
        while(current>=0){middle.unshift(graphPoints[current]);current=previous[current];}
        bestLength=cost;best=simplify([from,start.point,...middle,goal.point,to]);
      }
    }
  }
  if(best.length){best[0]={x:from.x,z:from.z};best[best.length-1]={x:to.x,z:to.z};}
  return best;
}

/** The first two loops retain the original eight cars' deterministic clocks. */
export const CITY_TRAFFIC_LOOPS:readonly (readonly Point[])[]=[
  anchors([[-80,-80],[80,-80],[80,80],[-80,80]]),
  anchors([[-40,-40],[-40,40],[40,40],[40,-40]]),
  westRing,northRing,southRing,
];

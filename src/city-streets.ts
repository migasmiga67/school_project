import * as THREE from 'three';
import { CITY_JUNCTIONS, CITY_SPACES, CITY_STREETS, type CityStreet } from './city-map';
import { WORLD_BOUNDS, type Point } from './model';
import { CityArt, pathLength, polygon, ribbon, samplePath } from './city-art';
import type { SurfaceLibrary } from './surface-materials';

/** Road geometry, markings and public spaces all consume the simulation's street map. */
export class CityStreetsView {
  readonly art:CityArt;
  get group(){return this.art.group;}
  constructor(software:boolean,surfaces:SurfaceLibrary){
    const art=this.art=new CityArt(software,surfaces);art.group.name='city-streets';
    art.box(915,.55,1600,surfaces.grass,-342.5,-.8,0);
    art.box(WORLD_BOUNDS.maxX-WORLD_BOUNDS.minX+16,.4,WORLD_BOUNDS.maxZ-WORLD_BOUNDS.minZ+16,art.material(0x818b70),(WORLD_BOUNDS.minX+WORLD_BOUNDS.maxX)/2,-.28,0);
    this.spaces();
    for(const street of CITY_STREETS)this.street(street);
    this.junctions();art.finish();
  }
  private street(street:CityStreet){
    const art=this.art,{surfaces}=art,length=pathLength(street.points),alley=street.kind==='alley'||street.kind==='service';
    const roadPoints=densePath(street.points);
    art.worldMesh(ribbon(roadPoints,street.width,.078),surfaces.asphalt);
    // Broad paved shoulders and narrow curbs follow bends instead of forming square blocks.
    if(street.sidewalkWidth>0)for(const side of[-1,1]){
      art.worldMesh(ribbon(roadPoints,street.sidewalkWidth,.063,side*(street.width+street.sidewalkWidth)/2),surfaces.pavers);
      for(let distance=1;distance<length;distance+=4){
        const start=samplePath(street.points,distance),end=samplePath(street.points,Math.min(length,distance+4.05));
        if(CITY_JUNCTIONS.some(j=>Math.hypot(start.x-j.x,start.z-j.z)<j.radius+2))continue;
        art.worldMesh(ribbon([start,end],.2,.135,side*(street.width/2+.1)),surfaces.concrete);
      }
    }
    if(!alley){
      const marking=art.material(street.kind==='boulevard'?0xd6be7e:0xd3c9a7),edge=art.material(0xd8d8c7);
      for(let distance=3;distance<length-2;distance+=7){
        const point=samplePath(street.points,distance);
        if(CITY_JUNCTIONS.some(j=>Math.hypot(point.x-j.x,point.z-j.z)<j.radius+5))continue;
        const angle=Math.atan2(point.dx,point.dz);
        if(street.width>9)for(const side of[-1,1])art.instance('box',marking,point.x-point.dz*side*.19,.091,point.z+point.dx*side*.19,.11,.012,3.1,angle);
        else art.instance('box',marking,point.x,.091,point.z,.12,.012,2.8,angle);
        if(street.kind==='boulevard')for(const side of[-1,1])art.instance('box',edge,point.x-point.dz*side*(street.width/2-.6),.09,point.z+point.dx*side*(street.width/2-.6),.11,.012,5.4,angle);
      }
    }
    if(length>22){
      const point=samplePath(street.points,Math.min(length/2,18)),offset=street.width/2+street.sidewalkWidth*.7,angle=Math.atan2(point.dx,point.dz);
      const x=point.x-point.dz*offset,z=point.z+point.dx*offset;
      art.instance('cylinder',art.material(0x53645e),x,1.6,z,.09,3.2,.09);
      art.sign(street.name.toUpperCase(),x,3.15,z,5.8,.72,angle,'#e0ead3','#31564d');
    }
    // A low circular apron makes the end of a residential cul-de-sac legible.
    if(street.kind==='residential'&&!street.closed){
      const end=street.points[street.points.length-1];
      const deadEnd=!CITY_JUNCTIONS.some(j=>Math.hypot(end.x-j.x,end.z-j.z)<2&&j.degree>1);
      if(deadEnd){const apron=art.mesh(new THREE.CircleGeometry(street.width*.66,20),surfaces.asphalt,end.x,.079,end.z);apron.rotation.x=-Math.PI/2;}
    }
  }
  private junctions(){
    const art=this.art,metal=art.material(0x36474a),black=art.material(0x203036),white=art.material(0xe4ded0),red=art.material(0xe46459,0x902c22),green=art.material(0x9dc89d,0x284d30);
    for(const junction of CITY_JUNCTIONS){
      if(junction.degree<3)continue;
      const streets=junction.streetIds.map(id=>CITY_STREETS.find(street=>street.id===id)).filter((street):street is CityStreet=>Boolean(street));
      const major=streets.find(street=>street.kind==='boulevard'||street.kind==='avenue');if(!major)continue;
      // Crosswalks sit on the actual approach tangent, including oblique intersections.
      const approaches:Point[]=[];
      for(const street of streets){
        let nearest=0,distance=Infinity;street.points.forEach((point,index)=>{const next=Math.hypot(point.x-junction.x,point.z-junction.z);if(next<distance){distance=next;nearest=index;}});
        for(const index of[nearest-2,nearest+2]){
          const point=street.points[Math.max(0,Math.min(street.points.length-1,index))],dx=point.x-junction.x,dz=point.z-junction.z,length=Math.hypot(dx,dz);if(length<2)continue;
          const direction={x:dx/length,z:dz/length};if(approaches.some(other=>other.x*direction.x+other.z*direction.z>.9))continue;approaches.push(direction);
          const reach=Math.max(junction.radius+1.9,street.width*.62+1.2),angle=Math.atan2(direction.x,direction.z);
          for(let across=-street.width/2+1;across<street.width/2-.4;across+=1.45)art.instance('box',white,junction.x+direction.x*reach-direction.z*across,.095,junction.z+direction.z*reach+direction.x*across,.72,.014,2.6,angle);
          if(approaches.length>2)continue;
          const side=street.width/2+1.05,x=junction.x+direction.x*(reach+2)-direction.z*side,z=junction.z+direction.z*(reach+2)+direction.x*side;
          art.instance('cylinder',metal,x,2.75,z,.16,5.5,.16);
          art.instance('box',black,x,4.9,z,.48,1.28,.38,angle);
          art.instance('sphere',approaches.length%2?red:green,x+direction.x*.23,5.18,z+direction.z*.23,.23,.23,.23);
          art.instance('sphere',art.material(0x927b3b),x+direction.x*.23,4.86,z+direction.z*.23,.22,.22,.22);
          art.instance('sphere',approaches.length%2?art.material(0x52775b):red,x+direction.x*.23,4.55,z+direction.z*.23,.22,.22,.22);
        }
      }
    }
  }
  private spaces(){
    const art=this.art,{surfaces}=art,white=art.material(0xd5d0bc),metal=art.material(0x52666a);
    for(const space of CITY_SPACES){
      const surface=space.kind==='park'?surfaces.grass:space.kind==='plaza'?surfaces.pavers:surfaces.asphalt;
      art.worldMesh(polygon(space.points,.045),surface);
      const minX=Math.min(...space.points.map(p=>p.x)),maxX=Math.max(...space.points.map(p=>p.x)),minZ=Math.min(...space.points.map(p=>p.z)),maxZ=Math.max(...space.points.map(p=>p.z));
      if(space.kind==='parking'||space.kind==='loading'){
        const z=minZ+5;
        for(let x=minX+2;x<maxX-2;x+=2.8)if(inPolygon({x,z},space.points)&&inPolygon({x,z:z-3},space.points)){
          art.instance('box',white,x,.062,z,.1,.013,5.1);
          art.instance('box',art.material(0xaaa58c),x+1.35,.16,z-1.85,1.7,.2,.22);
        }
        if(maxZ-minZ>13)for(let x=minX+2;x<maxX-2;x+=3)if(inPolygon({x,z:maxZ-4},space.points))art.instance('box',white,x,.062,maxZ-4,.1,.013,4.7);
        art.instance('box',metal,minX+1.6,1,minZ+1.5,.65,1.9,.6);
        art.sign(space.kind==='parking'?'P  PARKING':'LOADING ONLY',minX+1.6,2.35,minZ+1.84,3,.9,0,'#e2e9d5',space.kind==='parking'?'#315879':'#765e38');
      }
      if(space.kind==='plaza'){
        // A clear central axis makes plazas useful pedestrian shortcuts.
        const x=(minX+maxX)/2,z=(minZ+maxZ)/2;
        art.box(Math.max(2,maxX-minX-2),.018,1.3,white,x,.069,z);
        for(const side of[-1,1])art.instance('cylinder',metal,minX+2,.55,z+side*2,.23,1.05,.23);
      }
    }
  }
  destroy(){this.art.destroy();}
}
function inPolygon(point:Point,points:readonly Point[]){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a.z>point.z)!==(b.z>point.z)&&point.x<(b.x-a.x)*(point.z-a.z)/(b.z-a.z)+a.x)inside=!inside;}return inside;}

function densePath(points:readonly Point[]){const result:Point[]=[];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/8));for(let step=0;step<steps;step++)result.push({x:a.x+(b.x-a.x)*step/steps,z:a.z+(b.z-a.z)*step/steps});}result.push({...points[points.length-1]});return result;}

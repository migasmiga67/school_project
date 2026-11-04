import * as THREE from 'three';
import { CITY_JUNCTIONS, CITY_SPACES, CITY_STREETS, type CityStreet } from './city-map';
import { WORLD_BOUNDS, type Point } from './model';
import { CityArt, pathLength, polygon, ribbon, samplePath } from './city-art';
import type { SurfaceLibrary } from './surface-materials';
import { CITY_BENCH_PLACEMENTS,CITY_PLACEMENT_CONTEXT,CITY_STREET_SIGN_PLACEMENTS,canPlaceDecoration,type DecorationFootprint } from './city-placement';
import { TRAFFIC_SIGNALS,signalAt } from './traffic-signals';

/** Road geometry, markings and public spaces all consume the simulation's street map. */
export class CityStreetsView {
  readonly art:CityArt;
  private readonly signalMaterial=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false});
  private readonly signalMeshes:{mesh:THREE.InstancedMesh;heads:{id:string;heading:number;index:number;lastPhase:string}[]}[]=[];
  private readonly placed:DecorationFootprint[]=[...CITY_BENCH_PLACEMENTS,...CITY_STREET_SIGN_PLACEMENTS];
  get group(){return this.art.group;}
  constructor(software:boolean,surfaces:SurfaceLibrary){
    const art=this.art=new CityArt(software,surfaces);art.group.name='city-streets';
    art.box(915,.55,1600,surfaces.grass,-342.5,-.8,0);
    art.box(WORLD_BOUNDS.maxX-WORLD_BOUNDS.minX+16,.4,WORLD_BOUNDS.maxZ-WORLD_BOUNDS.minZ+16,art.material(0x818b70),(WORLD_BOUNDS.minX+WORLD_BOUNDS.maxX)/2,-.28,0);
    this.spaces();
    for(const street of CITY_STREETS)this.street(street);
    this.junctions();art.finish();this.updateSignals(0);
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
    const sign=CITY_STREET_SIGN_PLACEMENTS.find(placement=>placement.streetId===street.id);
    if(sign){
      const {x,z,rotation=0}=sign;
      art.instance('cylinder',art.material(0x53645e),x,1.6,z,.09,3.2,.09);
      art.sign(street.name.toUpperCase(),x,3.15,z,5.8,.72,rotation,'#e0ead3','#31564d');
    }
    this.surfaceDetails(street);
    // A low circular apron makes the end of a residential cul-de-sac legible.
    if(street.kind==='residential'&&!street.closed){
      const end=street.points[street.points.length-1];
      const deadEnd=!CITY_JUNCTIONS.some(j=>Math.hypot(end.x-j.x,end.z-j.z)<2&&j.degree>1);
      if(deadEnd){const apron=art.mesh(new THREE.CircleGeometry(street.width*.66,20),surfaces.asphalt,end.x,.079,end.z);apron.rotation.x=-Math.PI/2;}
    }
  }
  private junctions(){
    const art=this.art,metal=art.material(0x36474a),black=art.material(0x203036),white=art.material(0xe4ded0);
    const bulbs=new Map<string,{x:number;y:number;z:number;id:string;heading:number}[]>();
    for(const signal of TRAFFIC_SIGNALS){
      const junction=signal.junction;
      const streets=junction.streetIds.map(id=>CITY_STREETS.find(street=>street.id===id)).filter((street):street is CityStreet=>Boolean(street));
      const approaches:Point[]=[];
      for(const street of streets){
        let nearest=0,distance=Infinity;street.points.forEach((point,index)=>{const next=Math.hypot(point.x-junction.x,point.z-junction.z);if(next<distance){distance=next;nearest=index;}});
        for(const index of[nearest-2,nearest+2]){
          const point=street.points[Math.max(0,Math.min(street.points.length-1,index))],dx=point.x-junction.x,dz=point.z-junction.z,length=Math.hypot(dx,dz);if(length<2)continue;
          const direction={x:dx/length,z:dz/length};if(approaches.some(other=>other.x*direction.x+other.z*direction.z>.9))continue;approaches.push(direction);
          const reach=Math.max(junction.radius+1.9,street.width*.62+1.2),angle=Math.atan2(direction.x,direction.z);
          for(let across=-street.width/2+1;across<street.width/2-.4;across+=1.45)art.instance('box',white,junction.x+direction.x*reach-direction.z*across,.095,junction.z+direction.z*reach+direction.x*across,.72,.014,2.6,angle);
          const side=street.width/2+Math.max(1.05,street.sidewalkWidth*.52+.8);
          let pole:DecorationFootprint|null=null;
          for(const shift of[0,1.2,2.4]){
            const candidate={x:junction.x+direction.x*(reach+2+shift)-direction.z*side,z:junction.z+direction.z*(reach+2+shift)+direction.x*side,width:.54,depth:.46,rotation:angle};
            if(canPlaceDecoration(candidate,{...CITY_PLACEMENT_CONTEXT,occupied:this.placed},{walkingPadding:.45})){pole=candidate;break;}
          }
          if(!pole)continue;this.placed.push(pole);
          const {x,z}=pole;
          art.instance('cylinder',metal,x,2.75,z,.16,5.5,.16);
          art.instance('box',black,x,4.9,z,.48,1.28,.38,angle);
          art.instance('box',metal,x,.2,z,.38,.3,.38,angle);
          const key=`${Math.floor(x/64)},${Math.floor(z/64)}`;let sector=bulbs.get(key);if(!sector){sector=[];bulbs.set(key,sector);}
          sector.push({x:x+direction.x*.23,y:5.18,z:z+direction.z*.23,id:signal.id,heading:Math.atan2(-direction.x,direction.z)});
        }
      }
    }
    const geometry=new THREE.SphereGeometry(.5,art.software?6:8,art.software?4:6),dummy=new THREE.Object3D();
    for(const sector of bulbs.values()){
      const mesh=new THREE.InstancedMesh(geometry,this.signalMaterial,sector.length*3),heads:{id:string;heading:number;index:number;lastPhase:string}[]=[];
      sector.forEach((point,index)=>{
        for(let bulb=0;bulb<3;bulb++){dummy.position.set(point.x,point.y-bulb*.31,point.z);dummy.scale.setScalar(.24);dummy.updateMatrix();mesh.setMatrixAt(index*3+bulb,dummy.matrix);}
        heads.push({id:point.id,heading:point.heading,index:index*3,lastPhase:''});
      });mesh.computeBoundingSphere();art.group.add(mesh);this.signalMeshes.push({mesh,heads});
    }
  }
  /** Uses the host city clock also consumed by vehicles and pedestrian crossings. */
  updateSignals(seconds:number){
    const colors={red:[0xf36b5b,0x4a302c],amber:[0xffd779,0x53452c],green:[0x8ae0bb,0x2c4941]}as const,color=new THREE.Color();
    for(const {mesh,heads}of this.signalMeshes){let changed=false;for(const head of heads){
      const phase=signalAt(head.id,seconds,head.heading).phase;if(phase===head.lastPhase)continue;head.lastPhase=phase;changed=true;
      (['red','amber','green']as const).forEach((bulb,index)=>mesh.setColorAt(head.index+index,color.setHex(colors[bulb][phase===bulb?0:1])));
    }if(changed&&mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
  }
  private surfaceDetails(street:CityStreet){
    const art=this.art,iron=art.material(0x475956),length=pathLength(street.points);
    for(let distance=19,index=0;distance<length-6;distance+=37,index++){
      const point=samplePath(street.points,distance);if(CITY_JUNCTIONS.some(junction=>Math.hypot(point.x-junction.x,point.z-junction.z)<junction.radius+5))continue;
      const side=index%2?1:-1,x=point.x-point.dz*side*(street.width/2-.35),z=point.z+point.dx*side*(street.width/2-.35),angle=Math.atan2(point.dx,point.dz);
      // Flush drains and manholes are part of the driving surface, with no raised obstacle.
      art.instance('box',iron,x,.088,z,.42,.012,.8,angle);
      if(!art.software)for(let slat=0;slat<4;slat++)art.instance('box',art.material(0x85918a),x+point.dx*(slat-.5)*.12,.096,z+point.dz*(slat-.5)*.12,.36,.008,.028,angle);
      if(index%3===0)art.instance('cylinder',iron,point.x,.091,point.z,.75,.016,.75);
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
          if(this.reserve({x:x+1.35,z:z-1.85,width:1.7,depth:.22}))art.instance('box',art.material(0xaaa58c),x+1.35,.16,z-1.85,1.7,.2,.22);
        }
        if(maxZ-minZ>13)for(let x=minX+2;x<maxX-2;x+=3)if(inPolygon({x,z:maxZ-4},space.points))art.instance('box',white,x,.062,maxZ-4,.1,.013,4.7);
        if(this.reserve({x:minX+1.6,z:minZ+1.7,width:3,depth:.7})){art.instance('box',metal,minX+1.6,1,minZ+1.5,.65,1.9,.6);art.sign(space.kind==='parking'?'P  PARKING':'LOADING ONLY',minX+1.6,2.35,minZ+1.84,3,.9,0,'#e2e9d5',space.kind==='parking'?'#315879':'#765e38');}
      }
      if(space.kind==='plaza'){
        // A clear central axis makes plazas useful pedestrian shortcuts.
        const x=(minX+maxX)/2,z=(minZ+maxZ)/2;
        art.box(Math.max(2,maxX-minX-2),.018,1.3,white,x,.069,z);
        for(const side of[-1,1])if(this.reserve({x:minX+2,z:z+side*2,width:.3,depth:.3}))art.instance('cylinder',metal,minX+2,.55,z+side*2,.23,1.05,.23);
      }
    }
  }
  private reserve(footprint:DecorationFootprint){if(!canPlaceDecoration(footprint,{...CITY_PLACEMENT_CONTEXT,occupied:this.placed},{walkingPadding:.45}))return false;this.placed.push(footprint);return true;}
  destroy(){for(const {mesh}of this.signalMeshes)mesh.dispose();this.art.destroy();}
}
function inPolygon(point:Point,points:readonly Point[]){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a.z>point.z)!==(b.z>point.z)&&point.x<(b.x-a.x)*(point.z-a.z)/(b.z-a.z)+a.x)inside=!inside;}return inside;}

function densePath(points:readonly Point[]){const result:Point[]=[];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/8));for(let step=0;step<steps;step++)result.push({x:a.x+(b.x-a.x)*step/steps,z:a.z+(b.z-a.z)*step/steps});}result.push({...points[points.length-1]});return result;}

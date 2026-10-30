import * as THREE from 'three';
import type { Point } from './model';
import { ROAD_NODES } from './model';

export interface CityEvent { id:string; title:string; target:Point; reward:number; expiresAt:number }
export interface CityEnvironment {
  hour:number; clock:string; daylight:number; rain:number; sky:number; fog:number; sunColor:number;
  period:'ŚWIT'|'DZIEŃ'|'ZACHÓD SŁOŃCA'|'NOC'; weather:'BEZCHMURNIE'|'DESZCZ';
}
const clamp=(n:number,min=0,max=1)=>Math.min(max,Math.max(min,n));
const time=(seconds:number)=>Number.isFinite(seconds)?Math.max(0,seconds):0;
const mix=(a:number,b:number,t:number)=>{
  const r=Math.round((a>>16&255)*(1-t)+(b>>16&255)*t),g=Math.round((a>>8&255)*(1-t)+(b>>8&255)*t),bl=Math.round((a&255)*(1-t)+(b&255)*t);
  return r<<16|g<<8|bl;
};

/** One day lasts twelve minutes; room members use the same elapsed host time. */
export function getCityEnvironment(seconds:number):CityEnvironment {
  const elapsed=time(seconds),hour=(18.7+elapsed/30)%24;
  const daylight=hour>=6&&hour<=20?Math.max(0,Math.sin((hour-6)/14*Math.PI)):0;
  const wet=elapsed%360-180,rain=wet<0?0:clamp(Math.min(wet/15,(180-wet)/15));
  const period=hour<5||hour>=20?'NOC':hour<7?'ŚWIT':hour<17?'DZIEŃ':'ZACHÓD SŁOŃCA';
  const sunset=period==='ŚWIT'||period==='ZACHÓD SŁOŃCA';
  const sky=mix(0x101c35,sunset?0xbb8d9d:0x7199b5,daylight);
  const fog=mix(0x142139,sunset?0xd5aeb1:0xa9c6d2,Math.max(.12,daylight));
  const minutes=Math.floor(hour*60+1e-7);
  return {hour,clock:`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`,daylight,rain,sky:mix(sky,0x41586a,rain*.45),fog:mix(fog,0x596b78,rain*.5),sunColor:sunset?0xffcea0:0xd5e7ff,period,weather:rain>.01?'DESZCZ':'BEZCHMURNIE'};
}

const EVENTS=[
  {kind:'package',title:'Zgubiona przesyłka',target:{x:-40,z:40},reward:150},
  {kind:'roadside',title:'Pomoc na poboczu',target:{x:80,z:0},reward:180},
  {kind:'courier',title:'Pilna dostawa kurierska',target:{x:40,z:-40},reward:200},
] as const;

/** Forty-second opportunity, then eighty seconds between events. No wall clock. */
export function cityEventAt(seconds:number):CityEvent|null {
  const elapsed=time(seconds),cycle=Math.floor(elapsed/120);
  if(elapsed-cycle*120>=40)return null;
  const event=EVENTS[cycle%EVENTS.length];
  return {id:`city-${cycle}-${event.kind}`,title:event.title,target:{...event.target},reward:event.reward,expiresAt:cycle*120+40};
}

const BLOCKS=[{x:-20,z:-20},{x:20,z:-20},{x:-60,z:20},{x:60,z:60},{x:-180,z:-20},{x:-140,z:60},{x:20,z:-180},{x:-60,z:-140},{x:-140,z:140},{x:20,z:180}];
export const PEDESTRIAN_COUNT=BLOCKS.length*4;
export function pedestrianPose(index:number,seconds:number):Point&{heading:number} {
  const block=BLOCKS[((Math.floor(index/4)%BLOCKS.length)+BLOCKS.length)%BLOCKS.length],half=13.5;
  const route=[{x:block.x-half,z:block.z-half},{x:block.x+half,z:block.z-half},{x:block.x+half,z:block.z+half},{x:block.x-half,z:block.z+half}];
  const progress=((index*17+time(seconds)*(.85+index%4*.12))%108+108)%108;
  const side=Math.floor(progress/27),from=route[side],to=route[(side+1)%4],part=(progress-side*27)/27;
  return {x:from.x+(to.x-from.x)*part,z:from.z+(to.z-from.z)*part,heading:Math.atan2(to.x-from.x,-(to.z-from.z))};
}

/** Decorative city life adds no colliders, wallets or client-owned rewards. */
export class CityLife {
  readonly group=new THREE.Group();
  private readonly geometry=new THREE.BoxGeometry(1,1,1);
  private readonly people:THREE.InstancedMesh[]=[];
  private readonly peopleColors:THREE.Color[][]=[[],[],[],[]];
  private readonly visiblePeople:number[]=[];
  private readonly rainMesh:THREE.InstancedMesh;
  private readonly rainMaterial=new THREE.MeshBasicMaterial({color:0xc2e7ff,transparent:true,opacity:.5,depthWrite:false});
  private readonly lampMaterial=new THREE.MeshBasicMaterial({color:0xffe1a0});
  private readonly puddleMaterial=new THREE.MeshBasicMaterial({color:0x8cd4dc,transparent:true,opacity:0,depthWrite:false});
  private readonly neonMaterial=new THREE.MeshBasicMaterial({color:0x80e6de,transparent:true,opacity:1});
  private readonly eventGroup=new THREE.Group();
  private readonly lamps=new THREE.Group();
  private readonly reflections=new THREE.Group();
  private readonly eventRing:THREE.Mesh;
  private readonly dummy=new THREE.Object3D();
  private readonly part=new THREE.Object3D();
  private readonly matrix=new THREE.Matrix4();
  private lastEventId='';
  private current={pedestrians:PEDESTRIAN_COUNT,rainDrops:0,rain:0,daylight:1,weather:'BEZCHMURNIE' as CityEnvironment['weather'],eventId:null as string|null,period:'ZACHÓD SŁOŃCA' as CityEnvironment['period']};

  constructor(private readonly software:boolean) {
    this.group.name='city-life';
    const material=new THREE.MeshLambertMaterial({color:0xffffff});
    const head=new THREE.SphereGeometry(.5,software?6:8,software?4:6),torso=new THREE.CapsuleGeometry(.5,.4,software?2:3,software?6:8).scale(1,1/1.4,1),limb=new THREE.CapsuleGeometry(.5,.55,software?2:3,6).scale(1,1/1.55,1);
    for(const [count,geometry] of [[PEDESTRIAN_COUNT,head],[PEDESTRIAN_COUNT,torso],[PEDESTRIAN_COUNT*2,limb],[PEDESTRIAN_COUNT*2,limb]] as const){
      const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;
      this.people.push(mesh);this.group.add(mesh);
    }
    const shirts=[0x679ca8,0xb67c77,0x8b80ae,0xc4a76b,0x67a68d,0x526b88];
    const setColor=(part:number,index:number,color:number)=>{const value=new THREE.Color(color);this.peopleColors[part][index]=value;this.people[part].setColorAt(index,value);};
    for(let i=0;i<PEDESTRIAN_COUNT;i++){
      setColor(0,i,[0xd4a37d,0x9c6f54,0xc28e6c,0x6c4938][i%4]);
      setColor(1,i,shirts[i%shirts.length]);
      for(let side=0;side<2;side++){
        setColor(2,i*2+side,shirts[i%shirts.length]);
        setColor(3,i*2+side,i%3?0x25394d:0x625b58);
      }
    }
    this.rainMesh=new THREE.InstancedMesh(this.geometry,this.rainMaterial,software?128:480);
    this.rainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.rainMesh.frustumCulled=false;this.group.add(this.rainMesh);
    this.streetLights();this.garage();
    this.eventRing=new THREE.Mesh(new THREE.TorusGeometry(2.9,.1,4,32),new THREE.MeshBasicMaterial({color:0x84dbff}));
    this.eventRing.rotation.x=-Math.PI/2;this.eventRing.position.y=.15;this.eventGroup.add(this.eventRing);
    this.box(this.eventGroup,.8,.8,.8,new THREE.MeshLambertMaterial({color:0xd2aa68}),0,.45,0);
    this.group.add(this.eventGroup,this.lamps,this.reflections);
  }

  get snapshot(){return {...this.current};}
  private box(parent:THREE.Object3D,w:number,h:number,d:number,material:THREE.Material,x=0,y=0,z=0){
    const mesh=new THREE.Mesh(this.geometry,material);mesh.scale.set(w,h,d);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
  }
  private streetLights(){
    const postMaterial=new THREE.MeshLambertMaterial({color:0x334a54});
    const posts=new THREE.InstancedMesh(this.geometry,postMaterial,ROAD_NODES.length),bulbs=new THREE.InstancedMesh(this.geometry,this.lampMaterial,ROAD_NODES.length);
    let index=0;
    for(const {x,z} of ROAD_NODES){
      this.dummy.position.set(x+6.6,2.45,z+6.6);this.dummy.rotation.set(0,0,0);this.dummy.scale.set(.15,4.8,.15);this.dummy.updateMatrix();posts.setMatrixAt(index,this.dummy.matrix);
      this.dummy.position.y=4.9;this.dummy.scale.set(.65,.18,.65);this.dummy.updateMatrix();bulbs.setMatrixAt(index,this.dummy.matrix);index++;
    }
    this.group.add(posts);this.lamps.add(bulbs);
    const puddles=new THREE.InstancedMesh(this.geometry,this.puddleMaterial,Math.floor(ROAD_NODES.length/2));
    for(let i=0;i<puddles.count;i++){
      const point=ROAD_NODES[i*2];this.dummy.position.set(point.x,.085,point.z+12);this.dummy.scale.set(2.8,.006,6);this.dummy.updateMatrix();puddles.setMatrixAt(i,this.dummy.matrix);
    }
    this.reflections.add(puddles);
  }
  private garage(){
    const facade=new THREE.Group();facade.position.set(-20,0,72.4);facade.name='mod-shop';
    const dark=new THREE.MeshLambertMaterial({color:0x20313e}),metal=new THREE.MeshLambertMaterial({color:0x53646b});
    this.box(facade,9,4,.2,dark,0,2,0);this.box(facade,7,3.4,.25,metal,0,1.8,.17);
    const stripes=new THREE.InstancedMesh(this.geometry,dark,8);
    for(let i=0;i<8;i++){this.dummy.position.set(0,.35+i*.4,.32);this.dummy.scale.set(7,.045,.02);this.dummy.rotation.set(0,0,0);this.dummy.updateMatrix();stripes.setMatrixAt(i,this.dummy.matrix);}facade.add(stripes);
    this.box(facade,15,.35,2.6,dark,0,4.25,.8);
    this.box(facade,.12,4,.12,this.neonMaterial,-7,2.5,.4);this.box(facade,.12,4,.12,this.neonMaterial,7,2.5,.4);
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=192;
    const context=canvas.getContext('2d')!;context.fillStyle='#14232c';context.fillRect(0,0,768,192);
    context.strokeStyle='#83e9dc';context.lineWidth=6;context.strokeRect(6,6,756,180);
    context.fillStyle='#b5f4e6';context.textAlign='center';context.font='bold 86px Arial';context.fillText('MOD SHOP',384,106);
    context.fillStyle='#d9c9a0';context.font='22px Arial';context.fillText('TUNING  ·  LAKIER  ·  NOWE AUTA',384,154);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(15,3.75),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));sign.position.set(0,6.2,.2);facade.add(sign);
    const entrance=new THREE.Mesh(new THREE.TorusGeometry(1.8,.07,4,32),this.neonMaterial);entrance.rotation.x=-Math.PI/2;entrance.position.set(0,.12,1.6);facade.add(entrance);
    this.group.add(facade);
  }
  private personPart(mesh:number,index:number,x:number,y:number,z:number,w:number,h:number,d:number,swing=0){
    this.part.position.set(x,y,z);this.part.rotation.set(swing,0,0);this.part.scale.set(w,h,d);this.part.updateMatrix();
    this.matrix.multiplyMatrices(this.dummy.matrix,this.part.matrix);this.people[mesh].setMatrixAt(index,this.matrix);
  }
  update(seconds:number,player:Point,indoors:boolean,_dt:number):{period:CityEnvironment['period'];weather:CityEnvironment['weather'];event?:CityEvent}{
    const elapsed=time(seconds),environment=getCityEnvironment(elapsed),event=cityEventAt(elapsed);
    this.group.visible=!indoors;
    this.current={pedestrians:PEDESTRIAN_COUNT,rainDrops:environment.rain>.01?this.rainMesh.count:0,rain:environment.rain,daylight:environment.daylight,weather:environment.weather,eventId:event?.id??null,period:environment.period};
    if(!indoors){
      let visible=0,colorsChanged=false;
      for(let i=0;i<PEDESTRIAN_COUNT;i++){
        const pose=pedestrianPose(i,elapsed),stride=Math.sin(elapsed*5+i)*.38;
        // The full city population keeps its route; software WebGL draws nearby people.
        if(this.software&&(pose.x-player.x)**2+(pose.z-player.z)**2>10000)continue;
        const index=visible++;
        if(this.software&&this.visiblePeople[index]!==i){
          this.visiblePeople[index]=i;colorsChanged=true;
          for(let mesh=0;mesh<this.people.length;mesh++){
            const parts=mesh<2?1:2;
            for(let part=0;part<parts;part++)this.people[mesh].setColorAt(index*parts+part,this.peopleColors[mesh][i*parts+part]);
          }
        }
        this.dummy.position.set(pose.x,.05,pose.z);this.dummy.rotation.set(0,-pose.heading,0);this.dummy.scale.set(1,1,1);this.dummy.updateMatrix();
        this.personPart(0,index,0,1.6,0,.4,.42,.4);this.personPart(1,index,0,1.09,0,.52,.7,.34);
        for(let side=0;side<2;side++){
          const sign=side?1:-1;this.personPart(2,index*2+side,sign*.36,1.1,0,.17,.64,.22,stride*sign);
          this.personPart(3,index*2+side,sign*.15,.4,0,.2,.8,.26,-stride*sign);
        }
      }
      this.visiblePeople.length=visible;
      for(let index=0;index<this.people.length;index++){
        const mesh=this.people[index];mesh.count=visible*(index<2?1:2);mesh.instanceMatrix.needsUpdate=true;
        if(colorsChanged&&mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
      }
      this.rainMesh.visible=environment.rain>.01;this.rainMaterial.opacity=.25+environment.rain*.32;
      if(this.rainMesh.visible)for(let i=0;i<this.rainMesh.count;i++){
        const x=((i*17.31)%52)-26,z=((i*23.71)%52)-26,y=((i*7.3-elapsed*18)%25+25)%25;
        this.dummy.position.set(player.x+x,1+y,player.z+z);this.dummy.rotation.set(0,0,-.12);this.dummy.scale.set(.018,1.15,.018);this.dummy.updateMatrix();this.rainMesh.setMatrixAt(i,this.dummy.matrix);
      }
      if(this.rainMesh.visible)this.rainMesh.instanceMatrix.needsUpdate=true;
      this.lamps.visible=environment.daylight<.65;this.lampMaterial.color.setHex(environment.daylight<.2?0xffe6a8:0xe3caa0);
      this.puddleMaterial.opacity=environment.rain*(.13+(1-environment.daylight)*.12);this.reflections.visible=environment.rain>.01;
      this.neonMaterial.opacity=.7+(1-environment.daylight)*.3;
      this.eventGroup.visible=Boolean(event);
      if(event){
        if(event.id!==this.lastEventId){this.lastEventId=event.id;this.eventGroup.position.set(event.target.x,0,event.target.z);}
        this.eventRing.scale.setScalar(1+Math.sin(elapsed*3)*.06);
      }
    }
    return {period:environment.period,weather:environment.weather,...(event?{event}: {})};
  }
  destroy(){
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
    this.group.traverse(object=>{
      if(object instanceof THREE.Mesh){
        geometries.add(object.geometry);
        for(const material of Array.isArray(object.material)?object.material:[object.material]){
          materials.add(material);const map=(material as THREE.MeshBasicMaterial).map;if(map)textures.add(map);
        }
      }
      if(object instanceof THREE.InstancedMesh)object.dispose();
    });
    geometries.forEach(item=>item.dispose());materials.forEach(item=>item.dispose());textures.forEach(item=>item.dispose());this.group.removeFromParent();this.group.clear();
  }
}

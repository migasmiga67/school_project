import * as THREE from 'three';
import type { Point } from './model';
import { CITY_STREETS } from './city-map';
import { AMBIENT_PEDESTRIAN_COUNT,pedestrianTrafficPose } from './traffic-flow';
import { CITY_BENCH_PLACEMENTS,CITY_STREET_SIGN_PLACEMENTS,findStreetDecoration,type DecorationFootprint } from './city-placement';
import { AvatarMotion } from './avatar-motion';
import { cityLifeBudget,pedestrianReaction,type PedestrianVehicle } from './pedestrian-reaction';
import { pathLength, samplePath } from './city-art';

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

export const PEDESTRIAN_COUNT=AMBIENT_PEDESTRIAN_COUNT;
/** Both simulation and renderer read the exact same signalled sidewalk timeline. */
export function pedestrianPose(index:number,seconds:number){return pedestrianTrafficPose(index,seconds);}

/** Decorative city life adds no colliders, wallets or client-owned rewards. */
export class CityLife {
  readonly group=new THREE.Group();
  private readonly geometry=new THREE.BoxGeometry(1,1,1);
  private readonly people:THREE.InstancedMesh[]=[];
  private readonly peopleColors:THREE.Color[][]=[[],[],[],[]];
  private readonly visiblePeople:number[]=[];
  private readonly rainMesh:THREE.InstancedMesh;
  private quality:'low'|'medium'|'high';
  private readonly pedestrianMotion=Array.from({length:PEDESTRIAN_COUNT},()=>new AvatarMotion());
  private readonly reactions=Array.from({length:PEDESTRIAN_COUNT},()=>({alert:0,x:0,z:0}));
  private readonly lampPoolMaterial=new THREE.ShaderMaterial({
    uniforms:{strength:{value:0}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}',
    fragmentShader:'uniform float strength;varying vec2 vUv;void main(){float r=length((vUv-.5)*2.0);float a=pow(max(0.0,1.0-r),2.3)*strength;gl_FragColor=vec4(.95,.69,.3,a);}'
  });
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
  private current={pedestrians:PEDESTRIAN_COUNT,visiblePedestrians:0,reactingPedestrians:0,rainDrops:0,rain:0,daylight:1,weather:'BEZCHMURNIE' as CityEnvironment['weather'],eventId:null as string|null,period:'ZACHÓD SŁOŃCA' as CityEnvironment['period']};

  constructor(private readonly software:boolean) {
    this.group.name='city-life';this.quality=software?'low':'high';
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
    this.streetLights();
    this.eventRing=new THREE.Mesh(new THREE.TorusGeometry(2.9,.1,4,32),new THREE.MeshBasicMaterial({color:0x84dbff}));
    this.eventRing.rotation.x=-Math.PI/2;this.eventRing.position.y=.15;this.eventGroup.add(this.eventRing);
    this.box(this.eventGroup,.8,.8,.8,new THREE.MeshLambertMaterial({color:0xd2aa68}),0,.45,0);
    this.group.add(this.eventGroup,this.lamps,this.reflections);this.setQuality(this.quality);
  }

  get snapshot(){return {...this.current,visibleIds:this.group.visible?[...this.visiblePeople]:[]};}
  setQuality(quality:'low'|'medium'|'high'){this.quality=quality;this.rainMesh.count=cityLifeBudget(quality,this.software).rainDrops;}
  private box(parent:THREE.Object3D,w:number,h:number,d:number,material:THREE.Material,x=0,y=0,z=0){
    const mesh=new THREE.Mesh(this.geometry,material);mesh.scale.set(w,h,d);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
  }
  private streetLights(){
    const postMaterial=new THREE.MeshLambertMaterial({color:0x465e61});
    interface Detail {x:number;z:number;angle:number;side:number}
    const sectors=new Map<string,{lamps:Detail[];puddles:Detail[]}>();
    const occupied:DecorationFootprint[]=[...CITY_BENCH_PLACEMENTS,...CITY_STREET_SIGN_PLACEMENTS];
    const sector=(x:number,z:number)=>{const key=`${Math.floor(x/64)},${Math.floor(z/64)}`;let value=sectors.get(key);if(!value){value={lamps:[],puddles:[]};sectors.set(key,value);}return value;};
    for(const street of CITY_STREETS){
      const length=pathLength(street.points);
      for(let distance=12,index=0;distance<length-5;distance+=street.kind==='alley'?38:28,index++){
        const point=samplePath(street.points,distance),side=index%2?1:-1;
        const pole=findStreetDecoration(street,distance,.45,.45,{side,occupied,walkingPadding:.55});
        if(pole){occupied.push(pole);sector(pole.x,pole.z).lamps.push({x:pole.x,z:pole.z,angle:Math.atan2(point.dz*side,-point.dx*side),side});}
        if(index%2===0){const x=point.x-point.dz*street.width*.22,z=point.z+point.dx*street.width*.22;sector(x,z).puddles.push({x,z,angle:Math.atan2(point.dx,point.dz),side});}
      }
    }
    for(const {lamps,puddles}of sectors.values()){
      if(lamps.length){
        const posts=new THREE.InstancedMesh(this.geometry,postMaterial,lamps.length*3),bulbs=new THREE.InstancedMesh(this.geometry,this.lampMaterial,lamps.length);
        lamps.forEach((point,index)=>{
          const armX=Math.sin(point.angle)*.65,armZ=Math.cos(point.angle)*.65;
          this.dummy.position.set(point.x,3,point.z);this.dummy.rotation.set(0,point.angle,0);this.dummy.scale.set(.15,6,.15);this.dummy.updateMatrix();posts.setMatrixAt(index*3,this.dummy.matrix);
          this.dummy.position.set(point.x+armX,5.9,point.z+armZ);this.dummy.scale.set(.14,.14,1.4);this.dummy.updateMatrix();posts.setMatrixAt(index*3+1,this.dummy.matrix);
          this.dummy.position.set(point.x+armX*2,5.8,point.z+armZ*2);this.dummy.scale.set(.48,.2,.9);this.dummy.updateMatrix();posts.setMatrixAt(index*3+2,this.dummy.matrix);
          this.dummy.position.y=5.68;this.dummy.scale.set(.42,.05,.74);this.dummy.updateMatrix();bulbs.setMatrixAt(index,this.dummy.matrix);
        });
        posts.computeBoundingSphere();bulbs.computeBoundingSphere();this.group.add(posts);this.lamps.add(bulbs);
        const pools=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),this.lampPoolMaterial,lamps.length);
        lamps.forEach((point,index)=>{const armX=Math.sin(point.angle)*1.3,armZ=Math.cos(point.angle)*1.3;this.dummy.position.set(point.x+armX,.146,point.z+armZ);this.dummy.rotation.set(0,0,0);this.dummy.scale.set(6.5,1,6.5);this.dummy.updateMatrix();pools.setMatrixAt(index,this.dummy.matrix);});
        pools.computeBoundingSphere();this.lamps.add(pools);
      }
      if(puddles.length){
        const mesh=new THREE.InstancedMesh(this.geometry,this.puddleMaterial,puddles.length);
        puddles.forEach((point,index)=>{this.dummy.position.set(point.x,.092,point.z);this.dummy.rotation.set(0,point.angle,0);this.dummy.scale.set(1.4,.006,4.2);this.dummy.updateMatrix();mesh.setMatrixAt(index,this.dummy.matrix);});mesh.computeBoundingSphere();this.reflections.add(mesh);
      }
    }
  }
  private personPart(mesh:number,index:number,x:number,y:number,z:number,w:number,h:number,d:number,swing=0){
    this.part.position.set(x,y,z);this.part.rotation.set(swing,0,0);this.part.scale.set(w,h,d);this.part.updateMatrix();
    this.matrix.multiplyMatrices(this.dummy.matrix,this.part.matrix);this.people[mesh].setMatrixAt(index,this.matrix);
  }
  update(seconds:number,player:Point,indoors:boolean,dt:number,vehicles:readonly PedestrianVehicle[]=[]):{period:CityEnvironment['period'];weather:CityEnvironment['weather'];event?:CityEvent}{
    const elapsed=time(seconds),environment=getCityEnvironment(elapsed),event=cityEventAt(elapsed),budget=cityLifeBudget(this.quality,this.software);
    this.group.visible=!indoors;
    this.current={pedestrians:PEDESTRIAN_COUNT,visiblePedestrians:0,reactingPedestrians:0,rainDrops:!indoors&&environment.rain>.01?this.rainMesh.count:0,rain:environment.rain,daylight:environment.daylight,weather:environment.weather,eventId:event?.id??null,period:environment.period};
    if(!indoors){
      let visible=0,colorsChanged=false;
      for(let i=0;i<PEDESTRIAN_COUNT;i++){
        const pose=pedestrianPose(i,elapsed),avoid=pedestrianReaction(pose,vehicles),reaction=this.reactions[i],blend=1-Math.exp(-(Number.isFinite(dt)?Math.max(0,Math.min(.2,dt)):0)*12);
        reaction.alert+=(avoid.alert-reaction.alert)*blend;reaction.x+=(avoid.x-reaction.x)*blend;reaction.z+=(avoid.z-reaction.z)*blend;
        const moving=pose.speed>.08,motion=this.pedestrianMotion[i].update(moving,elapsed,{speed:pose.speed,heading:pose.heading,dt});
        if(reaction.alert>.2)this.current.reactingPedestrians++;
        // Every route advances at all presets. Quality only changes the visible subset.
        if(visible>=budget.pedestrians||(pose.x-player.x)**2+(pose.z-player.z)**2>budget.range**2)continue;
        const index=visible++;
        if(this.visiblePeople[index]!==i){
          this.visiblePeople[index]=i;colorsChanged=true;
          for(let mesh=0;mesh<this.people.length;mesh++){
            const parts=mesh<2?1:2;
            for(let part=0;part<parts;part++)this.people[mesh].setColorAt(index*parts+part,this.peopleColors[mesh][i*parts+part]);
          }
        }
        this.dummy.position.set(pose.x+reaction.x,.05+motion.bob,pose.z+reaction.z);this.dummy.rotation.set(motion.lean,-pose.heading+motion.yawOffset,motion.roll);this.dummy.scale.set(1,1,1);this.dummy.updateMatrix();
        this.personPart(0,index,0,1.6,0,.4,.42,.4);this.personPart(1,index,0,1.09,0,.52,.7,.34);
        for(let side=0;side<2;side++){
          const sign=side?1:-1,arm=side?motion.rightArm:motion.leftArm,leg=side?motion.rightLeg:motion.leftLeg;
          this.personPart(2,index*2+side,sign*.36,1.1,0,.17,.64,.22,arm-reaction.alert*.9);
          this.personPart(3,index*2+side,sign*.15,.4,0,.2,.8,.26,leg);
        }
      }
      this.current.visiblePedestrians=visible;this.visiblePeople.length=visible;
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
      this.lampPoolMaterial.uniforms.strength.value=clamp((.65-environment.daylight)/.65)*.22;
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

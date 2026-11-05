import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { appearanceColors, createAppearance, type AppearanceState } from './appearance';

export interface FirstPersonInput {
 visible:boolean;
 mode:'foot'|'drive';
 speed:number;
 steer:number;
 dt:number;
 seconds:number;
 fov?:number;
 aspect?:number;
 daylight?:number;
 /** Camera yaw relative to the car and downward camera pitch, in radians. */
 lookYaw?:number;
 lookPitch?:number;
}
export interface FirstPersonSnapshot {visible:boolean;mode:'foot'|'drive';speed:number;steering:number;phase:number;hands:number}
type Lit=THREE.MeshLambertMaterial|THREE.MeshStandardMaterial;
const clamp=THREE.MathUtils.clamp;
const finite=(value:number|undefined,fallback=0)=>Number.isFinite(value)?value!:fallback;
const ease=(a:number,b:number,rate:number,dt:number)=>a+(b-a)*(1-Math.exp(-rate*dt));

/** Retained camera-space hands and a car-space cockpit. This class never changes game state. */
export class FirstPersonView {
 readonly group=new THREE.Group();
 private readonly scene=new THREE.Scene();
 private readonly camera=new THREE.PerspectiveCamera(58,16/9,.05,5);
 private readonly ambient=new THREE.HemisphereLight(0xe6eced,0x414c56,1.45);
 private readonly key=new THREE.DirectionalLight(0xffe4cb,1.65);
 private readonly foot=new THREE.Group();
 private readonly cockpit=new THREE.Group();
 private readonly cockpitFrame=new THREE.Group();
 private readonly wheel=new THREE.Group();
 private readonly footArms:THREE.Group[]=[];
 private readonly needle=new THREE.Group();
 private readonly sleeve:Lit;
 private readonly skin:Lit;
 private readonly nails:Lit;
 private readonly trim:Lit;
 private readonly materials=new Set<THREE.Material>();
 private readonly geometries=new Set<THREE.BufferGeometry>();
 private motion={visible:false,mode:'foot' as 'foot'|'drive',speed:0,steering:0,phase:0,hands:0};
 private idle=0;
 private signature='';

 constructor(software=false){
  this.group.name='first-person-view';this.foot.name='first-person-hands';this.cockpit.name='first-person-cockpit';this.wheel.name='first-person-steering-wheel';
  const lit=(color:number):Lit=>{
   const options={color};
   const material=software?new THREE.MeshLambertMaterial(options):new THREE.MeshStandardMaterial({...options,roughness:.82,metalness:.02});
   this.materials.add(material);return material;
  };
  this.sleeve=lit(0xd1c6ae);this.skin=lit(0xc19074);this.nails=lit(0xd9af96);this.trim=lit(0x27323c);
  const dashboard=lit(0x1a252d),metal=lit(0x929b9c),leather=lit(0x27363d);
  const illuminated=new THREE.MeshBasicMaterial({color:0x9bd9c5});this.materials.add(illuminated);
  for(const side of[-1,1]){
   const arm=this.arm(side,false);arm.position.set(side*.265,-.292,-.59);arm.rotation.set(-.1,side*-.13,side*-.16);this.foot.add(arm);this.footArms.push(arm);
   const grip=this.arm(side,true);grip.position.set(side*.177,0,.012);grip.rotation.set(.05,side*-.12,side*-.54);this.wheel.add(grip);
  }
  // The broad dash remains below the road; the instrument hood is behind the wheel.
  this.box(this.cockpitFrame,1.25,.15,.29,dashboard,0,-.445,-.94);
  this.box(this.cockpitFrame,.48,.095,.2,this.trim,0,-.295,-.92);
  const dial=new THREE.CylinderGeometry(.092,.092,.012,24);dial.rotateX(Math.PI/2);
  this.mesh(this.cockpitFrame,dial,dashboard,-.04,-.32,-.805);
  const ticks:THREE.BufferGeometry[]=[];
  for(let index=0;index<=10;index++){
   const a=(-135+index*27)*Math.PI/180,x=-.04+Math.sin(a)*.075,y=-.32+Math.cos(a)*.075;
   const tick=new THREE.BoxGeometry(.004,index%2===0?.014:.008,.003);tick.rotateZ(-a);tick.translate(x,y,-.796);ticks.push(tick);
  }
  this.mesh(this.cockpitFrame,this.merge(ticks),illuminated);
  this.needle.position.set(-.04,-.32,-.788);this.box(this.needle,.003,.066,.003,illuminated,0,.025,0);this.cockpitFrame.add(this.needle);
  this.box(this.cockpitFrame,.075,.018,.007,illuminated,.105,-.325,-.805);
  const rim=new THREE.TorusGeometry(.183,.018,6,32);this.mesh(this.wheel,rim,leather);
  this.box(this.wheel,.095,.065,.035,this.trim,0,0,.005);
  this.box(this.wheel,.26,.024,.023,metal,0,-.005,-.004);
  this.box(this.wheel,.022,.145,.023,metal,0,-.065,-.004);
  this.box(this.wheel,.036,.026,.006,metal,0,.006,.026);
  this.wheel.position.set(0,-.285,-.59);this.wheel.rotation.x=-.18;this.cockpitFrame.add(this.wheel);
  this.cockpit.add(this.cockpitFrame);this.group.add(this.foot,this.cockpit);this.group.visible=false;
  this.scene.add(this.group,this.ambient);
  this.key.position.set(-.6,.9,.4);this.scene.add(this.key);
  this.setAppearance(createAppearance());
 }

 private mesh(parent:THREE.Object3D,geometry:THREE.BufferGeometry,material:THREE.Material,x=0,y=0,z=0){
  this.geometries.add(geometry);const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.frustumCulled=false;parent.add(mesh);return mesh;
 }
 private box(parent:THREE.Object3D,w:number,h:number,d:number,material:THREE.Material,x:number,y:number,z:number){return this.mesh(parent,new THREE.BoxGeometry(w,h,d),material,x,y,z);}
 private merge(parts:THREE.BufferGeometry[]){const geometry=mergeGeometries(parts,false)!;parts.forEach(part=>part.dispose());return geometry;}
 private oval(parts:THREE.BufferGeometry[],w:number,h:number,d:number,x:number,y:number,z:number){const geometry=new THREE.SphereGeometry(.5,10,6);geometry.scale(w,h,d);geometry.translate(x,y,z);parts.push(geometry);}
 private segment(parts:THREE.BufferGeometry[],from:THREE.Vector3,to:THREE.Vector3,radiusFrom:number,radiusTo=radiusFrom){
  const direction=to.clone().sub(from),geometry=new THREE.CylinderGeometry(radiusTo,radiusFrom,direction.length(),8,1);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));geometry.translate((from.x+to.x)/2,(from.y+to.y)/2,(from.z+to.z)/2);parts.push(geometry);
 }
 private arm(side:number,gripping:boolean){
  const arm=new THREE.Group();arm.name=gripping?'wheel-grip':'relaxed-hand';const flesh:THREE.BufferGeometry[]=[],cloth:THREE.BufferGeometry[]=[],nail:THREE.BufferGeometry[]=[];
  const point=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z);
  // Tapered forearm, wrist and a flattened palm keep a human silhouette at arm's length.
  this.segment(flesh,point(side*.042,-.075,.265),point(0,0,.075),.048,.033);
  this.oval(flesh,.073,.064,.092,0,0,.07);this.oval(flesh,.098,.046,.126,0,.002,.005);
  this.segment(cloth,point(side*.11,-.19,.445),point(side*.034,-.06,.218),.066,.054);
  this.segment(cloth,point(side*.04,-.071,.254),point(side*.03,-.052,.218),.057,.055);
  for(let digit=0;digit<4;digit++){
   const x=(digit-1.5)*.024,length=[.053,.07,.064,.048][digit],start=point(x,0,-.048),bend=point(x,-.013,-.048-length*.66),tip=point(x,-(gripping?.061:.038),-.048-length*(gripping?.46:.87));
   this.segment(flesh,start,bend,.0115,.0105);this.oval(flesh,.023,.022,.022,bend.x,bend.y,bend.z);
   this.segment(flesh,bend,tip,.0105,.009);this.oval(flesh,.018,.019,.02,tip.x,tip.y,tip.z);
   this.oval(nail,.012,.003,.014,tip.x,tip.y+.009,tip.z-.003);
  }
  const thumbBase=point(-side*.043,-.004,.024),thumbBend=point(-side*.068,-.014,-.008),thumbTip=point(-side*(gripping?.046:.069),-(gripping?.043:.027),-.035);
  this.segment(flesh,thumbBase,thumbBend,.018,.014);this.oval(flesh,.03,.03,.03,thumbBend.x,thumbBend.y,thumbBend.z);this.segment(flesh,thumbBend,thumbTip,.014,.012);this.oval(flesh,.024,.023,.025,thumbTip.x,thumbTip.y,thumbTip.z);
  this.mesh(arm,this.merge(flesh),this.skin).name='first-person-skin';this.mesh(arm,this.merge(cloth),this.sleeve).name='first-person-sleeve';this.mesh(arm,this.merge(nail),this.nails).name='first-person-nails';return arm;
 }

 setAppearance(appearance:AppearanceState,crewColor?:number){
  const colors=appearanceColors(appearance,crewColor),signature=`${colors.skin}/${colors.shirt}`;if(signature===this.signature)return;this.signature=signature;
  this.skin.color.setHex(colors.skin);this.sleeve.color.setHex(colors.shirt);this.nails.color.setHex(colors.skin).lerp(new THREE.Color(0xffdfcb),.22);
 }
 get snapshot():FirstPersonSnapshot{return{...this.motion};}
 update(input:FirstPersonInput){
  const daylight=clamp(finite(input.daylight,1),0,1);
  this.ambient.intensity=.65+daylight*.8;this.key.intensity=.35+daylight*1.3;
  this.key.color.setHex(daylight<.2?0xa8c4eb:0xffe4cb);
  const dt=clamp(finite(input.dt),0,.1),speed=Math.abs(finite(input.speed));this.idle+=dt;
  const changed=input.mode!==this.motion.mode;
  this.motion.speed=ease(this.motion.speed,speed,10,dt);this.motion.steering=ease(this.motion.steering,clamp(finite(input.steer),-1,1),12,dt);
  this.motion.visible=input.visible;this.motion.mode=input.mode;this.motion.hands=input.visible?2:0;this.group.visible=input.visible;
  this.foot.visible=input.mode==='foot';this.cockpit.visible=input.mode==='drive';
  if(changed){this.motion.phase=0;this.motion.speed=speed;this.motion.steering=clamp(finite(input.steer),-1,1);}
  const walking=clamp(this.motion.speed/2.8,0,1),running=clamp((this.motion.speed-3.2)/3,0,1);
  this.motion.phase=(this.motion.phase+dt*(1.6+running*.9)*Math.PI*2*walking)%(Math.PI*2);
  const phase=this.motion.phase,breath=Math.sin(this.idle*1.65)*.003;
  this.foot.position.set(Math.sin(phase)*.008*walking,breath+Math.abs(Math.sin(phase))*(.008+running*.009)*walking,0);
  this.footArms.forEach((arm,index)=>{const side=index===0?-1:1,swing=Math.sin(phase+index*Math.PI)*walking;arm.position.y=-.292+swing*(.012+running*.018);arm.position.z=-.59+swing*(.018+running*.025);arm.rotation.x=-.1+swing*(.065+running*.065);arm.rotation.z=side*-(.16+running*.06);});
  const fov=clamp(finite(input.fov,58),35,85),aspect=clamp(finite(input.aspect,1.5),.25,4);
  if(this.camera.fov!==fov||this.camera.aspect!==aspect){this.camera.fov=fov;this.camera.aspect=aspect;this.camera.updateProjectionMatrix();}
  const framing=Math.tan(fov*Math.PI/360)/Math.tan(29*Math.PI/180),narrow=clamp(aspect/1.25,.52,1);
  this.foot.scale.set(framing*narrow,framing,1);
  // Keep a circular wheel and two readable grips on portrait screens and at camera zoom.
  const cockpitScale=framing*clamp(aspect/.9,.48,1);
  this.cockpitFrame.scale.setScalar(cockpitScale);this.cockpitFrame.position.z=-.59*(1-cockpitScale);
  // Inverse camera look keeps the wheel fixed to the actual car when looking sideways.
  this.cockpit.rotation.set(clamp(finite(input.lookPitch),-1.45,1.45),finite(input.lookYaw),0,'XYZ');
  this.wheel.rotation.z=-this.motion.steering*.7;this.needle.rotation.z=(135-clamp(speed*3.6/200,0,1)*270)*Math.PI/180;
 }
 /** Clear only world depth so hands cannot clip walls, while their own surfaces still occlude correctly. */
 render(renderer:THREE.WebGLRenderer){
  if(!this.motion.visible)return;
  const autoClear=renderer.autoClear,autoReset=renderer.info.autoReset;
  try{
   renderer.autoClear=false;renderer.info.autoReset=false;renderer.clearDepth();renderer.render(this.scene,this.camera);
  }finally{renderer.autoClear=autoClear;renderer.info.autoReset=autoReset;}
 }
 destroy(){this.geometries.forEach(geometry=>geometry.dispose());this.materials.forEach(material=>material.dispose());this.geometries.clear();this.materials.clear();this.group.removeFromParent();this.group.clear();this.scene.clear();}
}

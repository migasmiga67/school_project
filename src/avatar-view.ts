import * as THREE from 'three';
import { appearanceColors, createAppearance, type AppearanceState } from './appearance';
import { AvatarMotion, type AvatarMotionInput } from './avatar-motion';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createCharacterFaceParts,createHeadGeometry,CHARACTER_HAIR_THETA,CHARACTER_HEAD_SCALE } from './character-geometry';

type AvatarMaterial=THREE.MeshLambertMaterial|THREE.MeshStandardMaterial;
/** One independently colored avatar. Parent sets world position and heading. */
export class AvatarView {
 readonly group=new THREE.Group();
 readonly legs:THREE.Mesh[]=[];
 readonly arms:THREE.Group[]=[];
 private readonly shirt:AvatarMaterial;
 private readonly trousers:AvatarMaterial;
 private readonly skin:AvatarMaterial;
 private readonly hair:AvatarMaterial;
 private readonly accessory:AvatarMaterial;
 private readonly hairstyles=new Map<string,THREE.Group>();
 private readonly accessories=new Map<string,THREE.Group>();
 private readonly crewStripe:THREE.Mesh;
 private readonly upperBody=new THREE.Group();
 private readonly headRoot=new THREE.Group();
 private readonly motion=new AvatarMotion();
 private readonly knees:THREE.Group[]=[];
 private readonly elbows:THREE.Group[]=[];
 private signature='';
 constructor(private readonly software=false){
  this.group.name='custom-player-avatar';
  this.shirt=this.material(0xd1c6ae);this.trousers=this.material(0x324654);this.skin=this.material(0xc19074);this.hair=this.material(0x303333);this.accessory=this.material(0x162b37);
  // Torso: chest, waist and sloping trapezius from one lathe profile, flattened front to back.
  const torso=this.lathe([[0,-.3],[.17,-.3],[.183,-.22],[.172,-.12],[.178,-.04],[.2,.05],[.222,.14],[.232,.21],[.232,.26],[.215,.3],[.17,.335],[.09,.355],[0,.36]],1.14,.64);
  {const p=torso.getAttribute('position');for(let i=0;i<p.count;i++){const y=p.getY(i),z=p.getZ(i);if(z<0&&y>.02&&y<.27)p.setZ(i,z*(1+.13*Math.sin((y-.02)/.25*Math.PI)));if(z>0&&y>.1)p.setZ(i,z*.94);}torso.computeVertexNormals();}
  this.part(this.group,torso,this.shirt,0,1.18,0).name='avatar-torso';
  const seam=this.material(0x59616a),shoe=this.material(0x202a30),sole=this.material(0xd9d6cc),features=this.material(0xffffff);features.vertexColors=true;
  // Hips and seat of the trousers, belt and fly seam.
  this.part(this.group,this.lathe([[0,-.13],[.14,-.13],[.185,-.07],[.2,.01],[.19,.09],[0,.1]],1.06,.7),this.trousers,0,.9,0);
  const belt=new THREE.TorusGeometry(.19,.016,5,20);belt.rotateX(Math.PI/2);belt.scale(1.07,1,.71);this.part(this.group,belt,seam,0,.96,0);
  this.box(this.group,.05,.035,.012,sole,0,.96,-.136);
  this.box(this.group,.012,.12,.01,seam,0,.86,-.14);
  // Neck rising from the collar.
  this.part(this.group,this.lathe([[0,-.1],[.074,-.1],[.068,-.02],[.064,.06],[.066,.1],[0,.11]],1,.95),this.skin,0,1.58,.01);
  const collar=new THREE.TorusGeometry(.08,.018,5,16);collar.rotateX(Math.PI/2+.2);collar.scale(1,1,.95);this.part(this.group,collar,this.shirt,0,1.535,.0);
  // Button placket.
  this.box(this.group,.014,.38,.012,seam,0,1.19,-.165);
  for(const y of[1.06,1.18,1.3,1.41])this.oval(this.group,.018,.018,.01,sole,0,y,-.172);
  this.part(this.group,createHeadGeometry(this.software?14:24),this.skin,0,1.79,-.015);
  const face=createCharacterFaceParts();this.part(this.group,face.skin,this.skin,0,1.79,-.015).name='avatar-face-skin';this.part(this.group,face.features,features,0,1.79,-.015).name='avatar-face-features';this.part(this.group,face.brows,this.hair,0,1.79,-.015);
  for(const x of[-.1,.1]){
   // Thigh tapering to the knee; calf with a muscle belly and a slim ankle.
   const leg=this.part(this.group,this.lathe([[0,.04],[.088,.03],[.1,-.06],[.094,-.18],[.08,-.32],[.066,-.4],[0,-.42]],1,.98),this.trousers,x,.85,0);leg.name='avatar-thigh';
   const knee=new THREE.Group();knee.position.y=-.4;leg.add(knee);this.knees.push(knee);
   this.part(knee,this.lathe([[0,.03],[.066,.02],[.07,-.08],[.066,-.17],[.052,-.3],[.046,-.37],[0,-.39]],1,1.02),this.trousers,0,0,0);
   this.box(knee,.008,.34,.008,seam,Math.sign(x)*.068,-.18,0);
   // Trainers: rounded upper with a toe box, a thick pale midsole and a tongue.
   const foot=this.oval(knee,.112,.09,.27,shoe,0,-.4,-.055);foot.name='avatar-shoe';
   this.oval(knee,.1,.07,.12,shoe,0,-.37,.005);
   this.round(knee,.116,.03,.285,sole,0,-.437,-.055);
   this.box(knee,.06,.05,.02,sole,0,-.36,-.11);
   this.legs.push(leg);
  }
  for(const x of[-.31,.31]){
   const side=Math.sign(x),arm=new THREE.Group();arm.position.set(x,1.45,0);this.group.add(arm);
   // Rounded deltoid inside a short sleeve, then the bare upper arm.
   this.oval(arm,.125,.17,.135,this.shirt,side*-.03,-.045,0);
   this.part(arm,this.lathe([[0,0],[.066,-.01],[.064,-.08],[.062,-.14],[.056,-.15],[0,-.152]]),this.shirt,0,0,0);
   this.part(arm,this.lathe([[0,-.1],[.054,-.11],[.052,-.18],[.045,-.25],[.042,-.27],[0,-.28]]),this.skin,0,0,0);
   const elbow=new THREE.Group();elbow.position.y=-.27;arm.add(elbow);this.elbows.push(elbow);
   this.part(elbow,this.lathe([[0,.02],[.043,.01],[.05,-.06],[.044,-.15],[.032,-.24],[.03,-.26],[0,-.27]]),this.skin,0,0,0);
   // Hand: palm facing the thigh, four fingers, thumb towards the front.
   this.oval(elbow,.04,.1,.085,this.skin,0,-.31,-.004).name='avatar-palm';
   for(let finger=0;finger<4;finger++){const z=-.03+finger*.02,length=[.07,.078,.074,.06][finger];this.round(elbow,.019,length,.019,this.skin,0,-.355-length/2+.012,z);}
   const thumb=this.round(elbow,.022,.065,.024,this.skin,side*-.004,-.32,-.05);thumb.rotation.x=.45;
   this.arms.push(arm);
  }
  const short=new THREE.Group();this.hairCap(short,1.05,1.12);this.oval(short,.3,.1,.3,this.hair,0,1.965,.01);this.oval(short,.37,.3,.2,this.hair,0,1.83,.115);
  for(const side of[-1,1])this.oval(short,.03,.09,.06,this.hair,side*.183,1.81,-.02);
  this.hairstyles.set('short',short);
  const buzz=new THREE.Group();this.hairCap(buzz,1,1.04);this.hairstyles.set('buzz',buzz);
  const long=new THREE.Group();this.hairCap(long,1.06,1.14);this.oval(long,.39,.52,.16,this.hair,0,1.72,.14);for(const x of[-.185,.185])this.round(long,.075,.39,.22,this.hair,x,1.76,.035);this.hairstyles.set('long',long);
  const glasses=new THREE.Group();for(const x of[-.095,.095])this.oval(glasses,.155,.095,.028,this.accessory,x,1.83,-.19);this.box(glasses,.06,.024,.025,this.accessory,0,1.84,-.207);this.accessories.set('glasses',glasses);
  const cap=new THREE.Group();this.hairCap(cap,1.18,1.24,this.accessory);this.oval(cap,.46,.035,.27,this.accessory,0,1.965,-.22);this.accessories.set('cap',cap);
  for(const object of[...this.hairstyles.values(),...this.accessories.values()])this.group.add(object);
  this.crewStripe=this.box(this.group,.09,.36,.018,this.material(0xdcece2),.14,1.18,-.176);this.crewStripe.rotation.z=.2;
  // Keep the pelvis and feet planted while shoulders and head anticipate a turn.
  const upper=this.group.children.filter(object=>this.arms.includes(object as THREE.Group)||[...this.hairstyles.values(),...this.accessories.values()].includes(object as THREE.Group)||object.position.y>=1);
  this.upperBody.position.y=1;this.group.add(this.upperBody);
  this.headRoot.position.y=.79;this.headRoot.scale.setScalar(CHARACTER_HEAD_SCALE);this.upperBody.add(this.headRoot);
  for(const object of upper){const head=object.position.y>1.65||[...this.hairstyles.values(),...this.accessories.values()].includes(object as THREE.Group);object.position.y-=head?1.79:1;(head?this.headRoot:this.upperBody).add(object);}
  // Fixed details share materials and one draw per animated bone instead of one draw per finger.
  const batch=(parent:THREE.Object3D)=>{
   for(const child of [...parent.children])batch(child);
   const byMaterial=new Map<THREE.Material,THREE.Mesh[]>();
   for(const child of parent.children)if(child instanceof THREE.Mesh&&child.children.length===0&&!Array.isArray(child.material)){const list=byMaterial.get(child.material)??[];list.push(child);byMaterial.set(child.material,list);}
   for(const[material,meshes]of byMaterial){if(meshes.length<2)continue;const parts=meshes.map(mesh=>{mesh.updateMatrix();return mesh.geometry.clone().applyMatrix4(mesh.matrix);});const merged=mergeGeometries(parts);parts.forEach(part=>part.dispose());
    const mesh=this.part(parent,merged,material,0,0,0);mesh.name=meshes.some(item=>item.name==='avatar-torso')?'avatar-torso':meshes.map(item=>item.name).filter(Boolean).join(' ');
    for(const old of meshes){old.removeFromParent();old.geometry.dispose();}
   }
  };batch(this.group);
  this.setAppearance(createAppearance());
 }
 private material(color:number):AvatarMaterial{return this.software?new THREE.MeshLambertMaterial({color}):new THREE.MeshStandardMaterial({color,roughness:.8,metalness:.02});}
 private part(parent:THREE.Object3D,geometry:THREE.BufferGeometry,material:THREE.Material,x:number,y:number,z:number){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.castShadow=!this.software;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
 private lathe(profile:readonly (readonly [number,number])[],sx=1,sz=1){const geometry=new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),this.software?10:18);geometry.scale(sx,1,sz);return geometry;}
 private capsule(w:number,h:number,d:number){const geometry=new THREE.CapsuleGeometry(.5,1,3,8);geometry.scale(w,h/2,d);return geometry;}
 private round(parent:THREE.Object3D,w:number,h:number,d:number,material:THREE.Material,x:number,y:number,z:number){return this.part(parent,this.capsule(w,h,d),material,x,y,z);}
 private oval(parent:THREE.Object3D,w:number,h:number,d:number,material:THREE.Material,x:number,y:number,z:number){const geometry=new THREE.SphereGeometry(.5,8,6);geometry.scale(w,h,d);return this.part(parent,geometry,material,x,y,z);}
 private hairCap(parent:THREE.Object3D,width:number,height:number,material:THREE.Material=this.hair){const geometry=new THREE.SphereGeometry(.2,8,5,0,Math.PI*2,0,CHARACTER_HAIR_THETA);geometry.scale(width,height,1);return this.part(parent,geometry,material,0,1.81,-.012);}
 private box(parent:THREE.Group,w:number,h:number,d:number,material:THREE.Material,x:number,y:number,z:number){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);mesh.castShadow=!this.software;parent.add(mesh);return mesh;}
 setAppearance(appearance:AppearanceState,crewColor?:number){
  const colors=appearanceColors(appearance,crewColor),signature=JSON.stringify(colors);if(signature===this.signature)return;this.signature=signature;
  for(const slot of['shirt','pants','skin','hair','accessory']as const){const material=slot==='pants'?this.trousers:this[slot];material.color.setHex(colors[slot]);}
  for(const[style,object]of this.hairstyles)object.visible=style===colors.hairstyle;
  for(const[style,object]of this.accessories)object.visible=style===colors.accessoryStyle;
  this.crewStripe.visible=colors.crewOutfit;
 }
 get motionSnapshot(){return this.motion.snapshot;}
 update(walking:boolean,seconds:number,input:AvatarMotionInput={}){
  const pose=this.motion.update(walking,seconds,input);
  this.legs.forEach((leg,index)=>{leg.rotation.x=index===0?pose.leftLeg:pose.rightLeg;leg.rotation.z=(index===0?1:-1)*Math.abs(Math.sin(pose.phase))*.014*pose.strideWeight;});
  this.arms.forEach((arm,index)=>{arm.rotation.x=index===0?pose.leftArm:pose.rightArm;arm.rotation.z=(index===0?1:-1)*(.035+pose.strideWeight*.045);});
  this.knees.forEach((knee,index)=>{const swing=index===0?pose.leftLeg:pose.rightLeg;knee.rotation.x=-Math.max(0,-swing)*.9;});
  this.elbows.forEach(elbow=>{elbow.rotation.x=.08+Math.max(0,pose.speed-3.1)*.12;});
  this.group.position.set(pose.sway,pose.bob,0);this.group.rotation.y=pose.yawOffset;
  this.upperBody.rotation.set(pose.lean,pose.torsoYaw,pose.roll);this.headRoot.rotation.y=pose.headYaw;
 }
 destroy(){const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();this.group.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}});geometries.forEach(item=>item.dispose());materials.forEach(item=>item.dispose());this.group.removeFromParent();this.group.clear();}
}

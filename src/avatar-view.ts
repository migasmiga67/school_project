import * as THREE from 'three';
import { appearanceColors, createAppearance, type AppearanceState } from './appearance';
import { AvatarMotion, type AvatarMotionInput } from './avatar-motion';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createCharacterFaceParts,CHARACTER_HAIR_THETA,CHARACTER_HEAD_SCALE } from './character-geometry';

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
  const torso=new THREE.CylinderGeometry(.29,.235,.66,12);torso.scale(1,1,.64);this.part(this.group,torso,this.shirt,0,1.18,0).name='avatar-torso';
  const seam=this.material(0x59616a),shoe=this.material(0x202a30),sole=this.material(0x787d7d),features=this.material(0xffffff);features.vertexColors=true;
  this.round(this.group,.49,.25,.31,this.trousers,0,.85,0);this.round(this.group,.145,.18,.145,this.skin,0,1.56,0);
  for(const side of[-1,1]){const collar=this.box(this.group,.12,.14,.025,this.shirt,side*.068,1.47,-.134);collar.rotation.z=side*.45;}
  this.box(this.group,.016,.4,.015,seam,0,1.19,-.187);this.box(this.group,.47,.045,.31,seam,0,.91,0);
  for(const y of[1.11,1.26,1.4])this.oval(this.group,.024,.024,.016,sole,0,y,-.2);
  this.oval(this.group,.38,.44,.35,this.skin,0,1.79,-.015);
  const face=createCharacterFaceParts();this.part(this.group,face.skin,this.skin,0,1.79,-.015).name='avatar-face-skin';this.part(this.group,face.features,features,0,1.79,-.015).name='avatar-face-features';this.part(this.group,face.brows,this.hair,0,1.79,-.015);
  for(const x of[-.145,.145]){
   const geometry=this.capsule(.225,.43,.255);geometry.translate(0,-.19,0);const leg=this.part(this.group,geometry,this.trousers,x,.85,0);leg.name='avatar-thigh';
   const knee=new THREE.Group();knee.position.y=-.39;leg.add(knee);this.knees.push(knee);
   this.round(knee,.19,.37,.215,this.trousers,0,-.17,0);this.round(knee,.025,.31,.018,seam,Math.sign(x)*.083,-.17,-.074);
   const foot=this.round(knee,.24,.145,.39,shoe,0,-.36,-.07);foot.name='avatar-shoe';this.round(knee,.244,.04,.385,sole,0,-.407,-.07);
   this.legs.push(leg);
  }
  for(const x of[-.325,.325]){
   const arm=new THREE.Group();arm.position.set(x,1.45,0);this.group.add(arm);this.round(arm,.22,.32,.245,this.shirt,0,-.1,0);
   const elbow=new THREE.Group();elbow.position.y=-.26;arm.add(elbow);this.elbows.push(elbow);
   const forearm=new THREE.CylinderGeometry(.079,.062,.285,10);this.part(elbow,forearm,this.skin,0,-.13,0);
   this.round(elbow,.107,.145,.095,this.skin,0,-.32,-.006).name='avatar-palm';
   for(let finger=0;finger<4;finger++)this.round(elbow,.022,.072-(finger===3?.016:0),.03,this.skin,-.034+finger*.023,-.407+Math.abs(1.5-finger)*.006,-.012);
   const thumb=this.round(elbow,.038,.09,.045,this.skin,Math.sign(x)*.058,-.324,-.01);thumb.rotation.z=Math.sign(x)*.5;
   this.arms.push(arm);
  }
  const short=new THREE.Group();this.hairCap(short,1.05,1.12);this.round(short,.35,.2,.12,this.hair,0,1.86,.13);this.hairstyles.set('short',short);
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

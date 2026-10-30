import * as THREE from 'three';
import { appearanceColors, createAppearance, type AppearanceState } from './appearance';

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
 private signature='';
 constructor(private readonly software=false){
  this.group.name='custom-player-avatar';
  this.shirt=this.material(0xd1c6ae);this.trousers=this.material(0x324654);this.skin=this.material(0xc19074);this.hair=this.material(0x303333);this.accessory=this.material(0x162b37);
  const torso=new THREE.CylinderGeometry(.31,.25,.72,8);torso.scale(1,1,.59);this.part(this.group,torso,this.shirt,0,1.17,0);
  this.round(this.group,.52,.3,.31,this.trousers,0,.87,0);this.round(this.group,.145,.17,.145,this.skin,0,1.58,0);
  this.oval(this.group,.38,.44,.35,this.skin,0,1.79,-.015);
  this.oval(this.group,.055,.105,.05,this.skin,-.19,1.78,0);this.oval(this.group,.055,.105,.05,this.skin,.19,1.78,0);this.oval(this.group,.05,.075,.06,this.skin,0,1.77,-.192);
  const eye=this.material(0x20313b),shoe=this.material(0x202a30);for(const x of[-.07,.07])this.oval(this.group,.038,.024,.018,eye,x,1.83,-.181);
  for(const x of[-.15,.15]){const geometry=this.capsule(.23,.74,.25);geometry.translate(0,-.37,0);const leg=this.part(this.group,geometry,this.trousers,x,.84,0);this.round(leg,.26,.15,.4,shoe,0,-.72,-.075);this.legs.push(leg);}
  for(const x of[-.35,.35]){const arm=new THREE.Group();arm.position.set(x,1.45,0);this.group.add(arm);this.round(arm,.21,.36,.23,this.shirt,0,-.13,0);this.round(arm,.17,.32,.18,this.skin,0,-.44,0);this.oval(arm,.15,.2,.14,this.skin,0,-.66,-.015);this.arms.push(arm);}
  const short=new THREE.Group();this.hairCap(short,1.05,1.12);this.round(short,.35,.2,.12,this.hair,0,1.86,.13);this.hairstyles.set('short',short);
  const buzz=new THREE.Group();this.hairCap(buzz,1,1.04);this.hairstyles.set('buzz',buzz);
  const long=new THREE.Group();this.hairCap(long,1.06,1.14);this.oval(long,.39,.52,.16,this.hair,0,1.72,.14);for(const x of[-.185,.185])this.round(long,.075,.39,.22,this.hair,x,1.76,.035);this.hairstyles.set('long',long);
  const glasses=new THREE.Group();for(const x of[-.095,.095])this.oval(glasses,.155,.095,.028,this.accessory,x,1.83,-.19);this.box(glasses,.06,.024,.025,this.accessory,0,1.84,-.207);this.accessories.set('glasses',glasses);
  const cap=new THREE.Group();this.hairCap(cap,1.18,1.24,this.accessory);this.oval(cap,.46,.035,.27,this.accessory,0,1.965,-.22);this.accessories.set('cap',cap);
  for(const object of[...this.hairstyles.values(),...this.accessories.values()])this.group.add(object);
  this.crewStripe=this.box(this.group,.09,.36,.018,this.material(0xdcece2),.14,1.18,-.176);this.crewStripe.rotation.z=.2;
  this.setAppearance(createAppearance());
 }
 private material(color:number):AvatarMaterial{return this.software?new THREE.MeshLambertMaterial({color}):new THREE.MeshStandardMaterial({color,roughness:.8,metalness:.02});}
 private part(parent:THREE.Object3D,geometry:THREE.BufferGeometry,material:THREE.Material,x:number,y:number,z:number){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.castShadow=!this.software;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
 private capsule(w:number,h:number,d:number){const geometry=new THREE.CapsuleGeometry(.5,1,3,8);geometry.scale(w,h/2,d);return geometry;}
 private round(parent:THREE.Object3D,w:number,h:number,d:number,material:THREE.Material,x:number,y:number,z:number){return this.part(parent,this.capsule(w,h,d),material,x,y,z);}
 private oval(parent:THREE.Object3D,w:number,h:number,d:number,material:THREE.Material,x:number,y:number,z:number){const geometry=new THREE.SphereGeometry(.5,8,6);geometry.scale(w,h,d);return this.part(parent,geometry,material,x,y,z);}
 private hairCap(parent:THREE.Object3D,width:number,height:number,material:THREE.Material=this.hair){const geometry=new THREE.SphereGeometry(.2,8,5,0,Math.PI*2,0,Math.PI*.57);geometry.scale(width,height,1);return this.part(parent,geometry,material,0,1.81,-.012);}
 private box(parent:THREE.Group,w:number,h:number,d:number,material:THREE.Material,x:number,y:number,z:number){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);mesh.castShadow=!this.software;parent.add(mesh);return mesh;}
 setAppearance(appearance:AppearanceState,crewColor?:number){
  const colors=appearanceColors(appearance,crewColor),signature=JSON.stringify(colors);if(signature===this.signature)return;this.signature=signature;
  for(const slot of['shirt','pants','skin','hair','accessory']as const){const material=slot==='pants'?this.trousers:this[slot];material.color.setHex(colors[slot]);}
  for(const[style,object]of this.hairstyles)object.visible=style===colors.hairstyle;
  for(const[style,object]of this.accessories)object.visible=style===colors.accessoryStyle;
  this.crewStripe.visible=colors.crewOutfit;
 }
 update(walking:boolean,seconds:number){const phase=Number.isFinite(seconds)?seconds*10:0;this.legs.forEach((leg,index)=>leg.rotation.x=walking?Math.sin(phase+index*Math.PI)*.45:0);this.arms.forEach((arm,index)=>arm.rotation.x=walking?-Math.sin(phase+index*Math.PI)*.38:0);}
 destroy(){const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();this.group.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}});geometries.forEach(item=>item.dispose());materials.forEach(item=>item.dispose());this.group.removeFromParent();this.group.clear();}
}

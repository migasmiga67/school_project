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
  this.box(this.group,.6,.7,.35,this.shirt,0,1.17,0);this.box(this.group,.17,.16,.2,this.skin,0,1.57,0);this.box(this.group,.4,.42,.36,this.skin,0,1.77,-.015);
  const eye=this.material(0x20313b);for(const x of[-.09,.09])this.box(this.group,.065,.045,.025,eye,x,1.81,-.21);
  for(const x of[-.17,.17])this.legs.push(this.box(this.group,.25,.7,.27,this.trousers,x,.45,0));
  for(const x of[-.43,.43]){const arm=new THREE.Group();arm.position.set(x,1.48,0);this.group.add(arm);this.box(arm,.2,.33,.25,this.shirt,0,-.16,0);this.box(arm,.18,.33,.23,this.skin,0,-.49,0);this.arms.push(arm);}
  const short=new THREE.Group();this.box(short,.43,.15,.39,this.hair,0,2,0);this.box(short,.42,.2,.09,this.hair,0,1.88,.15);this.hairstyles.set('short',short);
  const buzz=new THREE.Group();this.box(buzz,.41,.065,.37,this.hair,0,1.96,-.015);this.hairstyles.set('buzz',buzz);
  const long=new THREE.Group();this.box(long,.44,.16,.4,this.hair,0,2,0);this.box(long,.45,.48,.12,this.hair,0,1.8,.19);for(const x of[-.22,.22])this.box(long,.08,.36,.3,this.hair,x,1.82,.015);this.hairstyles.set('long',long);
  const glasses=new THREE.Group();for(const x of[-.105,.105])this.box(glasses,.16,.1,.04,this.accessory,x,1.82,-.22);this.box(glasses,.08,.025,.045,this.accessory,0,1.83,-.22);this.accessories.set('glasses',glasses);
  const cap=new THREE.Group();this.box(cap,.47,.16,.43,this.accessory,0,2.045,0);this.box(cap,.48,.045,.24,this.accessory,0,1.99,-.27);this.accessories.set('cap',cap);
  for(const object of[...this.hairstyles.values(),...this.accessories.values()])this.group.add(object);
  this.crewStripe=this.box(this.group,.12,.44,.02,this.material(0xdcece2),.17,1.17,-.185);this.crewStripe.rotation.z=.2;
  this.setAppearance(createAppearance());
 }
 private material(color:number):AvatarMaterial{return this.software?new THREE.MeshLambertMaterial({color}):new THREE.MeshStandardMaterial({color,roughness:.8,metalness:.02});}
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

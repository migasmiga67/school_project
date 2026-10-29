import * as THREE from 'three';
import { CREW_BASE, HOMES, type CareerState, type CrewBaseState, type HomeId } from './career';

/** A separate, self-lit room; the city renderer supplies the player and camera. */
export class HomeView {
 readonly group=new THREE.Group();
 private readonly floor:THREE.Mesh;
 private readonly wall:THREE.MeshStandardMaterial;
 private readonly wood:THREE.MeshStandardMaterial;
 private readonly accent:THREE.MeshStandardMaterial;
 private readonly sofa:THREE.Group;
 private readonly neon:THREE.Group;
 private readonly workbench:THREE.Group;
 private readonly label:THREE.Mesh;
 private readonly textures=new Set<THREE.Texture>();
 private signature='';
 constructor(private software=false){
  this.group.name='Neon Coast home interior';
  const wall=this.wall=this.material(0xc6bda4),wood=this.wood=this.material(0x8a6045),dark=this.material(0x22353b),trim=this.material(0xc4a879),accent=this.accent=this.material(0x79cbbb,0x287768,.35),white=this.material(0xd8d7c8);
  this.group.add(new THREE.HemisphereLight(0xf6e9d5,0x394c52,2));
  const sun=new THREE.DirectionalLight(0xffdfb8,2.5);sun.position.set(-4,8,4);this.group.add(sun);
  this.floor=this.box(16,.25,14.5,wood,0,-.1,.7);
  for(let i=0;i<13;i++)this.box(15.5,.008,.035,dark,0,.035,-5.7+i*1.05);
  // Open roof and low near wall keep the third-person camera inside the room.
  this.box(16,3.4,.3,wall,0,1.7,-6.35);
  this.box(.3,3.4,14.3,wall,-7.85,1.7,.6);this.box(.3,3.4,14.3,wall,7.85,1.7,.6);
  this.box(6.7,1,.3,wall,-4.6,.5,7.7);this.box(6.7,1,.3,wall,4.6,.5,7.7);
  this.box(15.8,.15,.22,trim,0,.12,-6.12);
  for(const x of [-7.64,7.64])this.box(.16,.15,14,trim,x,.12,.6);
  // Door leads back to the street. Its ring shares HOME_ROOM.exit coordinates.
  this.box(2.4,2.8,.14,dark,0,1.4,7.55);this.box(.14,2.9,.2,trim,-1.3,1.45,7.5);this.box(.14,2.9,.2,trim,1.3,1.45,7.5);
  this.box(.17,.17,.18,trim,.8,1.2,7.4);this.label=this.sign('MIESZKANIE',0,2.45,-6.1,5.4,.7);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.8,.04,4,32),accent);ring.position.set(0,.08,6.7);ring.rotation.x=-Math.PI/2;this.group.add(ring);
  // A map and planning table are included with every property.
  this.box(3.6,.2,2,wood,0,1.08,-3.5);
  for(const x of [-1.5,1.5])for(const z of [-4.2,-2.8])this.box(.13,1,.13,dark,x,.5,z);
  this.box(2.6,.03,1.5,this.material(0xd8d1ac),0,1.195,-3.5);
  for(let i=0;i<5;i++){this.box(.025,.014,1.25,dark,-1+i*.5,1.22,-3.5);this.box(2.3,.014,.025,dark,0,1.23,-4+i*.25);}
  const pin=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,.04,8),accent);pin.position.set(.5,1.25,-3.5);this.group.add(pin);
  this.sign('PLAN EKIPY  ·  E',0,1.7,-4.85,3.5,.45);
  // Permanent kitchen counter has a matching exported collider.
  this.box(2,1.05,3,white,5.5,.525,-3.7);this.box(2.15,.15,3.15,dark,5.5,1.1,-3.7);
  this.box(1,.04,.7,this.material(0x8faaa9),5.5,1.19,-4.4);this.box(.08,.5,.08,trim,5.5,1.4,-4.8);
  for(const z of [-4.4,-3.2])this.box(1.8,.05,.035,dark,5.5,.7,z);
  // A basic bench becomes a comfortable sofa after the furnishing purchase.
  this.box(1.9,.4,3.5,wood,-5,.35,0);this.box(.18,.6,3.5,wood,-5.9,.8,0);
  this.sofa=new THREE.Group();this.group.add(this.sofa);
  this.box(1.9,.55,3.5,accent,-5,.65,0,this.sofa);this.box(.3,.9,3.7,accent,-5.9,1,0,this.sofa);
  for(const z of [-1.8,1.8])this.box(2,.7,.25,accent,-5,.9,z,this.sofa);
  for(const z of [-.9,.3])this.box(1.1,.18,.85,white,-4.8,.99,z,this.sofa);
  const rug=this.box(4.5,.02,5.6,this.material(0x3d595b),-4,.06,.1);rug.rotation.y=.04;
  this.box(.9,.6,1.5,wood,-2.4,.3,.1);this.box(.95,.08,1.55,trim,-2.4,.64,.1);
  // Back-wall windows look over a stylised night skyline.
  const glass=this.material(0x152b41,0x142f48,.9);
  for(const x of [-5,5]){
   this.box(3.1,1.9,.12,glass,x,2,-6.12);this.box(.09,2,.15,trim,x,2,-6);
   for(const y of [1,3])this.box(3.2,.1,.17,trim,x,y,-6);
   for(let i=0;i<5;i++)this.box(.38,.2+i%3*.18,.035,this.material(0xabc4b3,0x637e89,.5),x-1.1+i*.55,1.2+i%3*.09,-6.03);
  }
  const planter=this.material(0x6e614c),leaf=this.material(0x527e5e);
  for(const x of [-6.7,6.7]){const pot=new THREE.Mesh(new THREE.CylinderGeometry(.4,.3,.65,8),planter);pot.position.set(x,.36,4.7);this.group.add(pot);for(let i=0;i<3;i++){const part=new THREE.Mesh(new THREE.ConeGeometry(.5,.8,5),leaf);part.position.set(x+(i-1)*.17,1.1+i*.2,4.7);part.rotation.z=(i-1)*.2;this.group.add(part);}}
  this.neon=new THREE.Group();this.group.add(this.neon);
  const glow=this.material(0x7df0d3,0x42e1b4,1.5);
  this.box(9,.07,.08,glow,0,3.2,-6.05,this.neon);
  this.box(.08,.6,.08,glow,-4.5,2.9,-6.05,this.neon);this.box(.08,.6,.08,glow,4.5,2.9,-6.05,this.neon);
  for(const x of [-7.6,7.6])this.box(.07,.07,10,glow,x,.3,.1,this.neon);
  this.sign('N E O N  C O A S T',0,2.9,-6,4,.45,this.neon,'#7ce3c3');
  this.workbench=new THREE.Group();this.group.add(this.workbench);
  this.box(2.7,.2,1.3,dark,4.9,.95,3.4,this.workbench);
  for(const x of [3.8,6])this.box(.14,.9,1,dark,x,.45,3.4,this.workbench);
  this.box(2.8,1.1,.14,wood,4.9,1.65,3.9,this.workbench);
  for(let i=0;i<4;i++)this.box(.15,.45,.15,trim,4+i*.6,1.7,3.7,this.workbench);
  this.box(.7,.4,.55,this.material(0xac6350),4.5,1.25,3.4,this.workbench);
  this.sofa.visible=false;this.neon.visible=false;this.workbench.visible=false;
 }
 private material(color:number,emissive=0,intensity=0){return new THREE.MeshStandardMaterial({color,emissive,emissiveIntensity:intensity,roughness:.8,metalness:this.software?0:.15});}
 private box(w:number,h:number,d:number,mat:THREE.Material,x:number,y:number,z:number,parent:THREE.Group=this.group){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);parent.add(mesh);return mesh;}
 private sign(text:string,x:number,y:number,z:number,w:number,h:number,parent:THREE.Group=this.group,color='#f3e7be'){
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=128;
  const context=canvas.getContext('2d')!;context.fillStyle='#182c33';context.fillRect(0,0,768,128);context.fillStyle=color;context.font='bold 44px Arial';context.textAlign='center';context.textBaseline='middle';context.fillText(text,384,65,735);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;this.textures.add(texture);
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));mesh.position.set(x,y,z);parent.add(mesh);return mesh;
 }
 update(homeId:HomeId|'crew',career:CareerState,base?:CrewBaseState){
  const items=homeId==='crew'?(base?.furniture??[]):(career.furniture[homeId]??[]),signature=JSON.stringify([homeId,items]);if(signature===this.signature)return;this.signature=signature;
  this.sofa.visible=items.includes('sofa');this.neon.visible=items.includes('neon');this.workbench.visible=items.includes('workbench');
  this.wall.color.setHex(homeId==='loft'?0xa2b4b4:homeId==='crew'?0x7c8b83:0xc6bda4);this.wood.color.setHex(homeId==='loft'?0x705648:0x8a6045);this.accent.color.setHex(homeId==='crew'?0xc7a86b:homeId==='loft'?0x8d9ebf:0x79cbbb);
  const name=homeId==='crew'?CREW_BASE.name:HOMES[homeId].name;
  const mat=this.label.material as THREE.MeshBasicMaterial,old=mat.map;
  const replacement=this.sign(name,0,0,0,1,1);mat.map=(replacement.material as THREE.MeshBasicMaterial).map;mat.needsUpdate=true;
  replacement.geometry.dispose();(replacement.material as THREE.Material).dispose();this.group.remove(replacement);if(old){old.dispose();this.textures.delete(old);}
 }
 destroy(){
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();this.group.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const mat of Array.isArray(object.material)?object.material:[object.material])materials.add(mat);}});
  geometries.forEach(item=>item.dispose());materials.forEach(item=>item.dispose());this.textures.forEach(item=>item.dispose());this.group.removeFromParent();this.group.clear();
 }
}

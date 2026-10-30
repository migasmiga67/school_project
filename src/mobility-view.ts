import * as THREE from 'three';
import { BIKE_RAMPS, DOCK, MOBILITY_COURSES } from './mobility';
import type { GameState, Vehicle } from './model';
import { appearanceColors, createAppearance, type AppearanceState } from './appearance';

export interface MobilityVehicleVisual {
 group:THREE.Group;wheels:THREE.Group[];frontWheels:THREE.Group[];paint:THREE.MeshLambertMaterial;rider:THREE.Group;
}

/** Shared by the local city and remote-player renderer, so silhouettes agree online. */
export function createMobilityVehicle(kind:'bike'|'boat',color:number):MobilityVehicleVisual {
 const group=new THREE.Group(),rider=new THREE.Group(),wheels:THREE.Group[]=[],frontWheels:THREE.Group[]=[];
 const paint=new THREE.MeshLambertMaterial({color}),dark=new THREE.MeshLambertMaterial({color:0x192936}),chrome=new THREE.MeshLambertMaterial({color:0xb2bfc0}),rubber=new THREE.MeshLambertMaterial({color:0x172029});
 const box=(parent:THREE.Object3D,w:number,h:number,d:number,material:THREE.Material,x:number,y:number,z:number)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;};
 const person=(slot:string,w:number,h:number,d:number,x:number,y:number,z:number,color:number)=>{
  let geometry:THREE.BufferGeometry;
  if(slot==='shirt'){geometry=new THREE.CylinderGeometry(.5,.41,1,8);geometry.scale(w,h,d);}
  else if(slot==='hair'){geometry=new THREE.SphereGeometry(.5,8,5,0,Math.PI*2,0,Math.PI*.57);geometry.scale(w,h*2,d);y-=.1;}
  else if(slot==='skin'&&w>.3){geometry=new THREE.SphereGeometry(.5,8,6);geometry.scale(w,h,d);}
  else{geometry=new THREE.CapsuleGeometry(.5,1,3,8);geometry.scale(w,h/2,d);}
  const mesh=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({color}));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;rider.add(mesh);mesh.name=`rider-${slot}`;mesh.userData.appearanceSlot=slot;return mesh;
 };
 if(kind==='bike'){
  for(const z of[-1.18,1.18]){
   const steer=new THREE.Group();steer.position.set(0,.48,z);group.add(steer);const spin=new THREE.Group();steer.add(spin);wheels.push(spin);if(z<0)frontWheels.push(steer);
   const tire=new THREE.Mesh(new THREE.CylinderGeometry(.48,.48,.25,12),rubber);tire.rotation.z=Math.PI/2;spin.add(tire);
   const hub=new THREE.Mesh(new THREE.CylinderGeometry(.27,.27,.28,8),chrome);hub.rotation.z=Math.PI/2;spin.add(hub);
  }
  box(group,.24,.12,2.25,chrome,0,.65,0);box(group,.6,.44,.9,paint,0,1.03,-.2);box(group,.54,.18,1.1,dark,0,1.08,.62);
  box(group,.65,.4,.2,paint,0,1.2,-1.02);box(group,.4,.22,.07,new THREE.MeshBasicMaterial({color:0xffe7ae}),0,1.23,-1.16);
  box(group,.34,.1,.08,new THREE.MeshBasicMaterial({color:0xe95f65}),0,1.05,1.35);box(group,.85,.08,.12,chrome,0,1.43,-.8);
  for(const x of[-.2,.2]){const fork=box(group,.08,.85,.08,chrome,x,.85,-1.06);fork.rotation.x=.17;box(group,.12,.12,.62,dark,x,.72,.5);}
  person('shirt',.52,.64,.35,0,1.6,.24,0xc5b897).rotation.x=-.18;person('skin',.14,.14,.14,0,1.93,-.015,0xc19074);person('skin',.36,.4,.34,0,2.08,-.045,0xc19074);person('hair',.39,.17,.37,0,2.28,-.025,0x29343d);
  for(const x of[-.3,.3]){person('pants',.2,.65,.24,x,1.04,.46,0x324654).rotation.x=-.3;person('skin',.16,.66,.18,x,1.54,-.35,0xc19074).rotation.x=.9;person('skin',.145,.17,.14,x,1.34,-.64,0xc19074);}
 }else{
  // Bow is a stretched cone, stern is flat. The lower hull sits partly in water.
  const hull=new THREE.Mesh(new THREE.CylinderGeometry(1.3,1.0,5.8,4,1),paint);hull.rotation.x=Math.PI/2;hull.rotation.z=Math.PI/4;hull.scale.y=.5;hull.position.y=.35;group.add(hull);
  box(group,2.45,.4,4.9,paint,0,.48,.2);box(group,2.2,.16,4.4,new THREE.MeshLambertMaterial({color:0xc6a77c}),0,.78,.3);
  box(group,1.85,.9,1.65,dark,0,1.18,-.45);box(group,1.75,.65,.07,new THREE.MeshLambertMaterial({color:0x88b9c9}),0,1.6,-1.2);
  box(group,1.8,.2,.6,new THREE.MeshLambertMaterial({color:0xeadfc4}),0,1.02,1.3);box(group,1.8,.65,.22,new THREE.MeshLambertMaterial({color:0xeadfc4}),0,1.26,1.6);
  for(const x of[-1.05,1.05]){box(group,.1,.4,3.2,chrome,x,1,.1);box(group,.15,.12,.18,new THREE.MeshBasicMaterial({color:x<0?0xe06060:0x6fe4b6}),x,1.1,-1.15);}
  const motor=box(group,.65,.95,.65,dark,0,.38,2.85);motor.rotation.x=-.12;
  rider.position.set(.45,.25,.55);person('shirt',.52,.68,.34,0,1.2,0,0xc5b897);person('skin',.14,.14,.14,0,1.56,0,0xc19074);person('skin',.36,.43,.34,0,1.78,-.02,0xc19074);person('hair',.39,.16,.37,0,1.99,0,0x29343d);
  for(const x of[-.16,.16])person('pants',.22,.68,.24,x,.54,0,0x324654);
  for(const x of[-.34,.34]){person('skin',.17,.58,.2,x,1.2,-.16,0xc19074).rotation.x=.45;person('skin',.14,.17,.14,x,.94,-.3,0xc19074);}
 }
 group.add(rider);return{group,wheels,frontWheels,paint,rider};
}

/** Boats, motorcycles, ramps and the usable shore entrance. Gameplay stays in game.ts. */
export class MobilityView {
 readonly group=new THREE.Group();
 private readonly vehicles=new Map<string,MobilityVehicleVisual>();
 private clock=0;
 private riderColors=appearanceColors(createAppearance());
 setAppearance(appearance:AppearanceState,crewColor?:number){this.riderColors=appearanceColors(appearance,crewColor);}
 constructor(_software=false){
  const wood=new THREE.MeshLambertMaterial({color:0xad8c69}),dark=new THREE.MeshLambertMaterial({color:0x31444a}),accent=new THREE.MeshBasicMaterial({color:0x90e6d3});
  const box=(w:number,h:number,d:number,material:THREE.Material,x:number,y:number,z:number)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);this.group.add(mesh);return mesh;};
  box(16,.32,5,wood,102,.13,20);for(const x of[96,101,106])for(const z of[17.8,22.2])box(.2,1.6,.2,dark,x,-.4,z);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(1.35,.06,4,32),accent);ring.rotation.x=-Math.PI/2;ring.position.set(DOCK.land.x,.14,DOCK.land.z);this.group.add(ring);
  this.sign('MARINA · E','MOTORÓWKA · POWRÓT PRZY BOI',96,2.7,16.6,6,1.4,-Math.PI/2);
  for(const ramp of BIKE_RAMPS){
   const wedge=new THREE.Mesh(new THREE.BoxGeometry(ramp.width,.25,ramp.length),new THREE.MeshLambertMaterial({color:0x47555a}));wedge.position.set(ramp.x,ramp.height/2,ramp.z);wedge.rotation.set(Math.atan(ramp.height/ramp.length),-ramp.heading,0);this.group.add(wedge);
   for(const side of[-1,1]){const marker=new THREE.Mesh(new THREE.BoxGeometry(.12,.16,ramp.length),accent);marker.position.set(ramp.x+Math.cos(ramp.heading)*side*ramp.width/2,ramp.height/2+.2,ramp.z+Math.sin(ramp.heading)*side*ramp.width/2);marker.rotation.set(Math.atan(ramp.height/ramp.length),-ramp.heading,0);this.group.add(marker);}
  }
  this.sign('VORTEX R','MOTOCYKL · E · PRÓBY W TELEFONIE',8,2.4,85,6,1.2,0);
  for(const point of MOBILITY_COURSES.boat.checkpoints){
   const buoy=new THREE.Group();buoy.position.set(point.x,0,point.z);
   const cone=new THREE.Mesh(new THREE.ConeGeometry(.6,1.4,8),new THREE.MeshLambertMaterial({color:0xe7b862}));cone.position.y=.5;buoy.add(cone);
   const beacon=new THREE.Mesh(new THREE.SphereGeometry(.25,8,6),accent);beacon.position.y=1.4;buoy.add(beacon);this.group.add(buoy);
  }
 }
 private sign(title:string,subtitle:string,x:number,y:number,z:number,w:number,h:number,rotation:number){
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=192;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#142a33';ctx.fillRect(0,0,768,192);ctx.strokeStyle='#93d9c4';ctx.lineWidth=5;ctx.strokeRect(4,4,760,184);ctx.textAlign='center';ctx.fillStyle='#e6e9d6';ctx.font='bold 61px Arial';ctx.fillText(title,384,88);ctx.font='22px Arial';ctx.fillText(subtitle,384,144);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));mesh.position.set(x,y,z);mesh.rotation.y=rotation;this.group.add(mesh);
 }
 update(state:GameState,dt=0,hiddenIds:ReadonlySet<string>=new Set(),firstPersonVehicleId?:string){
  this.clock+=Math.max(0,dt);this.group.visible=!state.interior;const alive=new Set<string>();
  for(const vehicle of state.vehicles){
   if(vehicle.kind!=='bike'&&vehicle.kind!=='boat')continue;alive.add(vehicle.id);let visual=this.vehicles.get(vehicle.id);
   if(!visual){visual=createMobilityVehicle(vehicle.kind,vehicle.color);this.vehicles.set(vehicle.id,visual);this.group.add(visual.group);}
   visual.group.visible=!hiddenIds.has(vehicle.id)&&vehicle.id!==firstPersonVehicleId;
   visual.paint.color.setHex(vehicle.color);visual.group.position.set(vehicle.x,vehicle.kind==='boat'?.08+Math.sin(this.clock*2+vehicle.x)*.06:(vehicle.airHeight??0),vehicle.z);
   visual.group.rotation.set(0,-vehicle.heading,vehicle.kind==='bike'?-(vehicle.lean??vehicle.steer*.3):Math.sin(this.clock*1.4)*.012);
   visual.wheels.forEach(wheel=>wheel.rotation.x=vehicle.wheelPhase);visual.frontWheels.forEach(wheel=>wheel.rotation.y=vehicle.steer*.28);
   visual.rider.visible=state.player.mode==='drive'&&state.player.vehicleId===vehicle.id;
   if(visual.rider.visible)visual.rider.traverse(object=>{if(!(object instanceof THREE.Mesh))return;const slot=object.userData.appearanceSlot as 'shirt'|'pants'|'skin'|'hair'|undefined;if(!slot)return;for(const material of Array.isArray(object.material)?object.material:[object.material])if('color'in material)(material as THREE.MeshLambertMaterial).color.setHex(this.riderColors[slot]);});
  }
  for(const[id,visual]of this.vehicles)if(!alive.has(id)){this.dispose(visual.group);this.vehicles.delete(id);}
 }
 private dispose(root:THREE.Object3D){const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();root.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material]){materials.add(material);const map=(material as THREE.MeshBasicMaterial).map;if(map)textures.add(map);}}});root.removeFromParent();geometries.forEach(item=>item.dispose());materials.forEach(item=>item.dispose());textures.forEach(item=>item.dispose());}
 destroy(){this.dispose(this.group);this.vehicles.clear();}
}

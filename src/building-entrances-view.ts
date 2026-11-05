import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILDING_ENTRANCES,BuildingEntranceDoors,advanceBuildingDoor,createBuildingDoorState,type BuildingEntranceId,type EntranceActor } from './building-entrances';
import type { Point } from './model';

type DoorMaterial=THREE.MeshLambertMaterial|THREE.MeshStandardMaterial;

/** Two retained leaves retract into the facade instead of disappearing on interaction. */
export class SlidingEntranceDoor {
 readonly group=new THREE.Group();
 private readonly leaves:THREE.Group[]=[];
 private readonly geometry=new Set<THREE.BufferGeometry>();
 private readonly materials=new Set<THREE.Material>();
 constructor(readonly width:number,readonly height:number,accent:number,software=false){
  this.group.name='animated-building-door';
  const material=(color:number,emissive=0):DoorMaterial=>{const value=software?new THREE.MeshLambertMaterial({color,emissive,emissiveIntensity:.3}):new THREE.MeshStandardMaterial({color,emissive,emissiveIntensity:.3,roughness:.35,metalness:.3});this.materials.add(value);return value;};
  const metal=material(accent),glass=material(0x284653,0x10272c),wall=material(0x172c32);
  const interior=new THREE.MeshBasicMaterial({color:0x203534});this.materials.add(interior);
  const box=(parent:THREE.Object3D,w:number,h:number,d:number,mat:THREE.Material,x:number,y:number,z:number)=>{const geometry=new THREE.BoxGeometry(w,h,d);this.geometry.add(geometry);const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(x,y,z);mesh.receiveShadow=true;mesh.castShadow=!software;parent.add(mesh);return mesh;};
  // An illuminated recess is visible through the opening; it covers the old
  // building body while existing interior transitions retain their own rooms.
  box(this.group,width,height,.04,interior,0,height/2,-.75);
  for(const side of[-1,1])box(this.group,.1,height,.76,wall,side*(width/2-.05),height/2,-.36);
  box(this.group,width,.035,.75,wall,0,.015,-.36);
  box(this.group,width*.7,.045,.04,metal,0,height*.82,-.68);
  box(this.group,width+.26,.14,.22,metal,0,height+.04,.035);
  for(const side of[-1,1]){
   box(this.group,.12,height+.1,.22,metal,side*(width/2+.07),height/2,.035);
   const leaf=new THREE.Group();leaf.name=side<0?'door-leaf-left':'door-leaf-right';leaf.position.x=side*width/4;this.group.add(leaf);this.leaves.push(leaf);
   box(leaf,width/2-.035,height,.10,glass,0,height/2,0);
   for(const edge of[-1,1])box(leaf,.055,height,.14,metal,edge*(width/4-.045),height/2,.025);
   for(const y of[.055,height-.055])box(leaf,width/2,.07,.14,metal,0,y,.025);
   box(leaf,.04,height*.28,.12,metal,-side*width*.13,height*.48,.13);
  }
  // Retain two moving leaf groups, while their fixed handles and trim share draws.
  const compact=(parent:THREE.Group)=>{
   const batches=new Map<THREE.Material,THREE.Mesh[]>();
   for(const child of parent.children)if(child instanceof THREE.Mesh&&!Array.isArray(child.material)){const batch=batches.get(child.material)??[];batch.push(child);batches.set(child.material,batch);}
   for(const[material,meshes]of batches){
    if(meshes.length<2)continue;
    const geometries=meshes.map(mesh=>{mesh.updateMatrix();return mesh.geometry.clone().applyMatrix4(mesh.matrix);}),geometry=mergeGeometries(geometries);
    geometries.forEach(value=>value.dispose());if(!geometry)continue;
    for(const mesh of meshes){parent.remove(mesh);this.geometry.delete(mesh.geometry);mesh.geometry.dispose();}
    this.geometry.add(geometry);const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=!software;mesh.receiveShadow=true;parent.add(mesh);
   }
  };
  this.leaves.forEach(compact);compact(this.group);
 }
 setProgress(progress:number){const value=Number.isFinite(progress)?Math.max(0,Math.min(1,progress)):0;this.leaves.forEach((leaf,index)=>leaf.position.x=(index===0?-1:1)*(this.width/4+this.width/2*value));this.group.userData.openProgress=value;}
 destroy(){this.group.removeFromParent();this.geometry.forEach(geometry=>geometry.dispose());this.materials.forEach(material=>material.dispose());this.group.clear();}
}

/** Added after static batching, so all four entrances keep moving independently. */
export class BuildingEntrancesView {
 readonly group=new THREE.Group();
 private readonly doors=new BuildingEntranceDoors();
 private readonly visuals=new Map<BuildingEntranceId,SlidingEntranceDoor>();
 constructor(software=false){
  this.group.name='interactive-building-entrances';
  for(const entrance of BUILDING_ENTRANCES){const visual=new SlidingEntranceDoor(entrance.width,entrance.height,entrance.accent,software);visual.group.position.set(entrance.portal.x,.15,entrance.portal.z);visual.group.rotation.y=entrance.rotation;visual.group.name=`entrance-${entrance.id}`;this.group.add(visual.group);this.visuals.set(entrance.id,visual);}
 }
 update(actors:readonly EntranceActor[],dt:number){this.doors.update(actors,dt);const states=this.doors.snapshot;for(const[id,visual]of this.visuals)visual.setProgress(states[id].progress);}
 holdOpen(id:BuildingEntranceId,seconds=2){this.doors.holdOpen(id,seconds);}
 get snapshot(){return this.doors.snapshot;}
 destroy(){this.visuals.forEach(visual=>visual.destroy());this.visuals.clear();this.group.removeFromParent();this.group.clear();}
}

/** Interior exits use the same leaves, with room-local proximity and no access checks. */
export class InteriorEntranceDoor {
 readonly visual:SlidingEntranceDoor;
 private state=createBuildingDoorState();
 constructor(width:number,height:number,accent:number,software=false){this.visual=new SlidingEntranceDoor(width,height,accent,software);}
 update(position:Point,exit:Point,dt:number){this.state=advanceBuildingDoor(this.state,Number.isFinite(position.x+position.z)&&Math.hypot(position.x-exit.x,position.z-exit.z)<3,dt);this.visual.setProgress(this.state.progress);}
 destroy(){this.visual.destroy();}
}

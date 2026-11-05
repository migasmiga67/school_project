import { describe,it,expect,vi } from 'vitest';
import * as THREE from 'three';
import { AvatarView } from '../src/avatar-view';
import { createAppearance,appearanceAction,appearanceColors } from '../src/appearance';
import { createCharacterFaceGeometry,createPedestrianHairGeometry,createPedestrianHeadGeometry,CHARACTER_HEAD_SCALE } from '../src/character-geometry';
import { CityLife,pedestrianPose } from '../src/city-life';

describe('character presentation',()=>{
 it('exposes forehead and cheeks in every hairstyle instead of covering the face with scalp geometry',()=>{
  const avatar=new AvatarView(true),ray=new THREE.Raycaster();
  try{
   for(const hairstyle of['hair-short','hair-buzz','hair-long']){
    const appearance=createAppearance();appearance.owned.push(hairstyle);appearance.selected.hair=hairstyle;avatar.setAppearance(appearance);avatar.group.updateMatrixWorld(true);
    const visible:THREE.Mesh[]=[];avatar.group.traverseVisible(object=>{if(object instanceof THREE.Mesh)visible.push(object);});
    for(const[x,y]of[[0,.08],[-.105,-.045],[.105,-.045]]as const){
     ray.set(new THREE.Vector3(x*CHARACTER_HEAD_SCALE,1.79+y*CHARACTER_HEAD_SCALE,-2),new THREE.Vector3(0,0,1));const hit=ray.intersectObjects(visible,false)[0];expect(hit,hairstyle).toBeTruthy();
     expect(((hit.object as THREE.Mesh).material as THREE.MeshLambertMaterial).color.getHex(),`${hairstyle}: ${x}/${y}`).toBe(appearanceColors(appearance).skin);
    }
   }
  }finally{avatar.destroy();}
  const skin=new THREE.MeshLambertMaterial({color:0xc19074}),hair=new THREE.MeshLambertMaterial({color:0x302b27}),head=new THREE.Mesh(createPedestrianHeadGeometry(),skin),scalp=new THREE.Mesh(createPedestrianHairGeometry(),hair);
  try{
   head.scale.setScalar(CHARACTER_HEAD_SCALE);scalp.scale.setScalar(CHARACTER_HEAD_SCALE);head.updateMatrixWorld(true);scalp.updateMatrixWorld(true);
   const neckBottom=new THREE.Box3().setFromObject(head).min.y+1.76;expect(neckBottom).toBeLessThanOrEqual(1.49-.025);
   for(const[x,y]of[[0,.08],[-.105,-.045],[.105,-.045]]as const){
    ray.set(new THREE.Vector3(x*CHARACTER_HEAD_SCALE,y*CHARACTER_HEAD_SCALE,-2),new THREE.Vector3(0,0,1));expect(ray.intersectObjects([head,scalp],false)[0]?.object).toBe(head);
   }
  }finally{head.geometry.dispose();scalp.geometry.dispose();skin.dispose();hair.dispose();}
 });
 it('keeps facial detail in front of a human-sized head and retains multiple material colours',()=>{
  const face=createCharacterFaceGeometry(0xc19074,0x303333);
  try{
   face.computeBoundingBox();const bounds=face.boundingBox!;
   expect(bounds.min.z).toBeLessThan(-.2);expect(bounds.max.z).toBeLessThan(.05);
   expect(bounds.max.x-bounds.min.x).toBeLessThan(.44);expect(bounds.max.y-bounds.min.y).toBeLessThan(.22);
   const color=face.getAttribute('color'),palette=new Set<string>();
   for(let i=0;i<color.count;i++)palette.add(`${color.getX(i).toFixed(3)}/${color.getY(i).toFixed(3)}/${color.getZ(i).toFixed(3)}`);
   expect(palette.size).toBeGreaterThanOrEqual(6);expect(face.getAttribute('position').count).toBeLessThan(4000);
  }finally{face.dispose();}
 });
 it('uses attached articulated limbs with cached geometry and bounded draw calls through appearance changes',()=>{
  const avatar=new AvatarView(true);
  try{
   const bounds=new THREE.Box3().setFromObject(avatar.group);expect(bounds.min.y).toBeGreaterThan(-.04);expect(bounds.max.y).toBeLessThan(2.1);
   const geometries=new Set<THREE.BufferGeometry>();let meshes=0;
   avatar.group.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);if(object.visible)meshes++;}});
   expect(meshes).toBeLessThan(42);expect(avatar.group.getObjectByName('avatar-face-features')).toBeTruthy();
   const knee=avatar.legs[0].children.find(child=>child instanceof THREE.Group)!;
   for(let frame=0;frame<60;frame++)avatar.update(true,frame/60,{speed:5,heading:0,dt:1/60});
   expect(knee.rotation.x).not.toBe(0);expect(avatar.legs[0].rotation.x).not.toBe(0);
   const appearance=appearanceAction(createAppearance(),500,{type:'buy',item:'shirt-coral'});expect(appearance.ok).toBe(true);
   if(appearance.ok)avatar.setAppearance(appearance.appearance);
   const current=new Set<THREE.BufferGeometry>();avatar.group.traverse(object=>{if(object instanceof THREE.Mesh)current.add(object.geometry);});
   expect(current).toEqual(geometries);
  }finally{avatar.destroy();}
 });
 it('keeps all ambient detail instanced and matched across software quality and neighbourhood changes',()=>{
  vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})})});
  const full=new CityLife(false),light=new CityLife(true);full.setQuality('high');
  const people=(life:CityLife)=>life.group.children.filter((object):object is THREE.InstancedMesh=>object instanceof THREE.InstancedMesh&&object.name.startsWith('pedestrian-'));
  try{
   const all=people(full),limited=people(light);expect(all).toHaveLength(8);expect(limited).toHaveLength(8);
   for(const[seconds,player]of[[0,{x:0,z:0}],[35,{x:-180,z:20}],[66,{x:80,z:-160}]]as const){
    full.update(seconds,player,false,.016);light.update(seconds,player,false,.016);
    for(let part=0;part<all.length;part++){
     const multiplicity=[1,1,2,2,2,2,1,1][part];
     light.snapshot.visibleIds.forEach((id,index)=>{
      const source=full.snapshot.visibleIds.indexOf(id);expect(source).toBeGreaterThanOrEqual(0);
      for(let side=0;side<multiplicity;side++){
       const expected=new THREE.Matrix4(),actual=new THREE.Matrix4(),expectedColor=new THREE.Color(),actualColor=new THREE.Color();
       all[part].getMatrixAt(source*multiplicity+side,expected);limited[part].getMatrixAt(index*multiplicity+side,actual);
       all[part].getColorAt(source*multiplicity+side,expectedColor);limited[part].getColorAt(index*multiplicity+side,actualColor);
       expect(actual.elements).toEqual(expected.elements);expect(actualColor).toEqual(expectedColor);
      }
     });
    }
    const pose=pedestrianPose(light.snapshot.visibleIds[0],seconds);expect(Number.isFinite(pose.x)).toBe(true);
   }
  }finally{full.destroy();light.destroy();vi.unstubAllGlobals();}
 });
});

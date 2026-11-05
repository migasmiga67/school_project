import {describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {FirstPersonView,type FirstPersonInput} from '../src/first-person-view';
import {appearanceColors,createAppearance} from '../src/appearance';

const input:FirstPersonInput={visible:true,mode:'foot',speed:0,steer:0,dt:1/60,seconds:0,fov:58,aspect:16/9};
const geometrySet=(view:FirstPersonView)=>{const result=new Set<THREE.BufferGeometry>();view.group.traverse(object=>{if(object instanceof THREE.Mesh)result.add(object.geometry);});return result;};
const visibleMeshes=(view:FirstPersonView)=>{const result:THREE.Mesh[]=[];view.group.traverseVisible(object=>{if(object instanceof THREE.Mesh)result.push(object);});return result;};
function renderable(view:FirstPersonView,sample:FirstPersonInput=input){view.update(sample);view.group.updateMatrixWorld(true);return view;}

describe('first person hands and cockpit',()=>{
 it('uses retained, bounded geometry with skin, cuffs, individual fingers and depth-safe rendering',()=>{
  const view=renderable(new FirstPersonView(true));
  try{
   const meshes=visibleMeshes(view);expect(meshes).toHaveLength(6);
   let triangles=0;for(const mesh of meshes){
    expect(Array.isArray(mesh.material)).toBe(false);const material=mesh.material as THREE.Material;
    expect(material.depthTest).toBe(true);expect(material.depthWrite).toBe(true);
    const vertices=mesh.geometry.getAttribute('position');expect(Array.from(vertices.array).every(Number.isFinite)).toBe(true);triangles+=(mesh.geometry.index?.count??vertices.count)/3;
   }
   expect(triangles).toBeGreaterThan(1000);expect(triangles).toBeLessThan(12000);
   const arms=view.group.getObjectByName('first-person-hands')!.children;expect(arms).toHaveLength(2);
   for(const arm of arms){expect(arm.getObjectByName('first-person-skin')).toBeDefined();expect(arm.getObjectByName('first-person-sleeve')).toBeDefined();expect(arm.getObjectByName('first-person-nails')).toBeDefined();}
   const original=geometrySet(view);for(let frame=0;frame<180;frame++)view.update({...input,speed:6,dt:1/60,seconds:frame/60});expect(geometrySet(view)).toEqual(original);
  }finally{view.destroy();}
 });

 it.each([35,58,85])('keeps both palms visible below the centre at FOV %i on desktop and portrait',fov=>{
  const view=new FirstPersonView();
  try{for(const aspect of[16/9,390/844]){
   const camera=new THREE.PerspectiveCamera(fov,aspect,.15,100);camera.add(view.group);renderable(view,{...input,fov,aspect});camera.updateMatrixWorld(true);
   for(const arm of view.group.getObjectByName('first-person-hands')!.children){
    const palm=arm.localToWorld(new THREE.Vector3(0,0,-.01)),projected=palm.clone().project(camera);
    expect(palm.z).toBeLessThan(-camera.near);expect(Math.abs(projected.x)).toBeLessThan(.95);expect(projected.y).toBeLessThan(-.6);expect(projected.y).toBeGreaterThan(-1);
   }
  }}finally{view.destroy();}
 });


 it.each([35,58,85])('keeps both wheel grips visible at FOV %i including a narrow phone screen',fov=>{
  const view=new FirstPersonView();
  try{for(const aspect of[16/9,390/844]){
   const camera=new THREE.PerspectiveCamera(fov,aspect,.15,100);camera.add(view.group);renderable(view,{...input,mode:'drive',fov,aspect});camera.updateMatrixWorld(true);
   const wheel=view.group.getObjectByName('first-person-steering-wheel')!;
   for(const hand of wheel.children.filter(child=>child.name==='wheel-grip')){
    const palm=hand.localToWorld(new THREE.Vector3(0,0,-.01)),projected=palm.clone().project(camera);
    expect(palm.z).toBeLessThan(-camera.near);expect(Math.abs(projected.x)).toBeLessThan(.95);expect(projected.y).toBeLessThan(-.1);expect(projected.y).toBeGreaterThan(-1);
   }
  }}finally{view.destroy();}
 });

 it('uses the same purchased skin and crew sleeves as the character without rebuilding meshes',()=>{
  const view=renderable(new FirstPersonView());
  try{
   const geometry=geometrySet(view),appearance=createAppearance();appearance.selected.skin='skin-deep';appearance.crewOutfit=true;
   view.setAppearance(appearance,0x218bad);const expected=appearanceColors(appearance,0x218bad);
   for(const name of['first-person-skin','first-person-sleeve']){
    const mesh=view.group.getObjectByName(name) as THREE.Mesh<THREE.BufferGeometry,THREE.MeshLambertMaterial>;
    expect(mesh.material.color.getHex()).toBe(name==='first-person-skin'?expected.skin:expected.shirt);
   }
   expect(geometrySet(view)).toEqual(geometry);
  }finally{view.destroy();}
 });

 it('blends a restrained walking/running gait back to idle and freezes on pause',()=>{
  const view=renderable(new FirstPersonView());
  try{
   const arm=view.group.getObjectByName('first-person-hands')!.children[0],rest=arm.position.clone();
   let travelled=0;for(let frame=0;frame<90;frame++){view.update({...input,speed:6,seconds:frame/60});travelled=Math.max(travelled,arm.position.distanceTo(rest));}
   expect(view.snapshot.phase).toBeGreaterThan(0);expect(view.snapshot.speed).toBeGreaterThan(5.9);expect(travelled).toBeGreaterThan(.04);
   const phase=view.snapshot.phase,position=arm.position.clone();view.update({...input,speed:6,dt:0,seconds:100});expect(view.snapshot.phase).toBe(phase);expect(arm.position.equals(position)).toBe(true);
   for(let frame=0;frame<180;frame++)view.update({...input,seconds:2+frame/60});expect(view.snapshot.speed).toBeLessThan(.001);expect(Math.abs(arm.position.y-rest.y)).toBeLessThan(.001);expect(Math.abs(arm.position.z-rest.z)).toBeLessThan(.001);
  }finally{view.destroy();}
 });

 it('turns the wheel and gripping hands right together, while mouse look reveals the car interior at its real orientation',()=>{
  const view=renderable(new FirstPersonView(),{...input,mode:'drive'});
  try{
   for(let frame=0;frame<90;frame++)view.update({...input,mode:'drive',speed:20,steer:1});
   const wheel=view.group.getObjectByName('first-person-steering-wheel')!,cockpit=view.group.getObjectByName('first-person-cockpit')!;
   expect(wheel.rotation.z).toBeLessThan(-.69);expect(wheel.children.filter(child=>child.name==='wheel-grip')).toHaveLength(2);
   expect(view.snapshot.hands).toBe(2);expect(view.group.getObjectByName('first-person-hands')!.visible).toBe(false);
   renderable(view,{...input,mode:'drive',lookYaw:Math.PI/2,lookPitch:.2});const wheelWorld=wheel.getWorldPosition(new THREE.Vector3());
   expect(cockpit.rotation.x).toBeCloseTo(.2);expect(wheelWorld.x).toBeLessThan(-.5);expect(Math.abs(wheelWorld.z)).toBeLessThan(.1);
   view.update({...input,visible:false,mode:'drive'});expect(view.group.visible).toBe(false);expect(view.snapshot.hands).toBe(0);
  }finally{view.destroy();}
 });


 it('renders a retained self-occluding overlay without clearing colour or hiding its draw count',()=>{
  const view=renderable(new FirstPersonView());
  const calls:string[]=[],scenes:THREE.Scene[]=[],cameras:THREE.Camera[]=[];
  const renderer={autoClear:true,info:{autoReset:true,render:{calls:100}},clearDepth(){calls.push('depth');},render(scene:THREE.Scene,camera:THREE.Camera){
   expect(this.autoClear).toBe(false);expect(this.info.autoReset).toBe(false);this.info.render.calls+=6;calls.push('render');scenes.push(scene);cameras.push(camera);
  }};
  try{
   view.render(renderer as unknown as THREE.WebGLRenderer);expect(calls).toEqual(['depth','render']);expect(renderer.autoClear).toBe(true);expect(renderer.info.autoReset).toBe(true);expect(renderer.info.render.calls).toBe(106);
   expect(scenes[0].children).toContain(view.group);expect(scenes[0].children.some(object=>object instanceof THREE.HemisphereLight)).toBe(true);
   expect((cameras[0]as THREE.PerspectiveCamera).fov).toBe(58);
   view.update({...input,fov:35,aspect:390/844});view.render(renderer as unknown as THREE.WebGLRenderer);expect(scenes[1]).toBe(scenes[0]);expect(cameras[1]).toBe(cameras[0]);expect((cameras[1]as THREE.PerspectiveCamera).aspect).toBeCloseTo(390/844);expect((cameras[1]as THREE.PerspectiveCamera).fov).toBe(35);
   view.update({...input,visible:false});view.render(renderer as unknown as THREE.WebGLRenderer);expect(calls).toHaveLength(4);
  }finally{view.destroy();}
 });

 it('restores renderer options even when an overlay draw fails',()=>{
  const view=renderable(new FirstPersonView()),renderer={autoClear:false,info:{autoReset:true},clearDepth(){},render(){throw new Error('context lost');}};
  try{expect(()=>view.render(renderer as unknown as THREE.WebGLRenderer)).toThrow('context lost');expect(renderer.autoClear).toBe(false);expect(renderer.info.autoReset).toBe(true);}finally{view.destroy();}
 });

 it('bounds invalid timing and controls and disposes every retained resource once',()=>{
  const view=new FirstPersonView(),geometry=geometrySet(view),spies=[...geometry].map(item=>vi.spyOn(item,'dispose'));
  view.update({...input,dt:NaN,speed:Infinity,steer:NaN,fov:NaN,aspect:NaN,lookYaw:Infinity,lookPitch:NaN});expect(Object.values(view.snapshot).every(value=>typeof value!=='number'||Number.isFinite(value))).toBe(true);
  view.destroy();expect(spies.every(spy=>spy.mock.calls.length===1)).toBe(true);view.destroy();expect(spies.every(spy=>spy.mock.calls.length===1)).toBe(true);
 });
});

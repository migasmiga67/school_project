import {afterEach,describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {CityArt} from '../src/city-art';
import type {SurfaceLibrary} from '../src/surface-materials';

const created:CityArt[]=[];
function art(software=true){
 vi.stubGlobal('document',{createElement:()=>({width:0,height:0})});
 const value=new CityArt(software,{registerVariant(){}} as unknown as SurfaceLibrary);created.push(value);return value;
}
afterEach(()=>{
 for(const value of created){value.destroy();value.group.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();}});}
 created.length=0;vi.unstubAllGlobals();
});
const meshes=(value:CityArt)=>value.group.children.filter((object):object is THREE.Mesh=>object instanceof THREE.Mesh);

describe('static city detail draw budgets',()=>{
 it.each([true,false])('combines different opaque paints and primitive kinds without changing their shapes or colours (software=%s)',software=>{
  const view=art(software),paints=[view.material(0x336699),view.material(0xb57739),view.material(0x70a755),view.material(0x714d91)];
  const shapes=[new THREE.BoxGeometry(1,1,1),new THREE.CylinderGeometry(.5,.5,1,software?6:8),new THREE.SphereGeometry(.5,software?6:8,software?4:6),new THREE.PlaneGeometry(1,1)];
  const placements=[{kind:'box',x:10,y:2,z:10,w:2,h:4,d:6,r:.4},{kind:'cylinder',x:30,y:3,z:20,w:2,h:6,d:2,r:0},{kind:'sphere',x:45,y:6,z:50,w:5,h:5,d:5,r:.2},{kind:'plane',x:40,y:4,z:40,w:3,h:3,d:1,r:-.3}] as const;
  const expected=new THREE.Box3(),dummy=new THREE.Object3D(),sourceColours=paints.map(paint=>paint.color.clone());
  placements.forEach((p,index)=>{
   view.instance(p.kind,paints[index],p.x,p.y,p.z,p.w,p.h,p.d,p.r);
   dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.r,0);dummy.scale.set(p.w,p.h,p.d);dummy.updateMatrix();
   const source=shapes[index];source.applyMatrix4(dummy.matrix);source.computeBoundingBox();expected.union(source.boundingBox!);source.dispose();
  });
  view.finish();
  const rendered=meshes(view);expect(rendered).toHaveLength(1);expect(rendered[0]).not.toBeInstanceOf(THREE.InstancedMesh);
  const actual=new THREE.Box3().setFromObject(rendered[0]);
  for(const axis of ['x','y','z']as const){expect(actual.min[axis]).toBeCloseTo(expected.min[axis],5);expect(actual.max[axis]).toBeCloseTo(expected.max[axis],5);}
  const material=rendered[0].material as THREE.MeshLambertMaterial|THREE.MeshStandardMaterial;
  expect(material.vertexColors).toBe(true);expect(material.color.getHex()).toBe(0xffffff);expect(rendered[0].geometry.groups).toHaveLength(0);
  const colours=rendered[0].geometry.getAttribute('color');let start=0;
  shapes.forEach((shape,index)=>{
   const count=shape.getAttribute('position').count;
   for(let vertex=start;vertex<start+count;vertex++){expect(colours.getX(vertex)).toBeCloseTo(sourceColours[index].r,6);expect(colours.getY(vertex)).toBeCloseTo(sourceColours[index].g,6);expect(colours.getZ(vertex)).toBeCloseTo(sourceColours[index].b,6);}
   expect(paints[index].color).toEqual(sourceColours[index]);expect(paints[index].vertexColors).toBe(false);start+=count;
  });
  expect(rendered[0].castShadow).toBe(!software);expect(rendered[0].receiveShadow).toBe(true);
 });

 it('keeps distant sectors independently cullable and preserves sidedness',()=>{
  const view=art(),red=view.material(0x993333),green=view.material(0x339933);green.side=THREE.DoubleSide;
  view.instance('box',red,5,1,5,2,2,2);view.instance('box',green,10,1,5,2,2,2);
  view.instance('box',red,135,1,-125,2,2,2);view.finish();
  const rendered=meshes(view);expect(rendered).toHaveLength(3);
  expect(new Set(rendered.map(mesh=>(mesh.material as THREE.Material).side))).toEqual(new Set([THREE.FrontSide,THREE.DoubleSide]));
  for(const mesh of rendered){
   const sphere=mesh.geometry.boundingSphere!;expect(sphere.radius).toBeLessThan(3);
   expect(mesh.frustumCulled).toBe(true);expect(Math.abs(sphere.center.x)).toBeLessThan(32);expect(Math.abs(sphere.center.z)).toBeLessThan(32);
  }
  const redMeshes=rendered.filter(mesh=>(mesh.material as THREE.Material).side===THREE.FrontSide);
  expect(redMeshes[0].material).toBe(redMeshes[1].material);
 });

 it('keeps textures, facade variants and glowing or transparent materials live, without mutating shared primitive geometry',()=>{
  const view=art(),solid=view.material(0x995533),textured=view.material(0x447788),glow=view.material(0xffaa66,0x996633),transparent=view.material(0x99aacc);
  const variant=view.tinted(new THREE.MeshLambertMaterial({color:0xffffff}),0x779955);
  textured.map=new THREE.Texture();transparent.transparent=true;transparent.opacity=.4;
  view.instance('box',solid,6,2,8,4,4,8,Math.PI/3);
  for(const [index,material]of[textured,glow,transparent,variant].entries())view.instance('box',material,15+index*5,1,10,2,2,2);
  view.finish();
  const rendered=meshes(view),live=rendered.filter((mesh):mesh is THREE.InstancedMesh=>mesh instanceof THREE.InstancedMesh);
  expect(rendered).toHaveLength(5);expect(live).toHaveLength(4);
  for(const material of[textured,glow,transparent,variant])expect(live.some(mesh=>mesh.material===material)).toBe(true);
  for(const mesh of live){mesh.geometry.computeBoundingBox();expect(mesh.geometry.boundingBox!.min.toArray()).toEqual([-.5,-.5,-.5]);expect(mesh.geometry.boundingBox!.max.toArray()).toEqual([.5,.5,.5]);expect(mesh.geometry.getAttribute('color')).toBeUndefined();}
  expect(variant.vertexColors).toBe(false);expect(glow.emissive.getHex()).toBe(0x996633);textured.map.dispose();
 });
});

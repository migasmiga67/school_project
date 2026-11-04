import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import {VehicleLighting,type VehicleLightSource} from '../src/vehicle-lighting';

const car=(id:string,x:number,z=0):VehicleLightSource=>({id,x,z,heading:0,kind:'sedan'});
describe('bounded vehicle headlights',()=>{
 it('lights the closest cars with a fixed shadow-free GPU light pool',()=>{
  const scene=new THREE.Scene(),lights=new VehicleLighting(scene,false);
  lights.setQuality('high');lights.update([car('far',30),car('near',2),car('middle',12)],{x:0,z:0},0,1/60);
  expect(lights.snapshot.litVehicles).toEqual(['near','middle']);expect(lights.snapshot.spots).toBe(4);expect(lights.snapshot.pools).toBe(6);
  const spots=lights.group.children.filter((child):child is THREE.SpotLight=>child instanceof THREE.SpotLight);
  expect(spots).toHaveLength(4);expect(spots.every(spot=>!spot.castShadow)).toBe(true);
  for(const spot of spots){expect(spot.target.position.z).toBeLessThan(spot.position.z);expect(spot.target.position.y).toBeLessThan(spot.position.y);}
  lights.setQuality('low');lights.update([car('near',2)],{x:0,z:0},0,1/60);
  expect(lights.snapshot.spots).toBe(0);expect(lights.group.children.filter(child=>child instanceof THREE.SpotLight)).toHaveLength(4);
  expect(spots.every(spot=>!spot.visible)).toBe(true);
  lights.destroy();expect(scene.children).toHaveLength(0);
 });
 it('turns the headlight throw with the car and removes stale or hidden sources',()=>{
  const scene=new THREE.Scene(),lights=new VehicleLighting(scene,false);
  lights.update([{...car('right',0),heading:Math.PI/2}],{x:0,z:0},0,1/60);
  const spot=lights.group.children.find((child):child is THREE.SpotLight=>child instanceof THREE.SpotLight)!;
  expect(spot.target.position.x).toBeGreaterThan(spot.position.x+10);
  lights.update([{...car('right',0),visible:false}],{x:0,z:0},0,1/60);
  expect(lights.snapshot.pools).toBe(0);expect(lights.snapshot.spots).toBe(0);
  lights.update([], {x:0,z:0},0,1/60);expect(lights.snapshot.litVehicles).toEqual([]);lights.destroy();
 });
 it('uses batched cones and road pools without real lights in software rendering',()=>{
  const scene=new THREE.Scene(),lights=new VehicleLighting(scene,true);
  lights.update([car('one',0),car('two',20)],{x:0,z:0},0,1/60);
  expect(lights.snapshot).toMatchObject({spots:0,pools:4,cones:4});
  expect(lights.group.children.filter(child=>child instanceof THREE.InstancedMesh)).toHaveLength(3);
  lights.update([car('one',0)],{x:0,z:0},1,1/60);expect(lights.snapshot.pools).toBe(0);
  lights.update([car('one',0)],{x:0,z:0},0,1/60,false);expect(lights.snapshot.cones).toBe(0);lights.destroy();
 });
});

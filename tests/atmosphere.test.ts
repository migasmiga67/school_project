import {describe,expect,it,vi} from 'vitest';
import {AtmosphereView,atmosphereFogProfile} from '../src/atmosphere';
import type {CityEnvironment} from '../src/city-life';

describe('atmospheric quality and weather',()=>{
 it('keeps fog within each camera profile and pulls rainy night visibility inward',()=>{
  const clear=atmosphereFogProfile({rain:0,daylight:1,fog:0xa9c6d2}),storm=atmosphereFogProfile({rain:1,daylight:0,fog:0x41586a});
  expect(clear.nearScale).toBe(1);expect(clear.farScale).toBe(1);
  for(const [near,far,camera]of[[69,160,170],[84,193,205],[100,230,245],[145,540,650]]){
   expect(near*storm.nearScale).toBeLessThan(near);
   expect(far*storm.farScale).toBeLessThan(far);
   expect(near*storm.nearScale).toBeLessThan(far*storm.farScale);
   expect(far*clear.farScale).toBeLessThan(camera);
  }
  const repaired=atmosphereFogProfile({rain:NaN,daylight:Infinity,fog:0xa9c6d2});
  expect(repaired).toEqual(clear);
 });
 it('changes cloud detail without adding geometry, textures or render passes',()=>{
  const sky=new AtmosphereView(false),mesh=sky.group.children[0],material=sky.material;
  try{
   sky.setQuality('low');expect(material.uniforms.uCloudDetail.value).toBe(0);
   sky.setQuality('medium');expect(material.uniforms.uCloudDetail.value).toBeGreaterThan(0);expect(material.uniforms.uCloudDetail.value).toBeLessThan(1);
   sky.setQuality('high');expect(material.uniforms.uCloudDetail.value).toBe(1);
   expect(sky.group.children).toEqual([mesh]);expect(sky.material).toBe(material);
   expect(material.uniforms).not.toHaveProperty('tDiffuse');
  }finally{sky.destroy();}
 });
 it('keeps the software sky on the cheap path and disposes its owned resources',()=>{
  const sky=new AtmosphereView(true),mesh=sky.group.children[0]as import('three').Mesh;
  const geometryDispose=vi.spyOn(mesh.geometry,'dispose'),materialDispose=vi.spyOn(sky.material,'dispose');
  sky.update({rain:2,daylight:NaN,period:'NOC',sky:0x101c35,fog:0x142139}as CityEnvironment,{x:3,y:8,z:10},92000,'high');
  expect(sky.material.uniforms.uCloudDetail.value).toBe(0);
  expect(sky.material.uniforms.uRain.value).toBe(1);expect(sky.material.uniforms.uDaylight.value).toBe(1);
  expect(sky.group.position.toArray()).toEqual([3,8,10]);expect(sky.material.uniforms.uTime.value).toBeLessThan(20000);
  sky.destroy();expect(geometryDispose).toHaveBeenCalledOnce();expect(materialDispose).toHaveBeenCalledOnce();expect(sky.group.children).toHaveLength(0);
 });
});

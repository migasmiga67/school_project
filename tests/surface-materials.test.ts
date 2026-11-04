import {describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {SurfaceLibrary} from '../src/surface-materials';

function proceduralCanvas(){
 const created:{width:number;height:number}[]=[],gradient={addColorStop(){}};
 const pixels=new Uint8ClampedArray(512*512*4);
 const context={fillStyle:'',strokeStyle:'',lineWidth:1,beginPath(){},closePath(){},moveTo(){},lineTo(){},stroke(){},fill(){},fillRect(){},strokeRect(){},createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},getImageData:()=>({data:pixels})};
 vi.stubGlobal('document',{createElement:()=>{const canvas={width:0,height:0,getContext:()=>context};created.push(canvas);return canvas;}});
 return created;
}

describe('cached city surface materials',()=>{
 it('reuses maps across rain and quality changes, restores dry paint, and updates facade variants',()=>{
  const canvases=proceduralCanvas(),surfaces=new SurfaceLibrary(false),road=surfaces.asphalt as THREE.MeshStandardMaterial,glass=surfaces.windowGlass as THREE.MeshStandardMaterial;
  const variant=surfaces.stucco.clone();variant.color.setHex(0x889966);surfaces.registerVariant(variant,surfaces.stucco);
  try{
   const dry=variant.color.clone(),normal=road.normalMap,roughness=road.roughnessMap,reflection=glass.envMap,count=canvases.length,dryRoughness=road.roughness,dryNormal=road.normalScale.x;
   expect(normal).not.toBeNull();expect(reflection).not.toBeNull();expect(road.envMap).toBe(reflection);
   surfaces.updateWeather(1,.3,'high');expect(road.roughness).toBeLessThan(dryRoughness);expect(road.normalScale.x).toBeLessThan(dryNormal);expect(variant.color.r).toBeLessThan(dry.r);
   surfaces.updateWeather(1,.3,'low');expect(road.normalMap).toBeNull();expect(road.roughnessMap).toBeNull();expect(glass.envMap).toBeNull();
   surfaces.updateWeather(0,1,'high');expect(road.normalMap).toBe(normal);expect(road.roughnessMap).toBe(roughness);expect(glass.envMap).toBe(reflection);expect(variant.color.equals(dry)).toBe(true);
   expect(canvases).toHaveLength(count);
  }finally{variant.dispose();surfaces.destroy();vi.unstubAllGlobals();}
 });
 it('keeps software materials Lambert and creates no reflection cube when high is requested',()=>{
  const canvases=proceduralCanvas(),surfaces=new SurfaceLibrary(true);
  try{
   surfaces.updateWeather(1,.2,'high');
   for(const material of[surfaces.asphalt,surfaces.brick,surfaces.windowGlass])expect(material).toBeInstanceOf(THREE.MeshLambertMaterial);
   expect(surfaces.windowGlass.envMap).toBeNull();expect(canvases.some(canvas=>canvas.width===64)).toBe(false);
  }finally{surfaces.destroy();vi.unstubAllGlobals();}
 });
});

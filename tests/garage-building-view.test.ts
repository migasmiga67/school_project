import {afterEach,describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {GarageBuildingView,garageDoorPanelPose} from '../src/garage-building-view';
import {GARAGE_BUILDING,GARAGE_CAR_CLEARANCE} from '../src/garage-building';
import type {GameState} from '../src/model';
import type {SurfaceLibrary} from '../src/surface-materials';

function fixture(){
  vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})})});
  const material=new THREE.MeshLambertMaterial({color:0x789084});
  const surfaces=Object.fromEntries(['asphalt','concrete','pavers','roof','brick','stucco','office','sandstone','grass','sand','bark','windowGlass','litWindow'].map(key=>[key,material]));
  Object.assign(surfaces,{facades:[material],registerVariant(){}});
  const view=new GarageBuildingView(true,surfaces as unknown as SurfaceLibrary);
  return{view,material};
}
const state=(openness:number,x=-20,z=80)=>({player:{x,z},garageGate:{openness,holdUntil:0}} as GameState);
afterEach(()=>vi.unstubAllGlobals());

describe('physical workshop presentation',()=>{
  it('raises real door sections and leaves a clear car-height opening into the bay',()=>{
    const {view,material}=fixture(),b=GARAGE_BUILDING,ray=new THREE.Raycaster(new THREE.Vector3(b.x,1.5,76),new THREE.Vector3(0,0,-1));
    try{
      view.update(state(0));const closed=ray.intersectObjects(view.occluders,false);
      expect(closed[0].distance).toBeLessThan(4);
      view.update(state(1));const open=ray.intersectObjects(view.occluders,false);
      expect(open[0].distance).toBeGreaterThan(17);
      const panels=view.group.children.filter((object):object is THREE.Mesh=>object instanceof THREE.Mesh&&object.userData.garageDoor);
      expect(panels).toHaveLength(7);
      view.update(state(GARAGE_CAR_CLEARANCE));
      const aperture=Math.min(...panels.map(panel=>new THREE.Box3().setFromObject(panel).min.y));
      expect(aperture).toBeGreaterThan(2.7);
      view.update(state(1));
      expect(Math.min(...panels.map(panel=>new THREE.Box3().setFromObject(panel).min.y))).toBeGreaterThan(3.75);
    }finally{view.destroy();material.dispose();}
  });
  it('cuts away overhead floors for an occupant and also removes them from camera collision',()=>{
    const {view,material}=fixture(),ray=new THREE.Raycaster(new THREE.Vector3(-20,30,62),new THREE.Vector3(0,-1,0));
    try{
      view.update(state(1),{x:-20,y:6,z:90});expect(ray.intersectObjects(view.occluders,false).length).toBeGreaterThan(0);
      view.update(state(1,-20,62),{x:-20,y:6,z:70});
      expect(view.snapshot).toMatchObject({inside:true,cutaway:true,openness:1});
      expect(ray.intersectObjects(view.occluders,false)).toHaveLength(0);
      view.update(state(1),{x:-20,y:6,z:90});expect(ray.intersectObjects(view.occluders,false).length).toBeGreaterThan(0);
    }finally{view.destroy();material.dispose();}
  });
  it('keeps every section on its rails and preserves shared surface resources on disposal',()=>{
    for(let index=0;index<7;index++)for(const openness of[-1,0,.25,.5,.75,1,2,NaN]){
      const pose=garageDoorPanelPose(index,openness);expect(Number.isFinite(pose.y+pose.z+pose.rotation)).toBe(true);
      expect(pose.rotation).toBeGreaterThanOrEqual(-Math.PI/2);expect(pose.rotation).toBeLessThanOrEqual(0);
      expect(pose.z).toBeLessThanOrEqual(GARAGE_BUILDING.frontZ);expect(pose.y).toBeLessThanOrEqual(GARAGE_BUILDING.ceilingHeight);
    }
    const {view,material}=fixture(),dispose=vi.spyOn(material,'dispose');view.destroy();expect(dispose).not.toHaveBeenCalled();material.dispose();
  });
});

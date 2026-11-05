import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { RemotePlayersView } from '../src/remote-players';
import { appearanceAction, appearanceColors, createAppearance } from '../src/appearance';
import type { OnlineMember, OnlineVehicle } from '../src/multiplayer-model';
import { CHARACTER_HEAD_SCALE } from '../src/character-geometry';

const views:RemotePlayersView[]=[];
const member=(id='driver'):OnlineMember=>({id,name:id,slot:0,appearance:createAppearance(),pose:{x:0,z:0,heading:0,mode:'drive',interior:null,seated:false,vehicle:{id:'car',kind:'sedan',x:0,z:0,heading:0,color:0x397b91,speed:12,health:100}}});
const vehicle=(person:OnlineMember,patch:Partial<OnlineVehicle>)=>{person.pose.vehicle={...person.pose.vehicle!,...patch};};
const car=(view:RemotePlayersView,id='driver')=>view.group.getObjectByName(`Online player ${id}`)!.children[1] as THREE.Group;
const view=()=>{const result=new RemotePlayersView(true);views.push(result);return result;};

beforeEach(()=>{
  const context={fillStyle:'',strokeStyle:'',lineWidth:0,font:'',textAlign:'',textBaseline:'',beginPath(){},roundRect(){},fill(){},stroke(){},fillText(){}};
  vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>context})});
});
afterEach(()=>{for(const item of views.splice(0))item.destroy();vi.unstubAllGlobals();});

describe('shared detailed online vehicles',()=>{
  it('uses the same retained police model, wheel steering and braking response as local cars',()=>{
    const other=member(),scene=view();vehicle(other,{kind:'police'});scene.update([other],'self',null,.1);
    const model=car(scene).getObjectByName('detailed-police')!;
    expect(model).toBeInstanceOf(THREE.Group);
    expect(model.getObjectByName('tapered-glazing')).toBeInstanceOf(THREE.Mesh);
    expect(model.getObjectsByProperty('name','wheel-spin')).toHaveLength(4);
    vehicle(other,{x:.5,z:-1,heading:.25,speed:8});scene.update([other],'self',null,.1);
    for(const pivot of model.getObjectsByProperty('name','front-steering-pivot'))expect(pivot.rotation.y).toBeLessThan(0);
    const body=model.getObjectByName('sprung-chassis')!;
    expect(Math.abs(body.rotation.x)).toBeGreaterThan(0);
    let brakes=0;body.traverse(object=>{if(object instanceof THREE.Mesh){const material=object.material as THREE.MeshLambertMaterial;if(material.emissive.getHex()===0xf4323f){expect(material.emissiveIntensity).toBeGreaterThan(.25);brakes++;}}});
    expect(brakes).toBe(1);
  });

  it('removes and disposes the old car when switching between cars, bikes and boats',()=>{
    const other=member(),scene=view();scene.update([other],'self',null,.016);
    const container=car(scene),old=container.children[0],shell=old.getObjectByName('painted-shell') as THREE.Mesh;
    const dispose=vi.spyOn(shell.geometry,'dispose');
    vehicle(other,{kind:'bike'});scene.update([other],'self',null,.016);
    expect(old.parent).toBeNull();expect(dispose).toHaveBeenCalledOnce();expect(container.children).toHaveLength(1);
    vehicle(other,{kind:'boat'});scene.update([other],'self',null,.016);expect(container.children).toHaveLength(1);
    vehicle(other,{kind:'sport'});scene.update([other],'self',null,.016);
    expect(container.children).toHaveLength(1);expect(container.getObjectByName('detailed-sport')).toBeDefined();
    const repaint=container.getObjectByName('painted-shell') as THREE.Mesh<THREE.BufferGeometry,THREE.MeshLambertMaterial>;
    expect(repaint.material.color.getHex()).toBe(0x397b91);
    scene.update([other],'self',null,.016,'driver');expect(container.visible).toBe(false);
    scene.update([],'self',null,.016);expect(scene.visibleCount).toBe(0);expect(scene.group.children).toHaveLength(0);
  });

  it('keeps face details and outfit geometry cached across animation frames',()=>{
    const other=member(),scene=view();other.pose.mode='foot';other.pose.vehicle=null;
    scene.update([other],'self',null,.016);
    const avatar=scene.group.getObjectByName('Online player driver')!.children[0],body=avatar.children[0] as THREE.Mesh;
    const geometry=body.geometry,colors=geometry.getAttribute('color'),positions=geometry.getAttribute('position');
    const whites=new THREE.Color(0xe9e3d7);let eyes=0;
    for(let index=0;index<colors.count;index++)if(Math.abs(colors.getX(index)-whites.r)<1e-5&&Math.abs(colors.getY(index)-whites.g)<1e-5&&Math.abs(colors.getZ(index)-whites.b)<1e-5){expect(positions.getY(index)).toBeGreaterThan(.8);expect(positions.getZ(index)).toBeLessThan(-.13);eyes++;}
    expect(eyes).toBeGreaterThan(0);
    for(let frame=0;frame<20;frame++){other.pose.z-=.03;scene.update([other],'self',null,.016);expect(body.geometry).toBe(geometry);}
  });

  it.each(['hair-short','hair-buzz','hair-long','accessory-cap'])('%s leaves remote eyes and cheeks visible from the front',item=>{
    const other=member(),scene=view();other.pose.mode='foot';other.pose.vehicle=null;
    if(item!=='hair-short'){
      const action=item==='hair-buzz'?{type:'equip' as const,slot:'hair' as const,item}:{type:'buy' as const,item};
      const result=appearanceAction(createAppearance(),500,action);if(!result.ok)throw new Error(result.reason);other.appearance=result.appearance;
    }
    scene.update([other],'self',null,.016);scene.group.updateMatrixWorld(true);
    const avatar=scene.group.getObjectByName('Online player driver')!.children[0],body=avatar.children[0] as THREE.Mesh;
    const palette=appearanceColors(other.appearance!),hair=new THREE.Color(palette.hair),accessory=new THREE.Color(palette.accessory);
    const colors=body.geometry.getAttribute('color'),ray=new THREE.Raycaster();
    for(const [x,y] of[[-.075,.043],[.075,.043],[-.12,-.05],[.12,-.05]]){
      ray.set(body.localToWorld(new THREE.Vector3(x*CHARACTER_HEAD_SCALE,.79+y*CHARACTER_HEAD_SCALE,-2)),new THREE.Vector3(0,0,1).transformDirection(body.matrixWorld));
      const hit=ray.intersectObject(body,false)[0];expect(hit).toBeDefined();
      const firstColor=new THREE.Color().fromBufferAttribute(colors,hit.face!.a);
      const difference=(other:THREE.Color)=>Math.abs(firstColor.r-other.r)+Math.abs(firstColor.g-other.g)+Math.abs(firstColor.b-other.b);
      expect(difference(hair)).toBeGreaterThan(.01);
      if(item==='accessory-cap')expect(difference(accessory)).toBeGreaterThan(.01);
    }
  });
});

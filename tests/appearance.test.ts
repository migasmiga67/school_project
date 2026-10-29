import {describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {APPEARANCE_ITEMS,CREW_OUTFIT_COLOR,appearanceAction,appearanceColors,createAppearance,parseAppearance,type AppearanceAction,type AppearanceState} from '../src/appearance';
import {AvatarView} from '../src/avatar-view';
import {RemotePlayersView} from '../src/remote-players';
import type {OnlineMember} from '../src/multiplayer-model';

const success=(state:AppearanceState,wallet:number,action:AppearanceAction)=>{const result=appearanceAction(state,wallet,action);if(!result.ok)throw new Error(result.reason);return result;};
describe('cosmetic inventory and wallet',()=>{
 it('starts with every free option and no unpurchased paid items',()=>{
  const state=createAppearance();expect(state.owned).toEqual(APPEARANCE_ITEMS.filter(item=>item.price===0).map(item=>item.id));
  expect(state.selected.shirt).toBe('shirt-sand');expect(state.crewOutfit).toBe(false);
 });
 it('buys and equips one item atomically, then rejects repeated purchase without charging again',()=>{
  const first=success(createAppearance(),1250,{type:'buy',item:'shirt-coral'});
  expect(first.wallet).toBe(1160);expect(first.appearance.selected.shirt).toBe('shirt-coral');
  const before=structuredClone(first.appearance);expect(appearanceAction(first.appearance,first.wallet,{type:'buy',item:'shirt-coral'}).ok).toBe(false);expect(first.appearance).toEqual(before);
 });
 it('rejects insufficient cash and cannot equip an unowned item',()=>{
  const state=createAppearance();expect(appearanceAction(state,20,{type:'buy',item:'shirt-night'}).ok).toBe(false);
  expect(appearanceAction(state,1250,{type:'equip',slot:'shirt',item:'shirt-night'}).ok).toBe(false);
  expect(state.selected.shirt).toBe('shirt-sand');expect(state.owned).not.toContain('shirt-night');
 });
 it('allows free skin and hairstyle choices without changing money',()=>{
  const first=success(createAppearance(),100,{type:'equip',slot:'skin',item:'skin-deep'});
  const second=success(first.appearance,first.wallet,{type:'equip',slot:'hair',item:'hair-buzz'});
  expect(second.wallet).toBe(100);expect(appearanceColors(second.appearance)).toMatchObject({skin:0x885c46,hairstyle:'buzz'});
 });
 it('does not put a purchased item into the wrong category',()=>{
  const bought=success(createAppearance(),500,{type:'buy',item:'pants-denim'});
  expect(appearanceAction(bought.appearance,bought.wallet,{type:'equip',slot:'shirt',item:'pants-denim'}).ok).toBe(false);
 });
 it('keeps original state immutable on both valid and invalid transactions',()=>{
  const state=createAppearance(),copy=structuredClone(state);success(state,500,{type:'buy',item:'hair-long'});
  appearanceAction(state,500,{type:'equip',slot:'shirt',item:'does-not-exist'});expect(state).toEqual(copy);
 });
 it.each([-1,NaN,Infinity,1.5,100000001])('rejects invalid wallet %s',wallet=>expect(appearanceAction(createAppearance(),wallet,{type:'buy',item:'shirt-coral'}).ok).toBe(false));
 it('validates unknown payloads without interpreting strings as colors or styles',()=>{
  const state=createAppearance();
  for(const payload of[null,{},[],{type:'crew',enabled:'yes'},{type:'buy',item:{toString:1}},{type:'equip',slot:'shirt',item:'<script>'}])expect(appearanceAction(state,500,payload as AppearanceAction).ok).toBe(false);
 });
});

describe('appearance persistence and crew colors',()=>{
 it('preserves valid paid outfits, hairstyle, accessory and skin across serialization',()=>{
  let state=createAppearance(),wallet=1000;
  for(const item of['shirt-night','pants-denim','hair-long','accessory-glasses']){const next=success(state,wallet,{type:'buy',item});state=next.appearance;wallet=next.wallet;}
  state=success(state,wallet,{type:'equip',slot:'skin',item:'skin-light'}).appearance;
  expect(parseAppearance(JSON.parse(JSON.stringify(state)))).toEqual(state);
 });
 it('repairs malformed profiles and rejects selected paid cosmetics not in inventory',()=>{
  const state=parseAppearance({owned:['invalid','shirt-coral','shirt-coral',34],selected:{shirt:'shirt-coral',pants:'shirt-coral',hair:'hair-long',skin:'skin-deep'},crewOutfit:'true'});
  expect(state.owned.filter(id=>id==='shirt-coral')).toHaveLength(1);expect(state.selected).toEqual({shirt:'shirt-coral',pants:'pants-slate',hair:'hair-short',accessory:'accessory-none',skin:'skin-deep'});expect(state.crewOutfit).toBe(false);
  expect(parseAppearance(null)).toEqual(createAppearance());
 });
 it('crew outfit changes shirt color while retaining personal selection for later',()=>{
  const bought=success(createAppearance(),500,{type:'buy',item:'shirt-coral'}),enabled=success(bought.appearance,bought.wallet,{type:'crew',enabled:true});
  expect(appearanceColors(enabled.appearance).shirt).toBe(CREW_OUTFIT_COLOR);expect(enabled.appearance.selected.shirt).toBe('shirt-coral');
  const disabled=success(enabled.appearance,enabled.wallet,{type:'crew',enabled:false});expect(appearanceColors(disabled.appearance).shirt).toBe(0xdf8e76);expect(disabled.wallet).toBe(bought.wallet);
 });
});

describe('independent 3D avatars',()=>{
 it('customizing one model never recolors another player, and limb animation is independent',()=>{
  const one=new AvatarView(true),two=new AvatarView(true);
  try{
   const shirt=(avatar:AvatarView)=>{const torso=avatar.group.children.find(object=>object instanceof THREE.Mesh&&Math.abs(object.position.y-1.17)<.001)as THREE.Mesh<THREE.BoxGeometry,THREE.MeshLambertMaterial>;return torso.material.color.getHex();};
   one.setAppearance(success(createAppearance(),500,{type:'buy',item:'shirt-coral'}).appearance);
   expect(shirt(one)).toBe(0xdf8e76);expect(shirt(two)).toBe(0xd1c6ae);
   one.update(true,.12);two.update(false,.12);expect(one.legs[0].rotation.x).not.toBe(0);expect(two.legs[0].rotation.x).toBe(0);
   const long=success(createAppearance(),500,{type:'buy',item:'hair-long'});one.setAppearance(long.appearance);expect(shirt(two)).toBe(0xd1c6ae);
  }finally{one.destroy();two.destroy();}
 });
 it('updates remote outfits and vehicle silhouettes without changing another member',()=>{
  const context={fillStyle:'',strokeStyle:'',lineWidth:0,font:'',textAlign:'',textBaseline:'',beginPath(){},roundRect(){},fill(){},stroke(){},fillText(){}};
  vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>context})});
  const view=new RemotePlayersView(true);
  const member=(id:string,slot:number,appearance:AppearanceState):OnlineMember=>({id,name:id,slot,appearance,pose:{x:slot*4,z:0,heading:0,mode:'foot',interior:null,seated:false,vehicle:null}});
  const one=member('one',0,success(createAppearance(),500,{type:'buy',item:'shirt-coral'}).appearance),two=member('two',1,createAppearance());
  try{
   view.update([one,two],'self',null,.016);expect(view.visibleCount).toBe(2);
   const rootOne=view.group.getObjectByName('Online player one')!,rootTwo=view.group.getObjectByName('Online player two')!;
   const bodyOne=rootOne.children[0].children[0]as THREE.Mesh,bodyTwo=rootTwo.children[0].children[0]as THREE.Mesh;
   const originalTwo=bodyTwo.geometry;expect(bodyOne.geometry).not.toBe(bodyTwo.geometry);
   one.appearance=success(one.appearance!,500,{type:'buy',item:'shirt-ocean'}).appearance;
   view.update([one,two],'self',null,.016);expect(bodyTwo.geometry).toBe(originalTwo);expect(bodyOne.geometry).not.toBe(originalTwo);
   one.pose={...one.pose,mode:'drive',vehicle:{id:'bike-1',kind:'bike',x:0,z:0,heading:0,color:0xff0000,speed:5,health:100}};
   view.update([one,two],'self',null,.016);
   const bikeRider=rootOne.getObjectByName('rider-shirt')as THREE.Mesh<THREE.BoxGeometry,THREE.MeshLambertMaterial>;
   expect(bikeRider.material.color.getHex()).toBe(appearanceColors(one.appearance!).shirt);
   one.pose={...one.pose,vehicle:{...one.pose.vehicle!,id:'boat-1',kind:'boat'}};view.update([one,two],'self',null,.016);
   const boatRider=rootOne.getObjectByName('rider-shirt')as THREE.Mesh<THREE.BoxGeometry,THREE.MeshLambertMaterial>;expect(boatRider.material.color.getHex()).toBe(appearanceColors(one.appearance!).shirt);
   one.pose={...one.pose,mode:'foot',vehicle:null};view.update([one,two],'self',null,.016);expect(rootOne.children[1].visible).toBe(false);expect(bodyTwo.geometry).toBe(originalTwo);
  }finally{view.destroy();vi.unstubAllGlobals();}
 });
});

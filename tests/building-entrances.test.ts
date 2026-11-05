import {describe,expect,it}from'vitest';
import * as THREE from'three';
import {BUILDING_ENTRANCES,BuildingEntranceDoors,advanceBuildingDoor,createBuildingDoorState,entranceWantsOpen,type BuildingEntranceId,type EntranceActor}from'../src/building-entrances';
import {SlidingEntranceDoor,BuildingEntrancesView}from'../src/building-entrances-view';
import {CASINO}from'../src/casino-location';
import {HOMES,CREW_BASE}from'../src/career';
const entrance=(id:BuildingEntranceId)=>BUILDING_ENTRANCES.find(value=>value.id===id)!;
const actor=(id:BuildingEntranceId,access:readonly BuildingEntranceId[]=[id]):EntranceActor=>({...entrance(id).point,mode:'foot',access});

describe('visible enterable building doors',()=>{
 it('retains existing interaction anchors and places portals on the outward facade',()=>{
  expect(entrance('casino').point).toEqual(CASINO.door);expect(entrance('canal').point).toEqual(HOMES.canal.door);
  expect(entrance('loft').point).toEqual(HOMES.loft.door);expect(entrance('crew').point).toEqual(CREW_BASE.door);
  for(const item of BUILDING_ENTRANCES){
   expect(item.width).toBeGreaterThan(1.3);expect(item.height).toBeGreaterThan(2.5);
   const front={...actor(item.id),z:item.point.z+Math.cos(item.rotation)*3};
   expect(entranceWantsOpen(item,[front])).toBe(true);
   const behind={...actor(item.id),z:item.portal.z-Math.cos(item.rotation)*3};
   expect(entranceWantsOpen(item,[behind])).toBe(false);
  }
 });
 it('requires a nearby pedestrian with access, while public casino defaults remain public',()=>{
  const casino=entrance('casino'),canal=entrance('canal');
  expect(entranceWantsOpen(casino,[{...CASINO.door,mode:'foot'}])).toBe(true);
  expect(entranceWantsOpen(canal,[{...HOMES.canal.door,mode:'foot'}])).toBe(false);
  const owner=actor('canal');expect(entranceWantsOpen(canal,[owner])).toBe(true);
  for(const invalid of [{...owner,mode:'drive' as const},{...owner,interior:'casino'},{...owner,homeId:'canal'},{...owner,passengerOf:'host'},{...owner,x:NaN},{...owner,x:owner.x+12}])expect(entranceWantsOpen(canal,[invalid])).toBe(false);
 });
 it('holds open around the threshold and closes only after the pedestrian has cleared it',()=>{
  const doors=new BuildingEntranceDoors();
  for(let i=0;i<5;i++)doors.update([actor('canal')],.1);
  expect(doors.snapshot.canal).toMatchObject({progress:1,phase:'open'});
  const threshold={...actor('canal'),z:HOMES.canal.door.z+6.7};
  expect(entranceWantsOpen(entrance('canal'),[threshold])).toBe(false);
  for(let i=0;i<25;i++)doors.update([threshold],.1);
  expect(doors.snapshot.canal.progress).toBe(1);
  for(let i=0;i<12;i++)doors.update([],.1);expect(doors.snapshot.canal.progress).toBe(1);
  for(let i=0;i<15;i++)doors.update([],.1);expect(doors.snapshot.canal).toMatchObject({progress:0,phase:'closed'});
 });
 it('advances independently of frame size, freezes on pause, and returns isolated snapshots',()=>{
  const a=new BuildingEntranceDoors(),b=new BuildingEntranceDoors();
  for(let i=0;i<20;i++)a.update([actor('casino')],.02);
  for(let i=0;i<4;i++)b.update([actor('casino')],.1);
  expect(a.snapshot.casino.progress).toBe(b.snapshot.casino.progress);
  const saved=a.snapshot;a.update([],0);expect(a.snapshot).toEqual(saved);
  saved.casino.progress=0;expect(a.snapshot.casino.progress).toBe(1);
  a.holdOpen('crew',2);for(let i=0;i<4;i++)a.update([],.1);
  expect(a.snapshot.crew.progress).toBe(1);expect(a.snapshot.loft.progress).toBe(0);
  for(const dt of [-1,NaN,Infinity])expect(advanceBuildingDoor(createBuildingDoorState(),false,dt)).toEqual(createBuildingDoorState());
 });
 it('retains moving leaves and retracts both completely clear of the actual aperture',()=>{
  const door=new SlidingEntranceDoor(4.2,3.6,0xd8b56e,true);
  try{
   const left=door.group.getObjectByName('door-leaf-left')!,right=door.group.getObjectByName('door-leaf-right')!;
   door.setProgress(0);const closedLeft=new THREE.Box3().setFromObject(left),closedRight=new THREE.Box3().setFromObject(right);
   expect(closedLeft.max.x).toBeCloseTo(0,1);expect(closedRight.min.x).toBeCloseTo(0,1);
   door.setProgress(1);const openLeft=new THREE.Box3().setFromObject(left),openRight=new THREE.Box3().setFromObject(right);
   expect(openLeft.max.x).toBeLessThanOrEqual(-2.1+.001);expect(openRight.min.x).toBeGreaterThanOrEqual(2.1-.001);
   expect(door.group.getObjectByName('door-leaf-left')).toBe(left);expect(door.group.getObjectByName('door-leaf-right')).toBe(right);
   expect(door.group.userData.openProgress).toBe(1);
  }finally{door.destroy();}
 });
 it('updates each world portal separately without creating geometry during animation',()=>{
  const view=new BuildingEntrancesView(true),scene=new THREE.Scene();scene.add(view.group);
  try{
   const geometries=new Set<THREE.BufferGeometry>();view.group.traverse(object=>{if(object instanceof THREE.Mesh)geometries.add(object.geometry);});
   for(let frame=0;frame<8;frame++)view.update([actor('loft')],.1);
   expect(view.snapshot.loft.progress).toBe(1);expect(view.snapshot.canal.progress).toBe(0);
   const after=new Set<THREE.BufferGeometry>();view.group.traverse(object=>{if(object instanceof THREE.Mesh)after.add(object.geometry);});expect(after).toEqual(geometries);
  }finally{view.destroy();}
  expect(scene.children).toHaveLength(0);
 });
});

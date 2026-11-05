import {describe,expect,it} from 'vitest';
import {RoomAuthority} from '../src/room-authority';
import {GARAGE_PAINTS} from '../src/garage';
import type {OnlinePose,RoomCommand} from '../src/multiplayer-model';

const create=()=>{
 const room=new RoomAuthority('ABCDEFGH','host','Gospodarz',31);
 expect(room.join('friend','Znajomy').ok).toBe(true);room.tick(0);return room;
};
function accept(room:RoomAuthority,id:string,command:RoomCommand){
 const result=room.command(id,command,0);if(!result.ok)throw new Error(result.reason);
}
const own=(room:RoomAuthority,id='host')=>room.snapshot(id).members.find(member=>member.id===id)!.pose;
function drive(room:RoomAuthority,x:number,z:number,speed=0,id='host',vehicleId='stratus'){
 const pose:OnlinePose={x,z,heading:0,mode:'drive',interior:null,seated:false,
  vehicle:{id:vehicleId,kind:'sport',x,z,heading:0,speed,color:0xffffff,health:43}};
 accept(room,id,{type:'pose',pose});
}
function foot(room:RoomAuthority,x:number,z:number,id='host'){
 accept(room,id,{type:'pose',pose:{x,z,heading:0,mode:'foot',interior:null,seated:false,vehicle:null}});
}

describe('host-authorized drive-in garage services',()=>{
 it('services a stopped owned car in the actual bay without moving, repairing or respawning it',()=>{
  const room=create();drive(room,-20,63);
  const before=structuredClone(own(room).vehicle!);
  accept(room,'host',{type:'garage',action:{type:'upgrade',upgrade:'engine'}});
  const snapshot=room.snapshot('host'),car=own(room).vehicle!;
  expect(snapshot.wallet).toBe(900);expect(room.snapshot('friend').wallet).toBe(1250);
  expect(snapshot.garage.cars.stratus!.engine).toBe(1);expect(car.tuning?.engine).toBe(1);
  expect({x:car.x,z:car.z,heading:car.heading,speed:car.speed,health:car.health,id:car.id}).toEqual({
   x:before.x,z:before.z,heading:before.heading,speed:before.speed,health:before.health,id:before.id,
  });
 });
 it('keeps both the original entrance and the bay available to a pedestrian',()=>{
  for(const point of [{x:-20,z:74},{x:-20,z:63}]){
   const room=create();foot(room,point.x,point.z);
   accept(room,'host',{type:'garage',action:{type:'buy',car:'sentinel'}});
   expect(room.snapshot('host').wallet).toBe(350);expect(room.snapshot('host').garage.selected).toBe('sentinel');
   expect(room.command('host',{type:'garage',action:{type:'buy',car:'sentinel'}},0).ok).toBe(false);
   expect(room.snapshot('host').wallet).toBe(350);
  }
 });
 it('rejects service through side/back walls or from another part of the building',()=>{
  for(const point of [{x:-28,z:63},{x:-12,z:63},{x:-20,z:51},{x:-29,z:72},{x:0,z:68}]){
   const room=create();foot(room,point.x,point.z);const before=room.snapshot('host');
   expect(room.command('host',{type:'garage',action:{type:'paint',color:GARAGE_PAINTS[1].color}},0).ok).toBe(false);
   expect(room.snapshot('host').wallet).toBe(before.wallet);expect(room.snapshot('host').garage).toEqual(before.garage);
  }
 });
 it('requires the whole vehicle footprint inside service space and a safe speed',()=>{
  for(const [x,z,speed]of[[-20,63,2],[-20,63,-2],[-24,63,0],[-16,63,0]]as const){
   const room=create();drive(room,x,z,speed);const before=room.snapshot('host');
   expect(room.command('host',{type:'garage',action:{type:'paint',color:GARAGE_PAINTS[1].color}},0).ok).toBe(false);
   expect(room.snapshot('host').wallet).toBe(before.wallet);expect(room.snapshot('host').garage).toEqual(before.garage);
  }
  const forged=create();drive(forged,-22.7,63);
  const pose=own(forged);accept(forged,'host',{type:'pose',pose:{...pose,x:-24.6}});
  expect(forged.command('host',{type:'garage',action:{type:'paint',color:GARAGE_PAINTS[1].color}},0).ok).toBe(false);
  expect(forged.snapshot('host').wallet).toBe(1250);
 });
 it('refuses tuning from a city vehicle and never redirects the charge to another member',()=>{
  const room=create();drive(room,-20,63,0,'host','parked-1');
  const before=room.snapshot('host');
  expect(room.command('host',{type:'garage',action:{type:'upgrade',upgrade:'engine'}},0).ok).toBe(false);
  expect(room.snapshot('host').wallet).toBe(before.wallet);expect(room.snapshot('host').garage).toEqual(before.garage);
  expect(room.snapshot('friend').wallet).toBe(1250);
 });
 it('preserves passenger and active-crew restrictions inside the bay',()=>{
  const room=create();drive(room,-20,63,0,'friend');foot(room,-18,63);
  accept(room,'host',{type:'ride',driverId:'friend'});
  expect(own(room).passengerOf).toBe('friend');
  expect(room.command('host',{type:'garage',action:{type:'paint',color:GARAGE_PAINTS[1].color}},0).ok).toBe(false);
  expect(room.snapshot('host').wallet).toBe(1250);

  const busy=create();drive(busy,-20,63);accept(busy,'host',{type:'job',action:{kind:'raceStart'}});
  expect(busy.command('host',{type:'garage',action:{type:'buy',car:'sentinel'}},0).ok).toBe(false);
  expect(busy.snapshot('host').wallet).toBe(1250);
 });
 it('lets all passengers leave a stopped car onto the actual garage floor',()=>{
  const room=create();expect(room.join('third','Trzeci').ok).toBe(true);expect(room.join('fourth','Czwarty').ok).toBe(true);
  drive(room,-20,63);
  const positions:{x:number;z:number}[]=[];
  for(const id of ['friend','third','fourth']){
   foot(room,-18,63,id);accept(room,id,{type:'ride',driverId:'host'});
  }
  for(const id of ['friend','third','fourth']){
   accept(room,id,{type:'exitRide'});const pose=own(room,id);
   expect(pose.passengerOf).toBeNull();expect(pose.mode).toBe('foot');expect(pose.vehicle).toBeNull();
   expect(pose.x).toBeGreaterThan(-23.9);expect(pose.x).toBeLessThan(-16.1);
   expect(pose.z).toBeGreaterThan(56.6);expect(pose.z).toBeLessThan(71.8);
   expect(Math.hypot(pose.x+20,pose.z-63)).toBeLessThan(4);
   positions.push({x:pose.x,z:pose.z});
  }
  expect(new Set(positions.map(point=>`${point.x}/${point.z}`)).size).toBe(3);
  expect(room.snapshot('host').wallet).toBe(1250);
 });
});

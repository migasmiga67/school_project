import { describe, expect, it } from 'vitest';
import { RoomAuthority } from '../src/room-authority';
import { BUILDINGS, WORLD_BOUNDS } from '../src/model';
import { GARAGE_LOCATION } from '../src/garage';
import { cityEventAt } from '../src/city-life';
import type { OnlinePose, RoomCommand } from '../src/multiplayer-model';

const create=(count=2)=>{
 const room=new RoomAuthority('ABCDEFGH','host','Gospodarz',123);
 for(const [index,id] of ['friend','third','fourth'].slice(0,count-1).entries())expect(room.join(id,`Gracz ${index+2}`).ok).toBe(true);
 return room;
};
function accepted(room:RoomAuthority,id:string,command:RoomCommand,now=0){
 const result=room.command(id,command,now);if(!result.ok)throw new Error(result.reason);
}
const own=(room:RoomAuthority,id:string)=>room.snapshot(id).members.find(member=>member.id===id)!.pose;
function foot(room:RoomAuthority,id:string,x:number,z:number,now=0){
 accepted(room,id,{type:'pose',pose:{x,z,heading:0,mode:'foot',interior:null,seated:false,vehicle:null}},now);
}
function drive(room:RoomAuthority,id:string,x:number,z:number,now=0,speed=0){
 const pose:OnlinePose={x,z,heading:0,mode:'drive',interior:null,seated:false,vehicle:{id:'stratus',kind:'sport',x,z,heading:0,color:0xffffff,speed,health:100}};
 accepted(room,id,{type:'pose',pose},now);
}
const garage=(room:RoomAuthority,id='host')=>foot(room,id,GARAGE_LOCATION.x,GARAGE_LOCATION.z);
const safe=(point:{x:number;z:number})=>point.x>WORLD_BOUNDS.minX&&point.x<WORLD_BOUNDS.maxX&&point.z>WORLD_BOUNDS.minZ&&point.z<WORLD_BOUNDS.maxZ&&!BUILDINGS.some(building=>Math.abs(point.x-building.x)<building.halfX+.55&&Math.abs(point.z-building.z)<building.halfZ+.55);

describe('host-owned garage transactions and city events',()=>{
 it('requires the workshop, applies one atomic purchase and never changes another wallet',()=>{
  const room=create();
  expect(room.command('host',{type:'garage',action:{type:'buy',car:'sentinel'}},0).ok).toBe(false);
  garage(room);accepted(room,'host',{type:'garage',action:{type:'buy',car:'sentinel'}});
  expect(room.snapshot('host').wallet).toBe(350);expect(room.snapshot('friend').wallet).toBe(1250);
  expect(room.snapshot('host').garage.selected).toBe('sentinel');
  expect(room.command('host',{type:'garage',action:{type:'buy',car:'sentinel'}},0).ok).toBe(false);
  accepted(room,'host',{type:'garage',action:{type:'upgrade',upgrade:'engine'}});
  expect(room.snapshot('host').wallet).toBe(0);
  drive(room,'host',-16,77);
  expect(own(room,'host').vehicle).toMatchObject({id:'stratus',kind:'sedan',label:'Sentinel GT',color:0x387e9a,tuning:{engine:1,brakes:0,nitro:0}});
  const snapshot=room.snapshot('host');snapshot.garage.cars.sentinel!.engine=2;
  expect(room.snapshot('host').garage.cars.sentinel!.engine).toBe(1);
 });
 it('rejects fast-car, malformed, unaffordable and competition-time transactions',()=>{
  const room=create();drive(room,'host',-16,77,0,2);
  expect(room.command('host',{type:'garage',action:{type:'paint',color:0xe88a67}},0).ok).toBe(false);
  garage(room);
  expect(room.command('host',{type:'garage',action:{type:'buy',car:'comet'}},0).ok).toBe(false);
  expect(room.command('host',{type:'garage',action:{type:'paint',color:NaN}},0).ok).toBe(false);
  accepted(room,'host',{type:'challengeStart'});
  expect(room.command('host',{type:'garage',action:{type:'upgrade',upgrade:'engine'}},0).ok).toBe(false);
  expect(room.command('host',{type:'job',action:{kind:'heistStart'}},0).ok).toBe(false);
  expect(room.snapshot('host').wallet).toBe(1250);
 });
 it('does not run a crew challenge or garage transaction during a race lobby',()=>{
  const room=create();accepted(room,'host',{type:'job',action:{kind:'raceStart'}});
  expect(room.command('host',{type:'challengeStart'},0).ok).toBe(false);garage(room);
  expect(room.command('host',{type:'garage',action:{type:'buy',car:'sentinel'}},0).ok).toBe(false);
 });
 it('validates event position, expiry, event identity and individual one-shot rewards',()=>{
  const room=create(),event=cityEventAt(0)!;
  expect(room.command('host',{type:'cityEventClaim',eventId:event.id},0).ok).toBe(false);
  foot(room,'host',event.target.x,event.target.z);
  accepted(room,'host',{type:'cityEventClaim',eventId:event.id});
  expect(room.snapshot('host').wallet).toBe(1250+event.reward);expect(room.snapshot('host').cityEventClaimed).toBe(true);
  expect(room.command('host',{type:'cityEventClaim',eventId:event.id},0).ok).toBe(false);
  foot(room,'friend',event.target.x,event.target.z);accepted(room,'friend',{type:'cityEventClaim',eventId:event.id});
  expect(room.snapshot('friend').wallet).toBe(1250+event.reward);
  expect(room.command('host',{type:'cityEventClaim',eventId:event.id},40000).ok).toBe(false);
  const next=cityEventAt(120)!;foot(room,'host',next.target.x,next.target.z,120000);
  expect(room.snapshot('host').cityEventClaimed).toBe(false);
  expect(room.command('host',{type:'cityEventClaim',eventId:event.id},120000).ok).toBe(false);
  accepted(room,'host',{type:'cityEventClaim',eventId:next.id},120000);
  expect(room.snapshot('host').wallet).toBe(1250+event.reward+next.reward);
 });
});

describe('authoritative passenger seats',()=>{
 it('requires a nearby stopped driver and does not trust passengerOf from a pose',()=>{
  const room=create();
  expect(room.command('friend',{type:'ride',driverId:'host'},0).ok).toBe(false);
  foot(room,'friend',2,68);
  expect(room.command('friend',{type:'ride',driverId:'friend'},0).ok).toBe(false);
  accepted(room,'friend',{type:'pose',pose:{...own(room,'friend'),passengerOf:'host'}});
  expect(own(room,'friend').passengerOf).toBeNull();
  drive(room,'host',0,68,0,4);
  expect(room.command('friend',{type:'ride',driverId:'host'},0).ok).toBe(false);
  drive(room,'host',0,68);accepted(room,'friend',{type:'ride',driverId:'host'});
  expect(own(room,'friend')).toMatchObject({x:0,z:68,mode:'foot',vehicle:null,passengerOf:'host'});
 });
 it('follows the driver, forbids independent movement and exits only at a safe stop',()=>{
  const room=create();foot(room,'friend',2,68);accepted(room,'friend',{type:'ride',driverId:'host'});
  expect(room.command('friend',{type:'pose',pose:{...own(room,'friend'),x:40,passengerOf:null}},0).ok).toBe(true);
  expect(own(room,'friend')).toMatchObject({x:0,z:68,passengerOf:'host'});
  drive(room,'host',0,50,1000,12);
  expect(own(room,'friend')).toMatchObject({x:0,z:50,passengerOf:'host'});
  expect(room.command('friend',{type:'exitRide'},1000).ok).toBe(false);
  drive(room,'host',0,50,2000,0);accepted(room,'friend',{type:'exitRide'},2000);
  expect(own(room,'friend').passengerOf).toBeNull();expect(safe(own(room,'friend'))).toBe(true);
  expect(Math.hypot(own(room,'friend').x,own(room,'friend').z-50)).toBeLessThan(5);
 });
 it('releases every passenger when the driver exits or disconnects',()=>{
  const room=create(4);
  for(const id of ['friend','third','fourth']){foot(room,id,2,68);accepted(room,id,{type:'ride',driverId:'host'});}
  drive(room,'host',0,40,1000,0);
  for(const id of ['friend','third','fourth'])expect(own(room,id).z).toBe(40);
  foot(room,'host',2.6,40,1000);
  for(const id of ['friend','third','fourth']){expect(own(room,id).passengerOf).toBeNull();expect(safe(own(room,id))).toBe(true);}
  drive(room,'friend',0,40,1000);foot(room,'host',2,40,1000);accepted(room,'host',{type:'ride',driverId:'friend'},1000);
  room.leave('friend');expect(own(room,'host').passengerOf).toBeNull();expect(safe(own(room,'host'))).toBe(true);
  expect(room.join('friend','Powrót').ok).toBe(true);expect(own(room,'friend').passengerOf??null).toBeNull();
 });
 it('does not let a passenger collect a city reward or acquire a poker seat',()=>{
  const room=create(),event=cityEventAt(0)!;foot(room,'friend',2,68);accepted(room,'friend',{type:'ride',driverId:'host'});
  drive(room,'host',event.target.x,event.target.z);
  expect(room.command('friend',{type:'cityEventClaim',eventId:event.id},0).ok).toBe(false);
  expect(room.command('friend',{type:'sit'},0).ok).toBe(false);
  expect(room.snapshot('friend').wallet).toBe(1250);
 });
});

describe('job financial integration',()=>{
 it('keeps hacking symbols private and pays a completed passenger escape once',()=>{
  const room=create();accepted(room,'host',{type:'job',action:{kind:'heistStart'}});
  drive(room,'host',20,74);foot(room,'friend',21,74);
  accepted(room,'host',{type:'job',action:{kind:'heistInteract'}});accepted(room,'friend',{type:'job',action:{kind:'heistInteract'}});
  expect(room.snapshot('host').jobs.heist.status).toBe('hack');expect(room.snapshot('host').jobs.heist.sequence).toEqual([]);
  const sequence=room.snapshot('friend').jobs.heist.sequence;expect(sequence).toHaveLength(3);
  expect(room.command('host',{type:'job',action:{kind:'heistHack',symbol:sequence[0]}},0).ok).toBe(false);
  for(const symbol of sequence)accepted(room,'friend',{type:'job',action:{kind:'heistHack',symbol}});
  expect(room.snapshot('host').jobs.heist.status).toBe('escape');
  accepted(room,'friend',{type:'ride',driverId:'host'});drive(room,'host',-80,0,5000);
  for(const id of ['host','friend']){expect(room.snapshot(id).jobs.heist.status).toBe('completed');expect(room.snapshot(id).wallet).toBe(2050);}
  room.tick(6000);accepted(room,'host',{type:'ping'},7000);expect(room.snapshot('host').wallet+room.snapshot('friend').wallet).toBe(4100);
 });
 it('owns the countdown grid and settles race standings into the right wallets once',()=>{
  const room=create();drive(room,'host',0,80);drive(room,'friend',0,80);accepted(room,'host',{type:'job',action:{kind:'raceStart'}});
  accepted(room,'host',{type:'job',action:{kind:'raceReady'}});accepted(room,'friend',{type:'job',action:{kind:'raceReady'}});
  expect(room.snapshot('host').jobs.race.status).toBe('countdown');expect(own(room,'host')).toMatchObject({x:-3,z:82});
  drive(room,'host',0,40,1000,20);expect(own(room,'host')).toMatchObject({x:-3,z:82});expect(own(room,'host').vehicle!.speed).toBe(0);
  room.tick(3000);expect(room.snapshot('host').jobs.race.status).toBe('running');
  for(const [index,point] of [{x:0,z:40},{x:40,z:40},{x:40,z:80},{x:0,z:80}].entries())drive(room,'host',point.x,point.z,3100+index*100);
  expect(room.snapshot('host').wallet).toBe(1750);expect(room.snapshot('host').jobs.race.participants.find(person=>person.id==='host')?.rank).toBe(1);
  for(const [index,point] of [{x:0,z:40},{x:40,z:40},{x:40,z:80},{x:0,z:80}].entries())drive(room,'friend',point.x,point.z,4100+index*100);
  expect(room.snapshot('friend').wallet).toBe(1550);expect(room.snapshot('host').jobs.race.status).toBe('completed');
  room.tick(5000);expect(room.snapshot('host').wallet+room.snapshot('friend').wallet).toBe(3300);
 });
});

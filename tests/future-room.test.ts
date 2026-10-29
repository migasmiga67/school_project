import { describe,expect,it } from 'vitest';
import { RoomAuthority } from '../src/room-authority';
import { DOCK,MOBILITY_COURSES,WATER_BOUNDS } from '../src/mobility';
import { campaignChapter } from '../src/campaign';
import { DISTRICTS } from '../src/factions';
import type { OnlinePose,RoomCommand } from '../src/multiplayer-model';

const create=(count=2)=>{const room=new RoomAuthority('ABCDEFGH','host','Gospodarz',321);for(const[id,name]of [['friend','Przyjaciel'],['third','Trzeci'],['fourth','Czwarty']].slice(0,count-1))expect(room.join(id,name).ok).toBe(true);room.tick(0);return room;};
function accepted(room:RoomAuthority,id:string,command:RoomCommand,now=0){const result=room.command(id,command,now);if(!result.ok)throw new Error(result.reason);}
function foot(room:RoomAuthority,id:string,x:number,z:number,now=0){accepted(room,id,{type:'pose',pose:{x,z,heading:0,mode:'foot',interior:null,seated:false,vehicle:null}},now);}
function drive(room:RoomAuthority,id:string,x:number,z:number,now=0,kind:'sport'|'bike'|'boat'='sport',speed=0){const pose:OnlinePose={x,z,heading:0,mode:'drive',interior:null,seated:false,vehicle:{id:kind==='sport'?'stratus':`${kind}-1`,kind,x,z,heading:0,color:0x123456,speed,health:100}};accepted(room,id,{type:'pose',pose},now);}

describe('new city systems share one authoritative session',()=>{
 it('buys cosmetics once, publishes the actual outfit, and preserves other members',()=>{
  const room=create();const initial=room.snapshot('friend').appearance;
  accepted(room,'host',{type:'appearance',action:{type:'buy',item:'shirt-coral'}});
  const next=room.snapshot('host');expect(next.wallet).toBe(1160);expect(next.appearance.selected.shirt).toBe('shirt-coral');
  expect(next.members.find(person=>person.id==='host')!.appearance).toEqual(next.appearance);
  expect(room.snapshot('friend').appearance).toEqual(initial);
  expect(room.command('host',{type:'appearance',action:{type:'buy',item:'shirt-coral'}},0).ok).toBe(false);
  expect(room.snapshot('host').wallet).toBe(1160);
  accepted(room,'host',{type:'appearance',action:{type:'crew',enabled:true}});
  expect(room.snapshot('friend').members.find(person=>person.id==='host')!.appearance?.crewOutfit).toBe(true);
 });
 it('shares literal bounded chat and validates per-player message clocks',()=>{
  const room=create(4),literal='<img src=x onerror="window.invalid=1">';
  accepted(room,'host',{type:'phone',action:{kind:'chat',text:literal}});
  expect(room.snapshot('friend').phone.messages.at(-1)?.text).toBe(literal);
  expect(room.command('host',{type:'phone',action:{kind:'chat',text:'Za szybko'}},999).ok).toBe(false);
  for(let index=1;index<=50;index++)accepted(room,'host',{type:'phone',action:{kind:'chat',text:`Wiadomość ${index}`}},index*1000);
  const messages=room.snapshot('fourth').phone.messages;
  expect(messages).toHaveLength(40);expect(messages.at(-1)?.text).toBe('Wiadomość 50');
  expect(new Set(messages.map(message=>message.id)).size).toBe(40);expect(room.snapshot('host').wallet).toBe(1250);
 });
 it('invites friends and records readiness without silently starting an activity',()=>{
  const room=create();accepted(room,'host',{type:'phone',action:{kind:'invite',activity:'bank'}});
  const invite=room.snapshot('friend').phone.invites[0];expect(invite.accepted).toEqual(['host']);
  accepted(room,'friend',{type:'phone',action:{kind:'acceptInvite',id:invite.id}});
  expect(room.snapshot('host').phone.invites[0]).toMatchObject({status:'ready',accepted:['host','friend']});
  expect(room.snapshot('host').jobs.active).toBeNull();
  room.tick(120000);expect(room.snapshot('friend').phone.invites[0].status).toBe('expired');
 });
 it('charges car delivery once, exposes a host-owned effect and rejects duplicate or indoor orders',()=>{
  const room=create();expect(room.command('host',{type:'phone',action:{kind:'requestCar'}},0).ok).toBe(false);
  foot(room,'host',3,68);accepted(room,'host',{type:'phone',action:{kind:'requestCar'}});
  const after=room.snapshot('host');expect(after.wallet).toBe(1200);expect(after.deliveryEffect.version).toBe(1);
  expect(Math.hypot(after.deliveryEffect.target!.x-3,after.deliveryEffect.target!.z-68)).toBeGreaterThanOrEqual(4.5);
  expect(room.command('host',{type:'phone',action:{kind:'requestCar'}},1).ok).toBe(false);
  expect(room.snapshot('host').wallet).toBe(1200);expect(room.snapshot('host').deliveryEffect).toEqual(after.deliveryEffect);
  accepted(room,'host',{type:'pose',pose:{x:0,z:6,heading:0,mode:'foot',interior:'casino',vehicle:null,seated:false}},60000);
  expect(room.command('host',{type:'phone',action:{kind:'requestCar'}},60000).ok).toBe(false);
 });
 it('boards boats from the dock, enforces water boundaries, and rescues an abandoned vessel',()=>{
  const room=create();
  expect(room.command('host',{type:'pose',pose:{...DOCK.mooring,heading:0,mode:'drive',interior:null,seated:false,vehicle:{id:'boat-1',kind:'boat',...DOCK.mooring,heading:0,color:0xeeeeee,speed:0,health:100}}},0).ok).toBe(false);
  foot(room,'host',DOCK.land.x,DOCK.land.z);drive(room,'host',DOCK.mooring.x,DOCK.mooring.z,0,'boat');
  drive(room,'host',180,-60,1,'boat');expect(room.snapshot('host').members.find(person=>person.id==='host')!.pose.x).toBe(180);
  const invalid:OnlinePose={x:WATER_BOUNDS.minX-2,z:0,heading:0,mode:'drive',interior:null,seated:false,vehicle:{id:'boat-1',kind:'boat',x:WATER_BOUNDS.minX-2,z:0,heading:0,color:0xffffff,speed:0,health:100}};
  expect(room.command('host',{type:'pose',pose:invalid},2).ok).toBe(false);
  foot(room,'host',DOCK.land.x,DOCK.land.z,3);
  expect(room.snapshot('friend').vehicles.find(vehicle=>vehicle.id==='boat-1')).toMatchObject({...DOCK.mooring,speed:0});
 });
 it('allows one bike passenger and only disembarks boat passengers at the dock',()=>{
  const room=create(4);drive(room,'host',0,80,0,'bike');foot(room,'friend',2,80);foot(room,'third',-2,80);
  accepted(room,'friend',{type:'ride',driverId:'host'});
  expect(room.command('third',{type:'ride',driverId:'host'},0).ok).toBe(false);
  accepted(room,'friend',{type:'exitRide'});foot(room,'host',DOCK.land.x,DOCK.land.z);foot(room,'friend',DOCK.land.x,DOCK.land.z);
  drive(room,'host',DOCK.mooring.x,DOCK.mooring.z,0,'boat');accepted(room,'friend',{type:'ride',driverId:'host'});
  drive(room,'host',160,50,1,'boat');expect(room.command('friend',{type:'exitRide'},1).ok).toBe(false);
  drive(room,'host',DOCK.mooring.x,DOCK.mooring.z,2,'boat');accepted(room,'friend',{type:'exitRide'},2);
  expect(room.snapshot('friend').members.find(person=>person.id==='friend')!.pose).toMatchObject({...DOCK.land,mode:'foot',passengerOf:null});
 });
 it('finishes a host-verified motorcycle course and pays that run only once',()=>{
  const room=create();drive(room,'host',0,80,0,'bike');accepted(room,'host',{type:'mobilityTrial',action:{kind:'start',course:'bike'}});
  let now=0;for(const point of MOBILITY_COURSES.bike.checkpoints){now+=1000;drive(room,'host',point.x,point.z,now,'bike');}
  const result=room.snapshot('host');expect(result.mobilityTrial.status).toBe('completed');expect(result.wallet).toBe(1600);expect(result.career.reputation).toBe(40);
  room.tick(now+1000);expect(room.snapshot('host').wallet).toBe(1600);expect(room.snapshot('friend').wallet).toBe(1250);
 });
 it('changes faction influence only after a legal job and credits its own participant once',()=>{
  const room=create();accepted(room,'host',{type:'faction',action:{kind:'join',faction:'tide'}});accepted(room,'friend',{type:'faction',action:{kind:'join',faction:'ember'}});
  accepted(room,'host',{type:'faction',action:{kind:'start',job:'courier',district:'downtown'}});
  expect(room.command('host',{type:'faction',action:{kind:'interact'}},0).ok).toBe(false);
  const area=DISTRICTS.downtown;foot(room,'host',area.pickup.x,area.pickup.z);accepted(room,'host',{type:'faction',action:{kind:'interact'}});
  foot(room,'host',area.delivery.x,area.delivery.z);accepted(room,'host',{type:'faction',action:{kind:'interact'}});
  const result=room.snapshot('host');expect(result.wallet).toBe(1470);expect(result.career.reputation).toBe(25);expect(result.factions.profile.loyalty).toBe(30);
  expect(room.snapshot('friend').factions.districts.find(area=>area.id==='downtown')!.influence.tide).toBe(12);
  expect(room.command('host',{type:'faction',action:{kind:'interact'}},0).ok).toBe(false);expect(room.snapshot('friend').wallet).toBe(1250);
 });
 it('shares a complete branching campaign, restricts decisions and preserves chapter prize conservation',()=>{
  const room=create();let now=0;accepted(room,'host',{type:'campaign',action:{kind:'start'}});
  expect(room.command('host',{type:'job',action:{kind:'raceStart'}},now).ok).toBe(false);
  for(let chapter=0;chapter<5;chapter++){
   const state=room.snapshot('host').campaign,definition=campaignChapter(chapter,state.truth,state.loyalty);
   for(const task of definition.objectives){
    now+=100;const id=chapter%2?'friend':'host';if(task.mode==='drive')drive(room,id,task.target.x,task.target.z,now);else foot(room,id,task.target.x,task.target.z,now);
    if(task.holdMs)for(let remaining=task.holdMs;remaining>0;remaining-=250){now+=250;room.tick(now);}
   }
   if(chapter===1){expect(room.command('friend',{type:'campaign',action:{kind:'choice',choice:'publish'}},now).ok).toBe(false);accepted(room,'host',{type:'campaign',action:{kind:'choice',choice:'publish'}},now);}
   if(chapter===3)accepted(room,'host',{type:'campaign',action:{kind:'choice',choice:'crew'}},now);
   if(chapter<4)accepted(room,'host',{type:'campaign',action:{kind:'continue'}},now);
  }
  const host=room.snapshot('host'),friend=room.snapshot('friend');expect(host.campaign).toMatchObject({status:'completed',ending:'dawn'});
  expect(host.wallet).toBe(2950);expect(friend.wallet).toBe(2950);expect(host.career.reputation).toBe(380);expect(friend.career.reputation).toBe(380);
  room.tick(now+1000);expect(room.snapshot('host').wallet).toBe(2950);accepted(room,'host',{type:'campaign',action:{kind:'restart'}},now+1000);expect(room.snapshot('host').campaign.rewardAvailable).toBe(false);
 });
});

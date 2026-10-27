import { describe, expect, it } from 'vitest';
import { RoomAuthority } from '../src/room-authority';
import { CREW_COOLDOWN_MS, CREW_DURATION_MS, CREW_REWARD, ONLINE_TURN_MS } from '../src/multiplayer-model';
import type { OnlinePose, RoomCommand } from '../src/multiplayer-model';

const outside=(x=0,z=68):OnlinePose=>({x,z,heading:0,mode:'foot',interior:null,seated:false,vehicle:null});
const inside=():OnlinePose=>({...outside(0,-2),interior:'casino'});
const create=(count=2)=>{
  const room=new RoomAuthority('ABCDEFGH','host','Gospodarz',123);
  if(count>=2)expect(room.join('friend','Znajomy').ok).toBe(true);
  if(count>=3)expect(room.join('third','Trzeci').ok).toBe(true);
  return room;
};
function accepted(room:RoomAuthority,id:string,command:RoomCommand,now=0) {
  const result=room.command(id,command,now);
  if(!result.ok)throw new Error(result.reason);
}
const start=(room:RoomAuthority,now=0)=>accepted(room,'host',{type:'challengeStart'},now);
const reach=(room:RoomAuthority,id:string,x:number,z:number,now=0)=>accepted(room,id,{type:'pose',pose:outside(x,z)},now);
function finish(room:RoomAuthority,now=0) {
  reach(room,'host',0,40,now);reach(room,'friend',40,40,now);reach(room,'host',40,80,now);
}

describe('host-authoritative cooperative city activity',()=>{
  it('requires a host, another member and the host outside the casino',()=>{
    const alone=create(1);
    expect(alone.command('host',{type:'challengeStart'},0).ok).toBe(false);
    const room=create();
    expect(room.command('friend',{type:'challengeStart'},0).ok).toBe(false);
    expect(room.command('stranger',{type:'challengeStart'},0).ok).toBe(false);
    accepted(room,'host',{type:'pose',pose:inside()});
    expect(room.command('host',{type:'challengeStart'},0).ok).toBe(false);
    accepted(room,'host',{type:'sit'});
    expect(room.command('host',{type:'challengeStart'},0).ok).toBe(false);
    accepted(room,'host',{type:'stand'});reach(room,'host',0,68);
    start(room);
    expect(room.snapshot('host').challenge).toMatchObject({status:'active',run:1,eligible:true,checkpoint:0,total:3,target:{x:0,z:40},remainingMs:CREW_DURATION_MS,cooldownMs:0,reward:CREW_REWARD});
    expect(room.command('host',{type:'challengeStart'},0).ok).toBe(false);
  });

  it('does not collect a previous stationary pose until a new validated update arrives',()=>{
    const room=create();reach(room,'host',0,40);
    start(room);room.tick(1000);
    expect(room.snapshot('host').challenge.checkpoint).toBe(0);
    reach(room,'host',0,40,1000);
    expect(room.snapshot('host').challenge).toMatchObject({checkpoint:1,target:{x:40,z:40},contributors:['host']});
    room.tick(2000);
    expect(room.snapshot('host').challenge.checkpoint).toBe(1);
  });

  it('accepts only the next checkpoint, outside, in range and with a legal pose',()=>{
    const room=create();start(room);
    reach(room,'host',40,40);
    expect(room.snapshot('host').challenge.checkpoint).toBe(0);
    reach(room,'host',0,45.01);
    expect(room.snapshot('host').challenge.checkpoint).toBe(0);
    // Casino coordinates are validated independently and cannot count as city coordinates.
    accepted(room,'host',{type:'pose',pose:inside()});
    expect(room.snapshot('host').challenge.checkpoint).toBe(0);
    expect(room.command('host',{type:'pose',pose:{...outside(0,40),heading:NaN}},0).ok).toBe(false);
    expect(room.snapshot('host').challenge.checkpoint).toBe(0);
    reach(room,'host',0,45);
    expect(room.snapshot('host').challenge.checkpoint).toBe(1);
    reach(room,'host',0,40);
    expect(room.snapshot('host').challenge.checkpoint).toBe(1);
    reach(room,'friend',40,40);reach(room,'host',40,80);
    expect(room.snapshot('host').challenge).toMatchObject({status:'completed',checkpoint:3,target:null,remainingMs:0,contributors:['host','friend']});
  });

  it('also collects checkpoints from a validated vehicle pose',()=>{
    const room=create();start(room);
    const pose=room.snapshot('host').members[0].pose;
    pose.x=0;pose.z=40;pose.vehicle!.x=0;pose.vehicle!.z=40;
    accepted(room,'host',{type:'pose',pose});
    expect(room.snapshot('host').challenge.checkpoint).toBe(1);
  });

  it('pays the initial connected cohort exactly once and isolates snapshot mutations',()=>{
    const room=create(3);start(room);finish(room,5000);
    for(const id of ['host','friend','third']) {
      expect(room.snapshot(id).wallet).toBe(1250+CREW_REWARD);
      expect(room.snapshot(id).challenge.eligible).toBe(true);
    }
    reach(room,'host',40,80,5500);room.tick(6000);
    expect(room.snapshot('host').wallet).toBe(1250+CREW_REWARD);
    const snapshot=room.snapshot('host');snapshot.challenge.contributors.push('fake');snapshot.challenge.checkpoint=0;snapshot.challenge.eligible=false;
    expect(room.snapshot('host').challenge).toMatchObject({checkpoint:3,eligible:true,contributors:['host','friend']});
  });

  it('lets a late joiner help but never grants that player the previous cohort reward',()=>{
    const room=create();start(room);
    expect(room.join('late','Spóźniony').ok).toBe(true);
    expect(room.snapshot('late').challenge.eligible).toBe(false);
    reach(room,'late',0,40,1000);reach(room,'friend',40,40,1000);reach(room,'late',40,80,1000);
    expect(room.snapshot('host').wallet).toBe(1550);expect(room.snapshot('friend').wallet).toBe(1550);expect(room.snapshot('late').wallet).toBe(1250);
    expect(room.snapshot('late').challenge).toMatchObject({status:'completed',eligible:false,contributors:['late','friend']});
    start(room,1000+CREW_COOLDOWN_MS);
    expect(room.snapshot('late').challenge).toMatchObject({run:2,eligible:true});
  });

  it('removes departed reward eligibility, even when the same identity rejoins',()=>{
    const room=create();start(room);room.leave('friend');
    expect(room.join('friend','Ponownie').ok).toBe(true);
    expect(room.snapshot('friend').challenge.eligible).toBe(false);
    finish(room);
    expect(room.snapshot('host').wallet).toBe(1550);expect(room.snapshot('friend').wallet).toBe(1250);
  });

  it('keeps a started challenge playable after a teammate disconnects',()=>{
    const room=create();start(room);room.leave('friend');
    reach(room,'host',0,40);reach(room,'host',40,40);reach(room,'host',40,80);
    expect(room.snapshot('host').challenge.status).toBe('completed');
    expect(room.snapshot('host').wallet).toBe(1550);
    expect(room.command('host',{type:'challengeStart'},CREW_COOLDOWN_MS).ok).toBe(false);
  });

  it('expires on the host deadline, never accepts a checkpoint at that deadline, and never pays failure',()=>{
    const room=create();start(room,1000);reach(room,'host',0,40,1001);reach(room,'friend',40,40,1002);
    expect(room.tick(1000+CREW_DURATION_MS-1)).toBe(false);
    reach(room,'host',40,80,1000+CREW_DURATION_MS);
    expect(room.snapshot('host').challenge).toMatchObject({status:'failed',checkpoint:2,target:null,remainingMs:0,cooldownMs:CREW_COOLDOWN_MS});
    expect(room.snapshot('host').wallet).toBe(1250);expect(room.snapshot('friend').wallet).toBe(1250);
    room.tick(1000+CREW_DURATION_MS+CREW_COOLDOWN_MS);
    expect(room.snapshot('host').wallet).toBe(1250);
  });

  it('reports timeout changes even when no poker hand exists and uses a monotonic clock',()=>{
    const room=create();start(room,1000);room.tick(5000);
    expect(room.snapshot('host').challenge.remainingMs).toBe(CREW_DURATION_MS-4000);
    room.tick(3000);
    expect(room.snapshot('host').challenge.remainingMs).toBe(CREW_DURATION_MS-4000);
    expect(room.tick(1000+CREW_DURATION_MS)).toBe(true);
    expect(room.tick(1000+CREW_DURATION_MS)).toBe(false);
    expect(room.tick(NaN)).toBe(false);
  });

  it('enforces cooldown, resets progress and captures a new cohort on the next run',()=>{
    const room=create();start(room);finish(room,5000);
    expect(room.command('host',{type:'challengeStart'},5000+CREW_COOLDOWN_MS-1).ok).toBe(false);
    expect(room.snapshot('host').challenge.cooldownMs).toBe(1);
    start(room,5000+CREW_COOLDOWN_MS);
    expect(room.snapshot('host').challenge).toMatchObject({status:'active',run:2,checkpoint:0,contributors:[],remainingMs:CREW_DURATION_MS,cooldownMs:0});
    expect(room.snapshot('host').wallet).toBe(1550);
    finish(room,6000+CREW_COOLDOWN_MS);
    expect(room.snapshot('host').wallet).toBe(1850);expect(room.snapshot('friend').wallet).toBe(1850);
  });

  it('does not reset or replace poker turn deadlines when starting or expiring a crew run',()=>{
    const room=create();start(room);
    for(const id of ['host','friend']) {accepted(room,id,{type:'pose',pose:inside()});accepted(room,id,{type:'sit'});}
    accepted(room,'host',{type:'deal'});
    const before=room.snapshot('host');
    expect(before.turnDeadline).toBe(ONLINE_TURN_MS);
    expect(room.tick(ONLINE_TURN_MS)).toBe(true);
    expect(room.snapshot('host').poker!.phase).toBe('showdown');
    expect(room.snapshot('host').challenge.status).toBe('active');
    expect(room.tick(CREW_DURATION_MS)).toBe(true);
    expect(room.snapshot('host').challenge.status).toBe('failed');
    expect(room.snapshot('host').poker!.phase).toBe('showdown');
  });
});

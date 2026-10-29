import { describe,expect,it } from 'vitest';
import { BUILDINGS } from '../src/model';
import type { OnlinePose } from '../src/multiplayer-model';
import { CITY_ACTIVITY_DURATION_MS,CITY_ACTIVITY_FIRST_MS,CITY_ACTIVITY_PERIOD_MS,CityEvents,CONVOY_INTERCEPT_MS,WANTED_VEHICLE_ID,convoyPose,type CityEventAction,type CityEventMember } from '../src/city-events';

const foot=(x=0,z=80):OnlinePose=>({x,z,heading:0,mode:'foot',interior:null,seated:false,vehicle:null});
const drive=(x=0,z=80,id='stratus',speed=0,health=100):OnlinePose=>({...foot(x,z),mode:'drive',vehicle:{id,kind:'sedan',x,z,heading:0,speed,health,color:0xaaaaaa}});
const people=():CityEventMember[]=>[{id:'one',name:'Nova',pose:drive()},{id:'two',name:'Rico',pose:drive(3,80)}];
function accept(events:CityEvents,id:string,action:CityEventAction,members:CityEventMember[],now:number){const result=events.command(id,action,members,now);if(!result.ok)throw new Error(result.reason);}
function setup(run=0){const events=new CityEvents(),members=people();events.update(members,0);const now=CITY_ACTIVITY_FIRST_MS+run*CITY_ACTIVITY_PERIOD_MS;events.update(members,now);return {events,members,now,id:events.snapshot('one').id!};}
function join(events:CityEvents,members:CityEventMember[],now:number,id:string,person='one'){accept(events,person,{kind:'join',eventId:id},members,now);}
function carryToFinish(events:CityEvents,members:CityEventMember[],now:number,id:string,person='one',vehicle='stratus'){
  const member=members.find(p=>p.id===person)!,checkpoint=events.snapshot(person).checkpoint!,drop=events.snapshot(person).drop!;
  member.pose=drive(checkpoint.x,checkpoint.z,vehicle);events.update(members,now+1);expect(events.snapshot(person).stage).toBe('delivery');
  member.pose=drive(drop.x,drop.z,vehicle);accept(events,person,{kind:'interact',eventId:id},members,now+2);
}

describe('host-owned city activities',()=>{
  it('uses the host epoch, rotates three distinct activities and expires at the exact deadline',()=>{
    const events=new CityEvents(),members=people();events.update(members,1000000);
    expect(events.snapshot('one')).toMatchObject({id:null,status:'upcoming',nextInMs:CITY_ACTIVITY_FIRST_MS});
    events.update(members,1000000+CITY_ACTIVITY_FIRST_MS);expect(events.snapshot('one')).toMatchObject({kind:'convoy',status:'available',remainingMs:CITY_ACTIVITY_DURATION_MS});
    events.update(members,1000000+CITY_ACTIVITY_FIRST_MS+CITY_ACTIVITY_DURATION_MS);expect(events.snapshot('one').status).toBe('expired');
    events.update(members,1000000+CITY_ACTIVITY_FIRST_MS+CITY_ACTIVITY_PERIOD_MS);expect(events.snapshot('one')).toMatchObject({kind:'wanted',status:'available'});
    events.update(members,1000000+CITY_ACTIVITY_FIRST_MS+CITY_ACTIVITY_PERIOD_MS*2);expect(events.snapshot('one').kind).toBe('courier');
    events.update(members,1000000+CITY_ACTIVITY_FIRST_MS+CITY_ACTIVITY_PERIOD_MS*3);expect(events.snapshot('one')).toMatchObject({id:'activity-3-convoy',kind:'convoy'});
  });

  it('requires a real driver to shadow the moving convoy for three continuous seconds before delivering once',()=>{
    const {events,members,now,id}=setup();join(events,members,now,id);
    members[0].pose=drive(80,40,'stratus',7);accept(events,'one',{kind:'interact',eventId:id},members,now);
    for(let elapsed=100;elapsed<=CONVOY_INTERCEPT_MS;elapsed+=100){const target=convoyPose(elapsed/1000);members[0].pose=drive(target.x,target.z,'stratus',7);events.update(members,now+elapsed);}
    expect(events.snapshot('one')).toMatchObject({holderId:'one',stage:'checkpoint',progress:100});
    expect(events.drainCredits()).toEqual([]);carryToFinish(events,members,now+CONVOY_INTERCEPT_MS,id);
    expect(events.snapshot('one')).toMatchObject({status:'completed',winnerId:'one'});
    expect(events.drainCredits()).toEqual([{id:'one',amount:650,eventId:id}]);expect(events.drainCredits()).toEqual([]);
    expect(events.command('one',{kind:'interact',eventId:id},members,now+4000).ok).toBe(false);
    events.update(members,now+5000);expect(events.drainCredits()).toEqual([]);
  });

  it('resets convoy progress after losing proximity, speeding, being a passenger or going indoors',()=>{
    const {events,members,now,id}=setup();join(events,members,now,id);
    members[0].pose=drive(80,40,'stratus',7);accept(events,'one',{kind:'interact',eventId:id},members,now);
    events.update(members,now+200);expect(events.snapshot('one').progress).toBeGreaterThan(0);
    members[0].pose=drive(0,0);events.update(members,now+300);expect(events.snapshot('one').progress).toBe(0);
    const target=convoyPose(.4);members[0].pose=drive(target.x,target.z,'stratus',13);events.update(members,now+400);expect(events.snapshot('one').progress).toBe(0);
    members[0].pose={...drive(target.x,target.z),passengerOf:'two'};events.update(members,now+500);expect(events.snapshot('one').canInteract).toBe(false);
    members[0].pose={...drive(target.x,target.z),interior:'casino'};events.update(members,now+600);expect(events.snapshot('one').canInteract).toBe(false);
  });

  it('does not let a single large time jump fabricate a completed convoy interception',()=>{
    const {events,members,now,id}=setup();join(events,members,now,id);
    members[0].pose=drive(80,40);accept(events,'one',{kind:'interact',eventId:id},members,now);
    const target=convoyPose(10);members[0].pose=drive(target.x,target.z);events.update(members,now+10000);
    expect(events.snapshot('one').holderId).toBeNull();expect(events.snapshot('one').progress).toBeLessThan(10);
  });

  it('requires the actual wanted vehicle, a checkpoint and a healthy stopped delivery',()=>{
    const {events,members,now,id}=setup(1);join(events,members,now,id);
    members[0].pose=drive(-75,-44);expect(events.command('one',{kind:'interact',eventId:id},members,now).ok).toBe(false);
    members[0].pose=drive(-75,-44,WANTED_VEHICLE_ID);accept(events,'one',{kind:'interact',eventId:id},members,now);
    expect(events.snapshot('one').stage).toBe('checkpoint');
    const drop=events.snapshot('one').drop!;members[0].pose=drive(drop.x,drop.z,WANTED_VEHICLE_ID);expect(events.command('one',{kind:'interact',eventId:id},members,now+1).ok).toBe(false);
    const checkpoint=events.snapshot('one').checkpoint!;members[0].pose=drive(checkpoint.x,checkpoint.z,WANTED_VEHICLE_ID);events.update(members,now+2);
    members[0].pose=drive(drop.x,drop.z,WANTED_VEHICLE_ID,0,29);expect(events.command('one',{kind:'interact',eventId:id},members,now+3).ok).toBe(false);
    members[0].pose=drive(drop.x,drop.z,WANTED_VEHICLE_ID,7);expect(events.command('one',{kind:'interact',eventId:id},members,now+4).ok).toBe(false);
    members[0].pose=drive(drop.x,drop.z,WANTED_VEHICLE_ID,0,40);accept(events,'one',{kind:'interact',eventId:id},members,now+5);
    expect(events.drainCredits()).toEqual([{id:'one',amount:550,eventId:id}]);
  });

  it('keeps the wanted-car marker at its last observed parked location after exit or disconnect',()=>{
    const {events,members,now,id}=setup(1);join(events,members,now,id);
    members[0].pose=drive(-80,20,WANTED_VEHICLE_ID);events.update(members,now+1);
    expect(events.snapshot('two').pickup).toEqual({x:-80,z:20});
    members[0].pose=foot(-77.4,20);events.update(members,now+2);
    expect(events.snapshot('two').pickup).toEqual({x:-80,z:20});
    events.update(members.slice(1),now+3);expect(events.snapshot('two').pickup).toEqual({x:-80,z:20});
    const nextWanted=now+CITY_ACTIVITY_PERIOD_MS*3;
    events.update(members.slice(1),nextWanted);expect(events.snapshot('two').pickup).toEqual({x:-80,z:20});
  });

  it('keeps the courier cargo exclusive and awards only the first legal delivery',()=>{
    const {events,members,now,id}=setup(2);join(events,members,now,id);join(events,members,now,id,'two');
    const pickup=events.snapshot('one').pickup!;members[0].pose=foot(pickup.x,pickup.z);members[1].pose=foot(pickup.x,pickup.z);
    accept(events,'two',{kind:'interact',eventId:id},members,now+1);
    expect(events.snapshot('one')).toMatchObject({holderId:'two',canInteract:false});
    expect(events.command('one',{kind:'interact',eventId:id},members,now+1).ok).toBe(false);
    members.push({id:'late',name:'Późny',pose:foot(pickup.x,pickup.z)});events.update(members,now+2);
    expect(events.snapshot('late').canJoin).toBe(false);expect(events.command('late',{kind:'join',eventId:id},members,now+2).ok).toBe(false);
    carryToFinish(events,members,now+2,id,'two');expect(events.drainCredits()).toEqual([{id:'two',amount:450,eventId:id}]);
  });

  it('returns abandoned or disconnected cargo to acquisition and permits another contestant to finish',()=>{
    const {events,members,now,id}=setup(2);join(events,members,now,id);join(events,members,now,id,'two');
    const pickup=events.snapshot('one').pickup!;members[0].pose=foot(pickup.x,pickup.z);accept(events,'one',{kind:'interact',eventId:id},members,now);
    accept(events,'one',{kind:'abandon',eventId:id},members,now+1);expect(events.snapshot('two')).toMatchObject({holderId:null,stage:'pickup'});
    members[1].pose=foot(pickup.x,pickup.z);accept(events,'two',{kind:'interact',eventId:id},members,now+2);
    events.update(members.slice(0,1),now+3);expect(events.snapshot('one')).toMatchObject({holderId:null,stage:'pickup'});expect(events.drainCredits()).toEqual([]);
    join(events,members.slice(0,1),now+4,id);accept(events,'one',{kind:'interact',eventId:id},members.slice(0,1),now+4);
    carryToFinish(events,members.slice(0,1),now+5,id);expect(events.drainCredits()[0].id).toBe('one');
  });

  it('rejects spectators, invalid commands, stale event IDs and invalid times without leaking rewards',()=>{
    const {events,members,now,id}=setup(2);
    expect(events.command('one',{kind:'interact',eventId:id},members,now).ok).toBe(false);
    expect(events.command('ghost',{kind:'join',eventId:id},members,now).ok).toBe(false);
    expect(events.command('one',{kind:'join',eventId:'activity-old'},members,now).ok).toBe(false);
    expect(events.command('one',null as unknown as CityEventAction,members,now).ok).toBe(false);
    expect(events.command('one',{kind:'join',eventId:id},members,Infinity).ok).toBe(false);
    members[0].pose={...foot(),homeId:'studio'} as OnlinePose;expect(events.command('one',{kind:'join',eventId:id},members,now).ok).toBe(false);
    events.update(members,NaN);expect(events.snapshot('one').status).toBe('available');expect(events.drainCredits()).toEqual([]);
  });

  it('expires held cargo without a payout and gives the next activity a fresh cohort',()=>{
    const {events,members,now,id}=setup(2);join(events,members,now,id);const pickup=events.snapshot('one').pickup!;
    members[0].pose=foot(pickup.x,pickup.z);accept(events,'one',{kind:'interact',eventId:id},members,now);
    events.update(members,now+CITY_ACTIVITY_DURATION_MS);expect(events.snapshot('one')).toMatchObject({status:'expired',holderId:null});expect(events.drainCredits()).toEqual([]);
    events.update(members,now+CITY_ACTIVITY_PERIOD_MS);expect(events.snapshot('one')).toMatchObject({status:'available',joined:false,participants:[],kind:'convoy'});
  });

  it('keeps snapshots independent, convoy travel on roads, and objectives outside buildings',()=>{
    const {events}=setup();const first=events.snapshot('one');first.target!.x=999;first.convoy!.x=999;
    expect(events.snapshot('one').target!.x).toBe(80);expect(events.snapshot('one').convoy!.x).toBe(80);
    for(let second=0;second<100;second++){
      const p=convoyPose(second);expect(BUILDINGS.some(b=>Math.abs(p.x-b.x)<b.halfX+1.5&&Math.abs(p.z-b.z)<b.halfZ+1.5)).toBe(false);
    }
    for(let run=0;run<3;run++){const snapshot=setup(run).events.snapshot('one');for(const point of [snapshot.pickup,snapshot.checkpoint,snapshot.drop])expect(BUILDINGS.some(b=>Math.abs(point!.x-b.x)<b.halfX&&Math.abs(point!.z-b.z)<b.halfZ)).toBe(false);}
  });
});

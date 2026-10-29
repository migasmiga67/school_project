import { describe,expect,it } from 'vitest';
import { DISTRICTS, FACTION_CAPTURE_MS, FACTION_JOB_COOLDOWN_MS, FACTION_JOB_DURATION_MS, FACTION_INCOME_MS, FACTION_SWITCH_MS, Factions, createFactionProfile, createFactionWorld, districtController, parseFactionSave, type DistrictId, type FactionAction, type FactionMember, type FactionSave } from '../src/factions';

function person(id='solo',x=0,z=68):FactionMember{return{id,name:id,pose:{x,z,heading:0,mode:'foot',vehicle:null,interior:null,seated:false}};}
function fixture(saved?:unknown,id='solo'){
 const model=new Factions(saved,id),members=[person(id)],time={now:0};model.update(members,0);
 const command=(action:FactionAction)=>{const result=model.command(id,action,members,time.now);if(!result.ok)throw new Error(result.reason);};
 const move=(x:number,z:number)=>{Object.assign(members[0].pose,{x,z});model.update(members,time.now);};
 const advance=(milliseconds:number)=>{for(let remaining=milliseconds;remaining>0;){const step=Math.min(100,remaining);time.now+=step;model.update(members,time.now);remaining-=step;}};
 return{model,members,time,command,move,advance,snapshot:()=>model.snapshot(id)};
}
function courier(f:ReturnType<typeof fixture>,district:DistrictId='downtown'){
 f.command({kind:'start',job:'courier',district});const area=DISTRICTS[district];f.move(area.pickup.x,area.pickup.z);f.command({kind:'interact'});f.move(area.delivery.x,area.delivery.z);f.command({kind:'interact'});
}
function veteran():FactionSave{return{profile:{...createFactionProfile(),faction:'tide',loyalty:60},world:createFactionWorld()};}

describe('faction territory gameplay',()=>{
 it('parses saved membership and shared influence without restoring unfinished jobs',()=>{
  const profile=parseFactionSave({profile:{faction:'tide',loyalty:60,completedJobs:2,serial:9,incomeSerial:4},world:{districts:{downtown:{influence:{tide:50,ember:25,circuit:0}}}},job:{status:'active',reward:999999}});
  expect(profile.profile).toEqual({faction:'tide',loyalty:60,completedJobs:2,serial:9,incomeSerial:4});expect(profile.world.districts.downtown.influence.tide).toBe(50);
  const f=fixture(profile);expect(f.snapshot().job.status).toBe('idle');expect(f.snapshot().districts[0].controller).toBe('tide');
  expect(parseFactionSave({profile:{faction:'unknown',loyalty:Infinity,serial:-1},world:{districts:{downtown:{influence:{tide:999,ember:-1,circuit:NaN}}}}})).toEqual({profile:createFactionProfile(),world:createFactionWorld()});
 });
 it('requires faction membership, a known job and a reachable, stopped collection',()=>{
  const f=fixture();expect(f.model.command('solo',{kind:'start',job:'courier',district:'downtown'},f.members,0).ok).toBe(false);
  f.command({kind:'join',faction:'tide'});f.command({kind:'start',job:'courier',district:'downtown'});
  expect(f.snapshot().job.canInteract).toBe(false);expect(f.model.command('solo',{kind:'interact'},f.members,0).ok).toBe(false);
  f.move(-40,0);f.members[0].pose.mode='drive';f.members[0].pose.vehicle={id:'stratus',kind:'sport',x:-40,z:0,heading:0,speed:10,health:100,color:0xffffff};
  expect(f.model.command('solo',{kind:'interact'},f.members,0).ok).toBe(false);f.members[0].pose.vehicle.speed=0;f.command({kind:'interact'});expect(f.snapshot().job.stage).toBe('delivery');
  expect(f.model.command('solo',{kind:'start',job:'courier',district:'harbor'},f.members,0).ok).toBe(false);
 });
 it('completes an actual pickup and delivery once, grows influence, and locks repeat starts until cooldown',()=>{
  const f=fixture();f.command({kind:'join',faction:'tide'});courier(f);
  expect(f.snapshot().job.status).toBe('completed');expect(f.snapshot().profile.loyalty).toBe(30);expect(f.snapshot().profile.completedJobs).toBe(1);expect(f.snapshot().districts[0].influence.tide).toBe(12);
  expect(f.model.drainCredits()).toEqual([{id:'solo',amount:220,reputation:25,sourceId:'faction-1-tide-downtown-courier'}]);
  expect(f.model.command('solo',{kind:'interact'},f.members,0).ok).toBe(false);expect(f.model.drainCredits()).toEqual([]);
  expect(f.model.command('solo',{kind:'start',job:'courier',district:'downtown'},f.members,0).ok).toBe(false);
  f.advance(FACTION_JOB_COOLDOWN_MS);courier(f);expect(f.model.drainCredits()[0].sourceId).toBe('faction-2-tide-downtown-courier');
 });
 it('requires faction loyalty before transmitter and control jobs unlock',()=>{
  const f=fixture();f.command({kind:'join',faction:'circuit'});
  expect(f.model.command('solo',{kind:'start',job:'transmitter',district:'downtown'},f.members,0).ok).toBe(false);
  courier(f);f.advance(FACTION_JOB_COOLDOWN_MS);expect(f.model.command('solo',{kind:'start',job:'capture',district:'downtown'},f.members,f.time.now).ok).toBe(false);
  f.command({kind:'start',job:'transmitter',district:'downtown'});expect(f.snapshot().job.kind).toBe('transmitter');
 });
 it('transmitter needs six continuous on-foot seconds, resets on leaving, and pays only after escape',()=>{
  const f=fixture(veteran()),area=DISTRICTS.downtown;f.command({kind:'start',job:'transmitter',district:'downtown'});f.move(area.relay.x,area.relay.z);f.command({kind:'interact'});f.advance(4000);expect(f.snapshot().job.progress).toBeGreaterThan(60);
  f.move(0,40);expect(f.snapshot().job.progress).toBe(0);f.move(area.relay.x,area.relay.z);f.advance(6000);expect(f.snapshot().job.stage).toBe('escape');expect(f.model.drainCredits()).toEqual([]);
  f.move(area.escape.x,area.escape.z);f.command({kind:'interact'});expect(f.snapshot().job.status).toBe('completed');expect(f.model.drainCredits()[0]).toMatchObject({amount:280,reputation:35});
 });
 it('rival presence interrupts capture; ten uninterrupted seconds award once',()=>{
  const f=fixture(veteran());f.members.push(person('rival',80,80));f.model.update(f.members,0);
  expect(f.model.command('rival',{kind:'join',faction:'ember'},f.members,0).ok).toBe(true);
  f.command({kind:'start',job:'capture',district:'downtown'});f.move(0,0);f.command({kind:'interact'});f.advance(7000);expect(f.snapshot().job.progress).toBe(70);
  Object.assign(f.members[1].pose,{x:1,z:1});f.advance(100);expect(f.snapshot().job.contested).toBe(true);expect(f.snapshot().job.progress).toBe(0);
  Object.assign(f.members[1].pose,{x:80,z:80});f.advance(FACTION_CAPTURE_MS-100);expect(f.snapshot().job.status).toBe('active');f.advance(100);expect(f.snapshot().job.status).toBe('completed');
  expect(f.model.drainCredits()).toHaveLength(1);f.advance(20000);expect(f.model.drainCredits()).toEqual([]);expect(f.model.snapshot('rival').districts[0].influence.tide).toBe(25);
 });
 it('does not award ten-second capture when one update jumps ahead in time',()=>{
  const f=fixture(veteran());f.command({kind:'start',job:'capture',district:'heights'});f.move(0,-80);f.command({kind:'interact'});f.time.now=10000;f.model.update(f.members,f.time.now);
  expect(f.snapshot().job.status).toBe('active');expect(f.snapshot().job.progress).toBe(10);expect(f.model.drainCredits()).toEqual([]);
 });
 it('district ownership requires a clear lead; successful rivals can erase it',()=>{
  expect(districtController({tide:34,ember:0,circuit:0})).toBeNull();expect(districtController({tide:35,ember:25,circuit:0})).toBe('tide');expect(districtController({tide:35,ember:30,circuit:0})).toBeNull();expect(districtController({tide:40,ember:40,circuit:0})).toBeNull();
  const save=veteran();save.world.districts.downtown.influence={tide:40,ember:25,circuit:0};save.profile.faction='ember';const f=fixture(save);courier(f);
  expect(f.snapshot().districts[0].influence).toEqual({tide:36,ember:37,circuit:0});expect(f.snapshot().districts[0].controller).toBeNull();expect(f.snapshot().districts[0].contested).toBe(true);
 });
 it('owned territory grants a real job bonus and one bounded income payment per minute without catchup',()=>{
  const save=veteran();save.world.districts.downtown.influence.tide=50;const f=fixture(save);expect(f.snapshot().bonusPercent).toBe(3);expect(f.snapshot().incomePerMinute).toBe(40);
  courier(f,'harbor');expect(f.model.drainCredits()[0].amount).toBe(226);
  f.time.now=FACTION_INCOME_MS-1;f.model.update(f.members,f.time.now);expect(f.model.drainCredits()).toEqual([]);
  f.time.now++;f.model.update(f.members,f.time.now);expect(f.model.drainCredits()).toEqual([{id:'solo',amount:40,reputation:0,sourceId:'faction-income-1'}]);f.model.update(f.members,f.time.now);expect(f.model.drainCredits()).toEqual([]);
  f.time.now=3600000;f.model.update(f.members,f.time.now);expect(f.model.drainCredits()).toHaveLength(1);f.model.update(f.members,200);expect(f.model.drainCredits()).toEqual([]);
 });
 it('switching factions resets loyalty and cannot farm a leading faction income',()=>{
  const save=veteran();save.world.districts.downtown.influence.ember=60;const f=fixture(save);f.command({kind:'join',faction:'ember'});expect(f.snapshot().profile.loyalty).toBe(0);expect(f.snapshot().incomePerMinute).toBe(0);
  expect(f.model.command('solo',{kind:'join',faction:'circuit'},f.members,0).ok).toBe(false);f.advance(FACTION_INCOME_MS);expect(f.model.drainCredits()).toEqual([]);f.advance(FACTION_SWITCH_MS-FACTION_INCOME_MS);f.command({kind:'join',faction:'circuit'});
 });
 it('expires or cancels an assignment without awards and refuses indoor objectives',()=>{
  const f=fixture(veteran());f.command({kind:'start',job:'courier',district:'downtown'});f.move(-40,0);f.members[0].pose.homeId='canal';
  expect(f.model.command('solo',{kind:'interact'},f.members,0).ok).toBe(false);f.members[0].pose.homeId=null;f.time.now=FACTION_JOB_DURATION_MS;f.model.update(f.members,f.time.now);expect(f.snapshot().job.status).toBe('failed');expect(f.model.drainCredits()).toEqual([]);
  f.advance(FACTION_JOB_COOLDOWN_MS);f.command({kind:'start',job:'capture',district:'downtown'});f.command({kind:'cancel'});expect(f.snapshot().job.status).toBe('failed');expect(f.model.drainCredits()).toEqual([]);
 });
 it('persists faction choice, influence and award serials; a reload cannot resume or repay the old assignment',()=>{
  const f=fixture();f.command({kind:'join',faction:'tide'});courier(f);f.model.drainCredits();const restored=fixture(f.model.save('solo'));
  expect(restored.snapshot().profile).toMatchObject({faction:'tide',loyalty:30,completedJobs:1,serial:1});expect(restored.snapshot().districts[0].influence.tide).toBe(12);expect(restored.snapshot().job.status).toBe('idle');expect(restored.model.drainCredits()).toEqual([]);
  courier(restored);expect(restored.model.drainCredits()[0].sourceId).toBe('faction-2-tide-downtown-courier');
 });
 it('removes a disconnected member from capture and income instead of paying a departed player',()=>{
  const save=veteran();save.world.districts.downtown.influence.tide=50;const f=fixture(save);f.command({kind:'start',job:'capture',district:'downtown'});f.move(0,0);f.command({kind:'interact'});f.advance(5000);f.model.update([],65000);
  expect(f.model.drainCredits()).toEqual([]);f.model.update(f.members,66000);expect(f.snapshot().profile.faction).toBeNull();expect(f.snapshot().job.status).toBe('idle');
 });
});

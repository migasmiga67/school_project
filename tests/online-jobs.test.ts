import {describe,expect,it} from 'vitest';
import {OnlineJobs,HEIST_DURATION_MS,HEIST_SAFEHOUSE,JOB_COOLDOWN_MS,RACE_COUNTDOWN_MS,RACE_DURATION_MS,RACE_CHECKPOINTS,type JobAction,type JobMember} from '../src/online-jobs';
import type {OnlinePose} from '../src/multiplayer-model';

function foot(x=0,z=80):OnlinePose{return{x,z,heading:0,mode:'foot',interior:null,seated:false,vehicle:null};}
function driver(x=0,z=80):OnlinePose{return{...foot(x,z),mode:'drive',vehicle:{id:'stratus',kind:'sport',x,z,heading:0,color:0xeeeeee,speed:0,health:100}};}
function members(count=2):JobMember[]{return ['host','friend','third','fourth'].slice(0,count).map((id,index)=>({id,name:`Gracz ${index}`,pose:driver(index,80)}));}
function at(people:JobMember[],id:string,pose:OnlinePose){people.find(person=>person.id===id)!.pose=pose;}
function accepted(jobs:OnlineJobs,id:string,action:JobAction,people:JobMember[],now=0){const result=jobs.command(id,action,people,now);if(!result.ok)throw new Error(result.reason);}
function gather(jobs:OnlineJobs,people:JobMember[],now=0){
 at(people,'host',driver(20,74));at(people,'friend',foot(20,74));
 accepted(jobs,'host',{kind:'heistInteract'},people,now);
 accepted(jobs,'friend',{kind:'heistInteract'},people,now);
 expect(jobs.snapshot('host',now).heist.status).toBe('hack');
}
function hack(jobs:OnlineJobs,people:JobMember[],now=0){
 const hacker=jobs.snapshot('host',now).heist.hackerId!;
 const symbols=jobs.snapshot(hacker,now).heist.sequence;
 for(const symbol of symbols)accepted(jobs,hacker,{kind:'heistHack',symbol},people,now);
 expect(jobs.snapshot('host',now).heist.status).toBe('escape');
}
function race(jobs:OnlineJobs,people:JobMember[],now=0){
 accepted(jobs,'host',{kind:'raceStart'},people,now);
 accepted(jobs,'host',{kind:'raceReady'},people,now);
 accepted(jobs,'friend',{kind:'raceReady'},people,now);
 for(const person of people){const point=jobs.snapshot(person.id,now).race.grid;if(point)person.pose=driver(point.x,point.z);}
 jobs.update(people,now+RACE_COUNTDOWN_MS);
 expect(jobs.snapshot('host',now+RACE_COUNTDOWN_MS).race.status).toBe('running');
}
function finish(jobs:OnlineJobs,people:JobMember[],id:string,now:number){
 const credits:{id:string;amount:number}[]=[];
 for(const target of RACE_CHECKPOINTS){at(people,id,driver(target.x,target.z));credits.push(...jobs.update(people,now++).credits);}
 return credits;
}

describe('cooperative casino heist',()=>{
 it('requires host, two members and an outdoor host, and blocks overlapping jobs',()=>{
  const jobs=new OnlineJobs('host'),people=members();
  expect(jobs.command('friend',{kind:'heistStart'},people,0).ok).toBe(false);
  expect(jobs.command('host',{kind:'heistStart'},people.slice(0,1),0).ok).toBe(false);
  at(people,'host',{...foot(),interior:'casino'});
  expect(jobs.command('host',{kind:'heistStart'},people,0).ok).toBe(false);
  at(people,'host',driver());accepted(jobs,'host',{kind:'heistStart'},people);
  expect(jobs.busy).toBe(true);
  expect(jobs.command('host',{kind:'raceStart'},people,0).ok).toBe(false);
  expect(jobs.command('host',{kind:'heistStart'},people,0).ok).toBe(false);
 });

 it('requires both roles to confirm near the casino and keeps the secret private',()=>{
  const jobs=new OnlineJobs('host'),people=members(3);accepted(jobs,'host',{kind:'heistStart'},people);
  expect(jobs.command('host',{kind:'heistInteract'},people,0).ok).toBe(false);
  at(people,'host',driver(20,74));at(people,'friend',foot(20,74));
  jobs.update(people,0);expect(jobs.snapshot('friend',0).heist.status).toBe('gather');
  accepted(jobs,'host',{kind:'heistInteract'},people);
  expect(jobs.snapshot('host',0).heist.gathered).toEqual(['host']);
  expect(jobs.command('host',{kind:'heistInteract'},people,0).ok).toBe(false);
  accepted(jobs,'friend',{kind:'heistInteract'},people);
  expect(jobs.snapshot('host',0).heist.sequence).toEqual([]);
  expect(jobs.snapshot('third',0).heist.sequence).toEqual([]);
  expect(jobs.snapshot('friend',0).heist.sequence).toHaveLength(3);
  expect(jobs.snapshot('host',0).heist.role).toBe('driver');
  expect(jobs.snapshot('friend',0).heist.role).toBe('hacker');
  expect(jobs.snapshot('third',0).heist.role).toBe('lookout');
  const secret=jobs.snapshot('friend',0).heist;secret.sequence[0]=99;
  expect(jobs.snapshot('friend',0).heist.sequence[0]).toBeLessThan(4);
 });

 it('accepts symbols only from the hacker standing at the entrance',()=>{
  const jobs=new OnlineJobs('host'),people=members();accepted(jobs,'host',{kind:'heistStart'},people);gather(jobs,people);
  const symbol=jobs.snapshot('friend',0).heist.sequence[0];
  expect(jobs.command('host',{kind:'heistHack',symbol},people,0).ok).toBe(false);
  at(people,'friend',driver(20,74));expect(jobs.command('friend',{kind:'heistHack',symbol},people,0).ok).toBe(false);
  at(people,'friend',foot(20,90));expect(jobs.command('friend',{kind:'heistHack',symbol},people,0).ok).toBe(false);
  at(people,'friend',foot(20,74));expect(jobs.command('friend',{kind:'heistHack',symbol:NaN},people,0).ok).toBe(false);
  accepted(jobs,'friend',{kind:'heistHack',symbol},people);
  expect(jobs.snapshot('friend',0).heist.progress).toBe(1);
 });

 it('resets a wrong sequence and fails cleanly at three errors without payouts',()=>{
  const jobs=new OnlineJobs('host'),people=members();accepted(jobs,'host',{kind:'heistStart'},people);gather(jobs,people);
  const first=jobs.snapshot('friend',0).heist.sequence[0];accepted(jobs,'friend',{kind:'heistHack',symbol:first},people);
  const second=jobs.snapshot('friend',0).heist.sequence[1];accepted(jobs,'friend',{kind:'heistHack',symbol:(second+1)%4},people);
  expect(jobs.snapshot('friend',0).heist).toMatchObject({progress:0,alarm:1});
  for(let error=0;error<2;error++)accepted(jobs,'friend',{kind:'heistHack',symbol:(first+1)%4},people);
  expect(jobs.snapshot('host',0).heist).toMatchObject({status:'failed',cooldownMs:JOB_COOLDOWN_MS});
  expect(jobs.update(people,1).credits).toEqual([]);expect(jobs.busy).toBe(false);
 });

 it('requires a driving leader and two initial members at the safehouse, then pays once',()=>{
  const jobs=new OnlineJobs('host'),people=members(3);accepted(jobs,'host',{kind:'heistStart'},people);gather(jobs,people);hack(jobs,people);
  expect(jobs.snapshot('friend',0).heist.sequence).toEqual([]);
  at(people,'host',driver(HEIST_SAFEHOUSE.x,HEIST_SAFEHOUSE.z));expect(jobs.update(people,1000).credits).toEqual([]);
  at(people,'friend',foot(HEIST_SAFEHOUSE.x,HEIST_SAFEHOUSE.z));at(people,'host',foot(HEIST_SAFEHOUSE.x,HEIST_SAFEHOUSE.z));
  expect(jobs.update(people,1001).credits).toEqual([]);
  at(people,'host',driver(HEIST_SAFEHOUSE.x,HEIST_SAFEHOUSE.z));
  expect(jobs.update(people,1002).credits).toEqual([{id:'host',amount:800},{id:'friend',amount:800},{id:'third',amount:800}]);
  expect(jobs.snapshot('host',1002).heist).toMatchObject({status:'completed',target:null,cooldownMs:JOB_COOLDOWN_MS});
  expect(jobs.update(people,1003).credits).toEqual([]);
  expect(jobs.command('host',{kind:'heistStart'},people,1003).ok).toBe(false);
  accepted(jobs,'host',{kind:'heistStart'},people,1002+JOB_COOLDOWN_MS);
  expect(jobs.snapshot('host',1002+JOB_COOLDOWN_MS).heist).toMatchObject({status:'gather',run:2,progress:0,alarm:0});
 });

 it('accepts a passenger as escape crew but never awards a late joiner',()=>{
  const jobs=new OnlineJobs('host'),people=members();accepted(jobs,'host',{kind:'heistStart'},people);gather(jobs,people);hack(jobs,people);
  people.push({id:'late',name:'Spóźniony',pose:foot(-80,0)});
  at(people,'host',driver(-80,0));at(people,'friend',{...foot(-80,0),passengerOf:'host'});
  expect(jobs.update(people,1000).credits).toEqual([{id:'host',amount:800},{id:'friend',amount:800}]);
  expect(jobs.snapshot('late',1000).heist.eligible).toBe(false);
 });

 it('reassigns a departed hacker, revokes departed eligibility and fails without two initial members',()=>{
  const jobs=new OnlineJobs('host'),people=members(3);accepted(jobs,'host',{kind:'heistStart'},people);gather(jobs,people);
  const rest=people.filter(person=>person.id!=='friend');jobs.update(rest,1000);
  expect(jobs.snapshot('third',1000).heist).toMatchObject({role:'hacker',hackerId:'third',progress:0});
  expect(jobs.snapshot('third',1000).heist.sequence).toHaveLength(3);
  rest.push({id:'friend',name:'Ponownie',pose:foot(20,74)});jobs.update(rest,1001);
  expect(jobs.snapshot('friend',1001).heist.eligible).toBe(false);
  jobs.update(rest.filter(person=>person.id!=='third'),1002);
  expect(jobs.snapshot('host',1002).heist.status).toBe('failed');
 });

 it('uses a monotonic deadline and rejects a final symbol arriving at timeout',()=>{
  const jobs=new OnlineJobs('host'),people=members();accepted(jobs,'host',{kind:'heistStart'},people,1000);gather(jobs,people,1001);
  const symbols=jobs.snapshot('friend',1001).heist.sequence;
  accepted(jobs,'friend',{kind:'heistHack',symbol:symbols[0]},people,2000);
  jobs.update(people,1000);expect(jobs.snapshot('friend',1000).heist.remainingMs).toBe(HEIST_DURATION_MS-1000);
  expect(jobs.command('friend',{kind:'heistHack',symbol:symbols[1]},people,1000+HEIST_DURATION_MS).ok).toBe(false);
  expect(jobs.snapshot('host',1000+HEIST_DURATION_MS).heist.status).toBe('failed');
  expect(jobs.update(people,1000+HEIST_DURATION_MS).credits).toEqual([]);
 });
});

describe('competitive room race',()=>{
 it('requires personal drivers at staging, excludes passengers and late members',()=>{
  const jobs=new OnlineJobs('host'),people=members();accepted(jobs,'host',{kind:'raceStart'},people);
  at(people,'friend',foot());expect(jobs.command('friend',{kind:'raceReady'},people,0).ok).toBe(false);
  at(people,'friend',{...driver(),passengerOf:'host'});expect(jobs.command('friend',{kind:'raceReady'},people,0).ok).toBe(false);
  at(people,'friend',driver(0,40));expect(jobs.command('friend',{kind:'raceReady'},people,0).ok).toBe(false);
  at(people,'friend',driver());people.find(person=>person.id==='friend')!.pose.vehicle!.id='parked-1';expect(jobs.command('friend',{kind:'raceReady'},people,0).ok).toBe(false);
  people.push({id:'late',name:'Spóźniony',pose:driver()});expect(jobs.command('late',{kind:'raceReady'},people,0).ok).toBe(false);
  expect(jobs.snapshot('late',0).race.canReady).toBe(false);
 });

 it('runs a three-second countdown, ignores earlier checkpoints and detects a false start',()=>{
  const jobs=new OnlineJobs('host'),people=members();accepted(jobs,'host',{kind:'raceStart'},people);
  accepted(jobs,'host',{kind:'raceReady'},people);accepted(jobs,'friend',{kind:'raceReady'},people);
  expect(jobs.snapshot('host',0).race).toMatchObject({status:'countdown',countdownMs:RACE_COUNTDOWN_MS,grid:{x:-3,z:82}});
  at(people,'host',driver(0,40));jobs.update(people,1000);
  expect(jobs.snapshot('host',1000).race.status).toBe('lobby');
  expect(jobs.snapshot('host',1000).race.participants.every(person=>person.checkpoint===0)).toBe(true);
  at(people,'host',driver());accepted(jobs,'host',{kind:'raceReady'},people,1001);
  // Both remain at staging but do not take their assigned grid positions.
  jobs.update(people,1001+RACE_COUNTDOWN_MS);
  expect(jobs.snapshot('host',4001).race.status).toBe('failed');
 });

 it('accepts an additional initial driver during countdown, then locks the field',()=>{
  const jobs=new OnlineJobs('host'),people=members(3);accepted(jobs,'host',{kind:'raceStart'},people);
  accepted(jobs,'host',{kind:'raceReady'},people);accepted(jobs,'friend',{kind:'raceReady'},people);accepted(jobs,'third',{kind:'raceReady'},people,1000);
  for(const person of people){const point=jobs.snapshot(person.id,1000).race.grid!;person.pose=driver(point.x,point.z);}
  jobs.update(people,RACE_COUNTDOWN_MS);
  expect(jobs.snapshot('third',3000).race.participants.filter(person=>person.status==='racing')).toHaveLength(3);
  expect(jobs.command('third',{kind:'raceReady'},people,3000).ok).toBe(false);
 });

 it('allows the full countdown after drivers ready just before the lobby deadline',()=>{
  const jobs=new OnlineJobs('host'),people=members();accepted(jobs,'host',{kind:'raceStart'},people);
  accepted(jobs,'host',{kind:'raceReady'},people,59999);accepted(jobs,'friend',{kind:'raceReady'},people,59999);
  for(const person of people){const point=jobs.snapshot(person.id,59999).race.grid!;person.pose=driver(point.x,point.z);}
  jobs.update(people,62999);expect(jobs.snapshot('host',62999).race.status).toBe('running');
 });

 it('requires ordered checkpoints and awards rank prizes exactly once',()=>{
  const jobs=new OnlineJobs('host'),people=members();race(jobs,people);
  at(people,'host',driver(40,40));jobs.update(people,3100);
  expect(jobs.snapshot('host',3100).race.participants[0].checkpoint).toBe(0);
  expect(finish(jobs,people,'friend',4000)).toEqual([{id:'friend',amount:500}]);
  expect(jobs.snapshot('friend',4003).race.participants.find(person=>person.id==='friend')).toMatchObject({rank:1,finishedMs:1003,prize:500});
  expect(finish(jobs,people,'host',5000)).toEqual([{id:'host',amount:300}]);
  expect(jobs.snapshot('host',5003).race.status).toBe('completed');
  expect(jobs.update(people,6000).credits).toEqual([]);
  expect(jobs.command('host',{kind:'raceStart'},people,6001).ok).toBe(false);
  accepted(jobs,'host',{kind:'raceStart'},people,5003+JOB_COOLDOWN_MS);
  expect(jobs.snapshot('host',25003).race).toMatchObject({run:2,status:'lobby'});
 });

 it('does not credit a race checkpoint from foot movement or a shared car',()=>{
  const jobs=new OnlineJobs('host'),people=members();race(jobs,people);
  at(people,'host',foot(0,40));jobs.update(people,4000);expect(jobs.snapshot('host',4000).race.participants[0].checkpoint).toBe(0);
  at(people,'host',driver(0,40));people[0].pose.vehicle!.id='parked-1';jobs.update(people,4001);expect(jobs.snapshot('host',4001).race.participants[0].checkpoint).toBe(0);
  at(people,'host',driver(0,40));jobs.update(people,4002);expect(jobs.snapshot('host',4002).race.participants[0].checkpoint).toBe(1);
 });

 it('marks a disconnect DNF and permits the remaining driver to finish',()=>{
  const jobs=new OnlineJobs('host'),people=members();race(jobs,people);
  const remaining=people.filter(person=>person.id==='host');jobs.update(remaining,4000);
  expect(jobs.snapshot('host',4000).race.participants.find(person=>person.id==='friend')!.status).toBe('dnf');
  expect(finish(jobs,remaining,'host',5000)).toEqual([{id:'host',amount:500}]);
  expect(jobs.snapshot('host',5003).race.status).toBe('completed');
 });

 it('times out unfinished racers without awarding an unearned prize',()=>{
  const jobs=new OnlineJobs('host'),people=members();race(jobs,people);
  expect(finish(jobs,people,'host',4000)).toEqual([{id:'host',amount:500}]);
  const atDeadline=RACE_COUNTDOWN_MS+RACE_DURATION_MS;
  expect(jobs.update(people,atDeadline).credits).toEqual([]);
  const result=jobs.snapshot('host',atDeadline).race;
  expect(result.status).toBe('completed');expect(result.participants.find(person=>person.id==='friend')!.status).toBe('dnf');
  expect(result.participants.find(person=>person.id==='friend')!.prize).toBe(0);
 });

 it('expires an abandoned lobby and snapshots cannot alter the next result',()=>{
  const jobs=new OnlineJobs('host'),people=members();accepted(jobs,'host',{kind:'raceStart'},people);
  const snapshot=jobs.snapshot('host',0);snapshot.race.participants[0].prize=9999;snapshot.race.ready.push('fake');
  expect(jobs.snapshot('host',0).race.participants[0].prize).toBe(0);expect(jobs.snapshot('host',0).race.ready).toEqual([]);
  jobs.update(people,60000);expect(jobs.snapshot('host',60000).race.status).toBe('failed');
  expect(jobs.busy).toBe(false);expect(jobs.update(people,60000).credits).toEqual([]);
 });
});

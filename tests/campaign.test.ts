import { describe,expect,it } from 'vitest';
import { CampaignController,CAMPAIGN_ENDINGS,campaignChapter,createCampaign,parseCampaign,type CampaignAction,type CampaignCredit,type CampaignEnding,type CampaignMember,type LoyaltyChoice,type TruthChoice } from '../src/campaign';
import type { OnlinePose } from '../src/multiplayer-model';

const pose=(x=0,z=68,mode:'foot'|'drive'='foot',speed=0):OnlinePose=>({x,z,heading:0,mode,interior:null,seated:false,vehicle:mode==='drive'?{id:'stratus',kind:'sport',x,z,heading:0,speed,color:0xffffff,health:100}:null});
function fixture(count=2,saved?:unknown){
 const controller=new CampaignController('host',saved),members:CampaignMember[]=[{id:'host',name:'Nova',pose:pose()}];
 if(count>1)members.push({id:'friend',name:'Milo',pose:pose(0,61)});
 let time=1000;
 const command=(action:CampaignAction,id='host')=>{const result=controller.command(id,action,members,time);if(!result.ok)throw new Error(result.reason);return result;};
 const tick=(dt=100)=>{time+=dt;controller.update(members,time);};
 const finishChapter=(actor='host')=>{
  const chapter=controller.snapshot('host').chapter,state=controller.save(),definition=campaignChapter(chapter,state.truth,state.loyalty);
  for(let index=0;index<definition.objectives.length;index++){
   const objective=definition.objectives[index],member=members.find(person=>person.id===actor)!;
   member.pose=pose(objective.target.x,objective.target.z,objective.mode==='drive'?'drive':'foot');tick();
   if(objective.holdMs){for(let step=0;step<=objective.holdMs/250;step++)tick(250);}
  }
  expect(controller.snapshot('host').status).not.toBe('active');
 };
 const complete=(truth:TruthChoice='publish',loyalty:LoyaltyChoice='crew')=>{
  command({kind:'start'});
  for(let chapter=0;chapter<5;chapter++){
   finishChapter(chapter%2&&members.length>1?'friend':'host');
   if(chapter===1)command({kind:'choice',choice:truth});
   if(chapter===3)command({kind:'choice',choice:loyalty});
   if(chapter<4)command({kind:'continue'});
  }
 };
 return{controller,members,command,tick,finishChapter,complete,get time(){return time;}};
}

describe('linked narrative campaign',()=>{
 it.each<[TruthChoice,LoyaltyChoice,CampaignEnding]>([['publish','crew','dawn'],['bargain','self','crown'],['publish','self','horizon'],['bargain','crew','horizon']])('plays five legal chapters and resolves %s/%s to %s',(truth,loyalty,ending)=>{
  const f=fixture();f.complete(truth,loyalty);
  const view=f.controller.snapshot('host');expect(view.status).toBe('completed');expect(view.ending).toBe(ending);expect(view.endingTitle).toBe(CAMPAIGN_ENDINGS[ending].title);
  expect(view.journal.every(chapter=>chapter.completed)).toBe(true);expect(f.controller.save()).toMatchObject({completed:5,truth,loyalty,ending,finishedRuns:1,rewardedChapters:[0,1,2,3,4]});
  const credits=f.controller.drainCredits();expect(credits).toHaveLength(10);expect(credits.filter(credit=>credit.id==='host').reduce((sum,credit)=>sum+credit.amount,0)).toBe(1700);expect(credits.filter(credit=>credit.id==='friend').reduce((sum,credit)=>sum+credit.reputation,0)).toBe(380);
  expect(new Set(credits.map(credit=>`${credit.id}:${credit.sourceId}`)).size).toBe(credits.length);expect(f.controller.drainCredits()).toEqual([]);
 });
 it('requires actual outdoor positions, the specified travel mode and a stopped vehicle',()=>{
  const f=fixture();f.command({kind:'start'});
  f.members[0].pose=pose(-40,40,'drive');f.tick();expect(f.controller.snapshot('host').objective).toBe(0);
  f.members[0].pose={...pose(-40,40),interior:'casino'};f.tick();expect(f.controller.snapshot('host').objective).toBe(0);
  f.members[0].pose={...pose(-40,40),homeId:'canal'};f.tick();expect(f.controller.snapshot('host').objective).toBe(0);
  f.members[0].pose={...pose(-40,40),passengerOf:'friend'};f.tick();expect(f.controller.snapshot('host').objective).toBe(0);
  f.members[0].pose=pose(-40,40);f.tick();expect(f.controller.snapshot('host').objective).toBe(1);
  f.members[0].pose=pose(-80,40);f.tick();expect(f.controller.snapshot('host').objective).toBe(1);
  f.members[0].pose=pose(-80,40,'drive',8);f.tick();expect(f.controller.snapshot('host').objective).toBe(1);
  f.members[0].pose=pose(-80,40,'drive');f.tick();expect(f.controller.snapshot('host').objective).toBe(2);
  expect(f.controller.drainCredits()).toEqual([]);
 });
 it('resets a stationary hold when a participant moves or leaves its radius',()=>{
  const f=fixture();f.command({kind:'start'});f.finishChapter();f.command({kind:'continue'});f.finishChapter();f.command({kind:'choice',choice:'publish'});f.command({kind:'continue'});
  f.members[0].pose=pose(80,0);f.tick();expect(f.controller.snapshot('host').objective).toBe(1);
  f.members[0].pose=pose(80,-40);f.tick();for(let step=0;step<8;step++)f.tick(250);expect(f.controller.snapshot('host').holdMs).toBe(2000);
  f.members[0].pose=pose(81,-40);f.tick(250);expect(f.controller.snapshot('host').holdMs).toBe(0);
  f.tick(250);expect(f.controller.snapshot('host').holdMs).toBe(250);
  f.members[0].pose=pose(90,-40);f.tick(250);expect(f.controller.snapshot('host').holdMs).toBe(0);expect(f.controller.snapshot('host').objective).toBe(1);
 });
 it('shares objectives but reserves awards for the connected original cohort',()=>{
  const f=fixture();f.command({kind:'start'});f.members.push({id:'late',name:'Vera',pose:pose(-40,40)});f.tick();expect(f.controller.snapshot('late').eligible).toBe(false);expect(f.controller.snapshot('host').objective).toBe(0);
  f.members.splice(1,1);f.finishChapter();const credits=f.controller.drainCredits();expect(credits.map(credit=>credit.id)).toEqual(['host']);
  f.command({kind:'continue'});expect(f.controller.snapshot('late').eligible).toBe(true);
  expect(f.controller.command('late',{kind:'choice',choice:'publish'},f.members,f.time)).toMatchObject({ok:false});
 });
 it('requires host decisions and refuses a choice from the wrong conversation',()=>{
  const f=fixture();expect(f.controller.command('friend',{kind:'start'},f.members,f.time)).toMatchObject({ok:false});f.command({kind:'start'});f.finishChapter();f.command({kind:'continue'});f.finishChapter();
  const view=f.controller.snapshot('friend');expect(view.status).toBe('choice');expect(view.decision).toBe('truth');expect(view.canHostControl).toBe(false);
  expect(f.controller.command('friend',{kind:'choice',choice:'publish'},f.members,f.time)).toMatchObject({ok:false});expect(f.controller.command('host',{kind:'choice',choice:'self'},f.members,f.time)).toMatchObject({ok:false});
  expect(f.controller.command('host',{kind:'continue'},f.members,f.time)).toMatchObject({ok:false});f.command({kind:'choice',choice:'publish'});expect(f.controller.save().truth).toBe('publish');
 });
 it('expires exactly at the deadline, supports interruption and never rewards a failed chapter',()=>{
  const f=fixture();f.command({kind:'start'});f.tick(240000);expect(f.controller.snapshot('host').status).toBe('failed');expect(f.controller.drainCredits()).toEqual([]);
  f.command({kind:'retry'});expect(f.controller.snapshot('host').status).toBe('active');f.command({kind:'abandon'});expect(f.controller.snapshot('host').status).toBe('failed');expect(f.controller.save().completed).toBe(0);
  f.command({kind:'retry'});f.members.splice(0,1);f.tick();expect(f.controller.snapshot('friend').status).toBe('failed');expect(f.controller.drainCredits()).toEqual([]);
 });
 it('persists finished chapters and pending choices but does not resume a partly timed objective',()=>{
  const f=fixture(1);f.command({kind:'start'});f.finishChapter();f.command({kind:'continue'});f.members[0].pose=pose(40,-40);f.tick();expect(f.controller.snapshot('host').objective).toBe(1);
  const loaded=fixture(1,f.controller.save());expect(loaded.controller.snapshot('host').status).toBe('interlude');loaded.command({kind:'continue'});expect(loaded.controller.snapshot('host').objective).toBe(0);loaded.finishChapter();
  const choice=new CampaignController('host',loaded.controller.save());expect(choice.snapshot('host')).toMatchObject({status:'choice',decision:'truth'});expect(choice.save().rewardedChapters).toEqual([0,1]);
 });
 it('allows another ending without farming already-paid chapters, including after reload',()=>{
  const f=fixture(1);f.complete();const paid:CampaignCredit[]=f.controller.drainCredits();expect(paid).toHaveLength(5);f.command({kind:'restart'});f.complete('bargain','self');expect(f.controller.snapshot('host').ending).toBe('crown');expect(f.controller.drainCredits()).toEqual([]);
  const loaded=fixture(1,f.controller.save());loaded.command({kind:'restart'});loaded.command({kind:'start'});loaded.finishChapter();expect(loaded.controller.drainCredits()).toEqual([]);expect(loaded.controller.snapshot('host').rewardAvailable).toBe(false);
 });
 it('rejects malformed persistence, invalid commands and backward clocks without advancing objectives',()=>{
  expect(parseCampaign(null)).toEqual(createCampaign());expect(parseCampaign({completed:99,rewardedChapters:[0,0,4,5,-1,'2'],truth:'invalid',loyalty:[],finishedRuns:NaN})).toEqual({...createCampaign(),rewardedChapters:[0,4]});
  expect(parseCampaign({completed:5,truth:null,loyalty:'self'})).toMatchObject({completed:2,truth:null,loyalty:null,ending:null});
  const f=fixture(1);f.command({kind:'start'});f.tick(100);f.members[0].pose=pose(-40,40);f.controller.update(f.members,0);expect(f.controller.snapshot('host').objective).toBe(0);
  expect(f.controller.command('host',{kind:'choice',choice:'publish'},f.members,0)).toMatchObject({ok:false});expect(f.controller.command('host',{kind:'unknown'} as unknown as CampaignAction,f.members,f.time)).toMatchObject({ok:false});
 });
});

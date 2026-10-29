import { describe, expect, it } from 'vitest';
import { RoomAuthority } from '../src/room-authority';
import { CASINO_GAMES } from '../src/casino-games-location';
import { CREW_BASE, HOME_ROOM, HOMES } from '../src/career';
import { CITY_ACTIVITY_FIRST_MS, CITY_ACTIVITY_PERIOD_MS, WANTED_VEHICLE_ID } from '../src/city-events';
import { legalActions } from '../src/poker';
import type { OnlinePose, RoomCommand } from '../src/multiplayer-model';

const create=(count=2)=>{const room=new RoomAuthority('ABCDEFGH','host','Gospodarz',123);for(const [index,id] of ['friend','third','fourth'].slice(0,count-1).entries())expect(room.join(id,`Gracz ${index+2}`).ok).toBe(true);room.tick(0);return room;};
function accept(room:RoomAuthority,id:string,command:RoomCommand,now=0){const result=room.command(id,command,now);if(!result.ok)throw new Error(result.reason);}
const self=(room:RoomAuthority,id='host')=>room.snapshot(id).members.find(member=>member.id===id)!.pose;
function foot(room:RoomAuthority,id:string,x:number,z:number,now=0,interior:'casino'|null=null,homeId:string|null=null){accept(room,id,{type:'pose',pose:{x,z,heading:0,mode:'foot',vehicle:null,seated:false,interior,homeId}},now);}
function drive(room:RoomAuthority,id:string,x:number,z:number,now=0,vehicleId='stratus',speed=0){const pose:OnlinePose={x,z,heading:0,mode:'drive',interior:null,seated:false,vehicle:{id:vehicleId,kind:'sedan',x,z,heading:0,speed,color:0xffffff,health:100}};accept(room,id,{type:'pose',pose},now);}
function contract(room:RoomAuthority,id='host',now=0){accept(room,id,{type:'career',action:{type:'contractStart',contract:'nova'}},now);foot(room,id,-40,40,now+1);foot(room,id,40,-40,now+2);}
const casino=(room:RoomAuthority,id:string,station:keyof typeof CASINO_GAMES)=>{const point=CASINO_GAMES[station];foot(room,id,point.x,point.z,0,'casino');};

describe('host-owned casino expansion',()=>{
 it('requires the real station, settles atomic bets once, and keeps blackjack hole cards private',()=>{
  const room=create();
  expect(room.command('host',{type:'casinoGame',action:{kind:'blackjackDeal',bet:100,version:0}},0).ok).toBe(false);
  casino(room,'host','blackjack');
  accept(room,'host',{type:'casinoGame',action:{kind:'blackjackDeal',bet:100,version:0}});
  const after=room.snapshot('host'),blackjack=after.casinoGames.blackjack;
  expect(after.wallet).toBe(1150+(blackjack.status==='settled'?blackjack.payout:0));
  expect(room.snapshot('friend').wallet).toBe(1250);
  expect(room.command('host',{type:'casinoGame',action:{kind:'blackjackDeal',bet:100,version:0}},0).ok).toBe(false);
  if(blackjack.status==='playing'){
   expect(blackjack.dealer[1].rank).toBe(0);
   expect(room.command('host',{type:'sit'},0).ok).toBe(false);
   accept(room,'host',{type:'casinoGame',action:{kind:'blackjackStand',version:after.casinoGames.version}});
   expect(room.snapshot('host').wallet).toBe(1150+room.snapshot('host').casinoGames.blackjack.payout);
  }
  const previous=room.snapshot('host').wallet;
  casino(room,'host','roulette');
  const version=room.snapshot('host').casinoGames.version;
  accept(room,'host',{type:'casinoGame',action:{kind:'rouletteSpin',bet:100,choice:'straight',number:0,version}});
  expect(room.snapshot('host').wallet).toBe(previous-100+room.snapshot('host').casinoGames.roulette.payout);
  expect(room.command('host',{type:'casinoGame',action:{kind:'rouletteSpin',bet:100,choice:'straight',number:0,version}},0).ok).toBe(false);
 });
 it('forfeits an unfinished blackjack when leaving the casino without a refund',()=>{
  // A natural can settle immediately. Open another legal hand until one needs a decision.
  const room=create();casino(room,'host','blackjack');
  for(let i=0;i<10&&room.snapshot('host').casinoGames.blackjack.status!=='playing';i++)accept(room,'host',{type:'casinoGame',action:{kind:'blackjackDeal',bet:10,version:room.snapshot('host').casinoGames.version}});
  expect(room.snapshot('host').casinoGames.blackjack.status).toBe('playing');
  const wallet=room.snapshot('host').wallet;foot(room,'host',20,76);
  expect(room.snapshot('host').casinoGames.blackjack.status).toBe('settled');expect(room.snapshot('host').wallet).toBe(wallet);
 });
 it('enrolls human friends in a separate tournament, prevents duplicate stakes and pays one prizepool',()=>{
  const room=create(4),players=['host','friend','third','fourth'];
  for(const id of players)casino(room,id,'tournament');
  accept(room,'host',{type:'tournament',action:{kind:'open'}});
  for(const id of players)accept(room,id,{type:'tournament',action:{kind:'join'}});
  expect(room.snapshot('host').tournament.pot).toBe(1000);
  expect(room.command('host',{type:'tournament',action:{kind:'join'}},0).ok).toBe(false);
  expect(room.command('host',{type:'sit'},0).ok).toBe(false);
  accept(room,'host',{type:'tournament',action:{kind:'start'}});
  expect(self(room).seated).toBe(true);
  const first=room.snapshot('host').tournament.poker!;
  expect(first.deck).toEqual([]);expect(first.seed).toBe(0);expect(first.players.slice(1).every(player=>player.hole.every(card=>card.rank===0))).toBe(true);
  let decisions=0;
  while(room.snapshot('host').tournament.status==='playing'&&decisions++<3000){
   const state=room.snapshot('host').tournament,poker=state.poker!;
   if(poker.actor===null){const id=state.participants.find(person=>person.status==='playing')!.id;accept(room,id,{type:'tournament',action:{kind:'next'}});continue;}
   const id=poker.players[poker.actor].id,view=room.snapshot(id).tournament,legal=legalActions(view.poker!,0);
   accept(room,id,{type:'tournament',action:{kind:'action',version:view.version,action:legal.canAllIn?{type:'allIn'}:legal.canCall?{type:'call'}:legal.canCheck?{type:'check'}:{type:'fold'}}});
  }
  expect(decisions).toBeLessThan(3000);expect(room.snapshot('host').tournament.status).toBe('completed');
  const total=players.reduce((sum,id)=>sum+room.snapshot(id).wallet,0);expect(total).toBe(5000);
  room.tick(1e6);room.tick(1e6+1);expect(players.reduce((sum,id)=>sum+room.snapshot(id).wallet,0)).toBe(total);
 });
});

describe('session careers, properties and shared base',()=>{
 it('checks contact unlocks and verified objectives, awards reputation and cash once, and isolates profiles',()=>{
  const room=create();
  expect(room.command('host',{type:'career',action:{type:'contractStart',contract:'milo'}},0).ok).toBe(false);
  contract(room);
  const after=room.snapshot('host');expect(after.wallet).toBe(1550);expect(after.career.reputation).toBe(60);expect(after.career.completedContracts).toBe(1);expect(after.career.activeContract).toBeNull();
  expect(room.command('host',{type:'career',action:{type:'contractVisit'}},10).ok).toBe(false);expect(room.snapshot('host').wallet).toBe(1550);expect(room.snapshot('friend').career.reputation).toBe(0);
  after.career.ownedHomes.push('loft');expect(room.snapshot('host').career.ownedHomes).toEqual([]);
 });
 it('buys one apartment, authorizes physical entry and exit, and ignores forged interior metadata',()=>{
  const room=create();accept(room,'host',{type:'career',action:{type:'buyHome',home:'canal'}});
  expect(room.snapshot('host').wallet).toBe(350);expect(room.command('host',{type:'career',action:{type:'buyHome',home:'canal'}},0).ok).toBe(false);
  expect(room.command('host',{type:'home',action:{kind:'enter',home:'canal'}},0).ok).toBe(false);
  accept(room,'friend',{type:'pose',pose:{...self(room,'friend'),homeId:'canal'}});expect(self(room,'friend').homeId??null).toBeNull();
  foot(room,'host',HOMES.canal.door.x,HOMES.canal.door.z);accept(room,'host',{type:'home',action:{kind:'enter',home:'canal'}});
  expect(self(room)).toMatchObject({...HOME_ROOM.entry,homeId:'canal',mode:'foot',vehicle:null});
  foot(room,'host',80,80);expect(self(room).homeId).toBe('canal');expect(self(room).x).toBe(HOME_ROOM.entry.x);
  foot(room,'host',HOME_ROOM.exit.x,HOME_ROOM.exit.z,0,null,'canal');accept(room,'host',{type:'home',action:{kind:'exit'}});
  expect(self(room)).toMatchObject({homeId:null,x:HOMES.canal.door.x,z:HOMES.canal.door.z+1.8});
 });
 it('stores only a stopped own car, prevents driving a stored car, and retrieves through a versioned effect',()=>{
  const room=create();accept(room,'host',{type:'career',action:{type:'buyHome',home:'canal'}});
  drive(room,'host',HOMES.canal.parking.x,HOMES.canal.parking.z,0,'stratus',3);
  expect(room.command('host',{type:'career',action:{type:'storeCar',home:'canal',car:'stratus'}},0).ok).toBe(false);
  drive(room,'host',HOMES.canal.parking.x,HOMES.canal.parking.z);
  accept(room,'host',{type:'career',action:{type:'storeCar',home:'canal',car:'stratus'}});
  expect(self(room).mode).toBe('foot');expect(room.snapshot('host').career.storedCars.stratus).toBe('canal');
  const pose:OnlinePose={x:-60,z:40,heading:0,mode:'drive',interior:null,seated:false,vehicle:{id:'stratus',kind:'sport',x:-60,z:40,heading:0,color:0xffffff,speed:0,health:100}};
  expect(room.command('host',{type:'pose',pose},0).ok).toBe(false);
  accept(room,'host',{type:'career',action:{type:'retrieveCar',home:'canal',car:'stratus'}});
  expect(room.snapshot('host').career.storedCars.stratus).toBeUndefined();expect(room.snapshot('host').careerEffect).toMatchObject({version:2,effect:{retrievedCar:'stratus'},home:'canal'});
 });
 it('lets only the host buy the crew base, admits friends, and starts a planned job from its table',()=>{
  const room=create();contract(room,'host');contract(room,'host',100);
  expect(room.command('friend',{type:'crewBase',action:{type:'buy'}},102).ok).toBe(false);
  accept(room,'host',{type:'crewBase',action:{type:'buy'}},102);expect(room.snapshot('host').wallet).toBe(50);expect(room.snapshot('friend').crewBase.owned).toBe(true);
  for(const id of ['host','friend']){foot(room,id,CREW_BASE.door.x,CREW_BASE.door.z,103);accept(room,id,{type:'home',action:{kind:'enter',home:'crew'}},103);}
  foot(room,'host',HOME_ROOM.planning.x,HOME_ROOM.planning.z,104,null,'crew');
  accept(room,'host',{type:'job',action:{kind:'heistStart'}},104);
  expect(room.snapshot('host').jobs.heist.status).toBe('gather');expect(self(room).homeId).toBeNull();expect(self(room,'friend').homeId).toBeNull();
 });
 it('does not let workshop model selection retrieve a secured car from a different building',()=>{
  const room=create();contract(room);contract(room,'host',100);
  accept(room,'host',{type:'career',action:{type:'buyHome',home:'canal'}},102);
  drive(room,'host',HOMES.canal.parking.x,HOMES.canal.parking.z,103);
  accept(room,'host',{type:'career',action:{type:'storeCar',home:'canal',car:'stratus'}},103);
  foot(room,'host',-20,74,104);accept(room,'host',{type:'garage',action:{type:'buy',car:'sentinel'}},104);
  const before=room.snapshot('host');expect(before.garage.selected).toBe('sentinel');
  const result=room.command('host',{type:'garage',action:{type:'select',car:'stratus'}},104);
  expect(result.ok).toBe(false);expect(room.snapshot('host').garage.selected).toBe('sentinel');expect(room.snapshot('host').career.storedCars.stratus).toBe('canal');expect(room.snapshot('host').wallet).toBe(before.wallet);
 });
});

describe('shared competitive city activity settlement',()=>{
 it('requires the actual wanted vehicle and pays only one legal finisher once',()=>{
  const room=create(),now=CITY_ACTIVITY_FIRST_MS+CITY_ACTIVITY_PERIOD_MS;room.tick(now);
  const activity=room.snapshot('host').cityActivities,eventId=activity.id!;expect(activity.kind).toBe('wanted');
  for(const id of ['host','friend'])accept(room,id,{type:'cityActivity',action:{kind:'join',eventId}},now);
  expect(room.command('host',{type:'cityActivity',action:{kind:'interact',eventId}},now).ok).toBe(false);
  drive(room,'host',-75,-44,now,WANTED_VEHICLE_ID);accept(room,'host',{type:'cityActivity',action:{kind:'interact',eventId}},now);
  expect(room.snapshot('friend').cityActivities.holderId).toBe('host');
  const checkpoint=activity.checkpoint!,drop=activity.drop!;
  drive(room,'host',checkpoint.x,checkpoint.z,now+1,WANTED_VEHICLE_ID);drive(room,'host',drop.x,drop.z,now+2,WANTED_VEHICLE_ID);
  accept(room,'host',{type:'cityActivity',action:{kind:'interact',eventId}},now+2);
  expect(room.snapshot('host').wallet).toBe(1800);expect(room.snapshot('host').career.reputation).toBe(80);expect(room.snapshot('friend').wallet).toBe(1250);
  expect(room.command('host',{type:'cityActivity',action:{kind:'interact',eventId}},now+3).ok).toBe(false);room.tick(now+4);expect(room.snapshot('host').wallet).toBe(1800);
 });
});

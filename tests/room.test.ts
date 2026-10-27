import { describe, expect, it } from 'vitest';
import { RoomAuthority } from '../src/room-authority';
import { legalActions } from '../src/poker';
import { ONLINE_TURN_MS } from '../src/multiplayer-model';
import type { OnlinePose, RoomCommand, RoomSnapshot } from '../src/multiplayer-model';
import type { PokerAction } from '../src/poker-model';

const ids=['host','friend','third','fourth'];
const room=()=>new RoomAuthority('ABCDEFGH','host','Gospodarz',123);
const foot=(x=0,z=2):OnlinePose=>({x,z,heading:0,mode:'foot',interior:'casino',seated:false,vehicle:null});
const drive=(id='stratus',x=0,z=68):OnlinePose=>({x,z,heading:0,mode:'drive',interior:null,seated:false,vehicle:{id,kind:'sport',x,z,heading:0,color:0xded8cb,speed:0,health:100}});
function accepted(authority:RoomAuthority,id:string,command:RoomCommand,now=0) {const result=authority.command(id,command,now);if(!result.ok)throw new Error(result.reason);}
function joined(count=2) {const authority=room();for(let i=1;i<count;i++)expect(authority.join(ids[i],`Gracz ${i+1}`).ok).toBe(true);return authority;}
function sit(authority:RoomAuthority,id:string) {accepted(authority,id,{type:'pose',pose:foot()});accepted(authority,id,{type:'sit'});}
function playing(count=2) {const authority=joined(count);for(const id of ids.slice(0,count))sit(authority,id);accepted(authority,ids[0],{type:'deal'});return authority;}
function actor(authority:RoomAuthority,players=ids) {return players.find(id=>authority.snapshot(id).poker?.actor===0)!;}
function move(authority:RoomAuthority,id:string,action:PokerAction,now=0) {accepted(authority,id,{type:'action',action,version:authority.snapshot(id).tableVersion},now);}
function money(authority:RoomAuthority,players=ids.slice(0,2)) {
 const snapshots=players.map(id=>authority.snapshot(id));const table=snapshots.find(snapshot=>snapshot.poker)?.poker;
 return snapshots.reduce((sum,snapshot)=>sum+snapshot.wallet,0)+(table?table.pot+table.players.reduce((sum,seat)=>sum+seat.stack,0):0);
}
function finish(authority:RoomAuthority,players=ids.slice(0,2)) {
 let count=0;
 while(players.some(id=>{const poker=authority.snapshot(id).poker;return poker&&poker.phase!=='waiting'&&poker.phase!=='showdown';})&&count++<100) {
  const id=actor(authority,players),snapshot=authority.snapshot(id),legal=legalActions(snapshot.poker!,0);
  move(authority,id,legal.canCheck?{type:'check'}:{type:'call'});
 }
 expect(count).toBeLessThan(100);
}

describe('room membership and authenticated commands',()=>{
 it('creates four distinct spawns and rejects full rooms and duplicate identity',()=>{
  const authority=joined(4),snapshot=authority.snapshot('host');
  expect(snapshot.members).toHaveLength(4);expect(new Set(snapshot.members.map(member=>member.slot)).size).toBe(4);expect(new Set(snapshot.members.map(member=>member.pose.z)).size).toBe(4);
  expect(authority.join('fifth','Piąty').ok).toBe(false);expect(authority.join('friend','Nowy').ok).toBe(false);expect(authority.snapshot('friend').wallet).toBe(1250);
 });
 it('validates room code and names without allowing markup or control text',()=>{
  expect(()=>new RoomAuthority('short','host','Host')).toThrow();expect(()=>new RoomAuthority('ABCDEFGH','host','<img>')).toThrow();
  const authority=room();expect(authority.join('friend','x').ok).toBe(false);expect(authority.join('friend','<script>alert(1)').ok).toBe(false);
  expect(authority.join('friend','Gracz\nX').ok).toBe(false);
  expect(authority.join('friend','  Żółty Gracz  ').ok).toBe(true);expect(authority.snapshot('host').members[1].name).toBe('Żółty Gracz');
 });
 it('rejects commands from nonmembers and mutable snapshot attacks',()=>{
  const authority=room();expect(authority.command('stranger',{type:'sit'},0).ok).toBe(false);expect(()=>authority.snapshot('stranger')).toThrow();
  const snapshot=authority.snapshot('host');snapshot.wallet=99999;snapshot.members[0].pose.x=99999;
  expect(authority.snapshot('host').wallet).toBe(1250);expect(authority.snapshot('host').members[0].pose.x).toBe(0);
  expect(authority.command('host',{type:'wallet',amount:999999} as unknown as RoomCommand,0).ok).toBe(false);
 });
 it('accepts only finite, bounded poses and derives the seated flag on host',()=>{
  const authority=room();expect(authority.command('host',{type:'pose',pose:foot(NaN)},0).ok).toBe(false);expect(authority.command('host',{type:'pose',pose:foot(1000)},0).ok).toBe(false);
  expect(authority.command('host',{type:'pose',pose:{...foot(),seated:true}},0).ok).toBe(true);expect(authority.snapshot('host').members[0].pose.seated).toBe(false);
  sit(authority,'host');expect(authority.snapshot('host').members[0].pose.seated).toBe(true);expect(authority.command('host',{type:'pose',pose:drive()},0).ok).toBe(false);
 });
 it('debits bounded costs without allowing grants, fractions or rapid repeats',()=>{
  const authority=room();expect(authority.command('host',{type:'spend',amount:-100},0).ok).toBe(false);expect(authority.command('host',{type:'spend',amount:0.5},0).ok).toBe(false);expect(authority.command('host',{type:'spend',amount:201},0).ok).toBe(false);
  accepted(authority,'host',{type:'spend',amount:100},0);expect(authority.snapshot('host').wallet).toBe(1150);expect(authority.command('host',{type:'spend',amount:200},100).ok).toBe(false);
  accepted(authority,'host',{type:'spend',amount:30},1500);expect(authority.snapshot('host').wallet).toBe(1120);
 });
 it('owns public cars exclusively but permits each personal Stratus',()=>{
  const authority=joined();accepted(authority,'host',{type:'pose',pose:drive('parked-1')});
  expect(authority.command('friend',{type:'pose',pose:drive('parked-1')},0).ok).toBe(false);
  accepted(authority,'friend',{type:'pose',pose:drive()});expect(authority.snapshot('host').vehicles[0].id).toBe('parked-1');
  accepted(authority,'host',{type:'pose',pose:{...foot(0,68),interior:null}});accepted(authority,'friend',{type:'pose',pose:drive('parked-1',0,67)});
  authority.leave('friend');expect(authority.snapshot('host').vehicles[0].speed).toBe(0);expect(authority.snapshot('host').vehicles[0].z).toBe(67);
 });
 it('does not allow arbitrary public-car allocations or nonfinite vehicle fields',()=>{
  const authority=room();expect(authority.command('host',{type:'pose',pose:drive('made-up')},0).ok).toBe(false);
  const pose=drive();pose.vehicle!.speed=Infinity;expect(authority.command('host',{type:'pose',pose},0).ok).toBe(false);
 });
 it('uses monotonic elapsed room time without coupling tests to wall-clock timestamps',()=>{
  const authority=room();expect(authority.snapshot('host').worldTime).toBe(0);authority.tick(1000);authority.tick(2500);expect(authority.snapshot('host').worldTime).toBe(1.5);authority.tick(1500);expect(authority.snapshot('host').worldTime).toBe(1.5);
 });
});

describe('online table entry, actions and private views',()=>{
 it('requires the real casino table, charges once and refunds once',()=>{
  const authority=room();expect(authority.command('host',{type:'sit'},0).ok).toBe(false);
  accepted(authority,'host',{type:'pose',pose:foot(9,8)});expect(authority.command('host',{type:'sit'},0).ok).toBe(false);
  sit(authority,'host');expect(authority.snapshot('host').wallet).toBe(1050);expect(authority.snapshot('host').poker!.players[0].stack).toBe(200);
  expect(authority.command('host',{type:'sit'},0).ok).toBe(false);accepted(authority,'host',{type:'stand'});accepted(authority,'host',{type:'stand'});expect(authority.snapshot('host').wallet).toBe(1250);
 });
 it.each([2,3,4])('plays a complete %i-human hand without bots or losing chips',count=>{
  const authority=playing(count),players=ids.slice(0,count);expect(money(authority,players)).toBe(1250*count);
  finish(authority,players);const state=authority.snapshot('host').poker!;expect(state.phase).toBe('showdown');expect(state.board).toHaveLength(5);expect(state.pot).toBe(0);expect(money(authority,players)).toBe(1250*count);
  for(const id of players)accepted(authority,id,{type:'stand'});expect(players.reduce((sum,id)=>sum+authority.snapshot(id).wallet,0)).toBe(1250*count);
 });
 it('supports a host who observes while two guests play',()=>{
  const authority=joined(3);sit(authority,'friend');sit(authority,'third');accepted(authority,'friend',{type:'deal'});
  expect(authority.snapshot('host').poker).toBeNull();expect(authority.snapshot('host').seated).toBe(false);finish(authority,['friend','third']);expect(money(authority,['host','friend','third'])).toBe(3750);
 });
 it('never transmits the deck, seed or another player’s unrevealed holes',()=>{
  const authority=playing(3),a=authority.snapshot('host'),b=authority.snapshot('friend');
  expect(a.poker!.deck).toEqual([]);expect(a.poker!.seed).toBe(0);expect(a.poker!.players[0].hole.every(card=>card.rank>=2)).toBe(true);
  expect(b.poker!.players[0].hole.every(card=>card.rank>=2)).toBe(true);expect(a.poker!.players.find(player=>player.id==='friend')!.hole).toEqual([{rank:0,suit:'♠'},{rank:0,suit:'♠'}]);
  expect(a.poker!.players.find(player=>player.id==='third')!.hole.every(card=>card.rank===0)).toBe(true);
  a.poker!.players[0].stack=999999;expect(authority.snapshot('host').poker!.players[0].stack).not.toBe(999999);
 });
 it('rotates own seat, actor and dealer consistently for all recipients',()=>{
  const authority=playing(4),views=ids.map(id=>authority.snapshot(id));
  expect(views.every((snapshot,index)=>snapshot.poker!.players[0].id===ids[index])).toBe(true);
  expect(new Set(views.map(snapshot=>snapshot.poker!.players[snapshot.poker!.actor!].id)).size).toBe(1);
  expect(new Set(views.map(snapshot=>snapshot.poker!.players[snapshot.poker!.dealer].id)).size).toBe(1);
 });
 it('rejects out-of-turn actions, invalid raises and replayed table versions',()=>{
  const authority=playing(),current=actor(authority),other=ids.find(id=>id!==current)!,version=authority.snapshot(current).tableVersion;
  expect(authority.command(other,{type:'action',action:{type:'call'},version},0).ok).toBe(false);
  expect(authority.command(current,{type:'action',action:{type:'raise',to:-100},version},0).ok).toBe(false);
  expect(authority.command(current,{type:'action',action:{type:'raise',to:20.5},version},0).ok).toBe(false);
  move(authority,current,{type:'call'});expect(authority.command(current,{type:'action',action:{type:'call'},version},0).ok).toBe(false);expect(money(authority)).toBe(2500);
 });
 it('does not reset the betting version on movement or heartbeat traffic',()=>{
  const authority=playing(),before=authority.snapshot('host');accepted(authority,'host',{type:'pose',pose:foot()});accepted(authority,'friend',{type:'ping'});
  expect(authority.snapshot('host').tableVersion).toBe(before.tableVersion);
 });
 it('shows valid winner payouts and revealed live hands while folded holes stay hidden',()=>{
  const authority=playing(3),players=ids.slice(0,3),folding=actor(authority,players);move(authority,folding,{type:'fold'});finish(authority,players);
  for(const id of players){const snapshot=authority.snapshot(id),poker=snapshot.poker!;expect(poker.winners.every(index=>poker.payouts[index]>0)).toBe(true);for(const seat of poker.players){if(seat.id===id||!seat.folded)expect(seat.hole.every(card=>card.rank>=2)).toBe(true);else expect(seat.hole.every(card=>card.rank===0)).toBe(true);}}
 });
});

describe('room departures, late joins and turn deadlines',()=>{
 it('folds the current player and refunds only their unbet stack',()=>{
  const authority=playing(),id=actor(authority),before=authority.snapshot(id),unbet=before.poker!.players[0].stack;
  accepted(authority,id,{type:'stand'});expect(authority.snapshot(id).wallet).toBe(before.wallet+unbet);expect(authority.snapshot(id).poker).toBeNull();expect(money(authority)).toBe(2500);
  const remaining=ids.find(player=>player!==id)!;expect(authority.snapshot(remaining).poker!.phase).toBe('showdown');expect(authority.snapshot(remaining).poker!.players[0].stack).toBeGreaterThan(200);
 });
 it('removes an off-turn player without skipping the existing actor or leaking a duplicate refund',()=>{
  const authority=playing(3),players=ids.slice(0,3),current=actor(authority,players),departing=players.find(id=>id!==current)!;
  accepted(authority,departing,{type:'stand'});expect(actor(authority,players.filter(id=>id!==departing))).toBe(current);const wallet=authority.snapshot(departing).wallet;accepted(authority,departing,{type:'stand'});expect(authority.snapshot(departing).wallet).toBe(wallet);finish(authority,players);expect(money(authority,players)).toBe(3750);
 });
 it('allows remaining players to start a new hand after canonical seat zero stands',()=>{
  const authority=playing(3);accepted(authority,'host',{type:'stand'});finish(authority,['friend','third']);accepted(authority,'friend',{type:'deal'});expect(authority.snapshot('friend').poker!.phase).toBe('preflop');finish(authority,['friend','third']);expect(money(authority,ids.slice(0,3))).toBe(3750);
 });
 it('keeps games and dealer rotation valid after seat zero busts while two others retain chips',()=>{
  let checked=0;
  for(let seed=1;seed<=16;seed++){
   const authority=new RoomAuthority('ABCDEFGH','host','Gospodarz',seed);authority.join('friend','Przyjaciel');authority.join('third','Trzeci');for(const id of ids.slice(0,3))sit(authority,id);accepted(authority,'host',{type:'deal'});
   move(authority,'host',{type:'allIn'});move(authority,'friend',{type:'call'});move(authority,'third',{type:'fold'});
   if(authority.snapshot('host').poker!.players[0].stack===0){
    checked++;accepted(authority,'third',{type:'deal'});const snapshot=authority.snapshot('third');expect(snapshot.poker!.players[snapshot.poker!.dealer].id).toBe('friend');finish(authority,ids.slice(0,3));expect(money(authority,ids.slice(0,3))).toBe(3750);
   }
  }
  expect(checked).toBeGreaterThan(0);
 });
 it('joins an unused seat midhand only for the next deal',()=>{
  const authority=joined(3);sit(authority,'host');sit(authority,'friend');accepted(authority,'host',{type:'deal'});const initialActor=actor(authority,ids.slice(0,2));sit(authority,'third');
  const joinedView=authority.snapshot('third').poker!;expect(joinedView.players[0].folded).toBe(true);expect(joinedView.players[0].hole).toEqual([]);expect(actor(authority,ids.slice(0,3))).toBe(initialActor);
  finish(authority,ids.slice(0,3));accepted(authority,'third',{type:'deal'});expect(authority.snapshot('third').poker!.players[0].hole).toHaveLength(2);expect(money(authority,ids.slice(0,3))).toBe(3750);
 });
 it('does not reuse a departing player’s committed seat before settlement',()=>{
  const authority=playing(4),players=ids.slice(),current=actor(authority,players);move(authority,current,{type:'call'});accepted(authority,current,{type:'stand'});
  // Three seats occupied and the fourth still holds that player's dead chips.
  expect(authority.command(current,{type:'sit'},0).ok).toBe(false);finish(authority,players);accepted(authority,current,{type:'sit'});expect(money(authority,players)).toBe(5000);
 });
 it('cleans a disconnected actor and keeps the remaining hand playable',()=>{
  const authority=playing(3),current=actor(authority,ids.slice(0,3));authority.leave(current);const remaining=ids.slice(0,3).filter(id=>id!==current);
  expect(authority.snapshot(remaining[0]).members).toHaveLength(2);expect(()=>authority.snapshot(current)).toThrow();finish(authority,remaining);expect(authority.snapshot(remaining[0]).poker!.phase).toBe('showdown');
 });
 it('automatically folds an unanswered bet at the host deadline',()=>{
  const authority=playing(),id=actor(authority),before=authority.snapshot(id);expect(before.turnDeadline).toBe(ONLINE_TURN_MS);
  expect(authority.tick(ONLINE_TURN_MS-1)).toBe(false);expect(authority.tick(ONLINE_TURN_MS)).toBe(true);expect(authority.snapshot(id).poker!.phase).toBe('showdown');expect(authority.snapshot(id).poker!.players[0].folded).toBe(true);expect(authority.snapshot(id).turnDeadline).toBeNull();expect(money(authority)).toBe(2500);
 });
 it('checks an unraised street on timeout and ignores stale actions arriving after it',()=>{
  const authority=playing(3),players=ids.slice(0,3);
  while(authority.snapshot('host').poker!.phase==='preflop'){const id=actor(authority,players),legal=legalActions(authority.snapshot(id).poker!,0);move(authority,id,legal.canCheck?{type:'check'}:{type:'call'});}
  const id=actor(authority,players),version=authority.snapshot(id).tableVersion;expect(authority.tick(ONLINE_TURN_MS)).toBe(true);expect(authority.snapshot(id).poker!.players[0].folded).toBe(false);
  expect(authority.command(id,{type:'action',action:{type:'check'},version},ONLINE_TURN_MS).ok).toBe(false);expect(authority.snapshot(id).turnDeadline).toBe(ONLINE_TURN_MS*2);expect(money(authority,players)).toBe(3750);
 });
});

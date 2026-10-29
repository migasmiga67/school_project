import { describe,expect,it } from 'vitest';
import { PokerTournament,type TournamentAction,type TournamentMember } from '../src/poker-tournament';
import { legalActions } from '../src/poker';
const members:TournamentMember[]=[{id:'host',name:'Ala'},{id:'guest',name:'Bartek'},{id:'third',name:'Celina'},{id:'fourth',name:'Darek'}];
function setup(count=2){
 const tournament=new PokerTournament('host',123),players=members.slice(0,count),wallets=new Map(players.map(person=>[person.id,1250]));let now=0;
 const command=(id:string,action:TournamentAction)=>{
  const result=tournament.command(id,action,players,wallets.get(id)!,now++);if(result.ok)wallets.set(id,result.wallet);
  for(const credit of tournament.update(players,now).credits)wallets.set(credit.id,(wallets.get(credit.id)??0)+credit.amount);
  return result;
 };
 expect(command('host',{kind:'open'}).ok).toBe(true);for(const person of players)expect(command(person.id,{kind:'join'}).ok).toBe(true);
 return {tournament,players,wallets,command};
}
describe('finite friends poker tournament',()=>{
 it('enrolls2–4 players once, debits only the cash buyin and blocks outsider starts',()=>{
  const {tournament,wallets,command}=setup(4);expect(tournament.snapshot('host').pot).toBe(1000);expect([...wallets.values()]).toEqual([1000,1000,1000,1000]);
  expect(command('host',{kind:'join'}).ok).toBe(false);expect(command('guest',{kind:'start'}).ok).toBe(false);expect(command('host',{kind:'start'}).ok).toBe(true);
  expect(tournament.snapshot('host').participants.every(person=>person.status==='playing')).toBe(true);expect(tournament.snapshot('host').poker?.players.every(player=>player.stack<=1000)).toBe(true);
 });
 it('refunds pre-start withdrawal only once and requires a real second entrant',()=>{
  const {tournament,wallets,command}=setup();expect(command('guest',{kind:'withdraw'}).ok).toBe(true);expect(wallets.get('guest')).toBe(1250);expect(command('guest',{kind:'withdraw'}).ok).toBe(false);expect(tournament.snapshot('host').pot).toBe(250);expect(command('host',{kind:'start'}).ok).toBe(false);
 });
 it('keeps decks and opponents cards private and rejects replayed and out-of-turn moves',()=>{
  const {tournament,command}=setup(4);expect(command('host',{kind:'start'}).ok).toBe(true);
  const state=tournament.snapshot('host'),poker=state.poker!;expect(poker.deck).toEqual([]);expect(poker.seed).toBe(0);expect(poker.players[0].hole.every(card=>card.rank>0)).toBe(true);expect(poker.players.slice(1).every(player=>player.hole.every(card=>card.rank===0))).toBe(true);
  const actor=poker.players[poker.actor!].id,other=members.find(person=>person.id!==actor)!.id;
  expect(command(other,{kind:'action',action:{type:'fold'},version:state.version}).ok).toBe(false);
  expect(command(actor,{kind:'action',action:{type:'fold'},version:state.version-1}).ok).toBe(false);
  expect(command(actor,{kind:'action',action:{type:'fold'},version:state.version}).ok).toBe(true);
  expect(command(actor,{kind:'action',action:{type:'fold'},version:state.version}).ok).toBe(false);
 });
 it('runs a legal four-player tournament to one finite payout without rebuy or minting cash',()=>{
  const {tournament,wallets,command}=setup(4);expect(command('host',{kind:'start'}).ok).toBe(true);let decisions=0;
  while(tournament.snapshot('host').status==='playing'&&decisions++<3000){
   const state=tournament.snapshot('host'),table=state.poker!;
   if(table.actor===null){const next=state.participants.find(person=>person.status==='playing')!;expect(command(next.id,{kind:'next'}).ok).toBe(true);continue;}
   const actor=table.players[table.actor].id,personal=tournament.snapshot(actor),legal=legalActions(personal.poker!,0);
   const action=legal.canAllIn?{type:'allIn' as const}:legal.canCall?{type:'call' as const}:legal.canCheck?{type:'check' as const}:{type:'fold' as const};
   expect(command(actor,{kind:'action',action,version:state.version}).ok).toBe(true);
  }
  const final=tournament.snapshot('host');expect(final.status).toBe('completed');expect(final.winnerIds.length).toBeGreaterThan(0);expect(decisions).toBeLessThan(3000);expect([...wallets.values()].reduce((a,b)=>a+b,0)).toBe(5000);expect(final.poker!.handNumber).toBeLessThanOrEqual(24);
  expect(tournament.update(members,1e9).credits).toEqual([]);expect(tournament.update(members,1e9+1).credits).toEqual([]);expect(command('host',{kind:'join'}).ok).toBe(false);
 });
 it('raises the blinds and stops at24 hands when players keep folding',()=>{
  const {tournament,command}=setup(2);command('host',{kind:'start'});let decisions=0,maxBlind=0;
  while(tournament.snapshot('host').status==='playing'&&decisions++<300){
   const state=tournament.snapshot('host'),table=state.poker!;maxBlind=Math.max(maxBlind,table.bigBlind);
   if(table.actor===null){expect(command(state.participants.find(person=>person.status==='playing')!.id,{kind:'next'}).ok).toBe(true);continue;}
   expect(command(table.players[table.actor].id,{kind:'action',action:{type:'fold'},version:state.version}).ok).toBe(true);
  }
  expect(tournament.snapshot('host').status).toBe('completed');expect(tournament.snapshot('host').poker!.handNumber).toBeLessThanOrEqual(24);expect(maxBlind).toBeGreaterThan(10);
 });
 it('forfeits disconnected players and pays the remaining player exactly once',()=>{
  const {tournament,command}=setup();command('host',{kind:'start'});
  const credits=tournament.update([members[0]],100).credits;expect(credits).toEqual([{id:'host',amount:500}]);expect(tournament.snapshot('host').status).toBe('completed');expect(tournament.snapshot('host').participants.find(person=>person.id==='guest')?.status).toBe('withdrawn');expect(tournament.update([members[0]],101).credits).toEqual([]);
 });
 it('auto-checks or folds a timed-out actor and refunds abandoned registration once',()=>{
  const {tournament,command}=setup(4);command('host',{kind:'start'});const before=tournament.snapshot('host');tournament.update(members,before.turnDeadline!+1);expect(tournament.snapshot('host').version).toBeGreaterThan(before.version);
  const lobby=setup();expect(lobby.tournament.update(lobby.players,120001).credits).toEqual([{id:'host',amount:250},{id:'guest',amount:250}]);expect(lobby.tournament.snapshot('host').status).toBe('completed');expect(lobby.tournament.update(lobby.players,120002).credits).toEqual([]);
 });
});

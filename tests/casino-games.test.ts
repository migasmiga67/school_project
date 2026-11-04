import { describe,expect,it } from 'vitest';
import { blackjackValue,CasinoGames,roulettePayout,type CasinoGameAction,type SavedRoulette } from '../src/casino-games';
import type { Card } from '../src/poker-model';
import { rouletteMotion, rouletteNumberAtAngle, ROULETTE_SPIN_MS } from '../src/roulette-motion';
const cards=(ranks:number[]):Card[]=>ranks.map(rank=>({rank,suit:'♠'}));
function playing(seed=1){
 for(let current=seed;current<seed+1000;current++){
  const game=new CasinoGames(current),result=game.command({kind:'blackjackDeal',bet:100,version:0},1000);
  if(result.ok&&game.snapshot().blackjack.status==='playing')return {game,wallet:result.wallet};
 }
 throw new Error('No playing deal');
}

describe('host-owned blackjack',()=>{
 it('values soft and hard aces without exceeding21 unnecessarily',()=>{
  expect(blackjackValue(cards([14,14,9]))).toBe(21);expect(blackjackValue(cards([14,6]))).toBe(17);expect(blackjackValue(cards([14,6,10]))).toBe(17);expect(blackjackValue(cards([13,12,5]))).toBe(25);
 });
 it('hides the dealer hole card and never serializes a deck or RNG state',()=>{
  const {game,wallet}=playing(),state=game.snapshot();expect(wallet).toBe(900);expect(state.blackjack.player).toHaveLength(2);expect(state.blackjack.dealer[0].rank).toBeGreaterThan(0);expect(state.blackjack.dealer[1].rank).toBe(0);
  expect(JSON.stringify(state)).not.toContain('seed');expect(JSON.stringify(state)).not.toContain('deck');
  state.blackjack.player[0].rank=0;expect(game.snapshot().blackjack.player[0].rank).toBeGreaterThan(0);
 });
 it.each([-10,0,15,501,1000,NaN,Infinity])('rejects malformed bet%s without consuming a revision',bet=>{
  const game=new CasinoGames(5),before=game.snapshot();expect(game.command({kind:'blackjackDeal',bet,version:0},1000).ok).toBe(false);expect(game.snapshot()).toEqual(before);
 });
 it('rejects insufficient funds and stale duplicate actions atomically',()=>{
  const game=new CasinoGames(3);expect(game.command({kind:'blackjackDeal',bet:100,version:0},90).ok).toBe(false);
  const {game:active,wallet}=playing(),version=active.snapshot().version;
  expect(active.command({kind:'blackjackStand',version:version-1},wallet).ok).toBe(false);
  const result=active.command({kind:'blackjackStand',version},wallet);expect(result.ok).toBe(true);
  const settled=active.snapshot();expect(active.command({kind:'blackjackStand',version},result.ok?result.wallet:0).ok).toBe(false);expect(active.snapshot()).toEqual(settled);
 });
 it('settles real dealer hands, reveals all cards and credits only the defined payout',()=>{
  for(let seed=1;seed<50;seed++){
   const game=new CasinoGames(seed),deal=game.command({kind:'blackjackDeal',bet:100,version:0},1000);expect(deal.ok).toBe(true);if(!deal.ok)throw new Error(deal.reason);
   const result=game.snapshot().blackjack.status==='playing'?game.command({kind:'blackjackStand',version:game.snapshot().version},deal.wallet):deal;
   expect(result.ok).toBe(true);if(!result.ok)throw new Error(result.reason);
   const state=game.snapshot().blackjack;expect(state.status).toBe('settled');expect(state.dealer.every(card=>card.rank>=2)).toBe(true);expect(result.wallet).toBe(900+state.payout);
   if(state.outcome==='blackjack')expect(state.payout).toBe(250);
   else if(state.outcome==='win')expect(state.payout).toBe(200);
   else if(state.outcome==='push')expect(state.payout).toBe(100);
   else expect(state.payout).toBe(0);
  }
 });
 it('doubles by charging exactly one extra stake then drawing only once',()=>{
  const {game,wallet}=playing(),before=game.snapshot();
  const result=game.command({kind:'blackjackDouble',version:before.version},wallet);expect(result.ok).toBe(true);if(!result.ok)throw new Error(result.reason);
  const hand=game.snapshot().blackjack;expect(hand.status).toBe('settled');expect(hand.stake).toBe(200);expect(hand.player).toHaveLength(3);expect(result.wallet).toBe(800+hand.payout);
 });
 it('cannot double after hitting and never allows a parallel roulette wager',()=>{
  const {game,wallet}=playing();expect(game.command({kind:'rouletteSpin',bet:10,choice:'red',version:game.snapshot().version},wallet).ok).toBe(false);
  const result=game.command({kind:'blackjackHit',version:game.snapshot().version},wallet);expect(result.ok).toBe(true);
  expect(game.snapshot().blackjack.canDouble).toBe(false);expect(game.command({kind:'blackjackDouble',version:game.snapshot().version},wallet).ok).toBe(false);
 });
 it('forfeits a pending hand without minting or refunding any chips',()=>{
  const {game,wallet}=playing(),result=game.command({kind:'blackjackForfeit',version:game.snapshot().version},wallet);
  expect(result).toMatchObject({ok:true,wallet:900});expect(game.snapshot().blackjack).toMatchObject({status:'settled',outcome:'loss',payout:0});
 });
});

describe('persisted solo roulette',()=>{
 const startedAt=1_700_000_000_000;
 function pending(){
  const probe=new CasinoGames(42);probe.command({kind:'rouletteSpin',bet:100,choice:'straight',number:0,version:0},1000,startedAt);
  const spin=probe.snapshot().roulette.spin!,pose=rouletteMotion(spin,spin.durationMs),number=rouletteNumberAtAngle(pose.ballAngle-pose.wheelAngle);
  const game=new CasinoGames(42),result=game.command({kind:'rouletteSpin',bet:100,choice:'straight',number,version:0},1000,startedAt);
  if(!result.ok)throw new Error(result.reason);
  return {game,wallet:result.wallet,number};
 }
 it('resumes an atomic wallet-and-spin save without debiting again or revealing a pending result',()=>{
  const {game,wallet,number}=pending();game.update(startedAt+2100);
  const profile=JSON.parse(JSON.stringify({wallet,roulette:game.saveRoulette()}));
  const restored=new CasinoGames(987);expect(restored.restoreRoulette(profile.roulette,startedAt+3400)).toBe(true);
  expect(profile.wallet).toBe(900);expect(restored.snapshot().roulette).toMatchObject({status:'spinning',elapsedMs:2100,number:null,payout:0,history:[]});
  expect(restored.update(startedAt+3400)).toEqual({changed:false,payout:0});expect(restored.snapshot().roulette.elapsedMs).toBe(3400);
  const credit=restored.update(startedAt+ROULETTE_SPIN_MS);profile.wallet+=credit.payout;
  expect(credit).toEqual({changed:true,payout:3600});expect(profile.wallet).toBe(4500);expect(restored.snapshot().roulette).toMatchObject({status:'settled',number,history:[number]});
  expect(restored.update(startedAt+ROULETTE_SPIN_MS+1)).toEqual({changed:false,payout:0});
  expect(restored.restoreRoulette(profile.roulette,startedAt+ROULETTE_SPIN_MS+2)).toBe(false);
 });
 it('accounts for time offline from the original UTC start and consumes the credit only on update',()=>{
  const {game}=pending(),save=game.saveRoulette();expect(save.startedAt).toBe(startedAt);expect(save.roulette.elapsedMs).toBe(0);
  const restored=new CasinoGames(9);expect(restored.restoreRoulette(save,startedAt+60_000)).toBe(true);
  expect(restored.snapshot().roulette).toMatchObject({status:'spinning',number:null,payout:0});
  expect(restored.saveRoulette().startedAt).toBe(startedAt);
  expect(restored.update(startedAt+60_000)).toEqual({changed:true,payout:3600});
  expect(restored.update(startedAt+61_000)).toEqual({changed:false,payout:0});
 });
 it('restores settled history without paying again and preserves increasing spin identities',()=>{
  const {game,number}=pending();expect(game.update(startedAt+ROULETTE_SPIN_MS).payout).toBe(3600);
  const save=game.saveRoulette(),restored=new CasinoGames(1);expect(restored.restoreRoulette(save,startedAt+20_000)).toBe(true);
  expect(restored.snapshot().roulette).toEqual(save.roulette);expect(restored.update(startedAt+20_000)).toEqual({changed:false,payout:0});
  const version=restored.snapshot().version,result=restored.command({kind:'rouletteSpin',bet:10,choice:'red',version},4500,startedAt+20_000);
  expect(result).toMatchObject({ok:true,wallet:4490});expect(restored.snapshot().roulette.spin!.id).toBe(save.roulette.spin!.id+1);
  expect(restored.snapshot().roulette.history).toEqual([number]);expect(restored.saveRoulette().startedAt).toBe(startedAt+20_000);
 });
 it('preserves sampled progress when the UTC clock rolls back and continues from that progress',()=>{
  const {game}=pending();game.update(startedAt+3000);const save=game.saveRoulette(),restored=new CasinoGames(7);
  expect(restored.restoreRoulette(save,startedAt-1000)).toBe(true);
  expect(restored.update(startedAt-1000)).toEqual({changed:false,payout:0});expect(restored.snapshot().roulette.elapsedMs).toBe(3000);
  restored.update(startedAt);expect(restored.snapshot().roulette.elapsedMs).toBe(4000);expect(restored.saveRoulette().startedAt).toBe(startedAt);
  restored.update(startedAt-2000);expect(restored.snapshot().roulette.elapsedMs).toBe(4000);
  expect(restored.update(startedAt+3200)).toEqual({changed:true,payout:3600});
 });
 it('returns isolated roulette-only saves and restores idle profiles without a pending credit',()=>{
  const idle=new CasinoGames(4),save=idle.saveRoulette(),restored=new CasinoGames(5);
  expect(save).toMatchObject({version:1,startedAt:null,roulette:{status:'idle',spin:null}});expect(restored.restoreRoulette(save,startedAt)).toBe(true);expect(restored.update(startedAt+60_000)).toEqual({changed:false,payout:0});
  const {game}=pending(),pendingSave=game.saveRoulette();pendingSave.roulette.spin!.ballTravel=0;pendingSave.roulette.history.push(37);
  expect(game.saveRoulette().roulette.spin!.ballTravel).toBeLessThan(0);expect(game.saveRoulette().roulette.history).toEqual([]);
  const serialized=JSON.stringify(game.saveRoulette());for(const privateField of ['seed','deck','blackjack','wallet'])expect(serialized).not.toContain(privateField);
  const input=game.saveRoulette(),copy=new CasinoGames(6);expect(copy.restoreRoulette(input,startedAt)).toBe(true);input.roulette.spin!.ballTravel=0;input.roulette.history.push(37);
  expect(copy.saveRoulette().roulette.spin!.ballTravel).toBeLessThan(0);expect(copy.saveRoulette().roulette.history).toEqual([]);
 });
 it.each([
  ['unsupported format',(save:SavedRoulette)=>{save.version=2 as 1;}],
  ['missing UTC start',(save:SavedRoulette)=>{save.startedAt=null;}],
  ['non-finite UTC start',(save:SavedRoulette)=>{save.startedAt=Infinity;}],
  ['negative UTC start',(save:SavedRoulette)=>{save.startedAt=-1;}],
  ['result before landing',(save:SavedRoulette)=>{save.roulette.number=0;}],
  ['payout before landing',(save:SavedRoulette)=>{save.roulette.payout=3600;}],
  ['invalid history',(save:SavedRoulette)=>{save.roulette.history=[37];}],
  ['invalid selected number',(save:SavedRoulette)=>{save.roulette.betNumber=37;}],
  ['invalid stake',(save:SavedRoulette)=>{save.roulette.stake=15;}],
  ['invalid timeline',(save:SavedRoulette)=>{save.roulette.spin!.ballTravel+=.03;}],
  ['elapsed past settlement',(save:SavedRoulette)=>{save.roulette.elapsedMs=ROULETTE_SPIN_MS;}],
  ['exhausted spin identity',(save:SavedRoulette)=>{save.roulette.spin!.id=Number.MAX_SAFE_INTEGER;}],
 ] as const)('rejects %s without consuming a revision or changing current state',(_name,mutate)=>{
  const save=pending().game.saveRoulette();mutate(save);const game=new CasinoGames(5),before=game.snapshot();
  expect(game.restoreRoulette(save,startedAt)).toBe(false);expect(game.snapshot()).toEqual(before);
 });
 it('rejects invalid envelopes and clocks and cannot replace an existing blackjack or roulette session',()=>{
  const save=pending().game.saveRoulette(),game=new CasinoGames(5),before=game.snapshot();
  for(const value of [null,undefined,[],{},save.roulette])expect(game.restoreRoulette(value,startedAt)).toBe(false);
  for(const time of [-1,NaN,Infinity])expect(game.restoreRoulette(save,time)).toBe(false);expect(game.snapshot()).toEqual(before);
  const active=playing().game;expect(active.restoreRoulette(save,startedAt)).toBe(false);expect(pending().game.restoreRoulette(save,startedAt)).toBe(false);
  const settled=pending().game;settled.update(startedAt+ROULETTE_SPIN_MS);const tampered=settled.saveRoulette();tampered.roulette.payout=0;
  expect(game.restoreRoulette(tampered,startedAt+10_000)).toBe(false);
 });
});

describe('European roulette',()=>{
 it('uses zero as a loss on every outside bet and pays35:1 plus the stake on a straight',()=>{
  for(const choice of ['red','black','odd','even'] as const)expect(roulettePayout(0,choice,10)).toBe(0);
  expect(roulettePayout(0,'straight',10,0)).toBe(360);expect(roulettePayout(17,'straight',10,17)).toBe(360);expect(roulettePayout(17,'straight',10,18)).toBe(0);
  expect(roulettePayout(1,'red',10)).toBe(20);expect(roulettePayout(2,'black',10)).toBe(20);expect(roulettePayout(19,'odd',10)).toBe(20);expect(roulettePayout(36,'even',10)).toBe(20);
 });
 it('debits one wager, hides the result during motion, and settles once into the visible pocket',()=>{
  const game=new CasinoGames(42),action:CasinoGameAction={kind:'rouletteSpin',bet:100,choice:'straight',number:0,version:0};
  const start=game.command(action,1000,1000);expect(start).toMatchObject({ok:true,wallet:900});
  const first=game.snapshot();expect(first.roulette).toMatchObject({status:'spinning',elapsedMs:0,number:null,betNumber:0,payout:0,history:[]});
  expect(first.roulette.message).not.toMatch(/Wypadło|Wypłata/);
  expect(game.command(action,900,1001).ok).toBe(false);
  expect(game.command({...action,version:first.version},900,1001).ok).toBe(false);
  expect(game.command({kind:'blackjackDeal',bet:100,version:first.version},900,1001).ok).toBe(false);
  expect(game.update(1000+ROULETTE_SPIN_MS-1)).toEqual({changed:false,payout:0});
  expect(game.snapshot()).toMatchObject({version:first.version,roulette:{status:'spinning',elapsedMs:ROULETTE_SPIN_MS-1,number:null,payout:0,history:[]}});
  const credit=game.update(1000+ROULETTE_SPIN_MS),landed=game.snapshot(),spin=landed.roulette.spin!;
  const pose=rouletteMotion(spin,spin.durationMs),number=rouletteNumberAtAngle(pose.ballAngle-pose.wheelAngle);
  expect(landed.roulette).toMatchObject({status:'settled',elapsedMs:ROULETTE_SPIN_MS,number,history:[number]});
  expect(credit).toEqual({changed:true,payout:roulettePayout(number,'straight',100,0)});
  expect(landed.version).toBe(first.version+1);
  expect(game.update(1e9)).toEqual({changed:false,payout:0});expect(game.update(1e9)).toEqual({changed:false,payout:0});
  expect(game.command(action,900+credit.payout,1e9).ok).toBe(false);
  expect(game.snapshot()).toEqual(landed);
 });
 it('keeps spin time monotonic without consuming revisions or leaking mutable motion data',()=>{
  const game=new CasinoGames(5);game.command({kind:'rouletteSpin',bet:10,choice:'red',version:0},1000,0);
  game.update(2500);const before=game.snapshot();
  expect(game.update(1000)).toEqual({changed:false,payout:0});expect(game.snapshot()).toEqual(before);
  for(const time of [-1,NaN,Infinity])expect(game.update(time)).toEqual({changed:false,payout:0});
  before.roulette.spin!.ballTravel=0;before.roulette.history.push(0);
  expect(game.snapshot().roulette.spin!.ballTravel).toBeLessThan(0);expect(game.snapshot().roulette.history).toEqual([]);
 });
 it('bounds settled history and gives each subsequent spin a new identity without an early payout',()=>{
  const game=new CasinoGames(42);let wallet=1000;
  for(let i=0;i<15;i++){
   const history=[...game.snapshot().roulette.history],now=i*ROULETTE_SPIN_MS;
   const action:CasinoGameAction={kind:'rouletteSpin',bet:10,choice:'red',version:game.snapshot().version},result=game.command(action,wallet,now);expect(result.ok).toBe(true);if(!result.ok)throw new Error(result.reason);
   const spin=game.snapshot().roulette;expect(spin.spin!.id).toBe(i+1);expect(spin.history).toEqual(history);expect(spin.number).toBeNull();expect(result.wallet).toBe(wallet-10);
   const credit=game.update(now+ROULETTE_SPIN_MS);expect(credit.changed).toBe(true);wallet=result.wallet+credit.payout;
   const settled=game.snapshot().roulette;expect(settled.number).toBeGreaterThanOrEqual(0);expect(settled.number).toBeLessThanOrEqual(36);expect(credit.payout).toBe(roulettePayout(settled.number!,'red',10));
   expect(game.command(action,wallet,now+ROULETTE_SPIN_MS).ok).toBe(false);
  }
  expect(game.snapshot().roulette.history).toHaveLength(12);
 });
 it.each([-1,37,2.5,NaN])('rejects invalid selected number%s without modifying the game',number=>{
  const game=new CasinoGames(3),before=game.snapshot();expect(game.command({kind:'rouletteSpin',bet:10,choice:'straight',number,version:0},1000).ok).toBe(false);expect(game.snapshot()).toEqual(before);
 });
});

import { describe,expect,it } from 'vitest';
import { blackjackValue,CasinoGames,roulettePayout,type CasinoGameAction } from '../src/casino-games';
import type { Card } from '../src/poker-model';
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

describe('European roulette',()=>{
 it('uses zero as a loss on every outside bet and pays35:1 plus the stake on a straight',()=>{
  for(const choice of ['red','black','odd','even'] as const)expect(roulettePayout(0,choice,10)).toBe(0);
  expect(roulettePayout(0,'straight',10,0)).toBe(360);expect(roulettePayout(17,'straight',10,17)).toBe(360);expect(roulettePayout(17,'straight',10,18)).toBe(0);
  expect(roulettePayout(1,'red',10)).toBe(20);expect(roulettePayout(2,'black',10)).toBe(20);expect(roulettePayout(19,'odd',10)).toBe(20);expect(roulettePayout(36,'even',10)).toBe(20);
 });
 it('charges and settles one wager atomically, bounding history and rejecting replay',()=>{
  const game=new CasinoGames(42);let wallet=1000;
  for(let i=0;i<15;i++){
   const action:CasinoGameAction={kind:'rouletteSpin',bet:10,choice:'red',version:game.snapshot().version},result=game.command(action,wallet);expect(result.ok).toBe(true);if(!result.ok)throw new Error(result.reason);
   const spin=game.snapshot().roulette;expect(spin.number).toBeGreaterThanOrEqual(0);expect(spin.number).toBeLessThanOrEqual(36);expect(result.wallet).toBe(wallet-10+spin.payout);wallet=result.wallet;
   expect(game.command(action,wallet).ok).toBe(false);
  }
  expect(game.snapshot().roulette.history).toHaveLength(12);
 });
 it.each([-1,37,2.5,NaN])('rejects invalid selected number%s without modifying the game',number=>{
  const game=new CasinoGames(3),before=game.snapshot();expect(game.command({kind:'rouletteSpin',bet:10,choice:'straight',number,version:0},1000).ok).toBe(false);expect(game.snapshot()).toEqual(before);
 });
});

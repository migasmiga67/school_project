import { describe, expect, it } from 'vitest';
import { act, advanceBots, compareHands, createPokerTable, dealHand, evaluateHand, foldPokerSeat, legalActions } from '../src/poker';
import type { Card, PokerAction, PokerResult, PokerState, Suit } from '../src/poker-model';

const card = (text: string): Card => ({ rank: ({ A:14,K:13,Q:12,J:11,T:10 } as Record<string,number>)[text[0]] ?? Number(text[0]), suit: ({s:'♠',h:'♥',d:'♦',c:'♣'} as Record<string,Suit>)[text[1]] });
const cards = (text: string) => text.split(' ').map(card);
const ok = (result: PokerResult): PokerState => { if(!result.ok)throw new Error(result.reason);return result.state; };
const action = (state: PokerState, move: PokerAction) => ok(act(state,state.actor!,move));
const total = (state: PokerState) => state.pot+state.players.reduce((sum,p)=>sum+p.stack,0);
const deal = (seed=1,buyIn=200) => ok(dealHand(createPokerTable(seed,buyIn)));
function river(contributions:number[],stacks:number[],holes:string[],board:string,folded:number[]=[]):PokerState {
 const state=createPokerTable(10);state.phase='river';state.board=cards(board);state.pot=contributions.reduce((a,b)=>a+b,0);state.actor=3;state.dealer=0;state.currentBet=0;
 state.players.forEach((p,i)=>{p.hole=cards(holes[i]);p.stack=stacks[i];p.contributed=contributions[i];p.bet=0;p.folded=folded.includes(i);p.allIn=p.stack===0;p.acted=true;});
 state.players[3].acted=false;state.raiseRights=state.players.map(()=>true);return state;
}

describe('best five-card poker hands',()=>{
 it.each([
  ['As Ks Qs Js Ts 2d 3c',8,'Poker królewski'],
  ['9s 8s 7s 6s 5s Ad Kd',8,'Poker'],
  ['As Ah Ad Ac Ks 2h 3h',7,'Kareta'],
  ['As Ah Ad Ks Kh Kd 2c',6,'Full'],
  ['As Js 8s 4s 2s Kd Qc',5,'Kolor'],
  ['As 2h 3d 4c 5s Kd Qc',4,'Strit'],
  ['As Ah Ad Ks Qh 7d 2c',3,'Trójka'],
  ['As Ah Ks Kh Qh 7d 2c',2,'Dwie pary'],
  ['As Ah Ks Qh Jh 7d 2c',1,'Para'],
  ['As Kh Jd 9c 7h 5s 3d',0,'Wysoka karta'],
 ])('ranks %s', (text,category,name)=>{
  const value=evaluateHand(cards(text as string));expect(value.category).toBe(category);expect(value.name).toBe(name);
 });
 it('treats the wheel as five high and distinguishes every flush kicker',()=>{
  expect(compareHands(evaluateHand(cards('As 2h 3d 4c 5s')),evaluateHand(cards('2s 3h 4d 5c 6s')))).toBe(-1);
  expect(compareHands(evaluateHand(cards('As Js 8s 4s 2s')),evaluateHand(cards('Ah Jh 8h 3h 2h')))).toBe(1);
 });
 it('selects the higher triplet for a full house and the correct two-pair kicker',()=>{
  expect(evaluateHand(cards('As Ah Ad Ks Kh Kd 2c')).kickers).toEqual([14,13]);
  expect(compareHands(evaluateHand(cards('As Ah Ks Kh Qc')),evaluateHand(cards('Ad Ac Kd Kc Js')))).toBe(1);
 });
 it('rejects incomplete, out-of-range and duplicated cards',()=>{
  expect(()=>evaluateHand(cards('As Ks Qs Js'))).toThrow();
  expect(()=>evaluateHand(cards('As As Qs Js Ts'))).toThrow();
  expect(()=>evaluateHand([{rank:16,suit:'♠'},...cards('Ks Qs Js Ts')])).toThrow();
 });
});

describe('dealing, action order and betting streets',()=>{
 it('deals eight distinct hole cards, posts blinds and gives the correct first action',()=>{
  const before=createPokerTable(123),saved=structuredClone(before),state=ok(dealHand(before));
  expect(before).toEqual(saved);expect(state.players.every(p=>p.hole.length===2)).toBe(true);
  expect(state.dealer).toBe(0);expect(state.actor).toBe(3);expect(state.players[1].bet).toBe(5);expect(state.players[2].bet).toBe(10);expect(state.pot).toBe(15);expect(total(state)).toBe(800);
  const deck=[...state.deck,...state.players.flatMap(p=>p.hole)];expect(deck).toHaveLength(52);expect(new Set(deck.map(c=>`${c.rank}${c.suit}`)).size).toBe(52);
  expect(ok(dealHand(createPokerTable(123)))).toEqual(state);
 });
 it('keeps the big blind option, then starts flop with the first seat left of dealer',()=>{
  let state=deal();state=action(state,{type:'call'});state=action(state,{type:'call'});state=action(state,{type:'call'});
  expect(state.phase).toBe('preflop');expect(state.actor).toBe(2);expect(legalActions(state,2).canCheck).toBe(true);
  state=action(state,{type:'check'});expect(state.phase).toBe('flop');expect(state.actor).toBe(1);expect(state.board).toHaveLength(3);expect(state.deck).toHaveLength(40);expect(state.pot).toBe(40);
  expect(state.players.every(p=>p.bet===0)).toBe(true);
 });
 it('rejects wrong-turn, free calls and under-minimum raises without mutating the table',()=>{
  const state=deal(),before=structuredClone(state);
  expect(act(state,0,{type:'call'}).ok).toBe(false);expect(act(state,3,{type:'check'}).ok).toBe(false);expect(act(state,3,{type:'raise',to:15}).ok).toBe(false);expect(act(state,3,{type:'raise',to:21.5}).ok).toBe(false);
  expect(state).toEqual(before);expect(act(createPokerTable(1),0,{type:'fold'}).ok).toBe(false);
 });
 it('awards the pot immediately when every other player folds',()=>{
  let state=deal();state=action(state,{type:'fold'});state=action(state,{type:'fold'});state=action(state,{type:'fold'});
  expect(state.phase).toBe('showdown');expect(state.winners).toEqual([2]);expect(state.players[2].stack).toBe(205);expect(state.pot).toBe(0);expect(total(state)).toBe(800);expect(state.board).toHaveLength(0);
 });
 it('rotates dealer over funded seats and uses heads-up preflop/postflop order',()=>{
  const table=createPokerTable(4);table.players[2].stack=0;table.players[3].stack=0;
  let state=ok(dealHand(table));expect(state.dealer).toBe(0);expect(state.players[0].bet).toBe(5);expect(state.players[1].bet).toBe(10);expect(state.actor).toBe(0);
  state=action(state,{type:'call'});state=action(state,{type:'check'});expect(state.phase).toBe('flop');expect(state.actor).toBe(1);
  state=action(state,{type:'fold'});state=ok(dealHand(state));expect(state.dealer).toBe(1);expect(state.actor).toBe(1);
 });
 it('does not start a new hand while one is active or after the hero is broke',()=>{
  expect(dealHand(deal()).ok).toBe(false);const table=createPokerTable(1);table.players[0].stack=0;expect(dealHand(table).ok).toBe(false);
  const alone=createPokerTable(1);alone.players.slice(1).forEach(p=>p.stack=0);expect(dealHand(alone).ok).toBe(false);
 });
});

describe('all-ins and raise rights',()=>{
 it('lets a checked player raise a short opening all-in without reopening callers',()=>{
  const table=createPokerTable(1);table.players[2].stack=15;
  let state=ok(dealHand(table));
  state=action(state,{type:'call'});state=action(state,{type:'call'});state=action(state,{type:'call'});state=action(state,{type:'check'});
  expect(state.phase).toBe('flop');expect(state.actor).toBe(1);
  state=action(state,{type:'check'});state=action(state,{type:'allIn'});
  expect(state.currentBet).toBe(5);expect(state.raiseRights[1]).toBe(true);
  state=action(state,{type:'call'});state=action(state,{type:'call'});
  expect(state.actor).toBe(1);expect(legalActions(state,1).canRaise).toBe(true);expect(legalActions(state,1).minRaiseTo).toBe(15);
  expect(state.raiseRights[3]).toBe(false);expect(state.raiseRights[0]).toBe(false);
  state=action(state,{type:'raise',to:15});expect(state.currentBet).toBe(15);expect(state.minRaise).toBe(10);expect(total(state)).toBe(615);
 });
 it('does not reopen an already-acted player after one short all-in raise',()=>{
  let state=deal();state=action(state,{type:'call'});state=action(state,{type:'raise',to:30});
  state.players[1].stack=35;state=action(state,{type:'allIn'});expect(state.currentBet).toBe(40);expect(state.minRaise).toBe(20);
  state=action(state,{type:'call'});state=action(state,{type:'call'});expect(state.actor).toBe(0);
  const legal=legalActions(state,0);expect(legal.canCall).toBe(true);expect(legal.callAmount).toBe(10);expect(legal.canRaise).toBe(false);expect(legal.canAllIn).toBe(false);
  expect(act(state,0,{type:'raise',to:60}).ok).toBe(false);
 });
 it('reopens raising when multiple short all-ins cumulatively make a full raise',()=>{
  let state=deal();state=action(state,{type:'call'});state=action(state,{type:'raise',to:30});state.players[1].stack=35;state=action(state,{type:'allIn'});
  state.players[2].stack=40;state=action(state,{type:'allIn'});expect(state.currentBet).toBe(50);state=action(state,{type:'call'});
  expect(state.actor).toBe(0);expect(legalActions(state,0).canRaise).toBe(true);expect(legalActions(state,0).minRaiseTo).toBe(70);
 });
 it('runs all-in players through five board cards without leaving an impossible actor',()=>{
  let state=deal(7,10);let count=0;
  while(state.phase!=='showdown'&&count++<12){const legal=legalActions(state,state.actor!);state=action(state,legal.canCall?{type:'call'}:{type:'check'});}
  expect(state.phase).toBe('showdown');expect(state.board).toHaveLength(5);expect(state.actor).toBeNull();expect(total(state)).toBe(40);expect(state.pot).toBe(0);
 });
 it('returns an unmatched overbet before resolving an all-in showdown',()=>{
  const table=createPokerTable(21);table.players[1].stack=50;table.players[2].stack=0;table.players[3].stack=0;
  let state=ok(dealHand(table));state=action(state,{type:'allIn'});state=action(state,{type:'call'});
  expect(state.phase).toBe('showdown');expect(state.players[0].stack).toBeGreaterThanOrEqual(150);expect(state.payouts.reduce((a,b)=>a+b,0)).toBe(100);expect(total(state)).toBe(250);expect(state.log.some(t=>t.includes('zwrot niesprawdzonych 150'))).toBe(true);
 });
 it('does not offer an extra raise into an opponent who is already all-in',()=>{
  const table=createPokerTable(21);table.players[1].stack=50;table.players[2].stack=0;table.players[3].stack=0;
  let state=ok(dealHand(table));state=action(state,{type:'call'});state=action(state,{type:'allIn'});
  expect(state.actor).toBe(0);expect(legalActions(state,0).canCall).toBe(true);expect(legalActions(state,0).canRaise).toBe(false);expect(legalActions(state,0).canAllIn).toBe(false);
 });
});

describe('side pots and tied showdowns',()=>{
 const holes=['As Ah','Ks Kh','Qs Qh','Js Jh'];const board='2c 3d 7c 9d Tc';
 it('separates three layers and awards each to its eligible highest hand',()=>{
  const state=river([50,100,150,150],[0,0,0,50],holes,board);const before=total(state);const result=action(state,{type:'check'});
  expect(result.payouts).toEqual([200,150,100,0]);expect(result.players.map(p=>p.stack)).toEqual([200,150,100,50]);expect(total(result)).toBe(before);expect(result.pot).toBe(0);
 });
 it('never awards a contested pot to a folded strongest hand',()=>{
  const state=river([50,50,50,50],[0,0,0,50],holes,board,[0]);const result=action(state,{type:'check'});
  expect(result.payouts).toEqual([0,200,0,0]);expect(result.winners).toEqual([1]);
 });
 it('splits the pot and gives an odd chip clockwise left of the dealer',()=>{
  const state=river([5,5,5,0],[100,100,0,20],['As 2c','Qs 3c','7s 8c','9s 4c'],'Th Jh Qh Kh Ah',[2,3]);state.actor=1;state.players[1].acted=false;state.players[3].acted=true;
  const result=action(state,{type:'check'});expect(result.payouts).toEqual([7,8,0,0]);expect(result.winners).toEqual([0,1]);expect(total(result)).toBe(total(state));
 });
});

describe('forced departures from an online hand',()=>{
 it('folds an off-turn player without skipping the current actor or mutating input',()=>{
  const state=deal(),saved=structuredClone(state),actor=state.actor!;
  const folded=ok(foldPokerSeat(state,0));expect(folded.actor).toBe(actor);expect(folded.players[0].folded).toBe(true);expect(total(folded)).toBe(800);expect(state).toEqual(saved);
  expect(foldPokerSeat(createPokerTable(1),0).ok).toBe(false);expect(foldPokerSeat(state,99).ok).toBe(false);
 });
 it('keeps an off-turn folded overbet in the pot even against short all-ins',()=>{
  const table=createPokerTable(91);table.players[1].stack=50;table.players[2].stack=50;table.players[3].stack=0;
  let state=ok(dealHand(table));expect(state.actor).toBe(0);state=action(state,{type:'allIn'});expect(state.currentBet).toBe(200);state=ok(foldPokerSeat(state,0));
  expect(state.actor).toBe(1);state=action(state,{type:'call'});state=action(state,{type:'call'});
  expect(state.phase).toBe('showdown');expect(state.board).toHaveLength(5);expect(state.players[0].stack).toBe(0);expect(state.payouts[0]).toBe(0);expect(state.payouts.reduce((sum,value)=>sum+value,0)).toBe(300);expect(total(state)).toBe(300);
 });
});

describe('bots and whole-table invariants',()=>{
 it('bots cannot act for the human and do not use other hole cards or unrevealed deck',()=>{
  const state=deal(30),different=structuredClone(state);[different.players[0].hole,different.players[1].hole]=[different.players[1].hole,different.players[0].hole];different.deck.reverse();
  const a=ok(advanceBots(state)),b=ok(advanceBots(different));expect(a.players[3]).toEqual(b.players[3]);expect(a.currentBet).toBe(b.currentBet);expect(a.seed).toBe(b.seed);
  let hero=deal(1);hero=action(hero,{type:'call'});expect(hero.actor).toBe(0);expect(advanceBots(hero).ok).toBe(false);
 });
 it('finishes varied legal multi-hand sessions with no lost or duplicated chips',()=>{
  for(let seed=1;seed<=24;seed++){
   let state=createPokerTable(seed);let decisions=0;
   for(let hand=0;hand<4&&state.players[0].stack>0&&state.players.filter(p=>p.stack>0).length>=2;hand++){
    state=ok(dealHand(state));
    while(state.phase!=='showdown'&&decisions++<400){
     const snapshot=structuredClone(state);let result:PokerResult;
     if(state.actor===0){const legal=legalActions(state,0);const move:PokerAction=legal.canRaise&&decisions%9===0?{type:'raise',to:legal.minRaiseTo}:legal.canCheck?{type:'check'}:legal.canCall?{type:'call'}:{type:'fold'};result=act(state,0,move);}else result=advanceBots(state);
     expect(state).toEqual(snapshot);state=ok(result);expect(total(state)).toBe(800);
     expect(state.players.every(p=>Number.isSafeInteger(p.stack)&&p.stack>=0)).toBe(true);
     const shown=[...state.players.flatMap(p=>p.hole),...state.board,...state.deck];expect(new Set(shown.map(c=>`${c.rank}${c.suit}`)).size).toBe(shown.length);
    }
    expect(state.phase).toBe('showdown');expect(state.actor).toBeNull();expect(state.pot).toBe(0);
   }
   expect(decisions).toBeLessThan(400);
  }
 });
});

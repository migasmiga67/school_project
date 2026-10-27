import type { Card, HandValue, LegalPokerActions, PokerAction, PokerResult, PokerSeat, PokerState, Suit } from './poker-model';
export * from './poker-model';

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const betting = (s: PokerState) => ['preflop', 'flop', 'turn', 'river'].includes(s.phase);
const copy = <T>(value: T): T => structuredClone(value);
const fail = (reason: string): PokerResult => ({ ok: false, reason });
function random(s: PokerState): number {
  let x = s.seed >>> 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  s.seed = (x >>> 0) || 0x9e3779b9;
  return s.seed / 0x100000000;
}
function log(s: PokerState, message: string) {
  s.message = message; s.log.push(message);
  if (s.log.length > 40) s.log.splice(0, s.log.length - 40);
}
function next(s: PokerState, after: number, predicate: (p: PokerSeat, index: number) => boolean): number | null {
  for (let offset = 1; offset <= s.players.length; offset++) {
    const index = (after + offset + s.players.length) % s.players.length;
    if (predicate(s.players[index], index)) return index;
  }
  return null;
}
function put(s: PokerState, index: number, amount: number) {
  const p = s.players[index], chips = Math.min(amount, p.stack);
  p.stack -= chips; p.bet += chips; p.contributed += chips; s.pot += chips; p.allIn = p.stack === 0;
}
function draw(s: PokerState): Card {
  const card = s.deck.pop();
  if (!card) throw new Error('Brak kart w talii.');
  return card;
}
function cardText(card: Card) { return `${({11:'J',12:'Q',13:'K',14:'A'} as Record<number,string>)[card.rank] ?? card.rank}${card.suit}`; }

/** Start a new table. Chips are supplied by the application wallet, never a payment service. */
export function createPokerTable(seed?: number, buyIn = 200): PokerState {
  if (!Number.isSafeInteger(buyIn) || buyIn < 10 || buyIn > 10000000) throw new Error('Wpisowe musi być całkowitą liczbą żetonów od 10 do 10 000 000.');
  let initial = seed;
  if (initial === undefined) {
    const values = new Uint32Array(1);
    if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(values);
    else values[0] = Date.now() >>> 0;
    initial = values[0];
  }
  return {
    players: ['Ty', 'Maya', 'Viktor', 'Leon'].map((name, i) => ({ id: `seat-${i}`, name, stack: buyIn, hole: [], folded: false, allIn: false, bet: 0, contributed: 0, acted: false })),
    dealer: 3, smallBlind: 5, bigBlind: 10, currentBet: 0, minRaise: 10, pot: 0, board: [], deck: [], phase: 'waiting', actor: null,
    message: 'Stół gotowy. Rozdaj karty.', log: [], handNumber: 0, winners: [], payouts: [0, 0, 0, 0], seed: (initial >>> 0) || 0x9e3779b9, raiseRights: [false, false, false, false],
  };
}

function rankedFive(cards: Card[]): HandValue {
  const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every(c => c.suit === cards[0].suit);
  const unique = [...new Set(ranks)];
  let straight = unique.length === 5 && unique[0] - unique[4] === 4 ? unique[0] : 0;
  if (unique.join(',') === '14,5,4,3,2') straight = 5;
  if (flush && straight) return { category: 8, kickers: [straight], name: straight === 14 ? 'Poker królewski' : 'Poker' };
  if (groups[0][1] === 4) return { category: 7, kickers: [groups[0][0], groups[1][0]], name: 'Kareta' };
  if (groups[0][1] === 3 && groups[1][1] === 2) return { category: 6, kickers: [groups[0][0], groups[1][0]], name: 'Full' };
  if (flush) return { category: 5, kickers: ranks, name: 'Kolor' };
  if (straight) return { category: 4, kickers: [straight], name: 'Strit' };
  if (groups[0][1] === 3) return { category: 3, kickers: [groups[0][0], ...groups.slice(1).map(g => g[0]).sort((a,b)=>b-a)], name: 'Trójka' };
  if (groups[0][1] === 2 && groups[1][1] === 2) return { category: 2, kickers: [Math.max(groups[0][0], groups[1][0]), Math.min(groups[0][0], groups[1][0]), groups[2][0]], name: 'Dwie pary' };
  if (groups[0][1] === 2) return { category: 1, kickers: [groups[0][0], ...groups.slice(1).map(g => g[0]).sort((a,b)=>b-a)], name: 'Para' };
  return { category: 0, kickers: ranks, name: 'Wysoka karta' };
}
export function compareHands(a: HandValue, b: HandValue): number {
  if (a.category !== b.category) return Math.sign(a.category - b.category);
  for (let i = 0; i < Math.max(a.kickers.length, b.kickers.length); i++) {
    const difference = (a.kickers[i] ?? 0) - (b.kickers[i] ?? 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}
export function evaluateHand(cards: Card[]): HandValue {
  if (cards.length < 5 || cards.length > 7 || cards.some(c => !Number.isInteger(c.rank) || c.rank < 2 || c.rank > 14 || !SUITS.includes(c.suit))) throw new Error('Ocena układu wymaga 5–7 poprawnych kart.');
  if (new Set(cards.map(c => `${c.rank}${c.suit}`)).size !== cards.length) throw new Error('Układ zawiera powtórzoną kartę.');
  let best: HandValue | null = null;
  for (let a = 0; a < cards.length - 4; a++) for (let b = a + 1; b < cards.length - 3; b++) for (let c = b + 1; c < cards.length - 2; c++) for (let d = c + 1; d < cards.length - 1; d++) for (let e = d + 1; e < cards.length; e++) {
    const value = rankedFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
    if (!best || compareHands(value, best) > 0) best = value;
  }
  return best!;
}

function returnUncalled(s: PokerState) {
  const bets = s.players.map((p, index) => ({ amount: p.bet, index })).sort((a, b) => b.amount - a.amount);
  const excess = bets[0].amount - (bets[1]?.amount ?? 0);
  if (excess <= 0) return;
  const p = s.players[bets[0].index];
  // A disconnected player can forfeit an uncalled wager off-turn. Their
  // committed chips remain dead money rather than returning after cash-out.
  if (p.folded) return;
  p.bet -= excess; p.contributed -= excess; p.stack += excess; p.allIn = false; s.pot -= excess;
  log(s, `${p.name}: zwrot niesprawdzonych ${excess} żetonów.`);
}
function resetBets(s: PokerState) {
  for (const p of s.players) { p.bet = 0; p.acted = false; }
  s.currentBet = 0; s.minRaise = s.bigBlind;
  s.raiseRights = s.players.map(p => !p.folded && !p.allIn);
}
function revealNext(s: PokerState) {
  draw(s); // Burn card: never part of a hand or visible information.
  if (s.phase === 'preflop') { s.phase = 'flop'; s.board.push(draw(s), draw(s), draw(s)); log(s, `Flop: ${s.board.map(cardText).join(' ')}.`); }
  else if (s.phase === 'flop') { s.phase = 'turn'; s.board.push(draw(s)); log(s, `Turn: ${cardText(s.board[3])}.`); }
  else { s.phase = 'river'; s.board.push(draw(s)); log(s, `River: ${cardText(s.board[4])}.`); }
  resetBets(s);
}
function finish(s: PokerState, payouts: number[], text: string) {
  for (let i = 0; i < s.players.length; i++) { const p = s.players[i]; p.stack += payouts[i]; p.bet = 0; p.contributed = 0; p.allIn = p.stack === 0; }
  s.payouts = payouts; s.winners = payouts.map((amount, index) => amount > 0 ? index : -1).filter(i => i >= 0);
  s.pot = 0; s.currentBet = 0; s.phase = 'showdown'; s.actor = null; s.raiseRights.fill(false); log(s, text);
}
function showdown(s: PokerState) {
  const values = s.players.map(p => !p.folded ? evaluateHand([...p.hole, ...s.board]) : null);
  const levels = [...new Set(s.players.map(p => p.contributed).filter(amount => amount > 0))].sort((a,b)=>a-b);
  const payouts = s.players.map(() => 0);
  let previous = 0;
  for (const level of levels) {
    const contributors = s.players.map((p,i)=>p.contributed >= level ? i : -1).filter(i=>i>=0);
    const amount = (level - previous) * contributors.length;
    let eligible = contributors.filter(i => !s.players[i].folded);
    // Off-turn departure may leave a layer containing only forfeited bets.
    // Dead money is contested by the remaining live hands.
    if (!eligible.length) eligible = s.players.map((p,i)=>!p.folded ? i : -1).filter(i=>i>=0);
    // Preserve chips even in a malformed external fixture with no live hand.
    if (!eligible.length) { const refund = level - previous; contributors.forEach(i => payouts[i] += refund); previous = level; continue; }
    let winners = [eligible[0]];
    for (const index of eligible.slice(1)) {
      const comparison = compareHands(values[index]!, values[winners[0]]!);
      if (comparison > 0) winners = [index]; else if (comparison === 0) winners.push(index);
    }
    const share = Math.floor(amount / winners.length);
    winners.forEach(i => payouts[i] += share);
    let odd = amount - share * winners.length;
    for (let offset = 1; offset <= s.players.length && odd > 0; offset++) { const i = (s.dealer + offset) % s.players.length; if (winners.includes(i)) { payouts[i]++; odd--; } }
    previous = level;
  }
  const details = payouts.map((amount,i)=>amount ? `${s.players[i].name}: ${amount} (${values[i]?.name ?? 'zwrot'})` : '').filter(Boolean).join(' · ');
  finish(s, payouts, `Odkrycie kart — ${details}.`);
}
function progress(s: PokerState, after: number) {
  while (betting(s)) {
    const live = s.players.map((p,i)=>!p.folded ? i : -1).filter(i=>i>=0);
    if (live.length === 1) {
      const payouts = s.players.map(()=>0); payouts[live[0]] = s.pot;
      finish(s, payouts, `${s.players[live[0]].name} wygrywa ${s.pot} żetonów — pozostali spasowali.`); return;
    }
    const movable = live.filter(i => s.players[i].stack > 0);
    if (movable.length <= 1 && (movable.length === 0 || s.players[movable[0]].bet >= s.currentBet)) {
      returnUncalled(s);
      while (s.board.length < 5) revealNext(s);
      showdown(s); return;
    }
    const mustAct = (p: PokerSeat) => !p.folded && !p.allIn && (!p.acted || p.bet < s.currentBet);
    const actor = next(s, after, mustAct);
    if (actor !== null) { s.actor = actor; return; }
    returnUncalled(s);
    if (s.phase === 'river') { showdown(s); return; }
    revealNext(s); after = s.dealer;
  }
}

export function dealHand(original: PokerState): PokerResult {
  if (!['waiting','showdown'].includes(original.phase)) return fail('Najpierw dokończ bieżące rozdanie.');
  if (original.players[0]?.stack <= 0) return fail('Nie masz żetonów. Opuść stół, aby wymienić kolejne wpisowe.');
  if (original.players.filter(p=>p.stack > 0).length < 2) return fail('Przy stole pozostał jeden gracz. Odbierz żetony i rozpocznij nową sesję.');
  const s = copy(original); s.handNumber++; s.board = []; s.pot = 0; s.currentBet = s.bigBlind; s.minRaise = s.bigBlind; s.winners = []; s.payouts = s.players.map(()=>0);
  s.deck = SUITS.flatMap(suit=>Array.from({length:13},(_,i)=>({rank:i+2,suit})));
  for (let i = s.deck.length - 1; i > 0; i--) { const j = Math.floor(random(s) * (i+1)); [s.deck[i], s.deck[j]] = [s.deck[j], s.deck[i]]; }
  for (const p of s.players) { p.folded = p.stack <= 0; p.allIn = false; p.bet = 0; p.contributed = 0; p.hole = []; p.acted = false; }
  s.dealer = next(s, s.dealer, p=>p.stack > 0)!;
  const funded = s.players.filter(p=>p.stack > 0).length;
  const small = funded === 2 ? s.dealer : next(s, s.dealer, p=>p.stack > 0)!;
  const big = next(s, small, p=>p.stack > 0)!;
  for (let round = 0; round < 2; round++) for (let offset = 1; offset <= s.players.length; offset++) { const p = s.players[(s.dealer + offset) % s.players.length]; if (!p.folded) p.hole.push(draw(s)); }
  s.phase = 'preflop'; s.raiseRights = s.players.map(p=>!p.folded); put(s,small,s.smallBlind); put(s,big,s.bigBlind);
  log(s, `Rozdanie ${s.handNumber}. ${s.players[small].name}: mała ciemna ${s.players[small].bet}, ${s.players[big].name}: duża ciemna ${s.players[big].bet}.`);
  // A short big blind still establishes the normal opening amount.
  progress(s,big);
  return {ok:true,state:s};
}

export function legalActions(s: PokerState, index: number): LegalPokerActions {
  const no: LegalPokerActions = {canFold:false,canCheck:false,canCall:false,callAmount:0,canRaise:false,minRaiseTo:0,maxRaiseTo:0,canAllIn:false};
  const p = s.players[index];
  if (!betting(s) || s.actor !== index || !p || p.folded || p.allIn || p.stack <= 0) return no;
  const needed = Math.max(0,s.currentBet-p.bet), max = p.bet+p.stack, minimum = s.currentBet+s.minRaise;
  const opposition = s.players.some((other,i)=>i!==index&&!other.folded&&other.stack>0);
  const rights = s.raiseRights[index] && opposition;
  return {canFold:true,canCheck:needed===0,canCall:needed>0,callAmount:Math.min(needed,p.stack),canRaise:rights&&max>=minimum,minRaiseTo:minimum,maxRaiseTo:max,canAllIn:max<=s.currentBet||Boolean(rights)};
}
export function act(original: PokerState, index: number, action: PokerAction): PokerResult {
  const legal = legalActions(original,index);
  if (!legal.canFold) return fail('Poczekaj na swoją kolej.');
  if (action.type === 'check'&&!legal.canCheck) return fail('Aby zostać w rozdaniu, sprawdź zakład lub spasuj.');
  if (action.type === 'call'&&!legal.canCall) return fail('Nie ma zakładu do sprawdzenia. Wybierz „Czekaj”.');
  if (action.type === 'raise'&&(!legal.canRaise||!Number.isSafeInteger(action.to)||action.to<legal.minRaiseTo||action.to>legal.maxRaiseTo)) return fail(`Podbicie musi wynosić od ${legal.minRaiseTo} do ${legal.maxRaiseTo} łącznie w tej rundzie.`);
  if (action.type === 'allIn'&&!legal.canAllIn) return fail('Nie możesz teraz ponownie otworzyć podbijania.');
  if (!['fold','check','call','raise','allIn'].includes(action.type)) return fail('Nieznana akcja.');
  const s=copy(original),p=s.players[index];
  p.acted=true;s.raiseRights[index]=false;
  if (action.type==='fold') {p.folded=true;log(s,`${p.name}: pas.`);}
  else if (action.type==='check') log(s,`${p.name}: czeka.`);
  else {
    const target=action.type==='call'?p.bet+legal.callAmount:action.type==='allIn'?legal.maxRaiseTo:action.to;
    const oldBet=s.currentBet, increase=target-oldBet;
    put(s,index,target-p.bet);
    if(target>oldBet) {
      s.currentBet=target;
      if(increase>=s.minRaise) {
        s.minRaise=increase;
        s.players.forEach((other,i)=>{if(i!==index&&!other.folded&&!other.allIn){other.acted=false;s.raiseRights[i]=true;}});
      } else {
        // Checking does not surrender the right to raise the first wager,
        // even when that opening wager is a short all-in. Players who have
        // already called a bet need a cumulative full raise to reopen action.
        s.players.forEach((other,i)=>{if(i!==index&&!other.folded&&!other.allIn&&other.acted&&((oldBet===0&&other.bet===0)||s.currentBet-other.bet>=s.minRaise))s.raiseRights[i]=true;});
      }
      log(s,`${p.name}: ${p.allIn?'all-in':'podbija do'} ${target}.`);
    } else log(s,`${p.name}: sprawdza ${target-(original.players[index].bet)}${p.allIn?' — all-in':''}.`);
  }
  progress(s,index);
  return {ok:true,state:s};
}

/** Host-only departure: forfeit the hand even when it is another seat's turn. */
export function foldPokerSeat(original: PokerState, index: number): PokerResult {
  if (!betting(original) || !Number.isInteger(index) || !original.players[index]) return fail('Brak aktywnego rozdania dla tego miejsca.');
  if (original.players[index].folded) return {ok:true,state:copy(original)};
  const s=copy(original),p=s.players[index];
  p.folded=true;p.acted=true;s.raiseRights[index]=false;
  log(s,`${p.name}: pas — opuścił stół.`);
  const after=original.actor===index||original.actor===null?index:(original.actor+s.players.length-1)%s.players.length;
  progress(s,after);
  return {ok:true,state:s};
}

/** A bot sees only its cards and the revealed board, never other holes or the deck. */
export function advanceBots(original: PokerState): PokerResult {
  const index=original.actor;
  if(index===null||index===0||!betting(original))return fail('Teraz ruch należy do gracza albo rozdanie już się zakończyło.');
  const s=copy(original),p=s.players[index],legal=legalActions(s,index),noise=random(s);
  let strength:number;
  if(s.board.length>=3) {
    const hand=evaluateHand([...p.hole,...s.board]);strength=Math.min(.98,.18+hand.category*.14+Math.max(...p.hole.map(c=>c.rank))/120);
  } else {
    const high=Math.max(...p.hole.map(c=>c.rank)),low=Math.min(...p.hole.map(c=>c.rank));
    strength=p.hole[0].rank===p.hole[1].rank?.65+high/45:.12+high/40+low/90+(p.hole[0].suit===p.hole[1].suit?.08:0);
  }
  let action:PokerAction;
  const price=legal.callAmount/(s.pot+legal.callAmount||1);
  if(legal.canCall&&strength+noise*.28<price+.22)action={type:'fold'};
  else if(legal.canRaise&&strength>.57&&noise>.68) {
    const target=Math.min(legal.maxRaiseTo,legal.minRaiseTo+Math.floor(s.pot*.25/5)*5);
    action={type:'raise',to:target};
  } else if(legal.canCheck)action={type:'check'};
  else if(legal.canCall)action={type:'call'};
  else if(legal.canAllIn)action={type:'allIn'};
  else action={type:'fold'};
  return act(s,index,action);
}

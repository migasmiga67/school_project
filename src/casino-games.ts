import type { Card, Suit } from './poker-model';

export type RouletteChoice = 'red' | 'black' | 'odd' | 'even' | 'straight';
export type CasinoGameAction = { version: number } & (
  | { kind: 'blackjackDeal'; bet: number }
  | { kind: 'blackjackHit' | 'blackjackStand' | 'blackjackDouble' | 'blackjackForfeit' }
  | { kind: 'rouletteSpin'; bet: number; choice: RouletteChoice; number?: number }
);
export interface BlackjackSnapshot {
  status: 'idle' | 'playing' | 'settled'; player: Card[]; dealer: Card[];
  stake: number; payout: number; outcome: 'win' | 'loss' | 'push' | 'blackjack' | null;
  canDouble: boolean; message: string;
}
export interface RouletteSnapshot {
  number: number | null; choice: RouletteChoice | null; stake: number; payout: number; history: number[]; message: string;
}
export interface CasinoGamesSnapshot { version: number; blackjack: BlackjackSnapshot; roulette: RouletteSnapshot }
export type CasinoGameResult = { ok: true; wallet: number; message: string } | { ok: false; reason: string };
export const CASINO_MIN_BET = 10;
export const CASINO_MAX_BET = 500;
export const ROULETTE_RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const SUITS: Suit[] = ['♠','♥','♦','♣'];
const no = (reason: string): CasinoGameResult => ({ok:false,reason});
const clone = <T>(value:T):T => structuredClone(value);

/** Aces become one as needed; the dealer stands on every seventeen. */
export function blackjackValue(cards: readonly Card[]): number {
  let total=0,aces=0;
  for(const card of cards){total+=card.rank===14?11:Math.min(10,card.rank);if(card.rank===14)aces++;}
  while(total>21&&aces-->0)total-=10;
  return total;
}
export function roulettePayout(number:number,choice:RouletteChoice,bet:number,straight?:number):number {
  if(number===0)return choice==='straight'&&straight===0?bet*36:0;
  const won=choice==='red'?ROULETTE_RED.has(number):choice==='black'?!ROULETTE_RED.has(number):choice==='odd'?number%2===1:choice==='even'?number%2===0:number===straight;
  return won?bet*(choice==='straight'?36:2):0;
}

/** One controller per wallet. Deck, seed and unrevealed dealer card stay on the host. */
export class CasinoGames {
  private revision=0;
  private seed:number;
  private deck:Card[]=[];
  private blackjack:BlackjackSnapshot={status:'idle',player:[],dealer:[],stake:0,payout:0,outcome:null,canDouble:false,message:'Postaw zakład i spróbuj zbliżyć się do 21.'};
  private roulette:RouletteSnapshot={number:null,choice:null,stake:0,payout:0,history:[],message:'Ruletka europejska: jedno zero. Wybierz zakład.'};

  constructor(seed?:number){
    this.seed=(seed??crypto.getRandomValues(new Uint32Array(1))[0])>>>0||0x9e3779b9;
  }
  snapshot():CasinoGamesSnapshot {
    const blackjack=clone(this.blackjack);
    if(blackjack.status==='playing')blackjack.dealer=blackjack.dealer.map((card,index)=>index===0?card:{rank:0,suit:'♠'});
    return {version:this.revision,blackjack,roulette:clone(this.roulette)};
  }
  command(action:CasinoGameAction,wallet:number):CasinoGameResult {
    if(!Number.isSafeInteger(wallet)||wallet<0)return no('Niepoprawny portfel.');
    if(!action||typeof action!=='object'||!Number.isSafeInteger(action.version)||action.version!==this.revision)return no('Stan gry się zmienił. Wybierz akcję ponownie.');
    if(!['blackjackDeal','blackjackHit','blackjackStand','blackjackDouble','blackjackForfeit','rouletteSpin'].includes(action.kind))return no('Nieznana gra kasyna.');
    const active=this.blackjack.status==='playing';
    if(action.kind==='blackjackDeal'||action.kind==='rouletteSpin'){
      if(active)return no('Dokończ bieżące rozdanie blackjacka.');
      if(!Number.isSafeInteger(action.bet)||action.bet<CASINO_MIN_BET||action.bet>CASINO_MAX_BET||action.bet%10!==0)return no('Zakład: od $10 do $500, co $10.');
      if(wallet<action.bet)return no('Brak gotówki na ten zakład.');
      if(action.kind==='rouletteSpin'){
        if(!['red','black','odd','even','straight'].includes(action.choice))return no('Niepoprawny rodzaj zakładu.');
        if(action.choice==='straight'&&(!Number.isInteger(action.number)||action.number! < 0||action.number! > 36))return no('Wybierz liczbę od 0 do 36.');
        const number=Math.floor(this.random()*37),payout=roulettePayout(number,action.choice,action.bet,action.number);
        this.roulette={number,choice:action.choice,stake:action.bet,payout,history:[number,...this.roulette.history].slice(0,12),message:`Wypadło ${number}${number===0?' · zero':ROULETTE_RED.has(number)?' · czerwone':' · czarne'}. ${payout?`Wypłata $${payout}.`:'Zakład przegrywa.'}`};
        this.revision++;return {ok:true,wallet:wallet-action.bet+payout,message:this.roulette.message};
      }
      this.shuffle();
      this.blackjack={status:'playing',player:[this.draw(),this.draw()],dealer:[this.draw(),this.draw()],stake:action.bet,payout:0,outcome:null,canDouble:true,message:'Dobierz kartę, zostań albo podwój zakład.'};
      wallet-=action.bet;
      const playerNatural=blackjackValue(this.blackjack.player)===21,dealerNatural=blackjackValue(this.blackjack.dealer)===21;
      if(playerNatural||dealerNatural){
        const payout=playerNatural&&dealerNatural?action.bet:playerNatural?action.bet*2.5:0;
        this.settle(playerNatural&&dealerNatural?'push':playerNatural?'blackjack':'loss',payout);
        wallet+=payout;
      }
      this.revision++;return {ok:true,wallet,message:this.blackjack.message};
    }
    if(!active)return no('Najpierw rozpocznij nowe rozdanie blackjacka.');
    if(action.kind==='blackjackDouble'){
      if(!this.blackjack.canDouble||this.blackjack.player.length!==2)return no('Podwojenie jest dostępne tylko przed pierwszym dobraniem.');
      if(wallet<this.blackjack.stake)return no('Brak gotówki na podwojenie zakładu.');
      wallet-=this.blackjack.stake;this.blackjack.stake*=2;
    }
    if(action.kind==='blackjackForfeit')this.settle('loss',0,'Opuściłeś rozdanie. Postawiony zakład przepada.');
    else {
      if(action.kind==='blackjackHit'||action.kind==='blackjackDouble'){
        this.blackjack.player.push(this.draw());this.blackjack.canDouble=false;
        if(blackjackValue(this.blackjack.player)>21)this.settle('loss',0,'Przekroczenie 21. Zakład przegrywa.');
      }
      if(this.blackjack.status==='playing'&&(action.kind!=='blackjackHit'||blackjackValue(this.blackjack.player)===21)){
        while(blackjackValue(this.blackjack.dealer)<17)this.blackjack.dealer.push(this.draw());
        const player=blackjackValue(this.blackjack.player),dealer=blackjackValue(this.blackjack.dealer);
        const outcome=dealer>21||player>dealer?'win':player===dealer?'push':'loss';
        this.settle(outcome,this.blackjack.stake*(outcome==='win'?2:outcome==='push'?1:0));
      }
      if(this.blackjack.status==='settled')wallet+=this.blackjack.payout;
      else this.blackjack.message=`Masz ${blackjackValue(this.blackjack.player)}. Dobierasz czy zostajesz?`;
    }
    this.revision++;return {ok:true,wallet,message:this.blackjack.message};
  }
  private settle(outcome:BlackjackSnapshot['outcome'],payout:number,message?:string){
    Object.assign(this.blackjack,{status:'settled',canDouble:false,outcome,payout,message:message??`${outcome==='blackjack'?'Blackjack!':outcome==='win'?'Wygrywasz.':outcome==='push'?'Remis.':'Wygrywa krupier.'} Wypłata $${payout}.`});
  }
  private random(){let x=this.seed;x^=x<<13;x^=x>>>17;x^=x<<5;this.seed=x>>>0||0x9e3779b9;return this.seed/0x100000000;}
  private shuffle(){this.deck=SUITS.flatMap(suit=>Array.from({length:13},(_,i)=>({rank:i+2,suit})));for(let i=51;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.deck[i],this.deck[j]]=[this.deck[j],this.deck[i]];}}
  private draw(){const card=this.deck.pop();if(!card)throw new Error('Brak kart w talii.');return card;}
}

import type { Card, Suit } from './poker-model';
import { createRouletteSpin, isRouletteSpin, rouletteMotion, rouletteNumberAtAngle, ROULETTE_SPIN_MS, type RouletteSpin } from './roulette-motion';
export type { RouletteSpin } from './roulette-motion';

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
  status:'idle'|'spinning'|'settled'; spin:RouletteSpin|null; elapsedMs:number;
  betNumber:number|null;
  number: number | null; choice: RouletteChoice | null; stake: number; payout: number; history: number[]; message: string;
}
/** Persist atomically with the solo wallet: its stake has already been debited. */
export interface SavedRoulette { version:1; roulette:RouletteSnapshot; startedAt:number|null }
export interface CasinoGamesSnapshot { version: number; blackjack: BlackjackSnapshot; roulette: RouletteSnapshot }
export type CasinoGameResult = { ok: true; wallet: number; message: string } | { ok: false; reason: string };
export const CASINO_MIN_BET = 10;
export const CASINO_MAX_BET = 500;
export const ROULETTE_RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const SUITS: Suit[] = ['♠','♥','♦','♣'];
const no = (reason: string): CasinoGameResult => ({ok:false,reason});
const clone = <T>(value:T):T => structuredClone(value);
const record = (value:unknown):value is Record<string,unknown> => Boolean(value&&typeof value==='object'&&!Array.isArray(value));
const integer = (value:unknown,max:number):value is number => typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=max;

function savedRoulette(value:unknown):value is SavedRoulette {
  if(!record(value)||value.version!==1||!record(value.roulette))return false;
  const spin=value.roulette;
  if(!['idle','spinning','settled'].includes(String(spin.status))||typeof spin.elapsedMs!=='number'||!Number.isFinite(spin.elapsedMs)||spin.elapsedMs<0||spin.elapsedMs>ROULETTE_SPIN_MS)return false;
  if(spin.number!==null&&!integer(spin.number,36)||![null,'red','black','odd','even','straight'].includes(spin.choice as null|string)||!integer(spin.stake,500)||!integer(spin.payout,18000)||!Array.isArray(spin.history)||spin.history.length>12||!spin.history.every(number=>integer(number,36))||typeof spin.message!=='string'||spin.message.length>600)return false;
  if(spin.betNumber!==null&&!integer(spin.betNumber,36)||spin.choice==='straight'&&spin.betNumber===null||spin.choice!=='straight'&&spin.betNumber!==null)return false;
  if(spin.status==='idle')return value.startedAt===null&&spin.spin===null&&spin.elapsedMs===0&&spin.number===null&&spin.choice===null&&spin.stake===0&&spin.payout===0&&spin.history.length===0;
  if(typeof value.startedAt!=='number'||!Number.isFinite(value.startedAt)||value.startedAt<0||!isRouletteSpin(spin.spin)||spin.spin.id>=Number.MAX_SAFE_INTEGER||spin.choice===null||spin.stake<CASINO_MIN_BET||spin.stake%10!==0)return false;
  if(spin.status==='spinning')return spin.elapsedMs<ROULETTE_SPIN_MS&&spin.number===null&&spin.payout===0;
  const pose=rouletteMotion(spin.spin,spin.spin.durationMs);
  return spin.elapsedMs===ROULETTE_SPIN_MS&&spin.number===rouletteNumberAtAngle(pose.ballAngle-pose.wheelAngle)&&spin.history[0]===spin.number
    &&spin.payout===roulettePayout(Number(spin.number),spin.choice as RouletteChoice,spin.stake,spin.betNumber===null?undefined:Number(spin.betNumber));
}

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
  private now=0;
  private rouletteStartedAt=0;
  private rouletteResumeAt=0;
  private rouletteResumeElapsed=0;
  private spinId=0;
  private blackjack:BlackjackSnapshot={status:'idle',player:[],dealer:[],stake:0,payout:0,outcome:null,canDouble:false,message:'Postaw zakład i spróbuj zbliżyć się do 21.'};
  private roulette:RouletteSnapshot={status:'idle',spin:null,elapsedMs:0,betNumber:null,number:null,choice:null,stake:0,payout:0,history:[],message:'Ruletka europejska: jedno zero. Wybierz zakład.'};

  constructor(seed?:number){
    this.seed=(seed??crypto.getRandomValues(new Uint32Array(1))[0])>>>0||0x9e3779b9;
  }
  snapshot():CasinoGamesSnapshot {
    const blackjack=clone(this.blackjack);
    if(blackjack.status==='playing')blackjack.dealer=blackjack.dealer.map((card,index)=>index===0?card:{rank:0,suit:'♠'});
    return {version:this.revision,blackjack,roulette:clone(this.roulette)};
  }
  saveRoulette():SavedRoulette {
    return {version:1,roulette:clone(this.roulette),startedAt:this.roulette.status==='idle'?null:this.rouletteStartedAt};
  }
  /** Restore only into a fresh controller. The next update consumes any credit. */
  restoreRoulette(value:unknown,now=Date.now()):boolean {
    if(this.revision!==0||!Number.isFinite(now)||now<0||!savedRoulette(value))return false;
    const roulette=value.roulette,spin=roulette.spin;
    this.roulette={status:roulette.status,spin:spin?{id:spin.id,durationMs:spin.durationMs,wheelStart:spin.wheelStart,wheelTravel:spin.wheelTravel,ballStart:spin.ballStart,ballTravel:spin.ballTravel}:null,elapsedMs:roulette.elapsedMs,betNumber:roulette.betNumber,number:roulette.number,choice:roulette.choice,stake:roulette.stake,payout:roulette.payout,history:[...roulette.history],message:roulette.message};
    this.rouletteStartedAt=value.startedAt??0;this.now=Math.max(this.now,now);
    this.rouletteResumeAt=this.now;this.rouletteResumeElapsed=roulette.elapsedMs;
    this.spinId=Math.max(this.spinId,spin?.id??0);this.revision++;
    return true;
  }
  /** Settlement is consumed once by the wallet owner, including losing spins. */
  update(now=Date.now()):{changed:boolean;payout:number} {
    if(!Number.isFinite(now)||now<0)return {changed:false,payout:0};
    this.now=Math.max(this.now,now);
    const spin=this.roulette.spin;
    if(this.roulette.status!=='spinning'||!spin)return {changed:false,payout:0};
    this.roulette.elapsedMs=Math.min(spin.durationMs,Math.max(this.roulette.elapsedMs,this.now-this.rouletteStartedAt,this.rouletteResumeElapsed+this.now-this.rouletteResumeAt));
    if(this.roulette.elapsedMs<spin.durationMs)return {changed:false,payout:0};
    const pose=rouletteMotion(spin,spin.durationMs);
    const number=rouletteNumberAtAngle(pose.ballAngle-pose.wheelAngle);
    const payout=roulettePayout(number,this.roulette.choice!,this.roulette.stake,this.roulette.betNumber??undefined);
    Object.assign(this.roulette,{status:'settled',number,payout,history:[number,...this.roulette.history].slice(0,12),message:`Wypadło ${number}${number===0?' · zero':ROULETTE_RED.has(number)?' · czerwone':' · czarne'}. ${payout?`Wypłata $${payout}.`:'Zakład przegrywa.'}`});
    this.revision++;
    return {changed:true,payout};
  }
  command(action:CasinoGameAction,wallet:number,now=Date.now()):CasinoGameResult {
    if(!Number.isSafeInteger(wallet)||wallet<0)return no('Niepoprawny portfel.');
    if(!action||typeof action!=='object'||!Number.isSafeInteger(action.version)||action.version!==this.revision)return no('Stan gry się zmienił. Wybierz akcję ponownie.');
    if(!['blackjackDeal','blackjackHit','blackjackStand','blackjackDouble','blackjackForfeit','rouletteSpin'].includes(action.kind))return no('Nieznana gra kasyna.');
    if(this.roulette.status==='spinning')return no('Koło wciąż się kręci. Poczekaj, aż kulka zatrzyma się w kieszeni.');
    const active=this.blackjack.status==='playing';
    if(action.kind==='blackjackDeal'||action.kind==='rouletteSpin'){
      if(active)return no('Dokończ bieżące rozdanie blackjacka.');
      if(!Number.isSafeInteger(action.bet)||action.bet<CASINO_MIN_BET||action.bet>CASINO_MAX_BET||action.bet%10!==0)return no('Zakład: od $10 do $500, co $10.');
      if(wallet<action.bet)return no('Brak gotówki na ten zakład.');
      if(action.kind==='rouletteSpin'){
        if(!['red','black','odd','even','straight'].includes(action.choice))return no('Niepoprawny rodzaj zakładu.');
        if(action.choice==='straight'&&(!Number.isInteger(action.number)||action.number! < 0||action.number! > 36))return no('Wybierz liczbę od 0 do 36.');
        if(!Number.isFinite(now)||now<0)return no('Niepoprawny zegar gry.');
        this.now=now;this.rouletteStartedAt=now;this.rouletteResumeAt=now;this.rouletteResumeElapsed=0;
        const spin=createRouletteSpin(++this.spinId,()=>this.random(),this.roulette.spin);
        this.roulette={status:'spinning',spin,elapsedMs:0,betNumber:action.choice==='straight'?action.number!:null,number:null,choice:action.choice,stake:action.bet,payout:0,history:[...this.roulette.history],message:'Koło nabiera prędkości. Zakład przyjęty — poczekaj na kulkę.'};
        this.revision++;return {ok:true,wallet:wallet-action.bet,message:this.roulette.message};
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

import { act, createPokerTable, dealHand, foldPokerSeat, legalActions } from './poker';
import type { PokerAction, PokerState } from './poker-model';

export const TOURNAMENT_BUY_IN=250;
export const TOURNAMENT_CHIPS=1000;
export const TOURNAMENT_HAND_LIMIT=24;
export const TOURNAMENT_TURN_MS=30000;
export type TournamentAction=
 | {kind:'open'|'join'|'start'|'next'|'withdraw'}
 | {kind:'action';action:PokerAction;version:number};
export interface TournamentMember {id:string;name:string}
export interface TournamentParticipant {id:string;name:string;chips:number;status:'registered'|'playing'|'eliminated'|'withdrawn'|'winner'}
export interface TournamentSnapshot {
 status:'idle'|'registration'|'playing'|'completed';version:number;buyIn:number;pot:number;level:number;handLimit:number;
 participants:TournamentParticipant[];winnerId:string|null;winnerIds:string[];message:string;turnDeadline:number|null;poker:PokerState|null;
}
export type TournamentResult={ok:true;wallet:number;message:string}|{ok:false;reason:string};
const no=(reason:string):TournamentResult=>({ok:false,reason});
const handActive=(table:PokerState)=>table.phase!=='waiting'&&table.phase!=='showdown';
const clone=<T>(value:T):T=>structuredClone(value);

/** Finite, no-rebuy friends tournament. Only the host owns the real deck and payouts. */
export class PokerTournament {
 private status:TournamentSnapshot['status']='idle';
 private version=0;
 private participants:TournamentParticipant[]=[];
 private table:PokerState|null=null;
 private pot=0;
 private winnerIds:string[]=[];
 private message='Wpisowe $250. Żetony turniejowe nie są wymieniane na gotówkę; zwycięzca zabiera pulę.';
 private deadline:number|null=null;
 private lobbyDeadline=0;
 private now=0;
 private credits:{id:string;amount:number}[]=[];
 constructor(private readonly hostId:string,private readonly seed?:number){}

 contains(id:string){return (this.status==='registration'||this.status==='playing')&&this.participants.some(person=>person.id===id&&(person.status==='registered'||person.status==='playing'));}
 command(id:string,action:TournamentAction,members:TournamentMember[],wallet:number,now:number):TournamentResult {
  this.advance(members,now);
  if(!members.some(person=>person.id===id))return no('Nie należysz do pokoju.');
  if(!Number.isSafeInteger(wallet)||wallet<0)return no('Niepoprawny portfel.');
  if(!action||typeof action!=='object'||!['open','join','start','next','withdraw','action'].includes(action.kind))return no('Nieznana akcja turnieju.');
  if(action.kind==='open'){
   if(id!==this.hostId)return no('Turniej otwiera gospodarz.');
   if(this.status==='registration'||this.status==='playing')return no('Turniej już trwa.');
   this.status='registration';this.participants=[];this.table=null;this.pot=0;this.winnerIds=[];this.deadline=null;this.lobbyDeadline=this.now+120000;
   this.message='Zapisy otwarte przez dwie minuty. Podejdź do stanowiska turniejowego i wpłać $250.';this.version++;
  }else if(action.kind==='join'){
   if(this.status!=='registration')return no('Poczekaj na otwarcie zapisów.');
   if(this.participants.some(person=>person.id===id))return no('Masz już miejsce w tym turnieju.');
   if(this.participants.length>=4)return no('Turniej ma już czterech uczestników.');
   if(wallet<TOURNAMENT_BUY_IN)return no('Potrzebujesz $250 na wpisowe.');
   wallet-=TOURNAMENT_BUY_IN;this.pot+=TOURNAMENT_BUY_IN;
   this.participants.push({id,name:members.find(person=>person.id===id)!.name,chips:TOURNAMENT_CHIPS,status:'registered'});
   this.message=`Zapisani: ${this.participants.length}/4. Gospodarz może rozpocząć przy co najmniej dwóch graczach.`;this.version++;
  }else if(action.kind==='start'){
   if(id!==this.hostId)return no('Karty turnieju rozdaje gospodarz.');
   if(this.status!=='registration'||this.participants.length<2)return no('Zapiszcie co najmniej dwóch uczestników.');
   this.status='playing';this.table=createPokerTable(this.seed,TOURNAMENT_CHIPS);
   this.table.players=this.table.players.map((player,index)=>{
    const person=this.participants[index];
    if(person)person.status='playing';
    return {...player,id:person?.id??`empty-${index}`,name:person?.name??'Wolne miejsce',stack:person?TOURNAMENT_CHIPS:0,folded:!person};
   });
   this.beginHand();
  }else if(action.kind==='withdraw'){
   const person=this.participants.find(entry=>entry.id===id);
   if(!person||!this.contains(id))return no('Nie uczestniczysz w tym turnieju.');
   if(this.status==='registration'){
    this.participants=this.participants.filter(entry=>entry.id!==id);this.pot-=TOURNAMENT_BUY_IN;wallet+=TOURNAMENT_BUY_IN;
    this.message='Uczestnik wypisał się przed startem. Wpisowe zwrócone.';this.version++;
   }else this.forfeit(id);
  }else if(action.kind==='next'){
   if(this.status!=='playing'||!this.contains(id)||!this.table)return no('Nie uczestniczysz w trwającym turnieju.');
   if(handActive(this.table))return no('Najpierw dokończ bieżące rozdanie.');
   this.beginHand();
  }else if(action.kind==='action'){
   if(this.status!=='playing'||!this.table||!this.contains(id))return no('Nie uczestniczysz w trwającym turnieju.');
   if(!Number.isSafeInteger(action.version)||action.version!==this.version)return no('Stan turnieju się zmienił. Wybierz ruch ponownie.');
   const index=this.table.players.findIndex(player=>player.id===id);
   if(!action.action||typeof action.action!=='object')return no('Niepoprawna akcja pokerowa.');
   const result=act(this.table,index,action.action);
   if(!result.ok)return no(result.reason);
   this.table=result.state;this.changed();this.afterHand();
  }
  return {ok:true,wallet,message:this.message};
 }
 update(members:TournamentMember[],now:number):{credits:{id:string;amount:number}[]} {
  this.advance(members,now);const credits=this.credits;this.credits=[];return {credits};
 }
 snapshot(id:string):TournamentSnapshot {
  const table=this.table;
  const people=this.participants.map(person=>({...person,chips:table?.players.find(player=>player.id===person.id)?.stack??person.chips}));
  let poker:PokerState|null=null;
  if(table&&this.participants.some(person=>person.id===id)){
   const viewer=table.players.findIndex(player=>player.id===id);
   if(viewer>=0){
    poker=clone(table);const order=table.players.map((_,index)=>(index+viewer)%table.players.length),count=order.length;
    poker.players=order.map((canonical,index)=>{
     const player=clone(table.players[canonical]);
     if(index!==0&&!(table.phase==='showdown'&&!player.folded))player.hole=player.hole.map(()=>({rank:0,suit:'♠'}));
     return player;
    });
    poker.dealer=(table.dealer-viewer+count)%count;poker.actor=table.actor===null?null:(table.actor-viewer+count)%count;
    poker.winners=table.winners.map(index=>(index-viewer+count)%count);poker.payouts=order.map(index=>table.payouts[index]);poker.raiseRights=order.map(index=>table.raiseRights[index]);poker.deck=[];poker.seed=0;
   }
  }
  return {status:this.status,version:this.version,buyIn:TOURNAMENT_BUY_IN,pot:this.pot,level:table?Math.floor(Math.max(0,table.handNumber-1)/3)+1:1,handLimit:TOURNAMENT_HAND_LIMIT,participants:people,winnerId:this.winnerIds[0]??null,winnerIds:[...this.winnerIds],message:this.message,turnDeadline:this.deadline,poker};
 }
 private advance(members:TournamentMember[],now:number){
  if(!Number.isFinite(now)||now<0)return;
  this.now=Math.max(this.now,now);
  const connected=new Set(members.map(person=>person.id));
  if(this.status==='registration'){
   for(const person of [...this.participants])if(!connected.has(person.id)){
    this.participants=this.participants.filter(entry=>entry.id!==person.id);this.pot-=TOURNAMENT_BUY_IN;
    this.credits.push({id:person.id,amount:TOURNAMENT_BUY_IN});this.version++;
   }
   if(this.now>=this.lobbyDeadline){
    for(const person of this.participants)this.credits.push({id:person.id,amount:TOURNAMENT_BUY_IN});
    this.status='completed';this.pot=0;this.participants=[];this.message='Zapisy wygasły. Wszystkie wpisowe zwrócono.';this.version++;
   }
  }
  if(this.status!=='playing'||!this.table)return;
  for(const person of this.participants)if(person.status==='playing'&&!connected.has(person.id))this.forfeit(person.id);
  if(this.status!=='playing'||this.deadline===null||this.now<this.deadline||!handActive(this.table)||this.table.actor===null)return;
  const index=this.table.actor,legal=legalActions(this.table,index),result=act(this.table,index,legal.canCheck?{type:'check'}:{type:'fold'});
  if(result.ok){this.table=result.state;this.changed();this.afterHand();}
 }
 private beginHand(){
  if(!this.table||this.status!=='playing')return;
  const alive=this.table.players.filter(player=>player.stack>0);
  if(alive.length<=1||this.table.handNumber>=TOURNAMENT_HAND_LIMIT){this.finish();return;}
  // The cash poker engine expects its first seat to have chips. Rotate all
  // canonical seat-indexed information together when that participant busts.
  const first=this.table.players.findIndex(player=>player.stack>0);
  if(first>0){
   const table=this.table,order=table.players.map((_,index)=>(index+first)%table.players.length);
   table.players=order.map(index=>table.players[index]);table.dealer=(table.dealer-first+4)%4;
   table.payouts=order.map(index=>table.payouts[index]);table.raiseRights=order.map(index=>table.raiseRights[index]);table.winners=table.winners.map(index=>(index-first+4)%4);
  }
  const multiplier=2**Math.min(7,Math.floor(this.table.handNumber/3));
  this.table.smallBlind=5*multiplier;this.table.bigBlind=10*multiplier;
  const result=dealHand(this.table);
  if(!result.ok){this.message=result.reason;return;}
  this.table=result.state;this.message=`Turniej · rozdanie ${this.table.handNumber}/${TOURNAMENT_HAND_LIMIT} · ciemne ${this.table.smallBlind}/${this.table.bigBlind}.`;
  this.changed();this.afterHand();
 }
 private forfeit(id:string){
  if(this.status!=='playing'||!this.table)return;
  const person=this.participants.find(entry=>entry.id===id);
  if(!person||person.status!=='playing')return;
  const index=this.table.players.findIndex(player=>player.id===id);
  if(index<0)return;
  if(handActive(this.table)&&!this.table.players[index].folded){const result=foldPokerSeat(this.table,index);if(result.ok)this.table=result.state;}
  this.table.players[index].stack=0;this.table.players[index].folded=true;person.status='withdrawn';person.chips=0;
  this.message=`${person.name} opuszcza turniej i traci pozostałe żetony.`;this.changed();this.afterHand();
  if(this.status==='playing'&&this.participants.filter(entry=>entry.status==='playing').length<=1)this.finish();
 }
 private changed(){this.version++;this.deadline=this.table&&handActive(this.table)?this.now+TOURNAMENT_TURN_MS:null;}
 private afterHand(){
  if(!this.table)return;
  if(!handActive(this.table))for(const person of this.participants){
   person.chips=this.table.players.find(player=>player.id===person.id)?.stack??0;
   if(person.status==='playing'&&person.chips===0)person.status='eliminated';
  }
  const live=this.participants.filter(person=>person.status==='playing');
  if(live.length<=1||(!handActive(this.table)&&this.table.handNumber>=TOURNAMENT_HAND_LIMIT))this.finish();
 }
 private finish(){
  if(this.status!=='playing'||!this.table)return;
  const live=this.participants.filter(person=>person.status==='playing');
  const high=Math.max(...live.map(person=>this.table!.players.find(player=>player.id===person.id)?.stack??0));
  const winners=live.filter(person=>(this.table!.players.find(player=>player.id===person.id)?.stack??0)===high);
  this.status='completed';this.deadline=null;this.winnerIds=winners.map(person=>person.id);
  const share=winners.length?Math.floor(this.pot/winners.length):0;
  winners.forEach((person,index)=>{person.status='winner';this.credits.push({id:person.id,amount:share+(index<this.pot-share*winners.length?1:0)});});
  this.message=winners.length?`Turniej zakończony! ${winners.map(person=>person.name).join(', ')}: pula $${this.pot}${winners.length>1?' podzielona po remisie':''}.`:'Turniej zakończony bez pozostałych uczestników.';
  this.version++;
 }
}

import './casino-games.css';
import type { CasinoGameAction, CasinoGamesSnapshot, RouletteChoice } from './casino-games';
import { blackjackValue, ROULETTE_RED } from './casino-games';
import type { CasinoStation } from './casino-games-location';
import { legalActions } from './poker';
import type { Card, PokerAction } from './poker-model';
import type { TournamentAction, TournamentSnapshot } from './poker-tournament';

export interface CasinoGamesCallbacks {
 getState():CasinoGamesSnapshot;getWallet():number;onAction(action:CasinoGameAction):void;
 getTournament():TournamentSnapshot|null;onTournament(action:TournamentAction):void;
 isOnline():boolean;isHost():boolean;getSelfId():string;
 onOpen():void;onClose():void;onMessage(message:string):void;
}
const safe=(value:string)=>value.replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!));
const cash=(value:number)=>`$${Math.max(0,value).toLocaleString('pl-PL')}`;
const cards=(hand:Card[])=>hand.map(card=>`<span class="casino-playing-card ${card.suit==='♥'||card.suit==='♦'?'red':''} ${card.rank===0?'card-back':''}">${card.rank===0?'✦':`${({11:'J',12:'Q',13:'K',14:'A'} as Record<number,string>)[card.rank]??card.rank}${card.suit}`}</span>`).join('');
const stationNames:Record<CasinoStation,string>={blackjack:'BLACKJACK · 21',roulette:'RULETKA EUROPEJSKA',tournament:'TURNIEJ PRZYJACIÓŁ'};
type ActionInput<T=CasinoGameAction>=T extends CasinoGameAction?Omit<T,'version'>:never;

/** Small betting panel leaves the actual casino interior visible. */
export class CasinoGamesUI {
 private root:HTMLDivElement|null=null;
 private station:CasinoStation='blackjack';
 private signature='';
 private bet=50;
 private choice:RouletteChoice='red';
 private straight=0;
 private raise=20;
 private previousFocus:HTMLElement|null=null;
 private notice='';
 constructor(private parent:HTMLElement,private callbacks:CasinoGamesCallbacks){}
 get active(){return this.root!==null;}
 get activeStation(){return this.active?this.station:null;}
 open(station:CasinoStation){
  if(this.root){this.station=station;this.refresh(true);return;}
  this.station=station;this.signature='';this.notice='';this.previousFocus=document.activeElement as HTMLElement;
  this.root=document.createElement('div');this.root.id='casino-games-dialog';this.root.className='casino-games-overlay';
  this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');this.root.setAttribute('aria-labelledby','casino-games-title');
  this.root.addEventListener('keydown',event=>{
   event.stopPropagation();
   if(event.key==='Escape'){event.preventDefault();this.handleEscape();}
   if(event.key==='Tab'){
    const controls=[...this.root!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)')],first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first){last?.focus();event.preventDefault();}
    else if(!event.shiftKey&&document.activeElement===last){first?.focus();event.preventDefault();}
   }
  });
  this.parent.append(this.root);this.callbacks.onOpen();this.refresh(true);this.root.querySelector<HTMLButtonElement>('#casino-games-close')?.focus();
 }
 close(){if(!this.root)return;this.root.remove();this.root=null;this.callbacks.onClose();if(this.previousFocus?.isConnected)this.previousFocus.focus({preventScroll:true});this.previousFocus=null;}
 handleEscape(){this.close();}
 report(message:string){this.notice=message;this.refresh();}
 refresh(force=false){
  if(!this.root)return;
  const state=this.callbacks.getState(),tournament=this.callbacks.getTournament(),wallet=this.callbacks.getWallet();
  const signature=JSON.stringify([this.station,state,tournament,wallet,this.callbacks.isOnline(),this.callbacks.isHost(),this.notice]);
  if(!force&&signature===this.signature)return;
  this.signature=signature;
  const focus=document.activeElement instanceof HTMLElement&&this.root.contains(document.activeElement)?document.activeElement.id:'';
  const scroll=this.root.querySelector('.casino-games-panel')?.scrollTop??0;
  const currentMessage=this.station==='blackjack'?state.blackjack.message:this.station==='roulette'?state.roulette.message:tournament?.message;
  const notice=this.notice&&this.notice!==currentMessage?this.notice:'';
  this.root.innerHTML=`<section class="casino-games-panel"><header><div><span class="casino-games-eyebrow">SAPPHIRE CLUB · WIRTUALNE ŻETONY</span><h2 id="casino-games-title">${stationNames[this.station]}</h2></div><button id="casino-games-close" aria-label="Odejdź od stanowiska">×</button></header><div class="casino-games-wallet">${this.callbacks.isOnline()?'Portfel pokoju':'Twoja gotówka'} <strong>${cash(wallet)}</strong></div>${this.station==='blackjack'?this.blackjack(state):this.station==='roulette'?this.roulette(state):this.tournament(tournament)}${notice?`<p class="casino-games-notice" role="status">${safe(notice)}</p>`:''}<footer>Wyłącznie gotówka z gry. Bez wpłat i wypłat prawdziwych pieniędzy.</footer></section>`;
  const query=<T extends HTMLElement=HTMLElement>(selector:string)=>this.root!.querySelector<T>(selector);
  const on=(id:string,callback:()=>void)=>query<HTMLButtonElement>(id)?.addEventListener('click',callback);
  on('#casino-games-close',()=>this.close());
  const bet=query<HTMLInputElement>('#casino-bet');if(bet)bet.oninput=()=>{this.bet=Number(bet.value);};
  const choice=query<HTMLSelectElement>('#roulette-choice');if(choice)choice.onchange=()=>{this.choice=choice.value as RouletteChoice;query('#roulette-number-wrap')?.classList.toggle('hidden',this.choice!=='straight');};
  const straight=query<HTMLInputElement>('#roulette-number');if(straight)straight.oninput=()=>{this.straight=Number(straight.value);};
  const issue=(action:ActionInput)=>{this.notice='';this.callbacks.onAction({...action,version:this.callbacks.getState().version});this.refresh();};
  on('#blackjack-deal',()=>issue({kind:'blackjackDeal',bet:this.bet}));
  on('#blackjack-hit',()=>issue({kind:'blackjackHit'}));on('#blackjack-stand',()=>issue({kind:'blackjackStand'}));on('#blackjack-double',()=>issue({kind:'blackjackDouble'}));
  on('#blackjack-forfeit',()=>issue({kind:'blackjackForfeit'}));
  on('#roulette-spin',()=>issue({kind:'rouletteSpin',bet:this.bet,choice:this.choice,number:this.straight}));
  const tour=(action:TournamentAction)=>{this.notice='';this.callbacks.onTournament(action);this.refresh();};
  for(const kind of ['open','join','start','next','withdraw'] as const)on(`#tournament-${kind}`,()=>tour({kind}));
  const poker=(action:PokerAction)=>tour({kind:'action',action,version:this.callbacks.getTournament()?.version??-1});
  on('#tournament-fold',()=>poker({type:'fold'}));on('#tournament-check',()=>poker({type:'check'}));on('#tournament-call',()=>poker({type:'call'}));on('#tournament-allin',()=>poker({type:'allIn'}));on('#tournament-raise',()=>poker({type:'raise',to:this.raise}));
  const raise=query<HTMLInputElement>('#tournament-raise-to');if(raise)raise.oninput=()=>{this.raise=Number(raise.value);};
  const panel=query('.casino-games-panel');if(panel)panel.scrollTop=scroll;
  if(focus)query<HTMLElement>(`#${CSS.escape(focus)}`)?.focus({preventScroll:true});
 }
 private betInput(){return `<label class="casino-bet-label">Zakład ($10–$500, co $10)<input id="casino-bet" type="number" min="10" max="500" step="10" value="${Number.isFinite(this.bet)?this.bet:50}" inputmode="numeric"></label>`;}
 private blackjack(state:CasinoGamesSnapshot){
  const hand=state.blackjack,playing=hand.status==='playing';
  return `<p class="casino-games-rules">Cel: wynik bliższy 21 niż krupier. As liczy się jako 1 lub 11. Krupier zostaje przy 17. Blackjack płaci 3:2.</p><div class="casino-card-row"><span>KRUPIER ${playing?'':hand.dealer.length?`· ${blackjackValue(hand.dealer)}`:''}</span><div>${cards(hand.dealer)}</div></div><div class="casino-card-row"><span>TY ${hand.player.length?`· ${blackjackValue(hand.player)}`:''}</span><div>${cards(hand.player)}</div></div><p id="blackjack-message" class="casino-games-result" role="status">${safe(hand.message)}</p>${playing?`<div class="casino-games-actions"><button id="blackjack-hit">Dobierz</button><button id="blackjack-stand">Zostań</button><button id="blackjack-double" ${!hand.canDouble||this.callbacks.getWallet()<hand.stake?'disabled':''}>Podwój · ${cash(hand.stake)}</button><button id="blackjack-forfeit" class="casino-game-secondary">Pas · stracisz zakład</button></div><small>Postawiono ${cash(hand.stake)}. Zamknięcie panelu pozostawia rozdanie otwarte; opuszczenie kasyna oznacza pas.</small>`:`${this.betInput()}<button class="casino-game-primary" id="blackjack-deal">${hand.status==='idle'?'Rozdaj karty':'Nowe rozdanie'}</button>${hand.status==='settled'?`<small>Zakład ${cash(hand.stake)} · wypłata ${cash(hand.payout)} (zawiera zwrot stawki).</small>`:''}`}`;
 }
 private roulette(state:CasinoGamesSnapshot){
  const spin=state.roulette;
  return `<p class="casino-games-rules">Jedno zero. Kolor i parzystość: wypłata 2× stawka. Wybrana liczba: 36×. Zero przegrywa wszystkie zakłady poza zakładem na 0.</p><div class="roulette-wheel-result ${spin.number===0?'green':spin.number!==null&&ROULETTE_RED.has(spin.number)?'red':'black'}" aria-label="Wynik ruletki">${spin.number??'♧'}</div><p class="casino-games-result" role="status">${safe(spin.message)}</p><div class="casino-games-form">${this.betInput()}<label>Rodzaj zakładu<select id="roulette-choice">${([['red','Czerwone'],['black','Czarne'],['odd','Nieparzyste'],['even','Parzyste'],['straight','Konkretna liczba']] as const).map(([value,name])=>`<option value="${value}" ${this.choice===value?'selected':''}>${name}</option>`).join('')}</select></label><label id="roulette-number-wrap" class="${this.choice==='straight'?'':'hidden'}">Liczba (0–36)<input id="roulette-number" type="number" min="0" max="36" step="1" value="${Number.isFinite(this.straight)?this.straight:0}" inputmode="numeric"></label></div><button class="casino-game-primary" id="roulette-spin" ${state.blackjack.status==='playing'?'disabled':''}>Zakręć kołem</button><div class="roulette-history" aria-label="Ostatnie wyniki">${spin.history.map(number=>`<span class="${number===0?'green':ROULETTE_RED.has(number)?'red':'black'}">${number}</span>`).join('')}</div>`;
 }
 private tournament(state:TournamentSnapshot|null){
  if(!this.callbacks.isOnline()||!state)return '<p>Turniej jest dostępny w pokoju online dla 2–4 osób. Utwórz pokój, zaproś znajomych i spotkajcie się przy tym stanowisku.</p>';
  const self=this.callbacks.getSelfId(),participant=state.participants.find(person=>person.id===self),enrolled=participant?.status==='registered'||participant?.status==='playing',host=this.callbacks.isHost(),table=state.poker;
  const legal=table?legalActions(table,0):null;
  let controls='';
  if(state.status==='idle'||state.status==='completed')controls=host?'<button class="casino-game-primary" id="tournament-open">Otwórz zapisy do turnieju</button>':'<p>Gospodarz otwiera kolejne zapisy.</p>';
  if(state.status==='registration')controls=`${!participant?`<button id="tournament-join" class="casino-game-primary" ${this.callbacks.getWallet()<state.buyIn?'disabled':''}>Zapisz się · ${cash(state.buyIn)}</button>`:'<button id="tournament-withdraw">Wypisz się · zwrot wpisowego</button>'}${host?`<button id="tournament-start" ${state.participants.length<2?'disabled':''}>Rozpocznij turniej</button>`:''}`;
  if(state.status==='playing'&&enrolled&&table){
   if(table.phase==='showdown')controls='<button id="tournament-next" class="casino-game-primary">Następne rozdanie</button>';
   else if(legal?.canFold){
    if(this.raise<legal.minRaiseTo||this.raise>legal.maxRaiseTo)this.raise=legal.minRaiseTo;
    controls=`<button id="tournament-fold">Pas</button><button id="tournament-check" ${!legal.canCheck?'disabled':''}>Czekaj</button><button id="tournament-call" ${!legal.canCall?'disabled':''}>Sprawdź ${legal.callAmount}</button><button id="tournament-allin" ${!legal.canAllIn?'disabled':''}>All-in</button>${legal.canRaise?`<label>Podbij do<input id="tournament-raise-to" type="number" min="${legal.minRaiseTo}" max="${legal.maxRaiseTo}" step="1" value="${this.raise}"></label><button id="tournament-raise">Podbij</button>`:''}`;
   }else controls='<p>Czekasz na ruch pozostałych graczy.</p>';
   controls+='<button id="tournament-withdraw" class="casino-game-secondary">Opuść turniej · tracisz wpisowe</button>';
  }
  return `<p class="casino-games-rules">2–4 osoby · wpisowe ${cash(state.buyIn)} · 1000 żetonów · bez dokupowania. Ciemne rosną co 3 rozdania. Najpóźniej po ${state.handLimit} rozdaniach wygrywa lider; remis dzieli pulę.</p><div class="tournament-summary"><strong>Pula ${cash(state.pot)}</strong><span>Poziom ${state.level}${table?` · ciemne ${table.smallBlind}/${table.bigBlind}`:''}</span></div><p class="casino-games-result" role="status">${safe(state.message)}</p><ol class="tournament-roster">${state.participants.map(person=>`<li><span>${safe(person.name)}${person.id===self?' · TY':''}</span><strong>${person.chips} ż.</strong><small>${({registered:'Zapisany',playing:'W grze',eliminated:'Odpadł',withdrawn:'Opuścił',winner:'Zwycięzca'} as const)[person.status]}</small></li>`).join('')}</ol>${table?`<div class="casino-card-row"><span>STÓŁ · PULA ${table.pot} Ż.</span><div>${cards(table.board)}</div></div><div class="casino-card-row"><span>TWOJE KARTY</span><div>${cards(table.players[0].hole)}</div></div><p class="casino-games-table-message">${safe(table.message)}</p>`:''}<div class="casino-games-actions">${controls}</div>`;
 }
}

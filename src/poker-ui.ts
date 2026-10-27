import './poker.css';
import { act, advanceBots, createPokerTable, dealHand, evaluateHand, legalActions } from './poker';
import type { Card, PokerAction, PokerResult, PokerSeat, PokerState } from './poker-model';
import type { MultiplayerSession, MultiplayerState } from './multiplayer-model';

export interface PokerCallbacks {
  getWallet:()=>number;
  buyIn:(amount:number)=>boolean;
  onReserve:(chips:number)=>void;
  onCashOut:(chips:number)=>void;
  onClose:()=>void;
  onState?:(state:PokerState|null)=>void;
  onMessage?:(text:string)=>void;
}
const BUY_IN=200;
const streets:Record<string,string>={waiting:'Nowy stół',preflop:'Preflop',flop:'Flop',turn:'Turn',river:'River',showdown:'Rozliczenie'};
const suitNames:Record<string,string>={'♠':'pik','♥':'kier','♦':'karo','♣':'trefl'};
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const money=(amount:number)=>`$${Math.max(0,Math.round(amount)).toLocaleString('pl-PL')}`;
const rank=(card:Card)=>card.rank===14?'A':card.rank===13?'K':card.rank===12?'Q':card.rank===11?'J':String(card.rank);
const isHand=(state:PokerState)=>state.phase!=='waiting'&&state.phase!=='showdown';

/** Poker presentation owns no money. Its callbacks atomically update the game wallet. */
export class PokerUI {
  private root:HTMLDivElement|null=null;
  private state:PokerState|null=null;
  private visible=false;
  private claimedBuyIn=false;
  private destroyed=false;
  private leavePending=false;
  private timer:ReturnType<typeof setTimeout>|null=null;
  private raiseValue=0;
  private error='';
  private previousFocus:HTMLElement|null=null;
  private online:MultiplayerSession|null=null;
  private onlineUnsubscribe:(()=>void)|null=null;
  private onlineSignature='';
  private onlineWallet=0;
  private onlinePending=false;
  private onlineWait:ReturnType<typeof setTimeout>|null=null;
  constructor(private parent:HTMLElement,private callbacks:PokerCallbacks) {}
  get active(){return this.visible;}
  get snapshot():PokerState|null{return this.state?structuredClone(this.state):null;}
  get onlineMode(){return this.online!==null;}

  openOnline(session:MultiplayerSession){
    if(this.visible||this.destroyed)return;
    if(session.state.status!=='online'||!session.state.snapshot){this.callbacks.onMessage?.('Najpierw dołącz do pokoju online.');this.callbacks.onClose();return;}
    this.online=session;this.onlineSignature='';this.onlineWallet=session.state.snapshot.wallet;
    this.open();
    const unsubscribe=session.subscribe(state=>this.receiveOnline(state));
    if(this.visible&&this.online===session)this.onlineUnsubscribe=unsubscribe;else unsubscribe();
    if(this.visible&&this.online===session)this.receiveOnline(session.state);
  }
  /** End the room presentation after a lost connection, without sending an action. */
  closeOnline(){if(this.online&&this.visible)this.close(false);}

  open(){
    if(this.visible||this.destroyed)return;
    this.visible=true;this.state=null;this.claimedBuyIn=false;this.leavePending=false;this.error='';
    this.previousFocus=document.activeElement as HTMLElement;
    this.root=document.createElement('div');this.root.id='poker-root';this.root.className='poker-overlay';
    this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');this.root.setAttribute('aria-label',"Poker Texas Hold'em — Sapphire Club");this.root.tabIndex=-1;
    this.root.addEventListener('keydown',event=>{
      event.stopPropagation();
      if(event.key==='Escape'){event.preventDefault();this.handleEscape();return;}
      if(event.key==='Tab')this.trapFocus(event);
    });
    this.parent.append(this.root);this.callbacks.onState?.(null);this.render();
  }
  handleEscape(){if(this.visible)this.requestLeave();}
  destroy(){if(this.online&&this.visible)this.close();this.stopTimer();this.clearOnlineWait();this.onlineUnsubscribe?.();this.onlineUnsubscribe=null;this.online=null;this.visible=false;this.destroyed=true;this.root?.remove();this.root=null;this.state=null;this.callbacks.onState?.(null);}
  private query<T extends HTMLElement=HTMLElement>(selector:string):T|null{return this.root?.querySelector<T>(selector)??null;}
  private focusDefault(){(this.query<HTMLButtonElement>('button:not(:disabled)')??this.root)?.focus({preventScroll:true});}
  private stopTimer(){if(this.timer!==null){clearTimeout(this.timer);this.timer=null;}}
  private wallet(){return this.online?this.onlineWallet:this.callbacks.getWallet();}
  private clearOnlineWait(){if(this.onlineWait!==null){clearTimeout(this.onlineWait);this.onlineWait=null;}}
  private receiveOnline(current:MultiplayerState){
    if(!this.visible||!this.online)return;
    if(current.status!=='online'||!current.snapshot){this.callbacks.onMessage?.(current.message||'Połączenie z pokojem zostało zakończone.');this.close(false);return;}
    const snapshot=current.snapshot;
    const signature=JSON.stringify([snapshot.tableVersion,snapshot.seated,snapshot.wallet,current.message]);
    if(signature===this.onlineSignature)return;
    this.onlineSignature=signature;this.onlineWallet=snapshot.wallet;this.onlinePending=false;this.clearOnlineWait();
    this.error=current.message;this.state=snapshot.seated&&snapshot.poker?structuredClone(snapshot.poker):null;
    this.callbacks.onState?.(this.state?structuredClone(this.state):null);this.render();
  }
  private requestOnline(send:(session:MultiplayerSession)=>void){
    if(!this.online||this.onlinePending||!this.visible)return;
    this.onlinePending=true;this.error='';this.render();this.clearOnlineWait();
    this.onlineWait=setTimeout(()=>{this.onlineWait=null;if(!this.visible||!this.online)return;this.onlinePending=false;this.error='Brak potwierdzenia akcji. Sprawdź połączenie i spróbuj ponownie.';this.render();},8000);
    try{send(this.online);}catch(error){this.clearOnlineWait();this.onlinePending=false;this.error=error instanceof Error?error.message:'Nie udało się wysłać akcji.';this.render();}
  }
  private trapFocus(event:KeyboardEvent){
    const area=this.leavePending?this.query('#poker-leave-dialog'):this.root;
    const focusable=[...(area?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href],summary')??[])];
    const first=focusable[0],last=focusable.at(-1);
    if(!first){event.preventDefault();return;}
    if(event.shiftKey&&(document.activeElement===first||document.activeElement===this.root)){last?.focus();event.preventDefault();}
    else if(!event.shiftKey&&document.activeElement===last){first.focus();event.preventDefault();}
  }
  private begin(){
    if(this.state||!this.visible||this.claimedBuyIn)return;
    if(this.online){this.requestOnline(session=>session.sit());return;}
    if(this.callbacks.getWallet()<BUY_IN||!this.callbacks.buyIn(BUY_IN)){this.error='Potrzebujesz $200 w portfelu, aby usiąść przy stole.';this.render();return;}
    this.claimedBuyIn=true;
    const seed=globalThis.crypto?.getRandomValues(new Uint32Array(1))[0]||((Date.now()>>>0)||1);
    this.state=createPokerTable(seed,BUY_IN);this.callbacks.onReserve(this.state.players[0].stack);
    this.apply(dealHand(this.state));
  }
  private apply(result:PokerResult){
    if(!this.visible)return;
    if(!result.ok){this.error=result.reason;this.render();return;}
    this.error='';this.state=result.state;
    this.callbacks.onReserve(this.state.players[0]?.stack??0);
    this.callbacks.onState?.(structuredClone(this.state));
    this.render();this.scheduleBot();
  }
  private action(action:PokerAction){
    if(!this.state||!this.visible||this.leavePending||this.state.actor!==0)return;
    if(this.online){this.requestOnline(session=>session.action(action));return;}
    this.stopTimer();this.apply(act(this.state,0,action));
  }
  private scheduleBot(){
    this.stopTimer();const state=this.state;
    if(this.online)return;
    if(!this.visible||this.leavePending||!state||!isHand(state)||state.actor===null||state.actor===0)return;
    this.timer=setTimeout(()=>{
      this.timer=null;
      if(!this.visible||this.leavePending||!this.state||this.state.actor===null||this.state.actor===0)return;
      this.apply(advanceBots(this.state));
    },550);
  }
  private requestLeave(){
    if(!this.visible)return;
    if(this.leavePending){this.leavePending=false;this.render();this.scheduleBot();return;}
    if(this.state&&isHand(this.state)){
      this.leavePending=true;this.stopTimer();this.render();this.query<HTMLButtonElement>('#poker-stay')?.focus();return;
    }
    this.close();
  }
  private close(sendStand=true){
    if(!this.visible)return;
    this.stopTimer();this.clearOnlineWait();const refund=this.state?.players[0]?.stack??0;const hadBuyIn=this.claimedBuyIn,online=this.online;
    // Mark closed before callbacks: parent may destroy this component synchronously.
    this.visible=false;this.claimedBuyIn=false;this.leavePending=false;this.root?.remove();this.root=null;this.state=null;
    this.onlineUnsubscribe?.();this.onlineUnsubscribe=null;this.online=null;this.onlineSignature='';this.onlinePending=false;
    this.callbacks.onState?.(null);
    if(online&&sendStand){try{online.stand();}catch{this.callbacks.onMessage?.('Połączenie z pokojem zostało zakończone.');}}
    if(hadBuyIn&&!online)this.callbacks.onCashOut(refund);
    this.callbacks.onClose();this.previousFocus?.focus({preventScroll:true});
  }
  private card(card:Card|null,hidden=false,board=false){
    if(card&&card.rank<2)hidden=true;
    if(hidden)return'<span class="poker-card poker-card--back" data-testid="poker-hole-card" data-face="down" aria-label="Zakryta karta"><span>♠</span></span>';
    if(!card)return'<span class="poker-card poker-card--empty" aria-label="Nieodkryta karta wspólna"><span>◇</span></span>';
    const red=card.suit==='♥'||card.suit==='♦';
    return`<span class="poker-card ${red?'poker-card--red':''}" data-testid="${board?'poker-board-card':'poker-hole-card'}" data-face="up" aria-label="${rank(card)} ${suitNames[card.suit]}"><span class="poker-card-corner">${rank(card)}<small>${card.suit}</small></span><span class="poker-card-suit">${card.suit}</span><span class="poker-card-mirror">${rank(card)}<small>${card.suit}</small></span></span>`;
  }
  private blindSeats(state:PokerState){
    const inHand=state.players.map((seat,index)=>({seat,index})).filter(({seat})=>seat.hole.length>0);
    const next=(from:number)=>{for(let step=1;step<=state.players.length;step++){const index=(from+step)%state.players.length;if(inHand.some(item=>item.index===index))return index;}return from;};
    return inHand.length===2?{small:state.dealer,big:next(state.dealer)}:{small:next(state.dealer),big:next(next(state.dealer))};
  }
  private seat(seat:PokerSeat,index:number,state:PokerState){
    const blinds=this.blindSeats(state);const winning=state.winners.includes(index),acting=state.actor===index&&isHand(state);
    const reveal=index===0||(state.phase==='showdown'&&!seat.folded);
    const stateLabel=seat.hole.length===0?(seat.stack>0?'Czeka na rozdanie':this.online&&seat.id.startsWith('empty-')?'Wolne miejsce':'Bez żetonów'):seat.folded?'PAS':seat.allIn&&isHand(state)?'ALL-IN':acting?(index===0?'TWÓJ RUCH':'NA RUCHU'):winning?'WYGRANA':'';
    const position=['player','left','top','right'][index];
    const cards=seat.hole.length?seat.hole.map(card=>this.card(reveal?card:null,!reveal)).join(''):'<span class="poker-out">Poza rozdaniem</span>';
    return`<section id="poker-seat-${index}" class="poker-seat poker-seat--${position} ${acting?'poker-seat--acting':''} ${seat.folded?'poker-seat--folded':''} ${winning?'poker-seat--winner':''}" aria-label="${escape(seat.name)}${acting?', na ruchu':''}"><div class="poker-seat-cards">${cards}</div><div class="poker-seat-info"><span class="poker-avatar">${index===0?'TY':escape(seat.name.slice(0,1))}</span><div><strong>${escape(seat.name)}</strong><span id="poker-stack-${index}" class="poker-seat-stack">${money(seat.stack)}</span></div><span class="poker-position-tags">${state.phase!=='waiting'&&state.dealer===index?'<i title="Dealer">D</i>':''}${state.phase!=='waiting'&&blinds.small===index?'<i title="Mała ciemna">SB</i>':''}${state.phase!=='waiting'&&blinds.big===index?'<i title="Duża ciemna">BB</i>':''}</span></div><div class="poker-seat-status">${stateLabel?`<span>${stateLabel}</span>`:'<span>PRZY STOLE</span>'}${seat.bet>0?`<b>Stawka ${money(seat.bet)}</b>`:''}</div>${state.phase==='showdown'&&state.payouts[index]>0?`<span class="poker-seat-payout">+${money(state.payouts[index])}</span>`:''}</section>`;
  }
  private heroHand(state:PokerState){
    const hero=state.players[0];if(!hero?.hole.length)return'';
    if(state.board.length>=3){try{return evaluateHand([...hero.hole,...state.board]).name;}catch{return'Twoje karty';}}
    return hero.hole[0].rank===hero.hole[1].rank?'Para w ręku':'Twoje karty · poczekaj na flop';
  }
  private header(state:PokerState|null){
    const payout=state?.payouts.reduce((sum,value)=>sum+value,0)??0;
    return `<header class="poker-header poker-panel"><div class="poker-brand"><span>♠</span><div>SAPPHIRE CLUB<small>${this.online?'STÓŁ ONLINE · '+escape(this.online.state.snapshot?.code??''):'TEXAS HOLD’EM · SALA GIER'}</small></div></div>${state?`<div class="poker-header-meta"><span>BLINDY <b>${money(state.smallBlind)} / ${money(state.bigBlind)}</b></span><span>ROZDANIE <b>#${state.handNumber}</b></span><span class="poker-pot"><small>${state.phase==='showdown'?'ROZLICZONA PULA':'PULA'}</small><strong id="poker-pot">${money(state.phase==='showdown'?payout:state.pot)}</strong></span></div>`:'<span class="poker-header-welcome">Twój wieczór w Sapphire Club</span>'}<button id="poker-leave" class="poker-button poker-button--quiet">${state?'Wstań od stołu':'Wróć do sali'}</button></header><div class="poker-view-hint">PPM + ruch — rozejrzyj się <span>· Esc — wstań</span></div>`;
  }
  private render(){
    if(!this.visible||!this.root)return;
    const state=this.state;this.root.dataset.mode=this.online?'online':'solo';this.root.dataset.phase=state?.phase??'lobby';this.root.dataset.actor=state?.actor===null?'':String(state?.actor??'');
    if(!state){this.renderLobby();return;}
    const legal=legalActions(state,0);const humanTurn=state.actor===0&&isHand(state)&&!this.leavePending&&!this.onlinePending;
    const funded=state.players.filter(seat=>seat.stack>0).length;const canDeal=!isHand(state)&&state.players[0].stack>0&&funded>=2;
    const min=Math.max(0,Math.ceil(legal.minRaiseTo)),max=Math.max(min,Math.floor(legal.maxRaiseTo));
    this.raiseValue=Math.min(max,Math.max(min,this.raiseValue||min));
    this.root.innerHTML=`<div class="poker-shell">
      ${this.header(state)}
      <aside class="poker-opponents" aria-label="Gracze przy stole">${state.players.slice(1).map((seat,index)=>this.seat(seat,index+1,state)).join('')}</aside>
      <footer class="poker-dock poker-panel">
        <div class="poker-cards-row">
          <div class="poker-hero">${this.seat(state.players[0],0,state)}<span class="poker-hand-label">${escape(this.heroHand(state))}</span></div>
          <div class="poker-community"><div class="poker-street"><strong>${streets[state.phase]}</strong><span>KARTY WSPÓLNE</span></div><div class="poker-board" id="poker-board" aria-label="Karty wspólne">${Array.from({length:5},(_,index)=>this.card(state.board[index]??null,false,true)).join('')}</div></div>
          <div class="poker-round-message"><span class="poker-round-dot ${humanTurn?'poker-round-dot--you':''}"></span><div><strong id="poker-status" role="status" aria-live="polite">${this.onlinePending?'Wysyłanie akcji…':humanTurn?'Twoja kolej':this.online&&state.phase==='waiting'?(funded>=2?'Gotowi do rozdania':'Czekamy na graczy przy stole'):state.phase==='showdown'?'Rozdanie rozliczone':state.actor!==null?`${escape(state.players[state.actor]?.name??'Przeciwnik')} podejmuje decyzję…`:'Poczekaj na kolejne rozdanie'}</strong><small>${escape(this.error||state.message||'Wybierz akcję przy stole.')}</small><span class="poker-wallet">${this.online?'Portfel online':'Portfel'}: ${money(this.wallet())}${this.online?' · 30 s na ruch':''}</span></div></div>
        </div>
        ${isHand(state)?`<div class="poker-action-area" id="poker-actions"><div class="poker-actions"><button id="poker-fold" class="poker-button poker-button--fold" ${!humanTurn||!legal.canFold?'disabled':''}>Pas</button><button id="poker-check" class="poker-button" ${!humanTurn||!legal.canCheck?'disabled':''}>Czekaj</button><button id="poker-call" class="poker-button poker-button--mint" ${!humanTurn||!legal.canCall?'disabled':''}>Sprawdź ${money(legal.callAmount)}</button><button id="poker-allin" class="poker-button poker-button--outline" ${!humanTurn||!legal.canAllIn?'disabled':''}>All-in ${money(state.players[0].stack)}</button></div><div class="poker-raise-control"><label for="poker-raise-amount">Podbij do <strong id="poker-raise-value">${money(this.raiseValue)}</strong></label><input id="poker-raise-amount" aria-label="Łączna stawka podbicia" type="range" min="${min}" max="${max}" step="1" value="${this.raiseValue}" ${!humanTurn||!legal.canRaise?'disabled':''}><button id="poker-raise" class="poker-button poker-button--gold" ${!humanTurn||!legal.canRaise?'disabled':''}>Podbij</button></div></div>`:`<div class="poker-result-actions" id="poker-actions"><button id="poker-next-hand" class="poker-button poker-button--gold" ${!canDeal||this.onlinePending?'disabled':''}>${state.phase==='waiting'?'Rozdaj karty →':'Następne rozdanie →'}</button><button id="poker-cashout" class="poker-button">Zabierz ${money(state.players[0].stack)} i wstań</button>${!canDeal?`<small>${this.online&&funded<2&&state.players[0].stack>0?'Do rozdania potrzeba co najmniej dwóch graczy przy stole.':state.players[0].stack<=0?'Skończyły ci się żetony. Możesz ponownie opłacić wpisowe.':'Pozostali gracze zakończyli sesję. Możesz usiąść ponownie.'}</small>`:''}</div>`}
      </footer>
    </div>${this.leavePending?this.leaveDialog():''}`;
    this.bindActions();
    if(this.leavePending)this.query<HTMLButtonElement>('#poker-stay')?.focus();
    else if(!isHand(state))this.query<HTMLButtonElement>(canDeal?'#poker-next-hand':'#poker-cashout')?.focus({preventScroll:true});
    else if(humanTurn)this.query<HTMLButtonElement>(legal.canCheck?'#poker-check':legal.canCall?'#poker-call':'#poker-fold')?.focus({preventScroll:true});
  }
  private renderLobby(){
    if(!this.root)return;
    const wallet=this.wallet();
    this.root.innerHTML=`<div class="poker-shell">${this.header(null)}<section class="poker-lobby poker-panel"><div class="poker-eyebrow">PRZY STOLE · SAPPHIRE CLUB</div><h1>Texas Hold’em</h1><p class="poker-lobby-description">${this.online?'Usiądź ze znajomymi przy wspólnym stole.<br>Rozdanie można rozpocząć od dwóch graczy.':'Zajmij miejsce przy stole.<br>Maya, Viktor i Leon czekają na rozdanie.'}</p><div class="poker-lobby-stakes"><span>WPISOWE<strong>${money(BUY_IN)}</strong></span><span>BLINDY<strong>$5 / $10</strong></span><span>GRACZE<strong>${this.online?'2–4 ONLINE':'1 + 3 NPC'}</strong></span></div><button id="poker-buyin" class="poker-button poker-button--gold poker-buyin" ${wallet<BUY_IN||this.onlinePending?'disabled':''}>${this.onlinePending?'Zajmowanie miejsca…':'Usiądź za '+money(BUY_IN)} <span>→</span></button><div class="poker-lobby-wallet">${this.online?'Portfel tej sesji online':'Twój portfel'}: <strong>${money(wallet)}</strong>${wallet<BUY_IN?`<span>${this.online?'Brak środków w tej sesji online.':'Zdobądź gotówkę w mieście, aby opłacić wpisowe.'}</span>`:''}</div>${this.error?`<p class="poker-error" role="alert">${escape(this.error)}</p>`:''}<details class="poker-rules"><summary>Jak grać?</summary><p>Ułóż najlepszy układ pięciu kart z dwóch własnych i pięciu wspólnych. Flop odkrywa trzy karty, potem turn i river. Możesz spasować, czekać, sprawdzić lub podbić. All-in stawia pozostałe żetony. Po rozdaniu możesz zagrać ponownie albo zabrać swój stos.</p><p>${this.online?'Na ruch masz 30 sekund. Po upływie czasu następuje czekanie lub pas. Wyjście od stołu oznacza pas; niewykorzystane żetony wracają do portfela tej sesji. Gospodarz musi pozostać w pokoju.':'Gotówka jest wirtualna. Odświeżenie lub wyjście podczas rozdania oznacza pas; niewykorzystane żetony wracają do portfela.'}</p></details></section></div>`;
    this.query<HTMLButtonElement>('#poker-buyin')?.addEventListener('click',()=>this.begin());
    this.query<HTMLButtonElement>('#poker-leave')?.addEventListener('click',()=>this.requestLeave());
    this.query<HTMLButtonElement>('#poker-buyin:not(:disabled)')?.focus({preventScroll:true});
  }
  private leaveDialog(){
    const chips=this.state?.players[0]?.stack??0,committed=this.state?.players[0]?.contributed??0;
    return`<div class="poker-confirm-overlay"><section id="poker-leave-dialog" class="poker-leave-dialog" role="alertdialog" aria-modal="true" aria-labelledby="poker-leave-heading"><span>ODEJŚCIE OD STOŁU</span><h2 id="poker-leave-heading">Zakończyć to rozdanie?</h2><p>Odejście oznacza pas. Postawione ${money(committed)} pozostanie w puli, a ${money(chips)} niewykorzystanych żetonów wróci do twojego portfela.</p><div><button id="poker-stay" class="poker-button poker-button--gold">Zostań przy stole</button><button id="poker-confirm-leave" class="poker-button">Spasuj i odejdź</button></div></section></div>`;
  }
  private bindActions(){
    const on=(id:string,action:()=>void)=>this.query<HTMLButtonElement>(id)?.addEventListener('click',action);
    on('#poker-leave',()=>this.requestLeave());on('#poker-fold',()=>this.action({type:'fold'}));on('#poker-check',()=>this.action({type:'check'}));on('#poker-call',()=>this.action({type:'call'}));on('#poker-allin',()=>this.action({type:'allIn'}));on('#poker-raise',()=>this.action({type:'raise',to:this.raiseValue}));
    on('#poker-next-hand',()=>{if(this.online)this.requestOnline(session=>session.deal());else if(this.state)this.apply(dealHand(this.state));});on('#poker-cashout',()=>this.close());
    on('#poker-stay',()=>{this.leavePending=false;this.render();this.scheduleBot();});on('#poker-confirm-leave',()=>this.close());
    this.query<HTMLInputElement>('#poker-raise-amount')?.addEventListener('input',event=>{this.raiseValue=Number((event.target as HTMLInputElement).value);const label=this.query('#poker-raise-value');if(label)label.textContent=money(this.raiseValue);});
  }
}

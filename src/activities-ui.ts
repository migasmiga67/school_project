import './activities.css';
import { CASINO } from './casino-location';
import type { MultiplayerSession, RoomSnapshot } from './multiplayer-model';
import type { JobAction, HeistSnapshot, RaceSnapshot } from './online-jobs';
import { BANK_ALARM, BANK_RECON, BANK_VAULT, BANK_DRILL_MS } from './online-jobs';

interface ActivitiesCallbacks {
  onOpen(): void;
  onClose(): void;
  onGarageRoute(): void;
  onStartCrew(): void;
  onMessage(text: string): void;
  onCareer?(): void;
  onCityEvents?(): void;
  onCasinoGames?(): void;
}

const safe = (value: string) => value.replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!));
const money = (value: number) => `$${Math.max(0, value).toLocaleString('pl-PL')}`;
const clock = (value: number) => { const seconds=Math.max(0,Math.ceil(value/1000)); return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`; };
const symbols = ['◆', '●', '▲', '■'];
const roles:Record<HeistSnapshot['role'],string> = {driver:'Kierowca',hacker:'Haker',lookout:'Zwiadowca',breacher:'Włamywacz',spectator:'Obserwator'};
const heistTitles:Record<HeistSnapshot['status'],string> = {idle:'Skok na Sapphire',gather:'Zbierzcie ekipę',recon:'Rozpoznajcie bank',alarm:'Wyłączcie alarm',breach:'Otwórzcie skarbiec',hack:'Otwórzcie sejf',escape:'Alarm. Czas na ucieczkę.',completed:'Sejf opróżniony.',failed:'Napad przerwany'};
const heistActive=(status:HeistSnapshot['status'])=>['gather','recon','alarm','breach','hack','escape'].includes(status);
const raceTitles:Record<RaceSnapshot['status'],string> = {idle:'Nocny sprint',lobby:'Zbiórka na starcie',countdown:'Na miejsca!',running:'Wyścig trwa',completed:'Meta osiągnięta',failed:'Wyścig zakończony'};

/** The panel displays authoritative job snapshots; it never advances jobs locally. */
export class ActivitiesUI {
  private root:HTMLDivElement|null=null;
  private visible=false;
  private previousFocus:HTMLElement|null=null;
  private signature='';
  private lastAction=0;
  private lastActionSignature='';
  private readonly unsubscribe:()=>void;

  constructor(private parent:HTMLElement,private session:MultiplayerSession,private callbacks:ActivitiesCallbacks) {
    this.unsubscribe=session.subscribe(()=>this.refresh());
  }
  get active(){return this.visible;}
  open(){
    if(this.visible)return;
    this.visible=true;this.previousFocus=document.activeElement as HTMLElement;
    this.root=document.createElement('div');this.root.id='activities-dialog';this.root.className='activities-overlay';
    this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');this.root.setAttribute('aria-labelledby','activities-title');this.root.setAttribute('aria-describedby','activities-description');
    this.root.addEventListener('keydown',event=>{
      event.stopPropagation();
      if(event.key==='Escape'){event.preventDefault();this.handleEscape();}
      else if(event.key==='Tab')this.trapFocus(event);
    });
    this.parent.append(this.root);this.callbacks.onOpen();this.refresh(true);this.query('#activities-close')?.focus({preventScroll:true});
  }
  close(){
    if(!this.visible)return;
    this.visible=false;this.root?.remove();this.root=null;this.callbacks.onClose();
    const target=this.previousFocus;this.previousFocus=null;
    queueMicrotask(()=>{if(this.visible)return;if(target?.isConnected&&target.getClientRects().length&&!target.matches(':disabled'))target.focus({preventScroll:true});});
  }
  handleEscape(){this.close();}
  destroy(){this.unsubscribe();this.close();}
  refresh(force=false){
    if(!this.visible)return;
    const current=this.session.state,snapshot=current.status==='online'?current.snapshot:null;
    const heist=snapshot?.jobs.heist,race=snapshot?.jobs.race,self=snapshot?.members.find(member=>member.id===snapshot.youId);
    // Poses arrive ten times per second. Clocks update text nodes separately:
    // replacing the dialog on every second interrupts scrolling and clicking.
    const nearHeist=Boolean(self&&self.pose.interior===null&&Math.hypot(self.pose.x-CASINO.door.x,self.pose.z-CASINO.door.z)<=8);
    const nearPrepare=Boolean(self&&self.pose.interior===null&&Math.hypot(self.pose.x-CASINO.door.x,self.pose.z-CASINO.door.z)<=6);
    const nearBankTarget=Boolean(self&&heist?.target&&self.pose.interior===null&&Math.hypot(self.pose.x-heist.target.x,self.pose.z-heist.target.z)<=6);
    const bankPositions=[BANK_RECON,BANK_ALARM,BANK_VAULT].map((point,index)=>Boolean(self&&self.pose.interior===null&&!self.pose.homeId&&Math.hypot(self.pose.x-point.x,self.pose.z-point.z)<=(index===1?8:6)));
    const signature=JSON.stringify([current.status,current.message,snapshot?.code,snapshot?.members.map(member=>[member.id,member.name]),snapshot?.hostId,snapshot?.youId,snapshot?.challenge.status,Boolean(snapshot&&snapshot.challenge.cooldownMs>0),
      heist&&[heist.status,heist.run,heist.cooldownMs>0,heist.eligible,heist.role,heist.progress,heist.alarm,heist.sequence,heist.gathered,heist.message,heist.variant,heist.drillStarted,heist.driverReady,heist.lookoutReady],nearBankTarget,bankPositions,
      race&&[race.status,race.run,race.cooldownMs>0,race.canReady,race.ready,race.participants,race.message],nearHeist,nearPrepare,self?.pose.mode,self?.pose.passengerOf]);
    if(force||signature!==this.signature){this.signature=signature;this.render(snapshot,nearHeist,current.message);}
    this.updateClockTexts(snapshot);
  }
  private query<T extends HTMLElement=HTMLElement>(selector:string){return this.root?.querySelector<T>(selector)??null;}
  private updateClockTexts(snapshot:RoomSnapshot|null){
    if(!snapshot)return;
    const {heist,race}=snapshot.jobs,challenge=snapshot.challenge;
    const write=(selector:string,value:string)=>{const node=this.query(selector);if(node&&node.textContent!==value)node.textContent=value;};
    write('#heist-countdown',heistActive(heist.status)?clock(heist.remainingMs):money(heist.reward));
    write('#heist-drill-value',`${(heist.drillMs/1000).toFixed(1)} / ${BANK_DRILL_MS/1000} s`);
    write('#race-countdown',race.status==='countdown'?String(Math.max(1,Math.ceil(race.countdownMs/1000))):['lobby','running'].includes(race.status)?clock(race.remainingMs):'$500 / $300 / $150 / $100');
    write('#activity-crew',challenge.status==='active'?'Przerzut już trwa':challenge.cooldownMs>0?`Przerzut za ${Math.ceil(challenge.cooldownMs/1000)} s`:'Rozpocznij przerzut');
    write('#heist-start',heist.cooldownMs>0?`Następny napad za ${Math.ceil(heist.cooldownMs/1000)} s`:'Rozpocznij napad');
    write('#bank-heist-start',heist.cooldownMs>0?`Bank za ${Math.ceil(heist.cooldownMs/1000)} s`:'Zaplanuj skok na bank · $1400');
    write('#race-start',race.cooldownMs>0?`Następny wyścig za ${Math.ceil(race.cooldownMs/1000)} s`:'Przygotuj wyścig');
  }
  private trapFocus(event:KeyboardEvent){
    const controls=[...(this.root?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),summary')??[])];
    const first=controls[0],last=controls.at(-1);
    if(!first){event.preventDefault();return;}
    if(!controls.includes(document.activeElement as HTMLElement)){(event.shiftKey?last:first)?.focus();event.preventDefault();}
    else if(event.shiftKey&&document.activeElement===first){last?.focus();event.preventDefault();}
    else if(!event.shiftKey&&document.activeElement===last){first.focus();event.preventDefault();}
  }
  private issue(action:JobAction){
    const state=this.session.state,snapshot=state.snapshot;
    if(state.status!=='online'||!snapshot){this.callbacks.onMessage('Do tego zlecenia potrzebujesz pokoju online.');return;}
    const heist=snapshot.jobs.heist,race=snapshot.jobs.race;
    const signature=JSON.stringify([action,heist.status,heist.run,heist.progress,heist.alarm,heist.gathered,race.status,race.run,race.ready]);
    const now=performance.now();
    if(signature===this.lastActionSignature&&now-this.lastAction<1500)return;
    this.lastAction=now;this.lastActionSignature=signature;
    this.session.job(action);
  }
  private render(snapshot:RoomSnapshot|null,nearHeist:boolean,notice:string){
    if(!this.root)return;
    const focused=document.activeElement,focusId=focused instanceof HTMLElement&&this.root.contains(focused)?focused.id:'';
    const scroll=this.query('.activities-card')?.scrollTop??0;
    const host=Boolean(snapshot&&snapshot.hostId===snapshot.youId),crewActive=snapshot?.challenge.status==='active';
    const busy=Boolean(snapshot?.jobs.active)||crewActive;
    const heist=snapshot?.jobs.heist,race=snapshot?.jobs.race;
    const canStart=Boolean(snapshot&&host&&snapshot.members.length>=2&&!busy);
    const roomNote=!snapshot?'Napad, wyścigi i przerzut wymagają pokoju online. Utwórz pokój przez przycisk Online i zaproś znajomego.':!host?'Gospodarz rozpoczyna wspólne zlecenia. Każdy kierowca osobno zgłasza gotowość do wyścigu.':snapshot.members.length<2?'Zaproś co najmniej jedną osobę do wspólnych zleceń.':'Wybierz jedno zlecenie. Ekipa rozgrywa jeden wspólny cel naraz.';
    this.root.innerHTML=`<section class="activities-card"><header class="activities-header"><div><span class="activities-eyebrow">NEON COAST · WASZA NOC</span><h1 id="activities-title">Co robimy dalej?</h1></div><button class="activities-close" id="activities-close" aria-label="Zamknij zajęcia">×</button></header><p class="activities-description" id="activities-description">${safe(roomNote)}</p>
      <div class="activities-grid"><section class="activity-tile activity-garage"><span class="activities-eyebrow">TWÓJ SAMOCHÓD</span><h2>Garaż i tuning</h2><p>Kup auto, zmień lakier i popraw silnik, hamulce lub nitro. Warsztat czeka naprzeciwko kasyna.</p><button class="activity-button" id="activity-garage">Wyznacz trasę do garażu →</button></section>
      <section class="activity-tile"><span class="activities-eyebrow">KRÓTKIE ZLECENIE · 2–4 OSOBY</span><h2>Nocny przerzut</h2><p>Trzy punkty w 150 sekund. Dowolny członek ekipy może zaliczyć kolejny cel.</p><div class="activity-meta"><span>Wspólny postęp</span><strong>+$300 / osoba</strong></div><button class="activity-button" id="activity-crew" ${!canStart||Boolean(snapshot&&snapshot.challenge.cooldownMs>0)?'disabled':''}>${crewActive?'Przerzut już trwa':snapshot&&snapshot.challenge.cooldownMs>0?`Przerzut za ${Math.ceil(snapshot.challenge.cooldownMs/1000)} s`:'Rozpocznij przerzut'}</button></section></div>
      <div class="activities-grid activities-discover">${this.callbacks.onCareer?'<section class="activity-tile"><span class="activities-eyebrow">TWOJA HISTORIA</span><h2>Reputacja i nieruchomości</h2><p>Poznaj kontakty, odblokuj trudniejsze zlecenia i urządź własną kryjówkę.</p><button class="activity-button" id="activity-career">Kontakty i mieszkania →</button></section>':''}${this.callbacks.onCityEvents?'<section class="activity-tile"><span class="activities-eyebrow">MIASTO W RUCHU</span><h2>Wydarzenia uliczne</h2><p>Przejmij konwój, znajdź poszukiwane auto albo wygraj wyścig o dostawę.</p><button class="activity-button" id="activity-events">Sprawdź wydarzenie →</button></section>':''}${this.callbacks.onCasinoGames?'<section class="activity-tile"><span class="activities-eyebrow">SAPPHIRE CLUB</span><h2>Wieczór w kasynie</h2><p>Blackjack, ruletka i turniej pokera. Wszystkie stawki korzystają z wirtualnego portfela gry.</p><button class="activity-button" id="activity-casino">Gry kasynowe →</button></section>':''}</div>
      <section class="activity-tile activity-heist" id="heist-panel"><div class="activity-title-row"><div><span class="activities-eyebrow">NAPAD KOOPERACYJNY · 2–4 OSOBY${heist?.variant==='bank'?' · NORTHSIDE BANK':''}</span><h2>${safe(heist?heistTitles[heist.status]:'Skok na Sapphire')}</h2></div><strong class="activity-countdown" id="heist-countdown">${heist&&heistActive(heist.status)?clock(heist.remainingMs):'+$800'}</strong></div>
      ${heist?this.heistBody(snapshot!,heist,nearHeist):'<p>Zbierzcie ekipę, otwórzcie sejf i ucieknijcie razem do kryjówki. Kierowca i haker mają różne zadania.</p>'}
      <div class="heist-start-options"><button class="activity-button" id="heist-start" ${!canStart||Boolean(heist&&heist.cooldownMs>0)?'disabled':''}>${heist&&heist.cooldownMs>0?`Następny napad za ${Math.ceil(heist.cooldownMs/1000)} s`:'Rozpocznij napad'}</button><button class="activity-button activity-button-primary" id="bank-heist-start" ${!canStart||Boolean(heist&&heist.cooldownMs>0)?'disabled':''}>${heist&&heist.cooldownMs>0?`Bank za ${Math.ceil(heist.cooldownMs/1000)} s`:'Zaplanuj skok na bank · $1400'}</button>${host&&heist&&heistActive(heist.status)?'<button class="activity-button" id="heist-abort">Odwołaj bieżący napad</button>':''}</div><small class="activity-hint">Sapphire: krótki skok za $800. Northside Bank: rozpoznanie, wyłączenie alarmu, wiercenie z osłoną i wspólna ucieczka; sześć minut, $1400 na osobę.</small></section>
      <section class="activity-tile activity-race" id="race-panel"><div class="activity-title-row"><div><span class="activities-eyebrow">WYŚCIG · 2–4 KIEROWCÓW</span><h2>${safe(race?raceTitles[race.status]:'Nocny sprint')}</h2></div><strong class="activity-countdown" id="race-countdown">${race?.status==='countdown'?String(Math.max(1,Math.ceil(race.countdownMs/1000))):race&&['lobby','running'].includes(race.status)?clock(race.remainingMs):'$500 / $300 / $150 / $100'}</strong></div>
      ${race?this.raceBody(snapshot!,race):'<p>Przyjedźcie własnymi samochodami na start, zgłoście gotowość i walczcie o najlepszy czas na czterech punktach.</p>'}
      <button class="activity-button" id="race-start" ${!canStart||Boolean(race&&race.cooldownMs>0)?'disabled':''}>${race&&race.cooldownMs>0?`Następny wyścig za ${Math.ceil(race.cooldownMs/1000)} s`:'Przygotuj wyścig'}</button></section>
      ${notice?`<p class="activities-notice" role="status">${safe(notice)}</p>`:''}<footer class="activities-footer"><span>Zamknij panel, aby ruszyć do celu. Zegar zlecenia online nadal biegnie.</span><button class="activity-button activity-button-primary" id="activities-back">Wracam na ulice →</button></footer></section>`;
    const on=(id:string,callback:()=>void)=>this.query(id)?.addEventListener('click',callback);
    on('#activities-close',()=>this.close());on('#activities-back',()=>this.close());
    on('#activity-garage',()=>{this.close();this.callbacks.onGarageRoute();});
    on('#activity-crew',()=>{this.close();this.callbacks.onStartCrew();});
    // Let close restore focus before another dialog takes ownership of it.
    on('#activity-career',()=>{this.close();queueMicrotask(()=>this.callbacks.onCareer?.());});
    on('#activity-events',()=>{this.close();queueMicrotask(()=>this.callbacks.onCityEvents?.());});
    on('#activity-casino',()=>{this.close();queueMicrotask(()=>this.callbacks.onCasinoGames?.());});
    on('#heist-start',()=>this.issue({kind:'heistStart'}));on('#heist-interact',()=>this.issue({kind:'heistInteract'}));
    on('#bank-heist-start',()=>this.issue({kind:'heistStart',variant:'bank'}));
    on('#heist-recon',()=>this.issue({kind:'heistRecon'}));on('#heist-breach',()=>this.issue({kind:'heistBreach'}));on('#heist-abort',()=>this.issue({kind:'heistAbort'}));
    symbols.forEach((_,symbol)=>on(`#heist-symbol-${symbol}`,()=>this.issue({kind:'heistHack',symbol})));
    on('#race-start',()=>this.issue({kind:'raceStart'}));on('#race-ready',()=>this.issue({kind:'raceReady'}));
    const card=this.query('.activities-card');if(card)card.scrollTop=scroll;
    const replacement=focusId?this.query(`#${CSS.escape(focusId)}`):null;
    if(replacement&&!replacement.matches(':disabled'))replacement.focus({preventScroll:true});
    else if(!this.root.contains(document.activeElement))this.query('#activities-close')?.focus({preventScroll:true});
  }
  private heistBody(snapshot:RoomSnapshot,heist:HeistSnapshot,nearHeist:boolean){
    if(heist.variant==='bank')return this.bankHeistBody(snapshot,heist);
    const self=snapshot.members.find(member=>member.id===snapshot.youId);
    const active=['gather','hack','escape'].includes(heist.status);
    const hacker=heist.role==='hacker'&&heist.status==='hack';
    const canHack=hacker&&nearHeist&&self?.pose.mode==='foot'&&!self.pose.passengerOf;
    const role=active?`<div class="activity-meta"><span>Twoja rola: <strong>${roles[heist.role]}</strong></span><span>${heist.eligible?'Nagroda: +$800':'Pomagasz ekipie'}</span></div>`:'';
    const secret=hacker?`<div class="heist-console"><span class="activities-eyebrow">TWOJA SEKWENCJA · OD LEWEJ DO PRAWEJ</span><div class="heist-sequence" aria-label="Sekwencja sejfu">${heist.sequence.map((symbol,index)=>`<span class="${index<heist.progress?'is-done':''}" aria-label="Symbol ${symbol+1}">${symbols[symbol]??'?'}</span>`).join('')}</div><div class="heist-symbols">${symbols.map((symbol,index)=>`<button class="activity-button" id="heist-symbol-${index}" aria-label="Wprowadź symbol ${index+1}" ${!canHack?'disabled':''}>${symbol}</button>`).join('')}</div><small>${canHack?'Wprowadź symbole po kolei. Trzy pomyłki blokują sejf.':'Wysiądź z auta i podejdź pieszo do drzwi Sapphire Club.'}</small></div>`:'';
    const progress=heist.status==='hack'?`<div class="activity-meta"><span>Sejf: ${heist.progress}/3</span><span>Alarm: ${heist.alarm}/3</span></div>`:'';
    const prepared=heist.gathered.includes(snapshot.youId);
    const canPrepare=Boolean(self&&self.pose.interior===null&&Math.hypot(self.pose.x-CASINO.door.x,self.pose.z-CASINO.door.z)<=6);
    const gather=heist.status==='gather'?`<button class="activity-button" id="heist-interact" ${!canPrepare||!heist.eligible||prepared?'disabled':''}>${prepared?'Przygotowanie potwierdzone':'Potwierdź przygotowanie'}</button><small class="activity-hint">Kierowca i haker muszą podejść pod wejście i osobno potwierdzić przygotowanie. Znacznik celu prowadzi ekipę do kasyna.</small>`:'';
    return `<p id="heist-status" role="status">${safe(heist.message)}</p>${role}${progress}${secret}${gather}`;
  }
  private bankHeistBody(snapshot:RoomSnapshot,heist:HeistSnapshot){
    const self=snapshot.members.find(member=>member.id===snapshot.youId);
    const at=(point:{x:number;z:number},radius=6)=>Boolean(self&&self.pose.interior===null&&!self.pose.homeId&&self.pose.mode==='foot'&&!self.pose.passengerOf&&Math.hypot(self.pose.x-point.x,self.pose.z-point.z)<=radius);
    const scout=heist.status==='recon'&&snapshot.youId===heist.lookoutId&&heist.eligible;
    const hacker=heist.status==='alarm'&&snapshot.youId===heist.hackerId&&heist.eligible;
    const breacher=heist.status==='breach'&&snapshot.youId===heist.breacherId&&heist.eligible;
    const role=heistActive(heist.status)?`<div class="activity-meta"><span>Twoja rola: <strong>${roles[heist.role]}${snapshot.youId===heist.driverId&&snapshot.youId===heist.lookoutId?' + rozpoznanie':''}${snapshot.youId===heist.hackerId&&snapshot.youId===heist.breacherId?' + włamywacz':''}</strong></span><span>${heist.eligible?`Nagroda: ${money(heist.reward)}`:'Obserwator'}</span></div>`:'';
    const steps=['recon','alarm','breach','escape'],step=steps.indexOf(heist.status);
    const progress=`<ol class="heist-stages" aria-label="Plan napadu">${['Rozpoznanie','Alarm','Skarbiec','Ucieczka'].map((label,index)=>`<li class="${index<step||heist.status==='completed'?'is-done':index===step?'is-current':''}">${index+1}. ${label}</li>`).join('')}</ol>`;
    const scoutButton=scout?`<button class="activity-button activity-button-primary" id="heist-recon" ${!at(BANK_RECON)?'disabled':''}>Potwierdź rozpoznanie skrzyżowania</button>`:'';
    const secret=hacker?`<div class="heist-console"><span class="activities-eyebrow">PRYWATNA SEKWENCJA WYŁĄCZENIA ALARMU</span><div class="heist-sequence" aria-label="Sekwencja alarmu">${heist.sequence.map((symbol,index)=>`<span class="${index<heist.progress?'is-done':''}">${symbols[symbol]??'?'}</span>`).join('')}</div><div class="heist-symbols">${symbols.map((symbol,index)=>`<button class="activity-button" id="heist-symbol-${index}" aria-label="Wprowadź symbol ${index+1}" ${!at(BANK_ALARM,8)?'disabled':''}>${symbol}</button>`).join('')}</div><small>Stań pieszo przy skrzynce z boku banku. Trzy błędy przerywają skok. Błędy: ${heist.alarm}/3.</small></div>`:'';
    const drill=heist.status==='breach'?`<div class="heist-cover"><span>Kierowca: <strong>${heist.driverReady?'auto gotowe':'przygotuj auto'}</strong></span><span>Osłona: <strong>${heist.lookoutReady?'na pozycji':'brak zwiadowcy'}</strong></span><span>Wiercenie: <strong id="heist-drill-value">${(heist.drillMs/1000).toFixed(1)} / ${BANK_DRILL_MS/1000} s</strong></span></div>${breacher?`<button class="activity-button activity-button-primary" id="heist-breach" ${!at(BANK_VAULT)||heist.drillStarted?'disabled':''}>${heist.drillStarted?'Wiertło uruchomione':'Uruchom wiertło przy sejfie'}</button>`:''}<small class="activity-hint">Postęp wymaga ośmiu sekund ciągłej osłony. Włamywacz pozostaje pieszo przy banku; kierowca siedzi w zatrzymanym aucie przy (-40, -40). W ekipie 3–4 osób zwiadowca pilnuje (-80, -40). Utrata pozycji zeruje wiercenie.</small>`:'';
    return `${progress}<p id="heist-status" role="status">${safe(heist.message)}</p>${role}<p class="heist-objective"><strong>Twoje zadanie:</strong> ${safe(heist.objective)}</p>${scoutButton}${secret}${drill}`;
  }
  private raceBody(snapshot:RoomSnapshot,race:RaceSnapshot){
    const ready=race.ready.includes(snapshot.youId);
    const readyButton=['lobby','countdown'].includes(race.status)?`<button class="activity-button activity-button-primary" id="race-ready" ${!race.canReady||ready?'disabled':''}>${ready?'Gotowość potwierdzona':'Jestem na starcie · gotowy'}</button><small class="activity-hint">Podjedź własnym autem do znacznika. Każdy kierowca zgłasza gotowość osobno; pasażerowie nie biorą udziału.</small>`:'';
    const ranking=race.participants.length?`<div class="race-ranking-wrap"><table class="race-ranking"><caption>${race.status==='completed'||race.status==='failed'?'Wyniki wyścigu':'Kierowcy i postęp'}</caption><thead><tr><th scope="col">Miejsce</th><th scope="col">Kierowca</th><th scope="col">Postęp</th><th scope="col">Czas</th><th scope="col">Nagroda</th></tr></thead><tbody>${[...race.participants].sort((a,b)=>(a.rank??99)-(b.rank??99)||b.checkpoint-a.checkpoint).map(person=>`<tr class="${person.id===snapshot.youId?'is-you':''}"><td>${person.rank??'—'}</td><th scope="row">${safe(person.name)}${person.id===snapshot.youId?' <small>TY</small>':''}</th><td>${person.status==='dnf'?'Nie ukończył':person.status==='ready'?'Gotowy':person.status==='waiting'?'Zbiórka':person.status==='spectator'?'Widz':`${person.checkpoint}/4`}</td><td>${person.finishedMs!==null?`${(person.finishedMs/1000).toFixed(2)} s`:'—'}</td><td>${person.prize>0?money(person.prize):'—'}</td></tr>`).join('')}</tbody></table></div>`:'';
    return `<p id="race-status" role="status">${safe(race.message)}</p>${readyButton}${ranking}`;
  }
}

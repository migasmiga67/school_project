import './city-events.css';
import type { Point } from './model';
import type { CityEventAction, CityEventsSnapshot } from './city-events';

export interface CityEventsCallbacks {
  getSnapshot():CityEventsSnapshot;
  onAction(action:CityEventAction):void;
  onRoute(target:Point):void;
  onOpen():void;
  onClose():void;
  onMessage?(text:string):void;
}
const safe=(value:string)=>value.replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!));
const clock=(value:number)=>{const seconds=Math.max(0,Math.ceil(value/1000));return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;};
const labels={convoy:'PRZEJĘCIE KONWOJU',wanted:'ODZYSKANIE AUTA',courier:'WYŚCIG KURIERÓW'};
const statusLabels={upcoming:'NADCHODZI',available:'ZAPISY OTWARTE',active:'W TOKU',completed:'DOSTARCZONO',expired:'CZAS MINĄŁ'};

/** A single view for solo and network-authoritative city opportunities. */
export class CityEventsUI {
  private root:HTMLDivElement|null=null;
  private previousFocus:HTMLElement|null=null;
  private signature='';
  private visible=false;
  constructor(private parent:HTMLElement,private callbacks:CityEventsCallbacks){}
  get active(){return this.visible;}
  open(){
    if(this.visible)return;
    this.visible=true;this.previousFocus=document.activeElement as HTMLElement;
    this.root=document.createElement('div');this.root.id='city-activities-dialog';this.root.className='city-activities-overlay';
    this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');this.root.setAttribute('aria-labelledby','city-activities-title');
    this.root.addEventListener('keydown',event=>{
      event.stopPropagation();
      if(event.key==='Escape'){event.preventDefault();this.handleEscape();}
      if(event.key==='Tab')this.trapFocus(event);
    });
    this.parent.append(this.root);this.callbacks.onOpen();this.refresh(true);this.query('#city-activities-close')?.focus({preventScroll:true});
  }
  close(){
    if(!this.visible)return;
    this.visible=false;this.root?.remove();this.root=null;this.signature='';this.callbacks.onClose();
    const focused=this.previousFocus;this.previousFocus=null;
    queueMicrotask(()=>{if(!this.visible&&focused?.isConnected&&focused.getClientRects().length&&!focused.matches(':disabled'))focused.focus({preventScroll:true});});
  }
  handleEscape(){this.close();}
  refresh(force=false){
    if(!this.visible)return;
    const snapshot=this.callbacks.getSnapshot();
    const signature=JSON.stringify([snapshot.id,snapshot.kind,snapshot.status,snapshot.stage,snapshot.joined,snapshot.canJoin,snapshot.canInteract,snapshot.holderId,snapshot.winnerId,snapshot.instruction,snapshot.participants.map(p=>[p.id,p.name]),snapshot.progress]);
    if(force||signature!==this.signature){this.signature=signature;this.render(snapshot);}
    const timer=this.query('#city-activities-clock');if(timer)timer.textContent=clock(snapshot.status==='upcoming'||snapshot.status==='completed'||snapshot.status==='expired'?snapshot.nextInMs:snapshot.remainingMs);
  }
  private query<T extends HTMLElement=HTMLElement>(selector:string){return this.root?.querySelector<T>(selector)??null;}
  private issue(kind:CityEventAction['kind']){
    const snapshot=this.callbacks.getSnapshot();if(!snapshot.id)return;
    this.callbacks.onAction({kind,eventId:snapshot.id});this.refresh();
  }
  private render(snapshot:CityEventsSnapshot){
    if(!this.root)return;
    const focused=document.activeElement instanceof HTMLElement&&this.root.contains(document.activeElement)?document.activeElement.id:'';
    const active=snapshot.status==='available'||snapshot.status==='active';
    const stages=['Odbiór','Punkt kontrolny','Dostawa'];
    const step=snapshot.stage==='pickup'?0:snapshot.stage==='checkpoint'?1:2;
    const action=snapshot.stage==='delivery'?'Potwierdź dostawę':snapshot.kind==='convoy'?'Rozpocznij przejęcie':snapshot.kind==='wanted'?'Potwierdź przejęcie auta':'Odbierz przesyłkę';
    this.root.innerHTML=`<section class="city-activities-card"><header><div><span class="city-activities-eyebrow">NEON COAST · ULICZNE OKAZJE</span><h1 id="city-activities-title">${safe(snapshot.title)}</h1></div><button id="city-activities-close" class="city-activities-close" aria-label="Zamknij wydarzenia">×</button></header>
      <div class="city-activities-meta"><span>${snapshot.kind?labels[snapshot.kind]:'COŚ SIĘ SZYKUJE'}</span><strong>${statusLabels[snapshot.status]}</strong></div>
      <p id="city-activities-instruction" role="status">${safe(snapshot.instruction)}</p>
      <div class="city-activities-score"><div><small>${active?'DO KOŃCA':'KOLEJNE WYDARZENIE'}</small><strong id="city-activities-clock">${clock(active?snapshot.remainingMs:snapshot.nextInMs)}</strong></div><div><small>NAGRODA DLA ZWYCIĘZCY</small><strong>${snapshot.reward?`$${snapshot.reward}`:'—'}</strong></div></div>
      ${snapshot.kind?`<ol class="city-activities-steps">${stages.map((stage,index)=>`<li class="${snapshot.status==='completed'||index<step?'complete':index===step?'current':''}"><span>${index+1}</span>${stage}</li>`).join('')}</ol>`:''}
      ${snapshot.kind==='convoy'&&snapshot.joined&&snapshot.stage==='pickup'?`<div class="city-activities-progress"><label for="convoy-progress">Utrzymaj się obok konwoju: ${snapshot.progress}%</label><progress id="convoy-progress" max="100" value="${snapshot.progress}"></progress><small>Po rozpoczęciu przejęcia jedź blisko przez 3 sekundy. Zbyt duża odległość lub prędkość zeruje postęp.</small></div>`:''}
      ${snapshot.kind==='wanted'?'<p class="city-activities-hint">Oznaczone auto to szary Sentinel z północno-zachodniej części miasta. Zachowaj co najmniej 30% jego stanu przy dostawie.</p>':''}
      <div class="city-activities-participants"><h2>Uczestnicy ${snapshot.participants.length?`· ${snapshot.participants.length}`:''}</h2>${snapshot.participants.length?`<ul>${snapshot.participants.map(person=>`<li><span>${safe(person.name)}</span><strong>${person.id===snapshot.winnerId?'ZWYCIĘZCA':person.id===snapshot.holderId?'MA ŁADUNEK':'W GRZE'}</strong></li>`).join('')}</ul>`:'<p>Dołącz jako pierwszy. W pokoju online wszyscy rywalizują o ten sam ładunek i jedną nagrodę.</p>'}</div>
      <div class="city-activities-buttons"><button id="city-activities-join" ${!snapshot.canJoin?'disabled':''}>Dołącz do wydarzenia</button><button id="city-activities-interact" class="city-activities-primary" ${!snapshot.canInteract?'disabled':''}>${action}</button><button id="city-activities-route" ${!active||!snapshot.target?'disabled':''}>Pokaż cel na GPS</button>${snapshot.joined&&active?'<button id="city-activities-abandon">Zrezygnuj z wydarzenia</button>':''}</div>
      <footer><span>${snapshot.holderName?`Ładunek: ${safe(snapshot.holderName)}. `:''}Zamknij panel, aby poruszać się po mieście.</span><button id="city-activities-back">Wracam na ulicę →</button></footer></section>`;
    const on=(selector:string,callback:()=>void)=>this.query(selector)?.addEventListener('click',callback);
    on('#city-activities-close',()=>this.close());on('#city-activities-back',()=>this.close());
    on('#city-activities-join',()=>this.issue('join'));on('#city-activities-interact',()=>this.issue('interact'));on('#city-activities-abandon',()=>this.issue('abandon'));
    on('#city-activities-route',()=>{const target=this.callbacks.getSnapshot().target;if(target){this.close();this.callbacks.onRoute(target);}});
    const replacement=focused?this.query(`#${CSS.escape(focused)}`):null;
    if(replacement&&!replacement.matches(':disabled'))replacement.focus({preventScroll:true});
    else if(!this.root.contains(document.activeElement))this.query('#city-activities-close')?.focus({preventScroll:true});
  }
  private trapFocus(event:KeyboardEvent){
    const controls=[...(this.root?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled)')??[])],first=controls[0],last=controls.at(-1);
    if(!first){event.preventDefault();return;}
    if(!controls.includes(document.activeElement as HTMLElement)){(event.shiftKey?last:first)?.focus();event.preventDefault();}
    else if(event.shiftKey&&document.activeElement===first){last?.focus();event.preventDefault();}
    else if(!event.shiftKey&&document.activeElement===last){first.focus();event.preventDefault();}
  }
}

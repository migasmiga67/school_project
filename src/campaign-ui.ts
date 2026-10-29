import './campaign.css';
import type { Point } from './model';
import type { CampaignAction, CampaignSnapshot } from './campaign';

export interface CampaignCallbacks {
 getSnapshot():CampaignSnapshot;onAction(action:CampaignAction):void;onRoute(target:Point):void;
 onOpen():void;onClose():void;onMessage(text:string):void;
}
const safe=(text:string)=>text.replace(/[&<>"']/g,value=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[value]!));
const clock=(milliseconds:number)=>{const seconds=Math.max(0,Math.ceil(milliseconds/1000));return`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;};
const statusNames:Record<CampaignSnapshot['status'],string>={idle:'NOWY SYGNAŁ',active:'W DRODZE',interlude:'ROZDZIAŁ UKOŃCZONY',choice:'WASZA DECYZJA',completed:'KONIEC HISTORII',failed:'PRZERWANA WYPRAWA'};

/** Journal controls read a shared host snapshot; the UI never grants rewards. */
export class CampaignUI {
 private root:HTMLDivElement|null=null;private previousFocus:HTMLElement|null=null;private signature='';private notice='';
 private pending=false;private wait:ReturnType<typeof setTimeout>|null=null;
 constructor(private parent:HTMLElement,private callbacks:CampaignCallbacks){}
 get active(){return this.root!==null;}
 open(){
  if(this.root)return;this.signature='';this.notice='';this.previousFocus=document.activeElement as HTMLElement;
  this.root=document.createElement('div');this.root.id='campaign-dialog';this.root.className='campaign-overlay';
  this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');this.root.setAttribute('aria-labelledby','campaign-heading');
  this.root.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();this.close();}if(event.key==='Tab')this.trapFocus(event);});
  this.parent.append(this.root);this.callbacks.onOpen();this.refresh(true);this.query('#campaign-close')?.focus({preventScroll:true});
 }
 close(){
  if(!this.root)return;this.clearPending();this.root.remove();this.root=null;this.callbacks.onClose();
  const previous=this.previousFocus;this.previousFocus=null;queueMicrotask(()=>{if(!this.root&&previous?.isConnected&&previous.getClientRects().length&&!previous.matches(':disabled'))previous.focus({preventScroll:true});});
 }
 handleEscape(){this.close();}destroy(){this.close();}
 report(message:string){this.notice=message;this.clearPending();this.refresh(true);}
 refresh(force=false){
  if(!this.root)return;const snapshot=this.callbacks.getSnapshot();
  const signature=JSON.stringify([snapshot.status,snapshot.chapter,snapshot.objective,snapshot.instruction,snapshot.truth,snapshot.loyalty,snapshot.ending,snapshot.message,snapshot.eligible,snapshot.participants,snapshot.rewardAvailable,snapshot.canHostControl]);
  if(force||signature!==this.signature){this.signature=signature;this.clearPending();this.render(snapshot);}
  const timer=this.query('#campaign-clock');if(timer)timer.textContent=clock(snapshot.remainingMs);
  const progress=this.query<HTMLProgressElement>('#campaign-hold');if(progress){progress.max=snapshot.holdRequiredMs;progress.value=snapshot.holdMs;}
  const label=this.query('#campaign-hold-label');if(label)label.textContent=`Utrzymaj pozycję: ${(snapshot.holdMs/1000).toFixed(1)} / ${snapshot.holdRequiredMs/1000} s`;
 }
 private clearPending(){this.pending=false;if(this.wait!==null)clearTimeout(this.wait);this.wait=null;}
 private issue(action:CampaignAction){
  if(this.pending)return;this.pending=true;this.notice='Potwierdzanie decyzji…';this.render(this.callbacks.getSnapshot());
  this.wait=setTimeout(()=>{this.clearPending();this.notice='Brak potwierdzenia. Sprawdź połączenie i spróbuj ponownie.';this.render(this.callbacks.getSnapshot());},7000);
  try{this.callbacks.onAction(action);}catch(error){this.report(error instanceof Error?error.message:'Nie udało się przekazać decyzji.');}
 }
 private query<T extends HTMLElement=HTMLElement>(selector:string){return this.root?.querySelector<T>(selector)??null;}
 private render(snapshot:CampaignSnapshot){
  if(!this.root)return;
  const focused=document.activeElement instanceof HTMLElement&&this.root.contains(document.activeElement)?document.activeElement.id:'',scroll=this.query('.campaign-shell')?.scrollTop??0;
  const host=snapshot.canHostControl,disabled=!host||this.pending?'disabled':'',active=snapshot.status==='active';
  const start=snapshot.status==='idle'?{kind:'start' as const,text:'Odbierz sygnał · rozpocznij historię'}:snapshot.status==='interlude'?{kind:'continue' as const,text:'Rozpocznij kolejny rozdział'}:snapshot.status==='failed'?{kind:'retry' as const,text:'Ponów ten rozdział'}:snapshot.status==='completed'?{kind:'restart' as const,text:'Rozegraj inną wersję historii'}:null;
  this.root.innerHTML=`<section class="campaign-shell"><header class="campaign-header"><div><span class="campaign-eyebrow">NEON COAST · DZIENNIK</span><h1 id="campaign-heading">Cena wybrzeża</h1><p>Pięć rozdziałów. Dwie decyzje. Trzy możliwe zakończenia.</p></div><button id="campaign-close" class="campaign-button campaign-button-quiet" aria-label="Zamknij dziennik">Wróć ×</button></header><div class="campaign-layout"><aside class="campaign-journal"><span class="campaign-eyebrow">WASZA DROGA</span><ol aria-label="Rozdziały kampanii">${snapshot.journal.map(chapter=>`<li class="${chapter.completed?'is-complete':chapter.chapter===snapshot.chapter?'is-current':''}" ${chapter.chapter===snapshot.chapter?'aria-current="step"':''}><span>${chapter.completed?'✓':String(chapter.chapter+1).padStart(2,'0')}</span><strong>${safe(chapter.title)}</strong></li>`).join('')}</ol><div class="campaign-decisions"><span class="campaign-eyebrow">PODJĘTE DECYZJE</span><p>Archiwum: <strong>${snapshot.truth==='publish'?'Ujawnić prawdę':snapshot.truth==='bargain'?'Negocjować':'Jeszcze nie wybrano'}</strong></p><p>Przyszłość: <strong>${snapshot.loyalty==='crew'?'Zostać z ekipą':snapshot.loyalty==='self'?'Własna droga':'Jeszcze nie wybrano'}</strong></p></div></aside><main class="campaign-story"><div class="campaign-status"><span>${statusNames[snapshot.status]}</span>${active?'<strong id="campaign-clock"></strong>':`<strong>ROZDZIAŁ ${Math.min(5,snapshot.chapter+1)} / 5</strong>`}</div>${snapshot.ending?`<section class="campaign-ending"><span class="campaign-eyebrow">TWOJE ZAKOŃCZENIE</span><h2>${safe(snapshot.endingTitle??'')}</h2><p>${safe(snapshot.endingText??'')}</p><small>Możesz sprawdzić inne wybory. Wcześniej wypłacone nagrody nie powtarzają się przy ponownym rozegraniu.</small></section>`:`<h2>${safe(snapshot.title)}</h2><p class="campaign-summary">${safe(snapshot.summary)}</p><div class="campaign-dialogue" aria-label="Rozmowa">${snapshot.dialogue.map(line=>`<p>${safe(line)}</p>`).join('')}</div>`}
    ${active?`<section class="campaign-objective"><span class="campaign-eyebrow">CEL ${snapshot.objective+1} / ${snapshot.objectiveCount}</span><h3>${safe(snapshot.instruction)}</h3>${snapshot.holdRequiredMs?'<label id="campaign-hold-label" for="campaign-hold"></label><progress id="campaign-hold" value="0" max="1"></progress>':''}<div class="campaign-reward"><span>${snapshot.rewardAvailable?`+$${snapshot.reward} · +${snapshot.reputation} REP`:'Nagroda za ten rozdział została już odebrana'}</span><button id="campaign-route" class="campaign-button" ${!snapshot.target?'disabled':''}>Trasa do celu →</button></div><small>${snapshot.eligible?'Jesteś w ekipie tego rozdziału. Cele zaliczają się po rzeczywistym dotarciu i spełnieniu warunków.':'Dołączysz do nagród od kolejnego rozdziału. Możesz towarzyszyć ekipie.'}</small></section>`:''}
    ${snapshot.decision?`<section class="campaign-choices"><span class="campaign-eyebrow">${host?'TA ODPOWIEDŹ ZMIENI DALSZĄ HISTORIĘ':'GOSPODARZ WYBIERA WSPÓLNĄ ODPOWIEDŹ'}</span>${snapshot.choices.map(choice=>`<button id="campaign-choice-${choice.id}" class="campaign-choice" ${disabled}><strong>${safe(choice.title)}</strong><span>${safe(choice.description)}</span><b>→</b></button>`).join('')}</section>`:''}
    ${snapshot.participants.length?`<p class="campaign-team">Ekipa: ${snapshot.participants.map(person=>safe(person.name)).join(' · ')}</p>`:''}<div class="campaign-controls">${start?`<button id="campaign-${start.kind}" class="campaign-button campaign-primary" ${disabled}>${start.text}</button>`:''}${active?`<button id="campaign-abandon" class="campaign-button campaign-button-quiet" ${disabled}>Przerwij rozdział</button>`:''}<button id="campaign-back" class="campaign-button campaign-button-quiet">Wracam do miasta →</button></div>${!host?'<p class="campaign-host-note">Gospodarz rozpoczyna rozdziały i podejmuje decyzje. Wspólne cele może wykonywać każdy uczestnik początkowej ekipy.</p>':''}<p id="campaign-notice" class="campaign-notice" role="status" aria-live="polite">${safe(this.notice||snapshot.message)}</p></main></div></section>`;
  const on=(selector:string,callback:()=>void)=>this.query(selector)?.addEventListener('click',callback);
  on('#campaign-close',()=>this.close());on('#campaign-back',()=>this.close());on('#campaign-route',()=>{const target=this.callbacks.getSnapshot().target;if(target){this.close();this.callbacks.onRoute(target);}});
  if(start)on(`#campaign-${start.kind}`,()=>this.issue({kind:start.kind}));on('#campaign-abandon',()=>this.issue({kind:'abandon'}));
  for(const choice of snapshot.choices)on(`#campaign-choice-${choice.id}`,()=>this.issue({kind:'choice',choice:choice.id}));
  const shell=this.query('.campaign-shell');if(shell)shell.scrollTop=scroll;const replacement=focused?this.query(`#${CSS.escape(focused)}`):null;
  if(replacement&&!replacement.matches(':disabled'))replacement.focus({preventScroll:true});else if(!this.root.contains(document.activeElement))this.query('#campaign-close')?.focus({preventScroll:true});
 }
 private trapFocus(event:KeyboardEvent){
  const buttons=[...(this.root?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[])],first=buttons[0],last=buttons.at(-1);
  if(!buttons.includes(document.activeElement as HTMLButtonElement)){(event.shiftKey?last:first)?.focus();event.preventDefault();}
  else if(event.shiftKey&&document.activeElement===first){last?.focus();event.preventDefault();}else if(!event.shiftKey&&document.activeElement===last){first?.focus();event.preventDefault();}
 }
}

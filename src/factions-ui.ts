import './factions.css';
import { DISTRICTS, FACTIONS, FACTION_JOBS, type DistrictId, type FactionAction, type FactionId, type FactionJobKind, type FactionsSnapshot } from './factions';
import type { Point } from './model';

export interface FactionsCallbacks {
 getSnapshot():FactionsSnapshot;
 onAction(action:FactionAction):void;
 onRoute(target:Point,label:string):void;
 onOpen():void;onClose():void;onMessage?(text:string):void;
}
type Tab='factions'|'districts'|'jobs';
const safe=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const color=(value:number)=>`#${value.toString(16).padStart(6,'0')}`;
const clock=(value:number)=>{const seconds=Math.max(0,Math.ceil(value/1000));return`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;};
const stages:Record<string,string>={pickup:'Odbiór',delivery:'Dostawa',channel:'Nadajnik',escape:'Przekazanie',control:'Kontrola strefy'};

/** Territory and assignment clocks come from the same controller in solo and rooms. */
export class FactionsUI {
 private root:HTMLDivElement|null=null;
 private previousFocus:HTMLElement|null=null;
 private tab:Tab='factions';
 private signature='';
 private notice='';
 constructor(private parent:HTMLElement,private callbacks:FactionsCallbacks){}
 get active(){return this.root!==null;}
 open(tab:Tab='factions'){
  if(this.root){this.tab=tab;this.refresh(true);return;}
  this.tab=tab;this.signature='';this.notice='';this.previousFocus=document.activeElement as HTMLElement;
  this.root=document.createElement('div');this.root.id='factions-dialog';this.root.className='factions-overlay';this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');this.root.setAttribute('aria-labelledby','factions-title');
  this.root.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();this.close();}else if(event.key==='Tab')this.trapFocus(event);});
  this.parent.append(this.root);this.callbacks.onOpen();this.refresh(true);this.query('#factions-close')?.focus({preventScroll:true});
 }
 close(){
  if(!this.root)return;this.root.remove();this.root=null;this.callbacks.onClose();const focus=this.previousFocus;this.previousFocus=null;
  queueMicrotask(()=>{if(!this.root&&focus?.isConnected&&focus.getClientRects().length&&!focus.matches(':disabled'))focus.focus({preventScroll:true});});
 }
 handleEscape(){this.close();}destroy(){this.close();}
 report(message:string){this.notice=message;this.refresh(true);}
 refresh(force=false){
  if(!this.root)return;const snapshot=this.callbacks.getSnapshot();
  const signature=JSON.stringify([this.tab,snapshot.profile,snapshot.districts,snapshot.members,snapshot.bonusPercent,snapshot.incomePerMinute,snapshot.switchCooldownMs>0,snapshot.job.status,snapshot.job.run,snapshot.job.kind,snapshot.job.district,snapshot.job.stage,snapshot.job.progress,snapshot.job.holding,snapshot.job.contested,snapshot.job.canInteract,snapshot.job.cooldownMs>0,snapshot.job.reward,snapshot.job.message,this.notice]);
  if(force||signature!==this.signature){this.signature=signature;this.render(snapshot);}
  const text=(selector:string,value:string)=>{const node=this.query(selector);if(node)node.textContent=value;};
  text('#factions-job-clock',snapshot.job.status==='active'?clock(snapshot.job.remainingMs):snapshot.job.cooldownMs>0?`Przerwa ${clock(snapshot.job.cooldownMs)}`:'Gotowe do zlecenia');
  text('#factions-income-clock',clock(snapshot.nextIncomeMs));text('#factions-switch-clock',snapshot.switchCooldownMs>0?`Zmiana frakcji za ${clock(snapshot.switchCooldownMs)}`:'Możesz zmienić frakcję; lojalność nowej zacznie się od zera.');
 }
 private query<T extends HTMLElement=HTMLElement>(selector:string){return this.root?.querySelector<T>(selector)??null;}
 private issue(action:FactionAction){try{this.notice='';this.callbacks.onAction(action);this.refresh();}catch(error){const message=error instanceof Error?error.message:'Nie udało się wykonać akcji frakcji.';this.report(message);this.callbacks.onMessage?.(message);}}
 private trapFocus(event:KeyboardEvent){
  const controls=[...(this.root?.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled)')??[])],first=controls[0],last=controls.at(-1);
  if(!controls.includes(document.activeElement as HTMLElement)){(event.shiftKey?last:first)?.focus();event.preventDefault();}
  else if(event.shiftKey&&document.activeElement===first){last?.focus();event.preventDefault();}else if(!event.shiftKey&&document.activeElement===last){first?.focus();event.preventDefault();}
 }
 private render(snapshot:FactionsSnapshot){
  if(!this.root)return;const focused=this.root.contains(document.activeElement)?(document.activeElement as HTMLElement).id:'',scroll=this.query('.factions-shell')?.scrollTop??0;
  const team=snapshot.profile.faction?FACTIONS[snapshot.profile.faction]:null;
  this.root.innerHTML=`<section class="factions-shell"><header class="factions-header"><div><span class="factions-eyebrow">NEON COAST · CZYJE TO ULICE?</span><h1 id="factions-title">Frakcje i wpływy</h1><p>${team?safe(team.name):'Wybierz stronę wybrzeża.'} · Lojalność ${snapshot.profile.loyalty} · ${snapshot.profile.completedJobs} ukończonych zleceń</p></div><button id="factions-close" class="factions-button" aria-label="Zamknij frakcje">Wróć ×</button></header>
   <nav class="factions-tabs" aria-label="Panel frakcji">${([['factions','Frakcje'],['districts','Dzielnice'],['jobs','Zlecenia']] as const).map(([id,label])=>`<button id="factions-tab-${id}" class="${this.tab===id?'is-active':''}" aria-pressed="${this.tab===id}">${label}</button>`).join('')}</nav>
   <div class="factions-content">${this.tab==='factions'?this.teams(snapshot):this.tab==='districts'?this.territories(snapshot):this.jobs(snapshot)}</div>
   <footer class="factions-footer"><p id="factions-notice" role="status">${safe(this.notice||snapshot.job.message)}</p><span>Zamknij panel, aby ruszyć do celu. Online czas biegnie dalej.</span></footer></section>`;
  const on=(selector:string,callback:()=>void)=>this.query(selector)?.addEventListener('click',callback);
  on('#factions-close',()=>this.close());for(const tab of ['factions','districts','jobs'] as const)on(`#factions-tab-${tab}`,()=>{this.tab=tab;this.refresh(true);});
  for(const id of Object.keys(FACTIONS) as FactionId[])on(`#factions-join-${id}`,()=>this.issue({kind:'join',faction:id}));
  for(const id of Object.keys(DISTRICTS) as DistrictId[]){
   on(`#factions-route-${id}`,()=>{this.close();this.callbacks.onRoute(DISTRICTS[id].center,DISTRICTS[id].name);});
   on(`#factions-capture-${id}`,()=>this.issue({kind:'start',job:'capture',district:id}));
   for(const job of Object.keys(FACTION_JOBS) as FactionJobKind[])on(`#factions-start-${id}-${job}`,()=>this.issue({kind:'start',job,district:id}));
  }
  on('#factions-job-route',()=>{const target=this.callbacks.getSnapshot().job.target;if(target){this.close();this.callbacks.onRoute(target,'Zlecenie frakcji');}});
  on('#factions-interact',()=>this.issue({kind:'interact'}));on('#factions-cancel',()=>this.issue({kind:'cancel'}));
  const shell=this.query('.factions-shell');if(shell)shell.scrollTop=scroll;const replacement=focused?this.query(`#${CSS.escape(focused)}`):null;if(replacement&&!replacement.matches(':disabled'))replacement.focus({preventScroll:true});
 }
 private teams(snapshot:FactionsSnapshot){
  return`<p class="factions-intro">Trzy ekipy, trzy dzielnice i wspólna mapa wpływów. Zlecenia wzmacniają twoją stronę; przeciwnicy mogą przejąć kontrolę. Zmiana frakcji zeruje lojalność, lecz pozostawia dawną historię miasta.</p><div class="factions-team-grid">${Object.values(FACTIONS).map(team=>`<article class="factions-team" style="--team-color:${color(team.color)}"><span class="factions-symbol">${team.id==='tide'?'≈':team.id==='ember'?'◆':'⌘'}</span><h2>${team.name}</h2><strong>${team.motto}</strong><p>${team.description}</p><small>${snapshot.members.filter(person=>person.faction===team.id).length} członków w tej sesji</small><button class="factions-button" id="factions-join-${team.id}" ${snapshot.profile.faction===team.id||snapshot.job.status==='active'||snapshot.switchCooldownMs>0?'disabled':''}>${snapshot.profile.faction===team.id?'Twoja frakcja':'Dołącz do frakcji'}</button></article>`).join('')}</div><p id="factions-switch-clock" class="factions-hint"></p><div class="factions-bonuses"><div><small>BONUS ZLECEŃ</small><strong>+${snapshot.bonusPercent}%</strong></div><div><small>DOCHÓD Z TERENÓW</small><strong>$${snapshot.incomePerMinute} / min</strong></div><div><small>KOLEJNE ROZLICZENIE</small><strong id="factions-income-clock"></strong></div></div><p class="factions-hint">Kontrola daje +3% do nagród zleceń za dzielnicę. Dochód $40 na dzielnicę co minutę otrzymują aktywni członkowie z co najmniej 60 lojalności. Czas offline nie nalicza zaległych wypłat.</p>`;
 }
 private territories(snapshot:FactionsSnapshot){
  return`<p class="factions-intro">Frakcja przejmuje teren przy co najmniej 35 wpływach i przewadze 10 punktów. Udane zlecenia podnoszą twoje wpływy i zmniejszają wpływy rywali.</p><div class="factions-district-grid">${snapshot.districts.map(area=>`<article class="factions-district"><span class="factions-eyebrow">${area.controller?safe(FACTIONS[area.controller].name):area.contested?'TEREN SPORNY':'TEREN NEUTRALNY'}</span><h2>${area.name}</h2>${Object.values(FACTIONS).map(team=>`<div class="factions-influence"><span>${team.name}</span><strong>${area.influence[team.id]}</strong><progress style="--team-color:${color(team.color)}" max="100" value="${area.influence[team.id]}"></progress></div>`).join('')}<div class="factions-row"><button id="factions-route-${area.id}" class="factions-button">Pokaż dzielnicę</button><button id="factions-capture-${area.id}" class="factions-button" ${!snapshot.profile.faction||snapshot.profile.loyalty<60||snapshot.job.status==='active'||snapshot.job.cooldownMs>0?'disabled':''}>Kontroluj teren · 60 lojalności</button></div></article>`).join('')}</div>`;
 }
 private jobs(snapshot:FactionsSnapshot){
  const current=snapshot.job;
  return`<section class="factions-current"><div class="factions-row"><h2>${current.kind?FACTION_JOBS[current.kind].name:'Wybierz zlecenie'}</h2><strong id="factions-job-clock"></strong></div><p>${safe(current.message)}</p>${current.status==='active'?`<div class="factions-row"><span>${current.district?DISTRICTS[current.district].name:''} · ${stages[current.stage??'']??''} · $${current.reward}</span><button id="factions-job-route" class="factions-button">Trasa do celu</button><button id="factions-interact" class="factions-button" ${!current.canInteract?'disabled':''}>${current.holding?'Utrzymuj pozycję':current.stage==='channel'||current.stage==='control'?'Rozpocznij przejęcie':'Potwierdź punkt · E'}</button><button id="factions-cancel" class="factions-button">Anuluj</button></div>${current.holding?`<label class="factions-hold">${current.contested?'Rywal przerywa kontrolę':`Postęp ${current.progress}%`}<progress max="100" value="${current.progress}"></progress></label>`:''}`:''}</section><div class="factions-job-grid">${Object.values(FACTION_JOBS).map(job=>{const kind=Object.keys(FACTION_JOBS).find(key=>FACTION_JOBS[key as FactionJobKind]===job) as FactionJobKind;return`<article class="factions-job"><h2>${job.name}</h2><p>${kind==='courier'?'Odbierz i dostarcz przesyłkę pod barwami swojej ekipy.':kind==='transmitter'?'Przejmij nadajnik pieszo przez 6 sekund i wynieś dane do punktu przekazania.':'Utrzymaj centrum dzielnicy pieszo przez 10 sekund. Rywal w strefie zeruje postęp.'}</p><strong>$${job.reward} + bonus · ${job.reputation} REP · ${job.influence} wpływów</strong><small>${job.requires?`Od ${job.requires} lojalności`:'Dostępne od początku'} · limit 3 minuty</small><div class="factions-job-buttons">${Object.values(DISTRICTS).map(area=>`<button id="factions-start-${area.id}-${kind}" class="factions-button" ${!snapshot.profile.faction||snapshot.profile.loyalty<job.requires||current.status==='active'||current.cooldownMs>0?'disabled':''}>${area.name}</button>`).join('')}</div></article>`;}).join('')}</div>`;
 }
}

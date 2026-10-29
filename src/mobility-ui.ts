import './mobility.css';
import { BIKE_LOCATION, DOCK, MOBILITY_COURSES, type MobilityCourse, type MobilityTrialAction, type MobilityTrialSnapshot } from './mobility';
import type { Point } from './model';

export interface MobilityCallbacks {
 getSnapshot():MobilityTrialSnapshot;
 getMounted?():{kind:string;x:number;z:number}|null;
 onAction(action:MobilityTrialAction):void;
 onRoute(target:Point,label:string):void;
 onOpen():void;onClose():void;onMessage?(text:string):void;
}
const safe=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const clock=(value:number)=>{const seconds=Math.max(0,Math.ceil(value/1000));return`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;};
/** The panel issues intent; the same trial controller runs solo and on the room host. */
export class MobilityUI {
 private root:HTMLDivElement|null=null;private signature='';private message='';private previousFocus:HTMLElement|null=null;
 constructor(private parent:HTMLElement,private callbacks:MobilityCallbacks){}
 get active(){return this.root!==null;}
 open(){if(this.root)return;this.previousFocus=document.activeElement as HTMLElement;this.signature='';this.message='';this.root=document.createElement('div');this.root.id='mobility-dialog';this.root.className='mobility-overlay';this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');this.root.setAttribute('aria-labelledby','mobility-heading');this.root.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();this.close();}if(event.key==='Tab')this.trap(event);});this.parent.append(this.root);this.callbacks.onOpen();this.refresh();this.root.querySelector<HTMLButtonElement>('#mobility-close')?.focus();}
 close(){if(!this.root)return;this.root.remove();this.root=null;this.callbacks.onClose();if(this.previousFocus?.isConnected&&this.previousFocus.getClientRects().length)this.previousFocus.focus({preventScroll:true});this.previousFocus=null;}
 handleEscape(){this.close();}destroy(){this.close();}
 report(message:string){this.message=message;this.refresh(true);}
 refresh(force=false){
  if(!this.root)return;const state=this.callbacks.getSnapshot(),mounted=this.callbacks.getMounted?.();
  const canStart=(course:MobilityCourse)=>Boolean(mounted&&mounted.kind===course&&Math.hypot(mounted.x-MOBILITY_COURSES[course].start.x,mounted.z-MOBILITY_COURSES[course].start.z)<=10&&state.status!=='running'&&state.cooldownMs===0);
  const signature=JSON.stringify([state.status,state.course,state.run,state.checkpoint,state.message,state.bestMs,Boolean(state.cooldownMs),canStart('bike'),canStart('boat'),this.message]);
  if(!force&&signature===this.signature){const timer=this.root.querySelector('#mobility-timer');if(timer)timer.textContent=state.status==='running'?clock(state.remainingMs):state.cooldownMs?`Przerwa ${clock(state.cooldownMs)}`:'Gotowy do startu';return;}
  this.signature=signature;const focused=this.root.contains(document.activeElement)?(document.activeElement as HTMLElement).id:'',scroll=this.root.querySelector('.mobility-panel')?.scrollTop??0;
  this.root.innerHTML=`<section class="mobility-panel"><header><div><span>NEON COAST · DROGA I OCEAN</span><h1 id="mobility-heading">Zmień tempo.</h1></div><button id="mobility-close" aria-label="Zamknij próby czasowe">×</button></header><p>Motocykl czeka przy południowej alei. Motorówkę przejmiesz przy wejściu na pomost na Ocean Drive. Oba pojazdy są dostępne bez zakupu.</p><div class="mobility-courses">${(['bike','boat'] as MobilityCourse[]).map(kind=>{const course=MOBILITY_COURSES[kind];return`<article class="mobility-course mobility-${kind}"><div class="mobility-art" aria-hidden="true">${kind==='bike'?'◉━━◉':'⛵'}</div><span>${kind==='bike'?'VORTEX R · MOTOCYKL':'TIDERUNNER · MOTORÓWKA'}</span><h2>${course.name}</h2><p>${kind==='bike'?'Wąskie przejazdy, szybsze skręty i prawdziwe skoki na oznaczonych rampach. Cztery punkty na ulicach.':'Płynne zakręty i bezwładność na oceanie. Cztery boje, powrót do przystani. Wysiądziesz dopiero przy pomoście.'}</p><strong>${clock(course.durationMs)} · +$${course.reward}</strong><button id="mobility-route-${kind}">Znajdź ${kind==='bike'?'motocykl':'przystań'} na GPS</button><button id="mobility-start-${kind}" ${!canStart(kind)?'disabled':''}>Rozpocznij próbę</button><small>${kind==='bike'?'Wsiądź na motocykl i zatrzymaj się przy starcie (0, 80).':'Będąc za sterem, wróć do boi startowej przy pomoście.'}</small></article>`;}).join('')}</div><section class="mobility-progress"><strong id="mobility-timer">${state.status==='running'?clock(state.remainingMs):state.cooldownMs?`Przerwa ${clock(state.cooldownMs)}`:'Gotowy do startu'}</strong><p id="mobility-status" role="status">${safe(this.message||state.message)}</p>${state.course?`<div>Punkty: ${state.checkpoint}/${state.total}${state.bestMs!==null?` · Rekord: ${(state.bestMs/1000).toFixed(2)} s`:''}</div>`:''}${state.status==='running'?'<button id="mobility-target">GPS do punktu</button><button id="mobility-cancel">Przerwij próbę</button>':''}</section><footer><span>WASD · Shift — pełna moc · E — wsiądź / wysiądź po zatrzymaniu</span><button id="mobility-back">Wracam do gry →</button></footer></section>`;
  const on=(id:string,callback:()=>void)=>this.root!.querySelector(id)?.addEventListener('click',callback);
  on('#mobility-close',()=>this.close());on('#mobility-back',()=>this.close());on('#mobility-cancel',()=>this.callbacks.onAction({kind:'cancel'}));on('#mobility-target',()=>{const target=this.callbacks.getSnapshot().target;if(target){this.close();this.callbacks.onRoute(target,'Punkt próby czasowej');}});
  for(const kind of['bike','boat'] as MobilityCourse[]){on(`#mobility-route-${kind}`,()=>{this.close();this.callbacks.onRoute(kind==='bike'?BIKE_LOCATION:DOCK.land,kind==='bike'?'Motocykl Vortex R':'Przystań TideRunner');});on(`#mobility-start-${kind}`,()=>this.callbacks.onAction({kind:'start',course:kind}));}
  const card=this.root.querySelector('.mobility-panel');if(card)card.scrollTop=scroll;const focus=focused?this.root.querySelector<HTMLElement>(`#${CSS.escape(focused)}`):null;if(focus&&!focus.matches(':disabled'))focus.focus({preventScroll:true});
 }
 private trap(event:KeyboardEvent){const buttons=[...this.root!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],first=buttons[0],last=buttons.at(-1);if(!buttons.includes(document.activeElement as HTMLButtonElement)){(event.shiftKey?last:first)?.focus();event.preventDefault();}else if(event.shiftKey&&document.activeElement===first){last?.focus();event.preventDefault();}else if(!event.shiftKey&&document.activeElement===last){first?.focus();event.preventDefault();}}
}

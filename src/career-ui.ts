import './career.css';
import { CONTACTS, CREW_BASE, FURNITURE, HOMES, careerTarget, reputationTier, type CareerAction, type CareerState, type CrewBaseAction, type CrewBaseState, type HomeId } from './career';
import { GARAGE_CARS, type GarageState } from './garage';
import type { Point } from './model';

export type VisitHomeId=HomeId|'crew';
export interface CareerCallbacks {
 getCareer():CareerState; getWallet():number; getGarage():GarageState;
 getBase?():CrewBaseState; isOnline?():boolean; isHost?():boolean;
 getHome?():VisitHomeId|null; getPosition?():Point; getTime?():number;
 onAction(action:CareerAction):void; onBaseAction?(action:CrewBaseAction):void;
 onRoute(target:Point,label:string):void; onEnterHome(id:VisitHomeId):void; onPlanning():void;
 onOpen():void; onClose():void; onMessage(text:string):void;
}
const money=(n:number)=>`$${Math.max(0,n).toLocaleString('pl-PL')}`;
const safe=(text:string)=>text.replace(/[&<>"']/g,item=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[item]!));
export class CareerUI {
 private root:HTMLDivElement|null=null; private visible=false; private signature=''; private message='';
 private previousFocus:HTMLElement|null=null; private pending=false; private timer:ReturnType<typeof setTimeout>|null=null;
 constructor(private parent:HTMLElement,private callbacks:CareerCallbacks){}
 get active(){return this.visible;}
 open(){
  if(this.visible)return;this.visible=true;this.message='';this.signature='';this.previousFocus=document.activeElement as HTMLElement;
  this.root=document.createElement('div');this.root.id='career-root';this.root.className='career-overlay';this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');this.root.setAttribute('aria-labelledby','career-heading');
  this.root.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();this.close();}else if(event.key==='Tab')this.trapFocus(event);});
  this.parent.append(this.root);this.callbacks.onOpen();this.refresh();this.query('#career-close')?.focus({preventScroll:true});
 }
 close(){
  if(!this.visible)return;this.visible=false;this.clearPending();this.root?.remove();this.root=null;this.callbacks.onClose();
  const focus=this.previousFocus;this.previousFocus=null;if(focus?.isConnected&&focus.getClientRects().length)focus.focus({preventScroll:true});
 }
 handleEscape(){this.close();} destroy(){this.close();}
 report(message:string){this.refresh(message);}
 refresh(message?:string){
  if(!this.visible)return;
  const career=this.callbacks.getCareer(),home=this.callbacks.getHome?.()??null,pos=this.callbacks.getPosition?.();
  const near=[...Object.values(HOMES).map(place=>pos?Math.hypot(place.door.x-pos.x,place.door.z-pos.z)<=9:false),pos?Math.hypot(CREW_BASE.door.x-pos.x,CREW_BASE.door.z-pos.z)<=9:false];
  const signature=JSON.stringify([career,this.callbacks.getWallet(),this.callbacks.getGarage(),this.callbacks.getBase?.(),this.callbacks.isOnline?.(),this.callbacks.isHost?.(),home,near]);
  if(signature===this.signature&&!message){this.clock();return;}
  this.signature=signature;this.clearPending();if(message)this.message=message;this.render();
 }
 private clearPending(){this.pending=false;if(this.timer!==null)clearTimeout(this.timer);this.timer=null;}
 private request(action:()=>void){
  if(this.pending)return;this.pending=true;this.message='Potwierdzanie…';this.render();this.timer=setTimeout(()=>{this.clearPending();this.message='Brak potwierdzenia. Sprawdź połączenie i spróbuj ponownie.';this.render();},7000);
  try{action();}catch(error){this.report(error instanceof Error?error.message:'Nie udało się wykonać akcji.');}
 }
 private query<T extends HTMLElement=HTMLElement>(selector:string){return this.root?.querySelector<T>(selector)??null;}
 private trapFocus(event:KeyboardEvent){
  const buttons=[...(this.root?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[])],first=buttons[0],last=buttons.at(-1);
  if(!buttons.includes(document.activeElement as HTMLButtonElement)){(event.shiftKey?last:first)?.focus();event.preventDefault();}
  else if(event.shiftKey&&document.activeElement===first){last?.focus();event.preventDefault();}else if(!event.shiftKey&&document.activeElement===last){first?.focus();event.preventDefault();}
 }
 private clock(){const career=this.callbacks.getCareer(),c=career.activeContract,node=this.query('#career-contract-clock');if(node&&c){const remain=Math.max(0,Math.ceil(c.deadline-(this.callbacks.getTime?.()??c.startedAt)));node.textContent=`${Math.floor(remain/60)}:${String(remain%60).padStart(2,'0')}`;}}
 private render(){
  if(!this.root)return;
  const focused=this.root.contains(document.activeElement)?(document.activeElement as HTMLElement).id:'',scroll=this.query('.career-shell')?.scrollTop??0;
  const career=this.callbacks.getCareer(),wallet=this.callbacks.getWallet(),garage=this.callbacks.getGarage(),online=Boolean(this.callbacks.isOnline?.()),base=this.callbacks.getBase?.(),activeHome=this.callbacks.getHome?.()??null;
  const disabled=this.pending?'disabled':'';
  const c=career.activeContract,contract=c?CONTACTS[c.id]:null;
  this.root.innerHTML=`<section class="career-shell"><header class="career-header"><div><span class="career-eyebrow">NEON COAST · TWOJA HISTORIA</span><h1 id="career-heading">Kontakty i kryjówki</h1><p>${online?'Reputacja, lokale i portfel dotyczą obecnego pokoju.':'Twoja reputacja, mieszkania i wyposażenie zapisują się w tej przeglądarce.'}</p></div><div class="career-actions"><strong>${money(wallet)}</strong><button id="career-close" class="career-button" aria-label="Zamknij kontakty i kryjówki">Wróć ×</button></div></header>
   <section class="career-rank" aria-label="Reputacja"><div><span class="career-eyebrow">REPUTACJA ${career.reputation}</span><h2>${reputationTier(career.reputation)}</h2></div><p>${career.completedContracts} zleceń kontaktów · ${career.ownedHomes.length} własnych lokali</p></section>
   ${c&&contract?`<section class="career-current"><div class="career-row"><h2>${contract.title}</h2><strong id="career-contract-clock"></strong></div><p>${contract.objectives[c.stage].instruction}</p><div class="career-row"><span>Punkt ${c.stage+1}/${contract.objectives.length} · +${money(contract.reward)} · +${contract.xp} reputacji</span><button id="career-contract-route" class="career-button">Trasa do celu</button><button id="career-contract-visit" class="career-button" ${disabled}>Potwierdź punkt</button><button id="career-contract-cancel" class="career-button career-button-quiet" ${disabled}>Anuluj zlecenie</button></div></section>`:''}
   <h2 class="career-section-title">Ludzie, którzy mają robotę</h2><div class="career-contacts">${Object.values(CONTACTS).map(contact=>{const locked=career.reputation<contact.reputation;return`<article class="career-contact ${locked?'is-locked':''}"><span class="career-eyebrow">${contact.contact}</span><h3>${contact.title}</h3><p>${contact.objectives.length} punkty · ${Math.floor(contact.duration/60)}:${String(contact.duration%60).padStart(2,'0')} min</p><strong>+${money(contact.reward)} · +${contact.xp} reputacji</strong><button class="career-button" id="career-contract-${contact.id}" ${disabled||locked||c?'disabled':''}>${locked?`Od ${contact.reputation} reputacji`:'Przyjmij zlecenie'}</button></article>`;}).join('')}</div>
   <h2 class="career-section-title">Miejsce, do którego wracasz</h2><div class="career-homes">${Object.values(HOMES).map(place=>{const owned=career.ownedHomes.includes(place.id),items=career.furniture[place.id]??[],inside=activeHome===place.id;return`<article class="career-home"><div class="career-home-art career-home-art-${place.id}" aria-hidden="true"><span>${place.id==='canal'?'⌂':'◈'}</span></div><div class="career-home-content"><span class="career-eyebrow">${owned?'TWÓJ LOKAL':`OD ${place.reputation} REPUTACJI`}</span><h3>${place.name}</h3><p>${place.description}</p><div class="career-row">${!owned?`<button class="career-button" id="career-buy-${place.id}" ${this.pending||wallet<place.price||career.reputation<place.reputation?'disabled':''}>Kup · ${money(place.price)}</button>`:`<button class="career-button" id="career-route-${place.id}">Trasa do domu</button><button class="career-button" id="career-enter-${place.id}" ${inside?'disabled':''}>Wejdź do mieszkania</button>`}</div>${owned?`<div class="career-furniture">${Object.entries(FURNITURE).map(([id,item])=>`<div><strong>${item.name}</strong><small>${item.description}</small><button class="career-button" id="career-furnish-${place.id}-${id}" ${this.pending||items.includes(id as never)||wallet<item.price?'disabled':''}>${items.includes(id as never)?'W mieszkaniu':`Kup · ${money(item.price)}`}</button></div>`).join('')}</div><div class="career-row"><button class="career-button" id="career-rest-${place.id}" ${this.pending||!items.includes('sofa')?'disabled':''}>Odpocznij</button><button class="career-button" id="career-repair-${place.id}" ${this.pending||!items.includes('workbench')||wallet<35?'disabled':''}>Napraw własne auto · $35</button><button class="career-button" id="career-plan-${place.id}">Stół planowania</button></div><div class="career-storage"><h4>Parking przy mieszkaniu</h4><p>Przyjedź do domu. Zaparkowane auto zostaje zabezpieczone; odbierz je przy wyjeździe.</p><button class="career-button" id="career-store-${place.id}" ${this.pending||Boolean(career.storedCars[garage.selected])?'disabled':''}>Zaparkuj ${GARAGE_CARS[garage.selected].name}</button>${garage.owned.filter(car=>career.storedCars[car]===place.id).map(car=>`<button class="career-button" id="career-retrieve-${place.id}-${car}" ${disabled}>Odbierz ${GARAGE_CARS[car].name}</button>`).join('')}</div>`:''}</div></article>`;}).join('')}</div>
   ${online?`<section class="career-base"><span class="career-eyebrow">WSPÓLNE MIEJSCE EKIPY</span><h2>${CREW_BASE.name}</h2><p>${base?.owned?'Baza jest otwarta dla wszystkich członków pokoju. Spotkajcie się przy stole i zaplanujcie napad.':'Gospodarz może kupić wspólną bazę z portfela pokoju. Baza i jej wyposażenie są wspólne.'}</p><div class="career-row">${base?.owned?'<button id="career-base-route" class="career-button">Trasa do bazy</button><button id="career-base-enter" class="career-button">Wejdź do bazy</button><button id="career-base-plan" class="career-button">Zaplanuj napad</button>':`<button id="career-base-buy" class="career-button" ${this.pending||!this.callbacks.isHost?.()||wallet<CREW_BASE.price?'disabled':''}>Kup bazę · ${money(CREW_BASE.price)}</button>`}</div>${base?.owned?`<div class="career-row">${Object.entries(FURNITURE).map(([id,item])=>`<button class="career-button" id="career-base-${id}" ${this.pending||!this.callbacks.isHost?.()||base.furniture.includes(id as never)||wallet<item.price?'disabled':''}>${base.furniture.includes(id as never)?'✓ ':''}${item.name} · ${money(item.price)}</button>`).join('')}</div>`:''}</section>`:''}
   <footer class="career-footer"><p id="career-message" role="status" aria-live="polite">${safe(this.message||'Wykonuj zlecenia, zdobywaj reputację i odblokowuj nowe kontakty.')}</p><small>ESC · POWRÓT NA ULICĘ</small></footer></section>`;
  const on=(id:string,callback:()=>void)=>this.query(id)?.addEventListener('click',callback);
  const action=(a:CareerAction)=>this.request(()=>this.callbacks.onAction(a));
  on('#career-close',()=>this.close());
  Object.values(CONTACTS).forEach(contact=>on(`#career-contract-${contact.id}`,()=>action({type:'contractStart',contract:contact.id})));
  on('#career-contract-cancel',()=>action({type:'contractCancel'}));on('#career-contract-visit',()=>action({type:'contractVisit'}));
  on('#career-contract-route',()=>{const target=careerTarget(this.callbacks.getCareer());if(target){this.close();this.callbacks.onRoute(target,contract?.title??'Zlecenie kontaktu');}});
  Object.values(HOMES).forEach(place=>{
   on(`#career-buy-${place.id}`,()=>action({type:'buyHome',home:place.id}));
   on(`#career-route-${place.id}`,()=>{this.close();this.callbacks.onRoute(place.door,place.name);});
   on(`#career-enter-${place.id}`,()=>{this.close();this.callbacks.onEnterHome(place.id);});
   Object.keys(FURNITURE).forEach(item=>on(`#career-furnish-${place.id}-${item}`,()=>action({type:'furnish',home:place.id,item:item as keyof typeof FURNITURE})));
   on(`#career-store-${place.id}`,()=>action({type:'storeCar',home:place.id,car:garage.selected}));
   garage.owned.forEach(car=>on(`#career-retrieve-${place.id}-${car}`,()=>action({type:'retrieveCar',home:place.id,car})));
   on(`#career-rest-${place.id}`,()=>action({type:'rest',home:place.id}));on(`#career-repair-${place.id}`,()=>action({type:'repairCar',home:place.id}));
   on(`#career-plan-${place.id}`,()=>{this.close();this.callbacks.onPlanning();});
  });
  on('#career-base-buy',()=>this.request(()=>this.callbacks.onBaseAction?.({type:'buy'})));
  on('#career-base-route',()=>{this.close();this.callbacks.onRoute(CREW_BASE.door,CREW_BASE.name);});
  on('#career-base-enter',()=>{this.close();this.callbacks.onEnterHome('crew');});on('#career-base-plan',()=>{this.close();this.callbacks.onPlanning();});
  Object.keys(FURNITURE).forEach(item=>on(`#career-base-${item}`,()=>this.request(()=>this.callbacks.onBaseAction?.({type:'furnish',item:item as keyof typeof FURNITURE}))));
  const shell=this.query('.career-shell');if(shell)shell.scrollTop=scroll;
  const replacement=focused?this.query<HTMLButtonElement>(`#${CSS.escape(focused)}`):null;if(replacement&&!replacement.disabled)replacement.focus({preventScroll:true});
  else if(!this.root.contains(document.activeElement))this.query('#career-close')?.focus({preventScroll:true});
  this.clock();
 }
}

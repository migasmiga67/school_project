import './appearance.css';
import { APPEARANCE_ITEMS, APPEARANCE_SLOTS, appearanceColors, type AppearanceAction, type AppearanceSlot, type AppearanceState } from './appearance';

export interface AppearanceCallbacks {
 getAppearance():AppearanceState;getWallet():number;isOnline?():boolean;
 onAction(action:AppearanceAction):void;onOpen():void;onClose():void;onMessage(text:string):void;
}
const slotNames:Record<AppearanceSlot,string>={shirt:'Ubrania',pants:'Spodnie',hair:'Fryzury',accessory:'Dodatki',skin:'Odcień skóry'};
const safe=(value:string)=>value.replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!));
const hex=(value:number)=>`#${value.toString(16).padStart(6,'0')}`;
export class AppearanceUI {
 private root:HTMLDivElement|null=null;
 private selected:AppearanceSlot='shirt';
 private previousFocus:HTMLElement|null=null;
 private signature='';
 private message='';
 private pending=false;
 private timer:ReturnType<typeof setTimeout>|null=null;
 constructor(private parent:HTMLElement,private callbacks:AppearanceCallbacks){}
 get active(){return this.root!==null;}
 open(){
  if(this.root)return;this.signature='';this.message='';this.previousFocus=document.activeElement as HTMLElement;
  this.root=document.createElement('div');this.root.id='appearance-dialog';this.root.className='appearance-overlay';this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');this.root.setAttribute('aria-labelledby','appearance-heading');
  this.root.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();this.close();}else if(event.key==='Tab')this.trapFocus(event);});
  this.parent.append(this.root);this.callbacks.onOpen();this.refresh();this.query('#appearance-close')?.focus({preventScroll:true});
 }
 close(){if(!this.root)return;this.clearPending();this.root.remove();this.root=null;this.callbacks.onClose();const target=this.previousFocus;this.previousFocus=null;if(target?.isConnected&&target.getClientRects().length)target.focus({preventScroll:true});}
 handleEscape(){this.close();}destroy(){this.close();}
 report(message:string){this.refresh(message);}
 refresh(message?:string){
  if(!this.root)return;const signature=JSON.stringify([this.callbacks.getAppearance(),this.callbacks.getWallet(),this.callbacks.isOnline?.()]);
  if(signature===this.signature&&!message)return;this.signature=signature;this.clearPending();if(message)this.message=message;this.render();
 }
 private query<T extends HTMLElement=HTMLElement>(selector:string){return this.root?.querySelector<T>(selector)??null;}
 private clearPending(){this.pending=false;if(this.timer!==null)clearTimeout(this.timer);this.timer=null;}
 private issue(action:AppearanceAction){
  if(this.pending)return;this.pending=true;this.message='Potwierdzanie…';this.render();this.timer=setTimeout(()=>{this.clearPending();this.message='Brak potwierdzenia. Sprawdź połączenie i spróbuj ponownie.';this.render();},7000);
  try{this.callbacks.onAction(action);}catch(error){this.report(error instanceof Error?error.message:'Nie udało się zmienić wyglądu.');}
 }
 private trapFocus(event:KeyboardEvent){
  const controls=[...(this.root?.querySelectorAll<HTMLElement>('button:not(:disabled)')??[])],first=controls[0],last=controls.at(-1);
  if(!controls.includes(document.activeElement as HTMLElement)){(event.shiftKey?last:first)?.focus();event.preventDefault();}else if(event.shiftKey&&document.activeElement===first){last?.focus();event.preventDefault();}else if(!event.shiftKey&&document.activeElement===last){first?.focus();event.preventDefault();}
 }
 private render(){
  if(!this.root)return;const appearance=this.callbacks.getAppearance(),wallet=this.callbacks.getWallet(),colors=appearanceColors(appearance);
  const focus=this.root.contains(document.activeElement)?(document.activeElement as HTMLElement).id:'',scroll=this.query('.appearance-items')?.scrollTop??0;
  this.root.innerHTML=`<section class="appearance-panel"><header><div><span class="appearance-eyebrow">NEON COAST · TWÓJ STYL</span><h1 id="appearance-heading">Garderoba</h1><p>${this.callbacks.isOnline?.()?'Zakupy dotyczą obecnego pokoju. Ekipa widzi twój strój.':'Wygląd i zakupione rzeczy zapisują się w twoim profilu.'}</p></div><button id="appearance-close" aria-label="Zamknij garderobę">×</button></header>
   <div class="appearance-summary"><div class="appearance-preview appearance-hair-${safe(colors.hairstyle)} appearance-accessory-${safe(colors.accessoryStyle)}" style="--shirt:${hex(colors.shirt)};--pants:${hex(colors.pants)};--skin:${hex(colors.skin)};--hair:${hex(colors.hair)};--accessory:${hex(colors.accessory)}" aria-hidden="true"><i class="appearance-preview-head"></i><i class="appearance-preview-hair"></i><i class="appearance-preview-shirt"></i><i class="appearance-preview-arms"></i><i class="appearance-preview-pants"></i><i class="appearance-preview-accessory"></i></div><div><span class="appearance-eyebrow">${this.callbacks.isOnline?.()?'PORTFEL POKOJU':'TWOJA GOTÓWKA'}</span><strong id="appearance-wallet">$${wallet.toLocaleString('pl-PL')}</strong><p id="appearance-crew-status">${appearance.crewOutfit?'Wspólne barwy ekipy są aktywne.':'Twój własny zestaw kolorów.'}</p><button id="appearance-crew" ${this.pending?'disabled':''}>${appearance.crewOutfit?'Wróć do własnych barw':'Załóż barwy ekipy · bez opłat'}</button></div></div>
   <div class="appearance-tabs" role="tablist" aria-label="Kategorie garderoby">${APPEARANCE_SLOTS.map(slot=>`<button id="appearance-tab-${slot}" role="tab" aria-selected="${this.selected===slot}" aria-controls="appearance-items">${slotNames[slot]}</button>`).join('')}</div>
   <div class="appearance-items" id="appearance-items" role="tabpanel" aria-label="${slotNames[this.selected]}">${APPEARANCE_ITEMS.filter(item=>item.slot===this.selected).map(item=>{const owned=appearance.owned.includes(item.id),selected=appearance.selected[this.selected]===item.id;return`<article class="appearance-item ${selected?'is-selected':''}"><span class="appearance-swatch" style="--swatch:${hex(item.color)}" aria-hidden="true"></span><div><h2>${safe(item.name)}</h2><small>${selected?'WYBRANY':owned?'W TWOJEJ GARDEROBIE':`$${item.price}`}</small></div><button id="appearance-${owned?'equip':'buy'}-${item.id}" ${this.pending||selected||!owned&&wallet<item.price?'disabled':''}>${selected?'Założone':owned?'Załóż':`Kup · $${item.price}`}</button></article>`;}).join('')}</div>
   <footer><p id="appearance-message" role="status" aria-live="polite">${safe(this.message||'Kupiony element od razu trafia na twoją postać. Zmiany widać także w mieście i mieszkaniu.')}</p><button id="appearance-back">Wróć do miasta →</button></footer></section>`;
  this.query('#appearance-close')?.addEventListener('click',()=>this.close());this.query('#appearance-back')?.addEventListener('click',()=>this.close());
  this.query('#appearance-crew')?.addEventListener('click',()=>this.issue({type:'crew',enabled:!this.callbacks.getAppearance().crewOutfit}));
  for(const slot of APPEARANCE_SLOTS)this.query(`#appearance-tab-${slot}`)?.addEventListener('click',()=>{this.selected=slot;this.render();this.query(`#appearance-tab-${slot}`)?.focus({preventScroll:true});});
  for(const item of APPEARANCE_ITEMS.filter(value=>value.slot===this.selected)){
   this.query(`#appearance-buy-${item.id}`)?.addEventListener('click',()=>this.issue({type:'buy',item:item.id}));
   this.query(`#appearance-equip-${item.id}`)?.addEventListener('click',()=>this.issue({type:'equip',slot:item.slot,item:item.id}));
  }
  const items=this.query('.appearance-items');if(items)items.scrollTop=scroll;
  const replacement=focus?this.query(`#${CSS.escape(focus)}`):null;if(replacement&&!replacement.matches(':disabled'))replacement.focus({preventScroll:true});else if(!this.root.contains(document.activeElement))this.query('#appearance-close')?.focus({preventScroll:true});
 }
}

import './phone.css';
import { CASINO } from './casino-location';
import { CONTACTS, CREW_BASE, HOMES } from './career';
import { GARAGE_LOCATION } from './garage';
import { PHONE_CHAT_LENGTH, PHONE_DELIVERY_PRICE, type PhoneAction, type PhoneActivity, type PhoneSnapshot } from './phone';
import { BUILDINGS, NATURAL_BLOCKS, ROAD_X, ROAD_Z, WORLD_BOUNDS, type Point } from './model';
import { WATER_BOUNDS } from './mobility';
import { WORLD_LANDMARKS } from './world-layout';

export interface PhoneDestination {id:string;name:string;point:Point;icon?:string}
export interface PhoneCallbacks {
 getSnapshot():PhoneSnapshot;getWallet():number;isOnline():boolean;getSelfId():string;
 getPosition?():Point;getReputation?():number;getCarName?():string;getDestinations?():readonly PhoneDestination[];
 onAction(action:PhoneAction):void;onRoute(point:Point,label:string):void;onContacts():void;onActivities():void;
 onAppearance?():void;onFactions?():void;onCampaign?():void;onMobility?():void;
 onOpen():void;onClose():void;onMessage(text:string):void;
}
type Tab='home'|'map'|'contacts'|'chat'|'invites'|'garage';
const safe=(value:string)=>value.replace(/[&<>"']/g,item=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[item]!));
const money=(value:number)=>`$${Math.max(0,value).toLocaleString('pl-PL')}`;
const labels:Record<Tab,string>={home:'Start',map:'Mapa',contacts:'Kontakty',chat:'Czat',invites:'Ekipa',garage:'Auto'};
const activities:Record<PhoneActivity,string>={heist:'Skok na Sapphire',bank:'Northside Bank',race:'Nocny sprint',challenge:'Nocny przerzut'};
export const PHONE_DESTINATIONS:readonly PhoneDestination[]=[{id:'casino',name:CASINO.name,point:CASINO.door,icon:'♠'},{id:'garage',name:'MOD SHOP · garaż',point:GARAGE_LOCATION,icon:'G'},...Object.values(HOMES).map(home=>({id:home.id,name:home.name,point:home.door,icon:'⌂'})),{id:'crew',name:CREW_BASE.name,point:CREW_BASE.door,icon:'B'},...WORLD_LANDMARKS.map((place,index)=>({id:place.id,name:place.name,point:place.point,icon:['W','N','P','S'][index]}))];
const fullMapBounds={minX:WORLD_BOUNDS.minX-16,maxX:WATER_BOUNDS.maxX+16,minZ:Math.min(WORLD_BOUNDS.minZ,WATER_BOUNDS.minZ)-16,maxZ:Math.max(WORLD_BOUNDS.maxZ,WATER_BOUNDS.maxZ)+16};
const fullMapScale=Math.min(268/(fullMapBounds.maxX-fullMapBounds.minX),218/(fullMapBounds.maxZ-fullMapBounds.minZ));
/** Full-world overview is independent from the player's neighborhood minimap. */
export function projectPhoneMap(point:Point){return{x:140+(point.x-(fullMapBounds.minX+fullMapBounds.maxX)/2)*fullMapScale,y:115+(point.z-(fullMapBounds.minZ+fullMapBounds.maxZ)/2)*fullMapScale};}

/** The phone is a presentation of host-owned state; map and contact buttons use existing game screens. */
export class PhoneUI {
 private root:HTMLDivElement|null=null;
 private tab:Tab='home';
 private signature='';
 private notice='';
 private draft='';
 private inviteActivity:PhoneActivity='heist';
 private previousFocus:HTMLElement|null=null;
 private lastAction=-Infinity;
 private lastActionKey='';
 constructor(private parent:HTMLElement,private callbacks:PhoneCallbacks){}
 get active(){return this.root!==null;}
 open(tab:Tab='home'){
  this.tab=tab;
  if(this.root){this.refresh(true);return;}
  this.notice='';this.signature='';this.previousFocus=document.activeElement as HTMLElement;
  this.root=document.createElement('div');this.root.id='phone-root';this.root.className='phone-overlay';
  this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');this.root.setAttribute('aria-labelledby','phone-heading');
  this.root.addEventListener('keydown',event=>{
   event.stopPropagation();
   if(event.key==='Escape'){event.preventDefault();this.close();return;}
   if(event.key==='Tab')this.trapFocus(event);
  });
  this.parent.append(this.root);this.callbacks.onOpen();this.refresh(true);this.query('#phone-close')?.focus({preventScroll:true});
 }
 close(){
  if(!this.root)return;this.root.remove();this.root=null;this.callbacks.onClose();
  const focus=this.previousFocus;this.previousFocus=null;if(focus?.isConnected&&focus.getClientRects().length)focus.focus({preventScroll:true});
 }
 handleEscape(){this.close();}
 destroy(){this.close();}
 report(text:string){if(text===this.notice)return;this.notice=text;this.refresh(true);}
 refresh(force=false){
  if(!this.root)return;
  const snapshot=this.callbacks.getSnapshot(),position=this.callbacks.getPosition?.();
  const signature=JSON.stringify([this.tab,snapshot.messages,snapshot.invites,snapshot.deliveryCooldownMs>0,this.callbacks.getWallet(),this.callbacks.isOnline(),this.callbacks.getReputation?.(),this.callbacks.getCarName?.(),position&&[Math.round(position.x),Math.round(position.z)],this.notice]);
  if(force||signature!==this.signature){this.signature=signature;this.render(snapshot);}
  const timer=this.query('#phone-delivery-cooldown');if(timer)timer.textContent=snapshot.deliveryCooldownMs>0?`Kolejna dostawa za ${Math.ceil(snapshot.deliveryCooldownMs/1000)} s`:'Kurier jest dostępny';
  for(const invite of snapshot.invites){const node=this.query(`#phone-invite-clock-${invite.id}`);if(node)node.textContent=invite.status==='expired'?'Zaproszenie wygasło':invite.status==='cancelled'?'Zaproszenie anulowane':'Potwierdźcie plan w panelu J';}
 }
 private query<T extends HTMLElement=HTMLElement>(selector:string){return this.root?.querySelector<T>(selector)??null;}
 private issue(action:PhoneAction){
  const now=performance.now(),key=JSON.stringify(action);if(key===this.lastActionKey&&now-this.lastAction<750)return;
  this.lastAction=now;this.lastActionKey=key;this.notice='';
  try{this.callbacks.onAction(action);}catch(error){this.report(error instanceof Error?error.message:'Nie udało się wykonać akcji telefonu.');}
 }
 private destinations(){return this.callbacks.getDestinations?.()??PHONE_DESTINATIONS;}
 private render(snapshot:PhoneSnapshot){
  if(!this.root)return;
  const focused=document.activeElement instanceof HTMLElement&&this.root.contains(document.activeElement)?document.activeElement:null;
  const focusedId=focused?.id??'',selection=focused instanceof HTMLInputElement?[focused.selectionStart,focused.selectionEnd]:null;
  const scroll=this.query('#phone-content')?.scrollTop??0;
  this.root.innerHTML=`<section class="phone-shell"><div class="phone-status"><span>NEON MOBILE</span><span>${this.callbacks.isOnline()?'● EKIPA ONLINE':'● TRYB SOLO'} ▰</span></div><header class="phone-header"><div><span>TWÓJ TELEFON</span><h1 id="phone-heading">${labels[this.tab]}</h1></div><button id="phone-close" aria-label="Schowaj telefon">×</button></header><nav class="phone-tabs" aria-label="Aplikacje telefonu">${(Object.keys(labels) as Tab[]).map(tab=>`<button id="phone-tab-${tab}" aria-pressed="${tab===this.tab}" class="${tab===this.tab?'selected':''}">${labels[tab]}</button>`).join('')}</nav><div id="phone-content" class="phone-content">${this.tab==='home'?this.home():this.tab==='map'?this.map():this.tab==='contacts'?this.contacts():this.tab==='chat'?this.chat(snapshot):this.tab==='invites'?this.invites(snapshot):this.garage(snapshot)}</div><p id="phone-notice" class="phone-notice" role="status" aria-live="polite">${safe(this.notice||'T · telefon / Esc · schowaj')}</p><div class="phone-home-bar" aria-hidden="true"></div></section>`;
  const on=(selector:string,callback:()=>void)=>this.query(selector)?.addEventListener('click',callback);
  on('#phone-close',()=>this.close());
  (Object.keys(labels) as Tab[]).forEach(tab=>on(`#phone-tab-${tab}`,()=>{this.tab=tab;this.notice='';this.refresh(true);}));
  (Object.keys(labels) as Tab[]).forEach(tab=>on(`#phone-app-${tab}`,()=>{this.tab=tab;this.notice='';this.refresh(true);}));
  for(const [id,callback] of [['appearance',this.callbacks.onAppearance],['factions',this.callbacks.onFactions],['campaign',this.callbacks.onCampaign],['mobility',this.callbacks.onMobility]] as const)if(callback)on(`#phone-launch-${id}`,()=>{this.close();callback();});
  for(const destination of this.destinations())on(`#phone-route-${CSS.escape(destination.id)}`,()=>{this.close();this.callbacks.onRoute({...destination.point},destination.name);});
  for(const marker of this.root.querySelectorAll<SVGGElement>('[data-map-destination]')){
    const navigate=()=>{const place=this.destinations().find(destination=>destination.id===marker.dataset.mapDestination);if(place){this.close();this.callbacks.onRoute({...place.point},place.name);}};
    marker.addEventListener('click',navigate);marker.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();navigate();}});
  }
  on('#phone-open-contacts',()=>{this.close();this.callbacks.onContacts();});on('#phone-open-activities',()=>{this.close();this.callbacks.onActivities();});
  const draft=this.query<HTMLInputElement>('#phone-chat-text');if(draft)draft.oninput=()=>this.draft=draft.value;
  this.query<HTMLFormElement>('#phone-chat-form')?.addEventListener('submit',event=>{event.preventDefault();const text=this.draft.trim();if(!text){this.report('Wpisz wiadomość do ekipy.');return;}this.draft='';if(draft)draft.value='';this.issue({kind:'chat',text});});
  const select=this.query<HTMLSelectElement>('#phone-invite-activity');if(select)select.onchange=()=>this.inviteActivity=select.value as PhoneActivity;
  on('#phone-send-invite',()=>this.issue({kind:'invite',activity:this.inviteActivity}));
  for(const invite of snapshot.invites){on(`#phone-invite-accept-${invite.id}`,()=>this.issue({kind:'acceptInvite',id:invite.id}));on(`#phone-invite-decline-${invite.id}`,()=>this.issue({kind:'declineInvite',id:invite.id}));on(`#phone-invite-cancel-${invite.id}`,()=>this.issue({kind:'cancelInvite',id:invite.id}));}
  on('#phone-request-car',()=>this.issue({kind:'requestCar'}));
  const content=this.query('#phone-content');if(content)content.scrollTop=scroll;
  if(this.tab==='chat'&&!focusedId&&content)content.scrollTop=content.scrollHeight;
  const replacement=focusedId?this.query(`#${CSS.escape(focusedId)}`):null;
  if(replacement&&!replacement.matches(':disabled')){replacement.focus({preventScroll:true});if(selection&&replacement instanceof HTMLInputElement)replacement.setSelectionRange(selection[0],selection[1]);}
 }
 private home(){
  const extra=[{id:'appearance',name:'Wygląd',icon:'◉',callback:this.callbacks.onAppearance},{id:'factions',name:'Frakcje',icon:'⚑',callback:this.callbacks.onFactions},{id:'campaign',name:'Historia',icon:'◈',callback:this.callbacks.onCampaign},{id:'mobility',name:'Sport',icon:'ϟ',callback:this.callbacks.onMobility}];
  const icons:Partial<Record<Tab,string>>={map:'⌖',contacts:'N',chat:'☷',invites:'♟',garage:'◒'};
  return`<section class="phone-home-card"><span>NEON COAST</span><h2>Miasto w kieszeni.</h2><p>Twoja gotówka <strong>${money(this.callbacks.getWallet())}</strong></p></section><div class="phone-apps">${(Object.keys(labels) as Tab[]).filter(tab=>tab!=='home').map(tab=>`<button id="phone-app-${tab}"><b>${icons[tab]}</b><span>${labels[tab]}</span></button>`).join('')}${extra.filter(app=>app.callback).map(app=>`<button id="phone-launch-${app.id}"><b>${app.icon}</b><span>${app.name}</span></button>`).join('')}</div><p class="phone-copy">Wybierz aplikację. Możesz wyznaczyć trasę, zebrać ekipę, zmienić swój styl albo wrócić do historii miasta.</p>`;
 }
 private map(){
  const points=this.destinations(),position=this.callbacks.getPosition?.();
  const project=projectPhoneMap,land=project({x:WORLD_BOUNDS.minX,z:WORLD_BOUNDS.minZ}),landEnd=project({x:WORLD_BOUNDS.maxX,z:WORLD_BOUNDS.maxZ}),shore=project({x:115,z:WORLD_BOUNDS.minZ});
  const rect=(point:Point,w:number,h:number,color:string)=>{const p=project(point);return`<rect x="${p.x}" y="${p.y}" width="${w*fullMapScale}" height="${h*fullMapScale}" fill="${color}"/>`;};
  const streets=[...ROAD_X.map(x=>{const a=project({x,z:WORLD_BOUNDS.minZ}),b=project({x,z:WORLD_BOUNDS.maxZ});return`M${a.x} ${a.y}L${b.x} ${b.y}`;}),...ROAD_Z.map(z=>{const a=project({x:WORLD_BOUNDS.minX,z}),b=project({x:WORLD_BOUNDS.maxX,z});return`M${a.x} ${a.y}L${b.x} ${b.y}`;})].join('');
  return`<div class="phone-map"><svg viewBox="0 0 280 230" role="group" aria-label="Mapa całego wybrzeża; wybierz znacznik, aby wyznaczyć trasę"><rect width="280" height="230" fill="#254b5b"/><rect x="${land.x}" y="${land.y}" width="${landEnd.x-land.x}" height="${landEnd.y-land.y}" fill="#536157"/><rect x="${landEnd.x}" y="${land.y}" width="${shore.x-landEnd.x}" height="${landEnd.y-land.y}" fill="#b3a582"/><path d="${streets}" stroke="#909e95" stroke-width="${14*fullMapScale}" fill="none"/><path d="${streets}" stroke="#34424a" stroke-width="${10*fullMapScale}" fill="none"/>${NATURAL_BLOCKS.map(area=>rect({x:area.x-14,z:area.z-14},28,28,'#3d7053')).join('')}${BUILDINGS.map(building=>rect({x:building.x-building.halfX,z:building.z-building.halfZ},building.halfX*2,building.halfZ*2,'#a7afa3')).join('')}${points.map(place=>{const p=project(place.point);return`<g role="button" tabindex="0" data-map-destination="${safe(place.id)}" aria-label="Wyznacz trasę: ${safe(place.name)}" style="cursor:pointer"><title>${safe(place.name)}</title><circle cx="${p.x}" cy="${p.y}" r="5" stroke="#263e43" stroke-width="1" fill="#f0d69c"/><text x="${p.x}" y="${p.y+2.8}" text-anchor="middle" fill="#16303c" font-size="7" font-weight="bold">${safe(place.icon??'·')}</text></g>`;}).join('')}${WORLD_LANDMARKS.map(place=>{const p=project(place.point);return`<text x="${p.x+7}" y="${p.y+2}" fill="#e4ecdf" font-size="5.7">${safe(place.name)}</text>`;}).join('')}${position?(()=>{const p=project(position);return`<circle cx="${p.x}" cy="${p.y}" r="4" stroke="#152e35" stroke-width="1.8" fill="#8aefd0"/>`;})():''}<text x="266" y="14" fill="#dbe8db" font-size="8" text-anchor="middle">N ↑</text></svg><span>NEON COAST · CAŁE WYBRZEŻE</span></div><p class="phone-copy">Kliknij znacznik lub wybierz miejsce poniżej. GPS poprowadzi ulicami po schowaniu telefonu.</p><div class="phone-destinations">${points.map(place=>`<button id="phone-route-${safe(place.id)}"><b>${safe(place.icon??'◈')}</b><span>${safe(place.name)}</span><i>→</i></button>`).join('')}</div>`;
 }
 private contacts(){
  const reputation=this.callbacks.getReputation?.()??0;
  return`<p class="phone-copy">Ludzie, którzy znają miasto. Przyjmowanie i postęp zleceń znajdziesz w kontaktach.</p><div class="phone-contacts">${Object.values(CONTACTS).map(contact=>`<article><div class="phone-contact-avatar">${safe(contact.contact[0])}</div><div><strong>${safe(contact.contact)}</strong><p>${safe(contact.title)}</p><small>${reputation>=contact.reputation?'Kontakt dostępny':`Od ${contact.reputation} reputacji`}</small></div></article>`).join('')}</div><button class="phone-primary" id="phone-open-contacts">Otwórz kontakty i zlecenia →</button><button class="phone-secondary" id="phone-open-activities">Wspólne zajęcia ekipy →</button>`;
 }
 private chat(snapshot:PhoneSnapshot){
  const online=this.callbacks.isOnline(),self=this.callbacks.getSelfId();
  return`<p class="phone-copy">${online?'Wiadomości widzą tylko osoby w bieżącym pokoju.':'Połącz się z pokojem online, aby rozmawiać ze znajomymi.'}</p><div class="phone-chat-log" role="log" aria-label="Wiadomości ekipy" aria-live="polite">${snapshot.messages.map(message=>`<article class="phone-chat-message ${message.senderId===self?'own':''} ${message.system?'system':''}" data-message-id="${safe(message.id)}"><strong>${safe(message.senderName)}</strong><p>${safe(message.text)}</p></article>`).join('')}</div><form id="phone-chat-form" class="phone-chat-form"><label for="phone-chat-text">Wiadomość do ekipy</label><div><input id="phone-chat-text" maxlength="${PHONE_CHAT_LENGTH}" value="${safe(this.draft)}" autocomplete="off" placeholder="Napisz do znajomych…" ${!online?'disabled':''}/><button id="phone-chat-send" aria-label="Wyślij wiadomość do ekipy" ${!online?'disabled':''}>↑</button></div><small>Do ${PHONE_CHAT_LENGTH} znaków · Enter wysyła</small></form>`;
 }
 private invites(snapshot:PhoneSnapshot){
  const online=this.callbacks.isOnline(),self=this.callbacks.getSelfId();
  return`<p class="phone-copy">Zaproponuj plan. Przyjęcie zaproszenia potwierdza gotowość; gospodarz osobno uruchamia zlecenie w panelu J.</p><div class="phone-invite-compose"><label for="phone-invite-activity">Co robimy?</label><select id="phone-invite-activity" ${!online?'disabled':''}>${(Object.keys(activities) as PhoneActivity[]).map(activity=>`<option value="${activity}" ${this.inviteActivity===activity?'selected':''}>${activities[activity]}</option>`).join('')}</select><button id="phone-send-invite" class="phone-primary" ${!online?'disabled':''}>Zaproś ekipę</button></div><div class="phone-invites">${snapshot.invites.length?snapshot.invites.map(invite=>{const live=invite.status==='open'||invite.status==='ready',mine=invite.senderId===self;return`<article class="phone-invitation"><small>${safe(invite.senderName)} proponuje</small><h2>${activities[invite.activity]}</h2><p>${invite.status==='ready'?'Ekipa potwierdziła plan':invite.status==='open'?'Czeka na odpowiedzi':invite.status==='expired'?'Zaproszenie wygasło':'Zaproszenie anulowane'} · gotowych: ${invite.accepted.length}</p><small id="phone-invite-clock-${invite.id}"></small>${live?`<div class="phone-invite-buttons">${mine?`<button id="phone-invite-cancel-${invite.id}">Anuluj</button>`:`<button id="phone-invite-accept-${invite.id}" ${invite.accepted.includes(self)?'disabled':''}>${invite.accepted.includes(self)?'Gotowość ✓':'Dołączam'}</button><button id="phone-invite-decline-${invite.id}" ${invite.declined.includes(self)?'disabled':''}>Odmów</button>`}</div>`:''}</article>`;}).join(''):'<p class="phone-empty">Nie ma jeszcze propozycji. Wyślij pierwszy plan.</p>'}</div><button class="phone-secondary" id="phone-open-activities">Otwórz panel zajęć →</button>`;
 }
 private garage(snapshot:PhoneSnapshot){
  return`<div class="phone-car-card"><span aria-hidden="true">◒</span><small>TWÓJ WŁASNY POJAZD</small><h2>${safe(this.callbacks.getCarName?.()??'Wybrany samochód')}</h2><p>Kurier dostawi wybrany model na najbliższą ulicę za ${money(PHONE_DELIVERY_PRICE)}. Wyjdź pieszo na zewnątrz, poza aktywnym zleceniem i pościgiem.</p><strong>Portfel: ${money(this.callbacks.getWallet())}</strong><button id="phone-request-car" class="phone-primary" ${snapshot.deliveryCooldownMs>0||this.callbacks.getWallet()<PHONE_DELIVERY_PRICE?'disabled':''}>Zamów własne auto · ${money(PHONE_DELIVERY_PRICE)}</button><small id="phone-delivery-cooldown"></small></div><p class="phone-copy">Model zabezpieczony na parkingu przy mieszkaniu odbiera się przez panel L. Telefon zachowuje obecny stan i tuning auta.</p>`;
 }
 private trapFocus(event:KeyboardEvent){
  const controls=[...(this.root?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[data-map-destination]')??[])],first=controls[0],last=controls.at(-1);
  if(!first){event.preventDefault();return;}
  if(!controls.includes(document.activeElement as HTMLElement)){(event.shiftKey?last:first)?.focus();event.preventDefault();}
  else if(event.shiftKey&&document.activeElement===first){last?.focus();event.preventDefault();}else if(!event.shiftKey&&document.activeElement===last){first.focus();event.preventDefault();}
 }
}

import { BUILDINGS, ROADS, WORLD_BOUNDS, type Point } from './model';

export const PHONE_CHAT_LIMIT=40;
export const PHONE_CHAT_LENGTH=180;
export const PHONE_CHAT_COOLDOWN_MS=1000;
export const PHONE_INVITE_LIMIT=8;
export const PHONE_INVITE_DURATION_MS=120000;
export const PHONE_INVITE_COOLDOWN_MS=15000;
export const PHONE_DELIVERY_PRICE=50;
export const PHONE_DELIVERY_COOLDOWN_MS=60000;
export type PhoneActivity='heist'|'bank'|'race'|'challenge';
export type PhoneAction=
 | {kind:'chat';text:string}
 | {kind:'invite';activity:PhoneActivity}
 | {kind:'acceptInvite'|'declineInvite'|'cancelInvite';id:string}
 | {kind:'requestCar'};
export interface PhoneMember {
 id:string;name:string;
 pose:Point&{mode:'foot'|'drive';interior:string|null;homeId?:string|null;passengerOf?:string|null;seated:boolean;vehicle:{id:string;speed:number}|null};
}
export interface PhoneMessage {id:string;senderId:string;senderName:string;text:string;sentAt:number;system:boolean}
export interface PhoneInvitation {
 id:string;senderId:string;senderName:string;activity:PhoneActivity;createdAt:number;expiresAt:number;
 status:'open'|'ready'|'cancelled'|'expired';accepted:string[];declined:string[];
}
export interface PhoneSnapshot {messages:PhoneMessage[];invites:PhoneInvitation[];deliveryCooldownMs:number}
export interface PhoneDeliveryContext {stored:boolean;busy:boolean;occupiedByOther?:boolean;wanted?:number}
export type PhoneResult={ok:true;wallet:number;message:string;delivery?:Point&{heading:number}}|{ok:false;reason:string};
const clone=<T>(value:T):T=>structuredClone(value);
const no=(reason:string):PhoneResult=>({ok:false,reason});
const finite=(value:number)=>Number.isFinite(value)&&value>=0;
const validId=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
const activities:PhoneActivity[]=['heist','bank','race','challenge'];

/** Delivery places the car on a nearby street, away from the player's body and buildings. */
export function getPhoneDeliveryPoint(player:Point):(Point&{heading:number})|null {
 if(!Number.isFinite(player.x)||!Number.isFinite(player.z)||player.x<WORLD_BOUNDS.minX||player.x>WORLD_BOUNDS.maxX||player.z<WORLD_BOUNDS.minZ||player.z>WORLD_BOUNDS.maxZ)return null;
 const candidates: (Point&{heading:number})[]=[];
 for(const road of ROADS)for(const offset of [-6,6]){
  candidates.push({x:road,z:Math.max(-88,Math.min(88,player.z+offset)),heading:0});
  candidates.push({x:Math.max(-88,Math.min(88,player.x+offset)),z:road,heading:Math.PI/2});
 }
 return candidates.filter(point=>{
  const distance=Math.hypot(point.x-player.x,point.z-player.z);
  return distance>=4.5&&distance<=20&&!BUILDINGS.some(building=>Math.abs(point.x-building.x)<building.halfX+2&&Math.abs(point.z-building.z)<building.halfZ+3);
 }).sort((a,b)=>Math.hypot(a.x-player.x,a.z-player.z)-Math.hypot(b.x-player.x,b.z-player.z))[0]??null;
}

/** The host owns message clocks, invitation membership, delivery fees and cooldowns. */
export class HostPhone {
 private now=0;
 private serial=0;
 private members=new Map<string,PhoneMember>();
 private messages:PhoneMessage[]=[{id:'welcome',senderId:'system',senderName:'Nova',text:'Wybrzeże czeka. Kontakty mają zlecenia, a telefon pomoże zebrać ekipę.',sentAt:0,system:true}];
 private invites:PhoneInvitation[]=[];
 private chatAt=new Map<string,number>();
 private inviteAt=new Map<string,number>();
 private deliveryAt=new Map<string,number>();
 constructor(readonly hostId:string){}

 update(members:PhoneMember[],nowMs:number):void {
  if(!finite(nowMs))return;
  this.now=Math.max(this.now,nowMs);
  this.members=new Map(members.filter(member=>validId(member.id)).map(member=>[member.id,clone(member)]));
  for(const invite of this.invites){
   if(invite.status==='cancelled'||invite.status==='expired')continue;
   if(!this.members.has(invite.senderId)){invite.status='cancelled';continue;}
   if(this.now>=invite.expiresAt){invite.status='expired';continue;}
   invite.accepted=invite.accepted.filter(id=>this.members.has(id));invite.declined=invite.declined.filter(id=>this.members.has(id));
   invite.status=invite.accepted.length>=2?'ready':'open';
  }
  // Room membership is bounded; stale rate-limit keys must not grow with visitors.
  for(const map of [this.chatAt,this.inviteAt,this.deliveryAt])for(const id of map.keys())if(!this.members.has(id))map.delete(id);
 }

 command(id:string,action:PhoneAction,members:PhoneMember[],wallet:number,nowMs:number,delivery?:PhoneDeliveryContext):PhoneResult {
  if(!finite(nowMs))return no('Niepoprawny zegar telefonu.');
  this.update(members,nowMs);
  const member=this.members.get(id);
  if(!member)return no('Nie należysz do tej ekipy.');
  if(!Number.isSafeInteger(wallet)||wallet<0)return no('Niepoprawny portfel telefonu.');
  if(!action||typeof action!=='object'||typeof action.kind!=='string')return no('Nieznana akcja telefonu.');
  if(action.kind==='chat'){
   if(typeof action.text!=='string'||/[\u0000-\u001f\u007f]/.test(action.text))return no('Wpisz zwykłą wiadomość tekstową.');
   const text=action.text.trim();
   if(!text||text.length>PHONE_CHAT_LENGTH)return no(`Wiadomość musi mieć od 1 do ${PHONE_CHAT_LENGTH} znaków.`);
   const last=this.chatAt.get(id);if(last!==undefined&&this.now-last<PHONE_CHAT_COOLDOWN_MS)return no('Poczekaj chwilę przed następną wiadomością.');
   this.chatAt.set(id,this.now);this.messages.push({id:`message-${++this.serial}`,senderId:id,senderName:member.name.slice(0,18),text,sentAt:this.now,system:false});
   this.messages=this.messages.slice(-PHONE_CHAT_LIMIT);
   return{ok:true,wallet,message:'Wiadomość wysłana do ekipy.'};
  }
  if(action.kind==='invite'){
   if(!activities.includes(action.activity))return no('Nieznany rodzaj zaproszenia.');
   if(this.members.size<2)return no('Zaproś znajomego do pokoju, zanim wyślesz propozycję zlecenia.');
   if(this.invites.some(invite=>invite.senderId===id&&(invite.status==='open'||invite.status==='ready')))return no('Masz już aktywne zaproszenie. Anuluj je przed wysłaniem kolejnego.');
   const last=this.inviteAt.get(id);if(last!==undefined&&this.now-last<PHONE_INVITE_COOLDOWN_MS)return no('Poczekaj przed kolejnym zaproszeniem.');
   this.inviteAt.set(id,this.now);this.invites.unshift({id:`invite-${++this.serial}`,senderId:id,senderName:member.name.slice(0,18),activity:action.activity,createdAt:this.now,expiresAt:this.now+PHONE_INVITE_DURATION_MS,status:'open',accepted:[id],declined:[]});
   this.invites=this.invites.slice(0,PHONE_INVITE_LIMIT);
   return{ok:true,wallet,message:'Zaproszenie wysłane. Uczestnicy osobno potwierdzają gotowość.'};
  }
  if(action.kind==='acceptInvite'||action.kind==='declineInvite'||action.kind==='cancelInvite'){
   if(typeof action.id!=='string')return no('Nieznane zaproszenie.');
   const invite=this.invites.find(item=>item.id===action.id);
   if(!invite||invite.status==='cancelled'||invite.status==='expired')return no('To zaproszenie nie jest już aktywne.');
   if(action.kind==='cancelInvite'){
    if(id!==invite.senderId&&id!==this.hostId)return no('Zaproszenie anuluje jego autor lub gospodarz.');
    invite.status='cancelled';return{ok:true,wallet,message:'Zaproszenie anulowane.'};
   }
   if(id===invite.senderId)return no('Autor zaproszenia jest już gotowy; może je anulować.');
   const accepting=action.kind==='acceptInvite',already=(accepting?invite.accepted:invite.declined).includes(id);
   if(already)return no('Twoja odpowiedź jest już zapisana.');
   invite.accepted=invite.accepted.filter(memberId=>memberId!==id);invite.declined=invite.declined.filter(memberId=>memberId!==id);
   (accepting?invite.accepted:invite.declined).push(id);invite.status=invite.accepted.length>=2?'ready':'open';
   return{ok:true,wallet,message:accepting?'Gotowość potwierdzona. Gospodarz rozpoczyna zlecenie w panelu J.':'Odrzucono propozycję zlecenia.'};
  }
  if(action.kind==='requestCar'){
   const pose=member.pose;
   if(!delivery||typeof delivery.stored!=='boolean'||typeof delivery.busy!=='boolean')return no('Dostawa samochodu jest teraz niedostępna.');
   if(pose.mode!=='foot'||pose.interior||pose.homeId||pose.passengerOf||pose.seated)return no('Wyjdź pieszo na ulicę, aby zamówić własny samochód.');
   if(delivery.busy||delivery.occupiedByOther)return no('Zakończ aktywność ekipy i zwolnij samochód przed dostawą.');
   if(delivery.stored)return no('Ten model jest zabezpieczony przy mieszkaniu. Odbierz go na swoim parkingu.');
   if((delivery.wanted??0)>0)return no('Zgub pościg przed zamówieniem samochodu.');
   const last=this.deliveryAt.get(id);if(last!==undefined&&this.now-last<PHONE_DELIVERY_COOLDOWN_MS)return no('Kurier przygotowuje kolejną dostawę. Poczekaj minutę.');
   if(wallet<PHONE_DELIVERY_PRICE)return no(`Dostawa kosztuje $${PHONE_DELIVERY_PRICE}.`);
   const target=getPhoneDeliveryPoint(pose);if(!target)return no('Podejdź bliżej ulicy, aby kurier mógł bezpiecznie zatrzymać samochód.');
   this.deliveryAt.set(id,this.now);
   return{ok:true,wallet:wallet-PHONE_DELIVERY_PRICE,message:'Twój samochód czeka na najbliższej ulicy. GPS wskazuje dostawę.',delivery:target};
  }
  return no('Nieznana akcja telefonu.');
 }

 snapshot(viewerId:string):PhoneSnapshot {
  const delivered=this.deliveryAt.get(viewerId);
  return clone({messages:this.messages,invites:this.invites,deliveryCooldownMs:delivered===undefined?0:Math.max(0,PHONE_DELIVERY_COOLDOWN_MS-(this.now-delivered))});
 }
}

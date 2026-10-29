import { describe,expect,it } from 'vitest';
import { BUILDINGS,ROADS } from '../src/model';
import { HostPhone,getPhoneDeliveryPoint,PHONE_CHAT_LIMIT,PHONE_DELIVERY_PRICE,PHONE_INVITE_DURATION_MS,type PhoneAction,type PhoneMember,type PhoneDeliveryContext } from '../src/phone';

const member=(id:string,name=id):PhoneMember=>({id,name,pose:{x:0,z:68,mode:'foot',interior:null,seated:false,vehicle:null}});
const host=member('host','Alicja'),friend=member('friend','Borys'),third=member('third','Celina');
const create=()=>{const phone=new HostPhone('host'),members=[structuredClone(host),structuredClone(friend),structuredClone(third)];phone.update(members,0);return{phone,members};};
const context:PhoneDeliveryContext={stored:false,busy:false};
function accept(phone:HostPhone,members:PhoneMember[],id:string,action:PhoneAction,now=0,wallet=1250,delivery?:PhoneDeliveryContext){const result=phone.command(id,action,members,wallet,now,delivery);if(!result.ok)throw new Error(result.reason);return result;}

describe('host-owned phone chat',()=>{
 it('shares bounded plain messages, keeps sender identity host-owned and snapshots detached',()=>{
  const {phone,members}=create();
  for(let index=0;index<45;index++)accept(phone,members,'friend',{kind:'chat',text:`Wiadomość ${index}`},index*1000);
  const view=phone.snapshot('host');expect(view.messages).toHaveLength(PHONE_CHAT_LIMIT);
  expect(view.messages[0].text).toBe('Wiadomość 5');expect(view.messages.at(-1)).toMatchObject({senderId:'friend',senderName:'Borys',text:'Wiadomość 44',system:false});
  view.messages[0].text='zmienione';expect(phone.snapshot('friend').messages[0].text).toBe('Wiadomość 5');
 });
 it('rejects spam, outsider identities, blank, control and oversized messages without changing a wallet',()=>{
  const {phone,members}=create();accept(phone,members,'host',{kind:'chat',text:'  Jadę do kasyna.  '},0);
  expect(phone.snapshot('friend').messages.at(-1)?.text).toBe('Jadę do kasyna.');
  for(const [id,text,now] of [['host','Spam',999],['outsider','Podszywanie',1000],['host',' ',1000],['host','x\nY',1000],['host','x'.repeat(181),1000]] as const)expect(phone.command(id,{kind:'chat',text},members,1250,now).ok).toBe(false);
  expect(phone.snapshot('host').messages).toHaveLength(2);
  const accepted=accept(phone,members,'host',{kind:'chat',text:'<img src=x onerror=alert(1)>'},1000);expect(accepted.wallet).toBe(1250);
  // Text travels unchanged as plain data; the phone UI escapes it when rendering.
  expect(phone.snapshot('friend').messages.at(-1)?.text).toBe('<img src=x onerror=alert(1)>');
 });
});

describe('crew mission proposals',()=>{
 it('records accepting and declining separately, reaches ready and never starts a mission or changes money',()=>{
  const {phone,members}=create();const first=accept(phone,members,'friend',{kind:'invite',activity:'bank'});expect(first.wallet).toBe(1250);
  const invite=phone.snapshot('host').invites[0];expect(invite).toMatchObject({senderId:'friend',activity:'bank',accepted:['friend'],declined:[],status:'open'});
  accept(phone,members,'host',{kind:'acceptInvite',id:invite.id},1);expect(phone.snapshot('friend').invites[0]).toMatchObject({accepted:['friend','host'],status:'ready'});
  expect(phone.command('host',{kind:'acceptInvite',id:invite.id},members,1250,2).ok).toBe(false);
  accept(phone,members,'third',{kind:'declineInvite',id:invite.id},3);expect(phone.snapshot('host').invites[0].declined).toEqual(['third']);
  accept(phone,members,'host',{kind:'declineInvite',id:invite.id},4);expect(phone.snapshot('host').invites[0]).toMatchObject({accepted:['friend'],declined:['third','host'],status:'open'});
  accept(phone,members,'third',{kind:'acceptInvite',id:invite.id},5);expect(phone.snapshot('host').invites[0]).toMatchObject({accepted:['friend','third'],declined:['host'],status:'ready'});
 });
 it('only allows the author or host to cancel and expires invitations exactly at the host deadline',()=>{
  const {phone,members}=create();accept(phone,members,'friend',{kind:'invite',activity:'heist'},100);
  const id=phone.snapshot('host').invites[0].id;
  expect(phone.command('third',{kind:'cancelInvite',id},members,1250,101).ok).toBe(false);
  expect(phone.command('friend',{kind:'declineInvite',id},members,1250,102).ok).toBe(false);
  accept(phone,members,'host',{kind:'cancelInvite',id},103);expect(phone.snapshot('friend').invites[0].status).toBe('cancelled');
  expect(phone.command('host',{kind:'acceptInvite',id},members,1250,104).ok).toBe(false);
  accept(phone,members,'third',{kind:'invite',activity:'race'},200);
  const timed=phone.snapshot('host').invites[0];phone.update(members,200+PHONE_INVITE_DURATION_MS-1);expect(phone.snapshot('host').invites[0].status).toBe('open');
  phone.update(members,200+PHONE_INVITE_DURATION_MS);expect(phone.snapshot('host').invites[0].status).toBe('expired');
  expect(phone.command('host',{kind:'acceptInvite',id:timed.id},members,1250,200+PHONE_INVITE_DURATION_MS).ok).toBe(false);
 });
 it('cancels an absent author, retracts disconnected readiness and bounds history',()=>{
  const {phone,members}=create();accept(phone,members,'friend',{kind:'invite',activity:'challenge'});const id=phone.snapshot('host').invites[0].id;
  accept(phone,members,'third',{kind:'acceptInvite',id},1);phone.update(members.slice(0,2),2);expect(phone.snapshot('host').invites[0]).toMatchObject({accepted:['friend'],status:'open'});
  phone.update([members[0],members[2]],3);expect(phone.snapshot('host').invites[0].status).toBe('cancelled');
  for(let index=0;index<10;index++){
   accept(phone,members,'host',{kind:'invite',activity:'race'},20000+index*15000);
   accept(phone,members,'host',{kind:'cancelInvite',id:phone.snapshot('host').invites[0].id},20000+index*15000+1);
  }
  expect(phone.snapshot('host').invites).toHaveLength(8);
 });
 it('rejects duplicate active proposals and checks activity, membership and the creation cooldown',()=>{
  const {phone,members}=create();accept(phone,members,'host',{kind:'invite',activity:'heist'});const id=phone.snapshot('host').invites[0].id;
  expect(phone.command('host',{kind:'invite',activity:'bank'},members,1250,20000).ok).toBe(false);
  accept(phone,members,'host',{kind:'cancelInvite',id},20001);
  accept(phone,members,'host',{kind:'invite',activity:'bank'},20002);accept(phone,members,'host',{kind:'cancelInvite',id:phone.snapshot('host').invites[0].id},20003);
  expect(phone.command('host',{kind:'invite',activity:'race'},members,1250,20004).ok).toBe(false);
  expect(phone.command('third',{kind:'invite',activity:'unknown'} as unknown as PhoneAction,members,1250,20005).ok).toBe(false);
  expect(phone.command('host',{kind:'invite',activity:'race'},[members[0]],1250,40000).ok).toBe(false);
 });
});

describe('own vehicle delivery',()=>{
 it('charges one fixed fee, returns a safe nearby street destination and enforces a per-player cooldown',()=>{
  const {phone,members}=create();const delivered=accept(phone,members,'host',{kind:'requestCar'},0,1250,context);
  expect(delivered.wallet).toBe(1250-PHONE_DELIVERY_PRICE);expect(delivered.delivery).toBeDefined();
  const target=delivered.delivery!;expect(Math.hypot(target.x-host.pose.x,target.z-host.pose.z)).toBeGreaterThanOrEqual(4.5);
  expect(Math.hypot(target.x-host.pose.x,target.z-host.pose.z)).toBeLessThanOrEqual(20);
  expect(ROADS.includes(target.x)||ROADS.includes(target.z)).toBe(true);
  expect(BUILDINGS.some(building=>Math.abs(target.x-building.x)<building.halfX+2&&Math.abs(target.z-building.z)<building.halfZ+3)).toBe(false);
  expect(phone.command('host',{kind:'requestCar'},members,1200,1,context).ok).toBe(false);
  expect(phone.snapshot('host').deliveryCooldownMs).toBe(59999);
  expect(accept(phone,members,'friend',{kind:'requestCar'},1,1250,context).wallet).toBe(1200);
  phone.update(members,60000);expect(phone.snapshot('host').deliveryCooldownMs).toBe(0);
  expect(accept(phone,members,'host',{kind:'requestCar'},60000,1200,context).wallet).toBe(1150);
 });
 it('protects parked models, passengers, interiors, pursuits and active jobs without charging or arming a cooldown',()=>{
  const cases:Partial<PhoneDeliveryContext>[]=[{stored:true},{busy:true},{occupiedByOther:true},{wanted:1}];
  for(const extra of cases){const {phone,members}=create();expect(phone.command('host',{kind:'requestCar'},members,1250,0,{...context,...extra}).ok).toBe(false);expect(phone.snapshot('host').deliveryCooldownMs).toBe(0);}
  for(const change of [{mode:'drive',vehicle:{id:'stratus',speed:0}},{interior:'casino'},{homeId:'canal'},{passengerOf:'friend'},{seated:true}] as const){
   const {phone,members}=create();Object.assign(members[0].pose,change);expect(phone.command('host',{kind:'requestCar'},members,1250,0,context).ok).toBe(false);expect(phone.snapshot('host').deliveryCooldownMs).toBe(0);
  }
  const {phone,members}=create();expect(phone.command('host',{kind:'requestCar'},members,49,0,context).ok).toBe(false);expect(phone.command('host',{kind:'requestCar'},members,1250,0).ok).toBe(false);
  expect(phone.snapshot('host').deliveryCooldownMs).toBe(0);
 });
 it('does not invent a destination outside the land bounds or deep inside a city block',()=>{
  for(const point of [{x:NaN,z:0},{x:130,z:0},{x:0,z:999},{x:-60,z:60}])expect(getPhoneDeliveryPoint(point)).toBeNull();
  expect(getPhoneDeliveryPoint({x:20,z:74})).not.toBeNull();
 });
});

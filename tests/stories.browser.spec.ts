import { expect,test,type Browser,type BrowserContext,type Page,type TestInfo } from '@playwright/test';
import type { AppearanceState } from '../src/appearance';
import { campaignChapter,type CampaignSnapshot } from '../src/campaign';
import type { FactionsSnapshot } from '../src/factions';
import type { GameState,Point } from '../src/model';
import type { MultiplayerState,RoomSnapshot } from '../src/multiplayer-model';
import type { PhoneSnapshot } from '../src/phone';
import { walkTo } from './browser-navigation';

type Snapshot={
 state:GameState;started:boolean;paused:boolean;online:MultiplayerState;
 stories:{appearance:AppearanceState;phone:PhoneSnapshot;factions:FactionsSnapshot;campaign:CampaignSnapshot};
 navigation:{route:Point[]};rendering:{frames:number;view:string;calls:number};
};
const GAME_URL=process.env.NEON_BASE_URL||'http://127.0.0.1:5185/school_project/';
const snapshot=(page:Page):Promise<Snapshot>=>page.evaluate(()=>(window as unknown as{__NEON_TEST__:Snapshot}).__NEON_TEST__);
function observe(page:Page,errors:string[],missing:string[],name='solo'){
 page.on('pageerror',error=>errors.push(`${name}: ${error.message}`));
 page.on('response',response=>{if(response.status()>=400&&/\/school_project\/(?:assets\/|favicon)/.test(response.url()))missing.push(`${response.status()} ${response.url()}`);});
}
async function openPhone(page:Page){
 await page.bringToFront();
 if(await page.locator('#resume').isVisible())await page.locator('#resume').click();
 if(!await page.locator('#phone-root').count())await page.keyboard.press('t');
 await expect(page.locator('#phone-root')).toBeVisible();
}
async function start(page:Page){await page.goto('./');await page.locator('#start-game').click();await expect.poll(async()=>(await snapshot(page)).started).toBe(true);}
async function room(page:Page):Promise<RoomSnapshot>{const state=(await snapshot(page)).online;expect(state.status).toBe('online');expect(state.snapshot).not.toBeNull();return state.snapshot!;}

test('telefon otwiera garderobę, zakupy zmieniają bohatera i pozostają po odświeżeniu',async({page},info)=>{
 test.setTimeout(90000);const errors:string[]=[],missing:string[]=[];observe(page,errors,missing);await start(page);
 await openPhone(page);await page.locator('#phone-launch-appearance').click();
 await expect(page.locator('#phone-root')).toHaveCount(0);await expect(page.locator('#appearance-dialog')).toBeVisible();
 await page.locator('#appearance-buy-shirt-coral').click();
 await expect.poll(async()=>(await snapshot(page)).stories.appearance.selected.shirt).toBe('shirt-coral');
 await expect.poll(async()=>(await snapshot(page)).state.money).toBe(1160);
 await expect(page.locator('#appearance-equip-shirt-coral')).toBeDisabled();
 await page.locator('#appearance-tab-hair').click();await page.locator('#appearance-buy-hair-long').click();
 await expect.poll(async()=>(await snapshot(page)).stories.appearance.selected.hair).toBe('hair-long');
 await expect.poll(async()=>(await snapshot(page)).state.money).toBe(1050);
 await page.locator('#appearance-close').click();
 // Use the first interaction immediately after a modal closes; the pulse must survive a zero-time RAF.
 await page.keyboard.press('e');await expect.poll(async()=>(await snapshot(page)).state.player.mode).toBe('foot');
 const before=(await snapshot(page)).rendering.frames;
 await expect.poll(async()=>(await snapshot(page)).rendering.frames).toBeGreaterThan(before+2);
 await expect(page.locator('#world canvas')).toBeVisible();expect((await snapshot(page)).rendering.calls).toBeGreaterThan(0);
 await page.screenshot({path:info.outputPath('personalized-avatar.png'),fullPage:true});
 await page.reload();await page.locator('#start-game').click();
 const restored=await snapshot(page);expect(restored.stories.appearance.selected).toMatchObject({shirt:'shirt-coral',hair:'hair-long'});
 expect(restored.stories.appearance.owned).toEqual(expect.arrayContaining(['shirt-coral','hair-long']));expect(restored.state.money).toBe(1050);
 await openPhone(page);await page.locator('#phone-launch-appearance').click();await expect(page.locator('#appearance-equip-shirt-coral')).toBeDisabled();
 await page.setViewportSize({width:390,height:844});await expect(page.locator('#appearance-dialog')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('appearance-mobile.png'),fullPage:true});
 expect(errors).toEqual([]);expect(missing).toEqual([]);
});

test('frakcja wyznacza trasę, blokuje drugi cel, a kampania zalicza prawdziwe spotkanie',async({page},info)=>{
 test.setTimeout(150000);const errors:string[]=[],missing:string[]=[];observe(page,errors,missing);await start(page);
 await openPhone(page);await page.locator('#phone-launch-factions').click();await expect(page.locator('#factions-dialog')).toBeVisible();
 await page.locator('#factions-join-tide').click();await expect.poll(async()=>(await snapshot(page)).stories.factions.profile.faction).toBe('tide');
 await page.locator('#factions-tab-jobs').click();await page.locator('#factions-start-downtown-courier').click();
 await expect.poll(async()=>(await snapshot(page)).stories.factions.job.status).toBe('active');
 expect((await snapshot(page)).stories.factions.job).toMatchObject({kind:'courier',stage:'pickup',target:{x:-40,z:0}});
 await page.locator('#factions-job-route').click();await expect(page.locator('#factions-dialog')).toHaveCount(0);
 await expect.poll(async()=>(await snapshot(page)).navigation.route.at(-1)).toEqual({x:-40,z:0});
 await page.keyboard.press('y');await page.locator('#campaign-start').click();
 await expect(page.locator('#campaign-notice')).toContainText(/frakcj|zlecen|aktywno|zakończ/i);
 expect((await snapshot(page)).stories.campaign.status).toBe('idle');
 await page.locator('#campaign-close').click();await page.keyboard.press('z');await page.locator('#factions-tab-jobs').click();await page.locator('#factions-cancel').click();await page.locator('#factions-close').click();
 await page.keyboard.press('y');await page.locator('#campaign-start').click();
 await expect.poll(async()=>(await snapshot(page)).stories.campaign.status).toBe('active');
 expect((await snapshot(page)).stories.campaign).toMatchObject({chapter:0,objective:0,target:{x:-40,z:40}});
 await page.locator('#campaign-route').click();await expect.poll(async()=>(await snapshot(page)).navigation.route.at(-1)).toEqual({x:-40,z:40});
 await page.keyboard.press('e');await expect.poll(async()=>(await snapshot(page)).state.player.mode).toBe('foot');
 const meeting=campaignChapter(0,null,null).objectives[0].target;
 await walkTo(page,{x:0,z:meeting.z},'z',true);await walkTo(page,meeting,'x',true);
 await expect.poll(async()=>(await snapshot(page)).stories.campaign.objective).toBe(1);
 expect((await snapshot(page)).stories.campaign.target).toEqual({x:-80,z:40});
 await expect.poll(async()=>(await snapshot(page)).navigation.route.at(-1)).toEqual({x:-80,z:40});
 await page.keyboard.press('y');await expect(page.locator('#campaign-dialog')).toBeVisible();await expect(page.locator('.campaign-objective')).toContainText('magazynu');
 await page.screenshot({path:info.outputPath('campaign-first-meeting.png'),fullPage:true});
 expect(errors).toEqual([]);expect(missing).toEqual([]);
});

type Pair={host:Page;guest:Page;contexts:BrowserContext[];errors:string[];missing:string[]};
async function capture(contexts:BrowserContext[],info:TestInfo){await Promise.allSettled(contexts.map(async(context,index)=>{const page=context.pages()[0];if(page&&!page.isClosed()){await page.screenshot({path:info.outputPath(`phone-failure-${index}.png`),fullPage:true});await info.attach(`phone-state-${index}`,{body:JSON.stringify(await snapshot(page),null,2),contentType:'application/json'});}}));}
async function pair(browser:Browser,info:TestInfo):Promise<Pair>{
 const contexts:BrowserContext[]=[],errors:string[]=[],missing:string[]=[];
 const open=async(name:string)=>{
  const context=await browser.newContext({baseURL:GAME_URL,viewport:{width:1200,height:800}});contexts.push(context);
  await context.addInitScript(()=>Object.defineProperty(window,'__NEON_SIGNALING__',{value:{host:'127.0.0.1',port:9000,path:'/peerjs',secure:false,config:{iceServers:[{urls:'turn:127.0.0.1:3478?transport=tcp',username:'neon',credential:'neon-local-test'}],iceTransportPolicy:'relay'}}}));
  const page=await context.newPage();observe(page,errors,missing,name);await page.goto('./');await page.locator('#intro-online').click();await page.locator('#online-name').fill(name);return page;
 };
 try{
  const host=await open('Alicja');await host.locator('#online-create').click();await expect.poll(async()=>(await snapshot(host)).online.status,{timeout:20000}).toBe('online');
  const code=(await host.locator('#online-code').innerText()).trim();await host.locator('#online-enter').click();
  const guest=await open('Borys');await guest.locator('#online-room').fill(code);await guest.locator('#online-join').click();await expect.poll(async()=>(await snapshot(guest)).online.status,{timeout:20000}).toBe('online');await guest.locator('#online-enter').click();
  for(const page of[host,guest])await expect.poll(async()=>(await room(page)).members.length).toBe(2);
  return{host,guest,contexts,errors,missing};
 }catch(error){await capture(contexts,info);await Promise.allSettled(contexts.map(context=>context.close()));throw error;}
}

test('telefon dwóch klientów przesyła zwykły tekst, zaproszenie i dostawia własne auto za jedną opłatę',async({browser},info)=>{
 test.setTimeout(120000);const clients=await pair(browser,info),{host,guest}=clients;
 try{
  await openPhone(host);await host.locator('#phone-tab-chat').click();
  const message='<img src=x onerror="window.__CHAT_INJECTED__=true"> Paweł & ekipa';
  await host.locator('#phone-chat-text').fill(message);await host.locator('#phone-chat-send').click();
  await expect(host.locator('#phone-chat-text')).toHaveValue('');
  await openPhone(guest);await guest.locator('#phone-tab-chat').click();
  await expect(guest.locator('.phone-chat-message p').filter({hasText:message})).toHaveText(message);
  expect(await guest.locator('#phone-content img').count()).toBe(0);expect(await guest.evaluate(()=>Object.prototype.hasOwnProperty.call(window,'__CHAT_INJECTED__'))).toBe(false);
  await expect.poll(async()=>(await room(guest)).phone.messages.some(entry=>entry.text===message&&entry.senderName==='Alicja')).toBe(true);
  await host.bringToFront();await host.locator('#phone-tab-invites').click();await host.locator('#phone-invite-activity').selectOption('bank');await host.locator('#phone-send-invite').click();
  await expect.poll(async()=>(await room(guest)).phone.invites.length).toBe(1);const invitation=(await room(guest)).phone.invites[0];
  await guest.bringToFront();await guest.locator('#phone-tab-invites').click();await guest.locator(`#phone-invite-accept-${invitation.id}`).click();
  for(const page of[host,guest])await expect.poll(async()=>{
   const shared=await room(page);
   return{invitation:shared.phone.invites[0].status,activity:shared.jobs.active,challenge:shared.challenge.status};
  }).toEqual({invitation:'ready',activity:null,challenge:'idle'});
  await guest.screenshot({path:info.outputPath('crew-phone-invitation.png'),fullPage:true});
  await host.bringToFront();await host.locator('#phone-close').click();await host.keyboard.press('e');await expect.poll(async()=>(await snapshot(host)).state.player.mode).toBe('foot');
  const before=await room(host);await openPhone(host);await host.locator('#phone-tab-garage').click();await host.locator('#phone-request-car').click();
  await expect.poll(async()=>{
   const shared=await room(host);return{wallet:shared.wallet,version:shared.deliveryEffect.version};
  }).toEqual({wallet:before.wallet-50,version:before.deliveryEffect.version+1});
  const delivered=await room(host),target=delivered.deliveryEffect.target!;
  expect(target).not.toBeNull();await expect(host.locator('#phone-request-car')).toBeDisabled();
  await expect.poll(async()=>{const car=(await snapshot(host)).state.vehicles.find(vehicle=>vehicle.id==='stratus')!;return Math.hypot(car.x-target.x,car.z-target.z);}).toBeLessThan(.1);
  const player=(await snapshot(host)).state.player;expect(Math.hypot(player.x-target.x,player.z-target.z)).toBeGreaterThanOrEqual(4.5);
  expect((await room(guest)).wallet).toBe(1250);
  const frames=(await snapshot(host)).rendering.frames;
  await expect.poll(async()=>{
   const current=await snapshot(host),shared=current.online.snapshot;
   return shared&&{online:current.online.status,advanced:current.rendering.frames>frames+5,wallet:shared.wallet,version:shared.deliveryEffect.version};
  }).toEqual({online:'online',advanced:true,wallet:before.wallet-50,version:delivered.deliveryEffect.version});
  expect(clients.errors).toEqual([]);expect(clients.missing).toEqual([]);
 }catch(error){await capture(clients.contexts,info);throw error;}
 finally{await Promise.allSettled(clients.contexts.map(context=>context.close()));}
});

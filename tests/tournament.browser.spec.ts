import { expect,test,type BrowserContext,type Page } from '@playwright/test';
import type { GameState } from '../src/model';
import type { MultiplayerState } from '../src/multiplayer-model';
import { CASINO } from '../src/casino-location';
import { CASINO_GAMES } from '../src/casino-games-location';
import { walk,walkTo } from './browser-navigation';

type Snapshot={state:GameState;paused:boolean;online:MultiplayerState;rendering:{frames:number};expansion:{casinoOpen:boolean;casinoStation:string|null}};
const snapshot=(page:Page):Promise<Snapshot>=>page.evaluate(()=>(window as unknown as{__NEON_TEST__:Snapshot}).__NEON_TEST__);
async function visitTournament(page:Page){
 await page.bringToFront();if((await snapshot(page)).paused)await page.locator('#resume').click();
 await page.keyboard.press('e');await expect.poll(async()=>(await snapshot(page)).state.player.mode).toBe('foot');
 await walk(page,'z',75,false,15000);await walkTo(page,CASINO.door,'x',false,15000);await page.keyboard.press('e');
 await expect.poll(async()=>(await snapshot(page)).state.interior).toBe('casino');
 await walkTo(page,CASINO_GAMES.tournament,'x',false,15000);await page.keyboard.press('e');
 await expect(page.locator('#casino-games-dialog')).toBeVisible();await expect(page.locator('#casino-games-title')).toHaveText('TURNIEJ PRZYJACIÓŁ');
}

test('turniej dwóch prawdziwych klientów zachowuje prywatność, blokuje ruch i wypłaca pulę raz',async({browser},testInfo)=>{
 test.setTimeout(180000);
 const contexts:BrowserContext[]=[],errors:string[]=[];
 const open=async(name:string)=>{
  const context=await browser.newContext({baseURL:process.env.NEON_BASE_URL||'http://127.0.0.1:5185/school_project/',viewport:{width:1200,height:800}});contexts.push(context);
  await context.addInitScript(()=>Object.defineProperty(window,'__NEON_SIGNALING__',{value:{host:'127.0.0.1',port:9000,path:'/peerjs',secure:false,config:{iceServers:[{urls:'turn:127.0.0.1:3478?transport=tcp',username:'neon',credential:'neon-local-test'}],iceTransportPolicy:'relay'}}}));
  const page=await context.newPage();page.on('pageerror',error=>errors.push(`${name}: ${error.message}`));await page.goto('./');await page.locator('#intro-online').click();await page.locator('#online-name').fill(name);return page;
 };
 try{
  const host=await open('Alicja');await host.locator('#online-create').click();await expect.poll(async()=>(await snapshot(host)).online.status,{timeout:20000}).toBe('online');
  const code=(await host.locator('#online-code').innerText()).trim();await host.locator('#online-enter').click();
  const guest=await open('Borys');await guest.locator('#online-room').fill(code);await guest.locator('#online-join').click();await expect.poll(async()=>(await snapshot(guest)).online.status,{timeout:20000}).toBe('online');await guest.locator('#online-enter').click();
  await expect.poll(async()=>(await snapshot(host)).online.snapshot?.members.length).toBe(2);
  await visitTournament(host);await visitTournament(guest);
  await host.bringToFront();await host.locator('#tournament-open').click();await expect(guest.locator('#tournament-join')).toBeVisible();
  await host.locator('#tournament-join').click();await guest.locator('#tournament-join').click();
  for(const page of[host,guest])await expect.poll(async()=>(await snapshot(page)).online.snapshot?.wallet).toBe(1000);
  await expect(host.locator('#tournament-start')).toBeEnabled();await host.locator('#tournament-start').click();
  for(const page of[host,guest])await expect.poll(async()=>(await snapshot(page)).online.snapshot?.tournament.status).toBe('playing');
  const state=(await snapshot(host)).online.snapshot!,table=state.tournament.poker!;
  expect(table.players[0].hole.every(card=>card.rank>0)).toBe(true);expect(table.players[1].hole.every(card=>card.rank===0)).toBe(true);expect(table.deck).toEqual([]);expect(table.seed).toBe(0);
  expect(state.tournament.pot).toBe(500);expect(state.poker).toBeNull();expect(state.seated).toBe(false);
  await host.screenshot({path:testInfo.outputPath('online-tournament.png'),fullPage:true});
  // Leaving the betting panel must not let a tournament participant walk away
  // from the host-owned seat or generate a stream of rejected pose updates.
  await host.locator('#casino-games-close').click();await expect.poll(async()=>(await snapshot(host)).expansion.casinoOpen).toBe(false);
  const before=await snapshot(host);await host.keyboard.down('d');
  try{await expect.poll(async()=>(await snapshot(host)).rendering.frames).toBeGreaterThan(before.rendering.frames+5);}
  finally{await host.keyboard.up('d');}
  const after=await snapshot(host);expect(Math.hypot(after.state.player.x-before.state.player.x,after.state.player.z-before.state.player.z)).toBeLessThan(.1);
  await host.keyboard.press('k');await expect(host.locator('#casino-games-dialog')).toBeVisible();
  await guest.bringToFront();await guest.locator('#tournament-withdraw').click();
  for(const page of[host,guest])await expect.poll(async()=>(await snapshot(page)).online.snapshot?.tournament.status).toBe('completed');
  await expect.poll(async()=>(await snapshot(host)).online.snapshot?.wallet).toBe(1500);expect((await snapshot(guest)).online.snapshot?.wallet).toBe(1000);
  expect((await snapshot(host)).online.snapshot?.tournament.winnerId).toBe(state.youId);
  await expect(guest.locator('#tournament-withdraw')).toHaveCount(0);
  const settled=(await snapshot(host)).rendering.frames;await expect.poll(async()=>(await snapshot(host)).rendering.frames).toBeGreaterThan(settled+10);
  expect((await snapshot(host)).online.snapshot?.wallet).toBe(1500);expect((await snapshot(host)).online.snapshot?.poker).toBeNull();expect(errors).toEqual([]);
 }catch(error){
  for(const[index,context]of contexts.entries()){const page=context.pages()[0];if(page&&!page.isClosed()){await page.screenshot({path:testInfo.outputPath(`tournament-failure-${index}.png`),fullPage:true});await testInfo.attach(`tournament-state-${index}`,{body:JSON.stringify(await snapshot(page),null,2),contentType:'application/json'});}}
  throw error;
 }finally{await Promise.allSettled(contexts.map(context=>context.close()));}
});

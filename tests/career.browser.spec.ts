import { expect,test,type Page } from '@playwright/test';
import { CONTACTS,HOMES,HOME_ROOM,type CareerState } from '../src/career';
import type { GameState } from '../src/model';
import { approach,walk,walkTo } from './browser-navigation';

interface Snapshot {
  state:GameState;
  started:boolean;
  paused:boolean;
  expansion:{career:CareerState;home:'canal'|'loft'|'crew'|null;careerOpen:boolean};
  rendering:{view:string;frames:number};
}
const snapshot=(page:Page):Promise<Snapshot>=>page.evaluate(()=>(window as unknown as {__NEON_TEST__:Snapshot}).__NEON_TEST__);
async function start(page:Page){
  await page.goto('./');await page.locator('#start-game').click();
  await expect.poll(async()=>(await snapshot(page)).started).toBe(true);
}
async function leaveCar(page:Page){await page.keyboard.press('e');await expect.poll(async()=>(await snapshot(page)).state.player.mode).toBe('foot');}
function watch(page:Page){
  const errors:string[]=[],missing:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400&&/\/school_project\/(?:assets\/|favicon)/.test(response.url()))missing.push(`${response.status()} ${response.url()}`);});
  return {errors,missing};
}

test('kupione mieszkanie ma dostępne wnętrze 3D, wyposażenie i zapis po odświeżeniu',async({page},info)=>{
  test.setTimeout(150000);const observed=watch(page);await start(page);
  await page.keyboard.press('l');await expect(page.locator('#career-root')).toBeVisible();
  await page.locator('#career-buy-canal').click();
  await expect.poll(async()=>(await snapshot(page)).expansion.career.ownedHomes).toEqual(['canal']);
  await expect.poll(async()=>(await snapshot(page)).state.money).toBe(350);
  await page.locator('#career-furnish-canal-sofa').click();
  await expect.poll(async()=>(await snapshot(page)).expansion.career.furniture.canal).toEqual(['sofa']);
  await expect.poll(async()=>(await snapshot(page)).state.money).toBe(190);
  await page.locator('#career-route-canal').click();await expect(page.locator('#career-root')).toHaveCount(0);
  await leaveCar(page);
  // Stay on the outer avenues, well away from the automatic reward at(-40,40).
  await walkTo(page,{x:0,z:80},'z',true);
  await walkTo(page,{x:-80,z:80},'x',true);
  await walkTo(page,{x:-80,z:40},'z',true);
  await walkTo(page,HOMES.canal.parking,'x');
  await walkTo(page,HOMES.canal.door,'z');
  await expect(page.locator('#interaction-text')).toContainText('mieszkania');await page.keyboard.press('e');
  await expect.poll(async()=>(await snapshot(page)).expansion.home).toBe('canal');
  await expect.poll(async()=>(await snapshot(page)).rendering.view).toBe('home');
  await expect(page.locator('#home-status')).toContainText('Mieszkanie nad kanałem');
  const entered=await snapshot(page),beforeFrames=entered.rendering.frames;
  await walk(page,'z',.5);await walk(page,'x',-2.5);
  expect((await snapshot(page)).rendering.frames).toBeGreaterThan(beforeFrames);
  expect((await snapshot(page)).expansion.home).toBe('canal');
  await page.screenshot({path:info.outputPath('owned-home-interior.png'),fullPage:true});
  await page.keyboard.press('l');await expect(page.locator('#career-furnish-canal-sofa')).toHaveText('W mieszkaniu');
  await expect(page.locator('#career-rest-canal')).toBeEnabled();await page.locator('#career-rest-canal').click();
  await expect(page.locator('#career-message')).toContainText('Zdrowie przywrócone');
  await page.screenshot({path:info.outputPath('owned-home-management.png'),fullPage:true});await page.locator('#career-close').click();
  await walkTo(page,HOME_ROOM.exit,'x');await approach(page,HOME_ROOM.exit,.8);await page.keyboard.press('e');
  await expect.poll(async()=>(await snapshot(page)).expansion.home).toBeNull();
  await expect.poll(async()=>(await snapshot(page)).rendering.view).toBe('city');
  expect((await snapshot(page)).state.money).toBe(190);
  await page.reload();await page.locator('#start-game').click();
  expect((await snapshot(page)).expansion.career.ownedHomes).toEqual(['canal']);
  expect((await snapshot(page)).expansion.career.furniture.canal).toEqual(['sofa']);
  expect((await snapshot(page)).state.money).toBe(190);
  expect(observed.errors).toEqual([]);expect(observed.missing).toEqual([]);
});

test('zlecenie kontaktu zalicza rzeczywistą trasę, wypłaca raz i zapisuje reputację',async({page},info)=>{
  test.setTimeout(180000);const observed=watch(page);await start(page);
  await page.keyboard.press('l');await expect(page.locator('#career-contract-milo')).toBeDisabled();
  await page.locator('#career-contract-nova').click();
  await expect.poll(async()=>(await snapshot(page)).expansion.career.activeContract?.id).toBe('nova');
  await page.locator('#career-contract-route').click();await leaveCar(page);
  let beforeDelivery=0;
  const pickup=CONTACTS.nova.objectives[0].target,delivery=CONTACTS.nova.objectives[1].target;
  await walkTo(page,{x:0,z:pickup.z},'z',true);
  await walkTo(page,pickup,'x',true);
  await expect.poll(async()=>(await snapshot(page)).expansion.career.activeContract?.stage).toBe(1);
  await walkTo(page,{x:pickup.x,z:delivery.z},'z',true);beforeDelivery=(await snapshot(page)).state.money;
  await walkTo(page,delivery,'x',true);
  await expect.poll(async()=>(await snapshot(page)).expansion.career.completedContracts).toBe(1);
  const completed=await snapshot(page);
  expect(completed.expansion.career.activeContract).toBeNull();expect(completed.expansion.career.reputation).toBe(60);
  expect(completed.state.money).toBe(beforeDelivery+300);
  await page.keyboard.press('l');await expect(page.locator('.career-rank')).toContainText('REPUTACJA 60');
  await expect(page.locator('#career-contract-milo')).toBeDisabled();
  await page.screenshot({path:info.outputPath('completed-contact-reputation.png'),fullPage:true});
  // A fresh assignment is another run; it cannot repeat the previous payout.
  await page.locator('#career-contract-nova').click();await expect(page.locator('#career-contract-cancel')).toBeVisible();
  await page.locator('#career-contract-cancel').click();
  expect((await snapshot(page)).state.money).toBe(beforeDelivery+300);expect((await snapshot(page)).expansion.career.reputation).toBe(60);
  await page.reload();await page.locator('#start-game').click();
  expect((await snapshot(page)).expansion.career.completedContracts).toBe(1);expect((await snapshot(page)).expansion.career.reputation).toBe(60);
  expect((await snapshot(page)).expansion.career.activeContract).toBeNull();
  expect(observed.errors).toEqual([]);expect(observed.missing).toEqual([]);
});

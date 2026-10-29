import { expect,test,type Page } from '@playwright/test';
import { DOCK,WATER_BOUNDS,type MobilityTrialSnapshot } from '../src/mobility';
import type { GameState } from '../src/model';

interface Snapshot {state:GameState;started:boolean;paused:boolean;stories:{mobilityTrial:MobilityTrialSnapshot};rendering:{frames:number;calls:number;view:string}}
const snapshot=(page:Page):Promise<Snapshot>=>page.evaluate(()=>(window as unknown as{__NEON_TEST__:Snapshot}).__NEON_TEST__);
async function start(page:Page){await page.goto('./');await expect(page.locator('#world canvas')).toBeVisible();await page.locator('#start-game').click();await page.keyboard.press('e');await expect.poll(async()=>(await snapshot(page)).state.player.mode).toBe('foot');}
async function move(page:Page,key:string,axis:'x'|'z',target:number,increasing:boolean){await page.keyboard.down(key);try{await expect.poll(async()=>{const value=(await snapshot(page)).state.player[axis];return increasing?value>=target:value<=target;},{timeout:30000,intervals:[50,100]}).toBe(true);}finally{await page.keyboard.up(key);}}
async function sport(page:Page){await page.keyboard.press('t');await expect(page.locator('#phone-root')).toBeVisible();await page.locator('#phone-launch-mobility').click();await expect(page.locator('#mobility-dialog')).toBeVisible();}
async function stop(page:Page){await page.keyboard.down(' ');try{await expect.poll(async()=>{const current=await snapshot(page);return Math.abs(current.state.vehicles.find(vehicle=>vehicle.id===current.state.player.vehicleId)?.speed??0);},{timeout:15000,intervals:[50,100]}).toBeLessThan(.5);}finally{await page.keyboard.up(' ');}}
function watch(page:Page){const errors:string[]=[],missing:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.status()>=400&&/\/school_project\/(?:assets\/|favicon)/.test(response.url()))missing.push(`${response.status()} ${response.url()}`);});return{errors,missing};}

test('motocykl jest dostępny z ulicy, jeździ i rozpoczyna prawdziwą próbę przez telefon',async({page},info)=>{
 test.setTimeout(120000);const seen=watch(page);await start(page);
 await move(page,'s','z',80,true);await expect(page.locator('#interaction-text')).toContainText('motocykl');await page.keyboard.press('e');
 await expect.poll(async()=>(await snapshot(page)).state.player.vehicleId).toBe('bike-1');
 await sport(page);await expect(page.locator('#mobility-start-bike')).toBeEnabled();await expect(page.locator('#mobility-start-boat')).toBeDisabled();
 await page.locator('#mobility-start-bike').click();await expect.poll(async()=>(await snapshot(page)).stories.mobilityTrial.status).toBe('running');
 const before=await snapshot(page);expect(before.stories.mobilityTrial.target).toEqual({x:40,z:80});await page.locator('#mobility-close').click();
 await move(page,'w','z',before.state.player.z-7,false);await stop(page);
 const driven=await snapshot(page);expect(driven.state.player.vehicleId).toBe('bike-1');expect(driven.stories.mobilityTrial.remainingMs).toBeLessThan(before.stories.mobilityTrial.remainingMs);expect(driven.rendering.calls).toBeGreaterThan(0);
 await page.screenshot({path:info.outputPath('vortex-motorcycle.png'),fullPage:true});
 await sport(page);await page.locator('#mobility-cancel').click();await expect.poll(async()=>(await snapshot(page)).stories.mobilityTrial.status).toBe('failed');
 expect((await snapshot(page)).state.money).toBe(1250);expect(seen.errors).toEqual([]);expect(seen.missing).toEqual([]);
});

test('motorówka ma dostępną przystań, sterowanie na wodzie i bezpieczny powrót',async({page},info)=>{
 test.setTimeout(180000);const seen=watch(page);await start(page);await page.keyboard.down('Shift');
 try{await move(page,'s','z',80,true);await move(page,'d','x',80,true);await move(page,'w','z',26,false);}finally{await page.keyboard.up('Shift');}
 // Finish the dock approach at walking speed, avoiding key-up overshoot on a software GPU.
 await move(page,'w','z',20,false);await move(page,'d','x',94.8,true);await expect(page.locator('#interaction-text')).toContainText('motorówki');await page.keyboard.press('e');
 await expect.poll(async()=>(await snapshot(page)).state.player.vehicleId).toBe('boat-1');
 expect((await snapshot(page)).state.player.x).toBeGreaterThan(118);
 await page.keyboard.press('e');await expect.poll(async()=>(await snapshot(page)).state.player.mode).toBe('foot');
 expect((await snapshot(page)).state.player.x).toBe(DOCK.land.x);expect((await snapshot(page)).state.player.z).toBe(DOCK.land.z);
 await page.keyboard.press('e');await expect.poll(async()=>(await snapshot(page)).state.player.vehicleId).toBe('boat-1');
 await sport(page);await expect(page.locator('#mobility-start-boat')).toBeEnabled();await page.locator('#mobility-start-boat').click();
 await expect.poll(async()=>(await snapshot(page)).stories.mobilityTrial.status).toBe('running');await page.locator('#mobility-close').click();
 await move(page,'w','x',139,true);await stop(page);const afloat=await snapshot(page),boat=afloat.state.vehicles.find(vehicle=>vehicle.id==='boat-1')!;
 expect(boat.kind).toBe('boat');expect(boat.x).toBeGreaterThanOrEqual(WATER_BOUNDS.minX);expect(boat.x).toBeLessThanOrEqual(WATER_BOUNDS.maxX);expect(boat.z).toBeGreaterThanOrEqual(WATER_BOUNDS.minZ);expect(boat.z).toBeLessThanOrEqual(WATER_BOUNDS.maxZ);
 await page.keyboard.press('e');await expect(page.locator('#toast')).toContainText('Wróć do pomostu');expect((await snapshot(page)).state.player.vehicleId).toBe('boat-1');
 await page.screenshot({path:info.outputPath('tiderunner-on-ocean.png'),fullPage:true});
 await page.keyboard.press('r');await expect.poll(async()=>(await snapshot(page)).state.player.vehicleId).toBe('stratus');
 const rescued=await snapshot(page),returned=rescued.state.vehicles.find(vehicle=>vehicle.id==='boat-1')!;expect(returned.x).toBe(DOCK.mooring.x);expect(returned.z).toBe(DOCK.mooring.z);expect(rescued.state.money).toBe(1150);
 await expect.poll(async()=>(await snapshot(page)).stories.mobilityTrial.status).toBe('failed');expect(seen.errors).toEqual([]);expect(seen.missing).toEqual([]);
});

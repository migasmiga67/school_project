import { describe, expect, it } from 'vitest';
import { createEngineCare, createEngineRun, createOilService, enginePower, engineWarnings, gearLabel, parseEngineCare, serviceAction, stepEngine, stepService, canFinishService, engineBayPose, OIL_CAPACITY, FILTER_PRICE, REDLINE_RPM, IDLE_RPM, type EngineCare, type OilService } from '../src/engine';
import { createGarage, garageAction, garageVehicle } from '../src/garage';
import { activeVehicle, createGame, step } from '../src/game';
import type { Input } from '../src/model';

const idle = (): Input => ({ throttle: false, brake: false, left: false, right: false, handbrake: false, boost: false, sprint: false, interact: false, nextMission: false, reset: false });
function run(care: EngineCare, service: OilService, seconds: number) {
  for (let t = 0; t < seconds; t += .1) stepService(care, service, .1, 1000);
}

describe('running engine', () => {
  it('idles, revs through an automatic gearbox and never exceeds the redline', () => {
    const care = createEngineCare(), engine = createEngineRun();
    stepEngine(care, engine, { speed: 0, throttle: false, driving: true, dt: 1 });
    expect(engine.rpm).toBeCloseTo(IDLE_RPM, -1); expect(gearLabel(engine, 0)).toBe('N');
    const gears: number[] = [];
    for (let speed = 1; speed < 45; speed += .5) { stepEngine(care, engine, { speed, throttle: true, driving: true, dt: .1 }); gears.push(engine.gear); expect(engine.rpm).toBeLessThanOrEqual(REDLINE_RPM); }
    expect(Math.max(...gears)).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < gears.length; i++) expect(gears[i]).toBeGreaterThanOrEqual(gears[i - 1]);
    expect(gearLabel(engine, -3)).toBe('R');
    engine.running = false; expect(gearLabel(engine, 0)).toBe('OFF');
  });
  it('ages oil with distance, costs power and damages an engine run without oil', () => {
    const care = createEngineCare(), engine = createEngineRun(); care.life = 1; care.oil = OIL_CAPACITY;
    expect(enginePower(care)).toBe(1);
    for (let i = 0; i < 2400; i++) stepEngine(care, engine, { speed: 30, throttle: true, driving: true, dt: .25 });
    expect(care.km).toBeGreaterThan(createEngineCare().km + 17);
    expect(care.life).toBeLessThan(.1); expect(enginePower(care)).toBeLessThan(1);
    expect(engineWarnings(care)).toContain('old-oil');
    const dry = createEngineCare(); dry.oil = .2;
    for (let i = 0; i < 80; i++) stepEngine(dry, createEngineRun(), { speed: 0, throttle: false, driving: false, dt: .25 });
    expect(dry.wear).toBeGreaterThan(.2); expect(engineWarnings(dry)).toContain('no-oil'); dry.wear = .5; expect(engineWarnings(dry)).toContain('damaged');
    // Limp mode: never zero power, the player can always reach the workshop.
    dry.wear = 1; dry.life = 0; dry.oil = 0; expect(enginePower(dry)).toBeGreaterThanOrEqual(.35);
  });
  it('parses damaged saves into safe values', () => {
    expect(parseEngineCare(null)).toEqual(createEngineCare());
    const parsed = parseEngineCare({ oil: 99, life: -3, filter: 'x', wear: NaN, km: 12 });
    expect(parsed).toEqual({ oil: 6, life: 0, filter: createEngineCare().filter, wear: 0, km: 12 });
  });
  it('applies engine condition to real driving physics', () => {
    const healthy = createGame(), worn = createGame();
    for (const state of [healthy, worn]) { state.vehicles = [activeVehicle(state)!]; state.police = []; state.mission.active = false; }
    activeVehicle(worn)!.power = .5;
    for (let i = 0; i < 40; i++) { step(healthy, { ...idle(), throttle: true }, .05); step(worn, { ...idle(), throttle: true }, .05); }
    expect(activeVehicle(worn)!.speed).toBeLessThan(activeVehicle(healthy)!.speed * .7);
  });
});

describe('workshop oil change', () => {
  it('follows the full procedure: drain, filter, refill and finish with fresh oil', () => {
    const care = createEngineCare(), service = createOilService();
    let spent = 0;
    const act = (part: Parameters<typeof serviceAction>[2]) => { const result = serviceAction(care, service, part, 1000, false); expect(result.ok, result.message).toBe(true); spent += result.cost; return result; };
    expect(serviceAction(care, service, 'cap', 1000, false).ok).toBe(false);
    act('hood'); expect(act('dipstick').message).toMatch(/Bagnet/); act('dipstick');
    act('cap'); act('drainPlug'); run(care, service, 12);
    expect(care.oil).toBe(0); expect(service.pan).toBeGreaterThan(3.5); expect(service.done).toContain('drain');
    act('filter'); expect(service.filter).toBe('none'); expect(canFinishService(service)).not.toBeNull();
    act('filter'); expect(service.filter).toBe('new'); expect(spent).toBe(FILTER_PRICE);
    expect(canFinishService(service)).toMatch(/spustowy/);
    act('drainPlug'); act('bottle'); run(care, service, 10.2); act('bottle');
    expect(care.oil).toBeGreaterThan(OIL_CAPACITY - .1); expect(care.oil).toBeLessThan(OIL_CAPACITY + .2);
    expect(care.life).toBeCloseTo(1, 5); expect(care.filter).toBe(1);
    act('cap'); act('dipstick'); act('dipstick'); act('hood');
    expect(service.done).toEqual(expect.arrayContaining(['hood', 'dipstick', 'cap', 'drain', 'filter', 'plug', 'fill', 'closeCap', 'check', 'closeHood']));
    expect(canFinishService(service)).toBeNull();
    expect(enginePower(care)).toBe(1);
  });
  it('refuses unsafe or impossible steps and mixes oil when the sump was not drained', () => {
    const care = createEngineCare(), service = createOilService();
    serviceAction(care, service, 'hood', 1000, false);
    expect(serviceAction(care, service, 'bottle', 1000, false).ok).toBe(false); // cap closed
    serviceAction(care, service, 'cap', 1000, false);
    expect(serviceAction(care, service, 'hood', 1000, false).ok).toBe(false); // cap still open
    const before = care.life;serviceAction(care, service, 'bottle', 1000, false); run(care, service, 2);
    expect(care.life).toBeGreaterThan(before); expect(care.life).toBeLessThan(.6);
    expect(service.done).not.toContain('fill');
    const broke = createOilService(); broke.hood = true; broke.filter = 'none';
    expect(serviceAction(createEngineCare(), broke, 'filter', 5, false).ok).toBe(false);
  });
  it('drains slower with the filler cap closed and exposes a matching 3D pose', () => {
    const open = createEngineCare(), closed = createEngineCare();
    const a = createOilService(), b = createOilService();
    a.hood = b.hood = true; a.cap = true; a.plugOut = b.plugOut = true;
    stepService(open, a, 1, 0); stepService(closed, b, 1, 0);
    expect(createEngineCare().oil - open.oil).toBeGreaterThan(createEngineCare().oil - closed.oil);
    const pose = engineBayPose(open, createEngineRun(), a, 'drainPlug');
    expect(pose).toMatchObject({ hood: 1, cap: 1, plug: 1, service: true, highlight: 'drainPlug' });
    expect(pose.draining).toBeGreaterThan(0);
  });
});

describe('visual tuning in the garage', () => {
  it('charges for parts, rejects bad options and hands the style to the car', () => {
    let result = garageAction(createGarage(), 1000, { type: 'part', part: 'spoiler', value: 2 });
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.wallet).toBe(1000 - 320); expect(garageVehicle(result.garage).style.spoiler).toBe(2);
    expect(garageAction(result.garage, 1000, { type: 'part', part: 'spoiler', value: 2 }).ok).toBe(false);
    expect(garageAction(result.garage, 1000, { type: 'part', part: 'spoiler', value: 9 }).ok).toBe(false);
    expect(garageAction(result.garage, 1000, { type: 'part', part: 'wings' as never, value: 1 }).ok).toBe(false);
    expect(garageAction(result.garage, 10, { type: 'part', part: 'kit', value: 2 }).ok).toBe(false);
    result = garageAction(result.garage, 1000, { type: 'part', part: 'spoiler', value: 0 });
    expect(result.ok && result.wallet).toBe(1000);
  });
});

import { describe, expect, it } from 'vitest';
import { activeVehicle, createGame, step } from '../src/game';
import { applyGarage, createGarage, GARAGE_CARS, GARAGE_PAINTS, garageAction, garageVehicle, parseGarage, type GarageAction, type GarageState } from '../src/garage';
import type { Input } from '../src/model';

function transaction(garage: GarageState, wallet: number, action: GarageAction) {
  const result = garageAction(garage, wallet, action);
  if (!result.ok) throw new Error(result.reason);
  return result;
}
function driveState() {
  const state = createGame();
  state.vehicles = [activeVehicle(state)!]; state.police = []; state.mission.active = false;
  return state;
}
const idle = (): Input => ({ throttle: false, brake: false, left: false, right: false, handbrake: false, boost: false, sprint: false, interact: false, nextMission: false, reset: false });
function advance(state: ReturnType<typeof createGame>, seconds: number, input: Partial<Input>) {
  for (let index = 0; index < Math.round(seconds / .05); index++) step(state, { ...idle(), ...input }, .05);
}

describe('atomic garage transactions and saved profiles', () => {
  it('gives old profiles an independent default car without sharing mutable settings', () => {
    const a = parseGarage(undefined), b = createGarage();
    expect(a).toEqual(b); expect(a.owned).toEqual(['stratus']);
    a.cars.stratus!.engine = 2;
    expect(b.cars.stratus!.engine).toBe(0);
    for (const value of [null, 7, [], 'garage']) expect(parseGarage(value)).toEqual(b);
  });
  it('rejects unknown saved models, inaccessible selections and invalid tuning values', () => {
    const parsed = parseGarage({ owned: ['stratus', 'stratus', 'unknown', 'sentinel'], selected: 'comet', cars: { stratus: { paint: -1, engine: 100, brakes: -.5, nitro: Infinity }, sentinel: { paint: GARAGE_PAINTS[4].color, engine: 1, brakes: 2, nitro: 0 }, comet: { engine: 2 } } });
    expect(parsed.owned).toEqual(['stratus', 'sentinel']); expect(parsed.selected).toBe('stratus');
    expect(parsed.cars.stratus).toEqual({ paint: GARAGE_CARS.stratus.paint, engine: 0, brakes: 0, nitro: 0 });
    expect(parsed.cars.sentinel).toEqual({ paint: GARAGE_PAINTS[4].color, engine: 1, brakes: 2, nitro: 0 });
    expect(parsed.cars.comet).toBeUndefined();
  });
  it('round-trips valid per-car ownership, selections and upgrades through JSON', () => {
    let result = transaction(createGarage(), 5000, { type: 'upgrade', upgrade: 'engine' });
    result = transaction(result.garage, result.wallet, { type: 'buy', car: 'sentinel' });
    result = transaction(result.garage, result.wallet, { type: 'paint', color: GARAGE_PAINTS[5].color });
    const restored = parseGarage(JSON.parse(JSON.stringify(result.garage)));
    expect(restored).toEqual(result.garage);
    expect(restored.cars.stratus!.engine).toBe(1); expect(restored.cars.sentinel!.paint).toBe(GARAGE_PAINTS[5].color);
  });
  it('buys and selects a car once with an exact debit, without mutating the original', () => {
    const original = createGarage(), before = structuredClone(original);
    const result = transaction(original, 1250, { type: 'buy', car: 'sentinel' });
    expect(original).toEqual(before); expect(result.wallet).toBe(350); expect(result.garage.selected).toBe('sentinel');
    expect(result.garage.owned).toEqual(['stratus', 'sentinel']);
    expect(garageAction(result.garage, result.wallet, { type: 'buy', car: 'sentinel' }).ok).toBe(false);
    expect(result.wallet).toBe(350);
  });
  it('never spends or unlocks anything when funds are insufficient', () => {
    const original = createGarage(), before = structuredClone(original);
    for (const action of [{ type: 'buy', car: 'sentinel' }, { type: 'upgrade', upgrade: 'engine' }, { type: 'paint', color: GARAGE_PAINTS[1].color }] as GarageAction[]) {
      expect(garageAction(original, 79, action).ok).toBe(false);
      expect(original).toEqual(before);
    }
  });
  it('charges level-dependent upgrades once and refuses a third level', () => {
    let result = transaction(createGarage(), 1000, { type: 'upgrade', upgrade: 'engine' });
    expect(result.wallet).toBe(650); expect(result.garage.cars.stratus!.engine).toBe(1);
    result = transaction(result.garage, result.wallet, { type: 'upgrade', upgrade: 'engine' });
    expect(result.wallet).toBe(50); expect(result.garage.cars.stratus!.engine).toBe(2);
    expect(garageAction(result.garage, result.wallet, { type: 'upgrade', upgrade: 'engine' }).ok).toBe(false);
    expect(result.garage.cars.stratus!.engine).toBe(2);
  });
  it('keeps individual cars tuned when switching and refuses unowned selections', () => {
    let result = transaction(createGarage(), 5000, { type: 'upgrade', upgrade: 'brakes' });
    result = transaction(result.garage, result.wallet, { type: 'buy', car: 'comet' });
    expect(result.garage.cars.comet).toMatchObject({ engine: 1, brakes: 0, nitro: 1 });
    result = transaction(result.garage, result.wallet, { type: 'select', car: 'stratus' });
    expect(result.garage.cars.stratus!.brakes).toBe(1); expect(result.garage.cars.comet!.brakes).toBe(0);
    expect(garageAction(result.garage, result.wallet, { type: 'select', car: 'sentinel' }).ok).toBe(false);
    expect(garageAction(result.garage, result.wallet, { type: 'select', car: 'stratus' }).ok).toBe(false);
  });
  it('charges only palette paint changes, rejecting repeated and arbitrary colours', () => {
    const result = transaction(createGarage(), 1250, { type: 'paint', color: GARAGE_PAINTS[2].color });
    expect(result.wallet).toBe(1170); expect(result.garage.cars.stratus!.paint).toBe(GARAGE_PAINTS[2].color);
    expect(garageAction(result.garage, result.wallet, { type: 'paint', color: GARAGE_PAINTS[2].color }).ok).toBe(false);
    expect(garageAction(result.garage, result.wallet, { type: 'paint', color: 0xffffff }).ok).toBe(false);
  });
  it('rejects malformed commands and invalid wallet amounts without exceptions', () => {
    const garage = createGarage();
    for (const wallet of [-1, .5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(garageAction(garage, wallet, { type: 'upgrade', upgrade: 'engine' }).ok).toBe(false);
    for (const action of [null, {}, { type: 'buy', car: '__proto__' }, { type: 'upgrade', upgrade: 'freeMoney' }, { type: 'refund', amount: 99999 }]) {
      expect(garageAction(garage, 1250, action as GarageAction).ok).toBe(false);
    }
  });
  it('applies cosmetic and mechanical choices without repairing or moving a car', () => {
    const state = createGame(), car = activeVehicle(state)!, traffic = structuredClone(state.vehicles[1]);
    Object.assign(car, { speed: 3, x: 0, z: 50, health: 42, heading: 1.2 });
    const before = { x: car.x, z: car.z, speed: car.speed, health: car.health, heading: car.heading };
    const result = transaction(createGarage(), 1250, { type: 'buy', car: 'sentinel' });
    applyGarage(state, result.garage);
    expect({ x: car.x, z: car.z, speed: car.speed, health: car.health, heading: car.heading }).toEqual(before);
    expect(car).toMatchObject(garageVehicle(result.garage)); expect(car.kind).toBe('sedan'); expect(car.label).toBe('Sentinel GT');
    expect(state.vehicles[1]).toEqual(traffic); expect(state.money).toBe(1250);
  });
});

describe('purchased tuning changes driving physics', () => {
  it('keeps untuned acceleration and trajectory unchanged', () => {
    const stock = driveState(), configured = driveState(); applyGarage(configured, createGarage());
    advance(stock, 1, { throttle: true }); advance(configured, 1, { throttle: true });
    expect(activeVehicle(configured)!.speed).toBe(activeVehicle(stock)!.speed);
    expect(configured.player).toEqual(stock.player);
  });
  it('gives an upgraded engine measurably stronger acceleration on the same road', () => {
    const stock = driveState(), tuned = driveState();
    const result = transaction(createGarage(), 1250, { type: 'upgrade', upgrade: 'engine' }); applyGarage(tuned, result.garage);
    advance(stock, 1, { throttle: true }); advance(tuned, 1, { throttle: true });
    expect(activeVehicle(tuned)!.speed).toBeGreaterThan(activeVehicle(stock)!.speed + 1.5);
    expect(tuned.player.z).toBeLessThan(stock.player.z);
  });
  it('reduces speed faster with purchased brakes without changing reverse limits', () => {
    const stock = driveState(), tuned = driveState();
    const result = transaction(createGarage(), 1250, { type: 'upgrade', upgrade: 'brakes' }); applyGarage(tuned, result.garage);
    activeVehicle(stock)!.speed = 20; activeVehicle(tuned)!.speed = 20;
    advance(stock, .4, { brake: true }); advance(tuned, .4, { brake: true });
    expect(activeVehicle(tuned)!.speed).toBeLessThan(activeVehicle(stock)!.speed - 1.5);
    advance(tuned, 2, { brake: true }); expect(activeVehicle(tuned)!.speed).toBeGreaterThanOrEqual(-9);
  });
  it('uses nitro and engine upgrades while keeping boosted speed within 45', () => {
    const stock = driveState(), tuned = driveState();
    const garage = createGarage(); garage.cars.stratus = { paint: GARAGE_PAINTS[0].color, engine: 2, brakes: 0, nitro: 2 }; applyGarage(tuned, garage);
    activeVehicle(stock)!.speed = 44; activeVehicle(tuned)!.speed = 44;
    advance(stock, .1, { throttle: true, boost: true }); advance(tuned, .1, { throttle: true, boost: true });
    expect(activeVehicle(stock)!.speed).toBe(35); expect(activeVehicle(tuned)!.speed).toBe(45);
    expect(tuned.player.z).toBeLessThan(stock.player.z);
  });
  it('clamps malformed runtime tuning and still produces finite bounded movement', () => {
    const state = driveState(); activeVehicle(state)!.tuning = { engine: 999, brakes: NaN, nitro: Infinity };
    advance(state, .5, { throttle: true, boost: true });
    expect(activeVehicle(state)!.speed).toBeLessThanOrEqual(45); expect(Number.isFinite(state.player.z)).toBe(true);
  });
});

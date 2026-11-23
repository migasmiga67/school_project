import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game';
import { createGarage } from '../src/garage';
import { clearCitySegment } from '../src/city-map';
import { createInventory, useItem } from '../src/inventory';
import {
  accrueRent, buyProperty, collectRent, createEstate, dispatchCourier, DAY_SECONDS, estateIncomePerDay, forecast, KITCHENS, marketBusted, marketOffers,
  nextWeatherChange, parseEstate, PROPERTIES, raceDefinitions, raceTarget, RACE_PERIOD, rivalTimes, scannerAlert, scannerUnits, sellProperty, signUpForRace,
  stepCourier, stepRace, towNeeded, upcomingRace,
} from '../src/phone-apps';

describe('police scanner', () => {
  it('lists patrols nearest first and announces a new chase', () => {
    const state = createGame();
    const units = scannerUnits(state);
    expect(units.length).toBe(state.police.length);
    for (let i = 1; i < units.length; i++) expect(units[i].distance).toBeGreaterThanOrEqual(units[i - 1].distance);
    const before = { wanted: 0, status: 'clear', heli: false, blocks: 0 };
    expect(scannerAlert(before, state)).toBeNull();
    state.wanted = 2;
    expect(scannerAlert(before, state)).toMatch(/Poziom 2/);
  });
});

describe('street races', () => {
  it('builds every route on drivable streets with checkpoints', () => {
    for (const race of raceDefinitions()) {
      expect(race.checkpoints.length).toBeGreaterThanOrEqual(5);
      expect(race.length).toBeGreaterThan(300);
      for (const point of race.checkpoints) expect(clearCitySegment(point, point, 1)).toBe(true);
    }
  });
  it('charges the entry, needs the car at the start line and pays the pool to the winner', () => {
    const at = 10, sign = signUpForRace(null, 5000, at);
    expect(sign.ok).toBe(true);
    if (!sign.ok) return;
    const entry = sign.entry, race = raceDefinitions()[entry.index % raceDefinitions().length];
    expect(sign.cost).toBe(race.entry);
    expect(signUpForRace(entry, 5000, at).ok).toBe(false);
    expect(raceTarget(entry)).toEqual(race.checkpoints[0]);
    expect(stepRace(entry, race.checkpoints[0], true, entry.startedAt - 1)).toBeNull();
    expect(stepRace(entry, race.checkpoints[0], true, entry.startedAt)?.kind).toBe('start');
    // Drive through every checkpoint faster than any rival.
    let t = entry.startedAt, last = null;
    for (let i = 1; i < race.checkpoints.length; i++) { t += 1; last = stepRace(entry, race.checkpoints[i], true, t); }
    expect(last?.kind).toBe('finish');
    expect(entry.place).toBe(1);
    expect(last?.payout).toBe(race.entry * (race.rivals.length + 1));
  });
  it('forfeits the entry when the player is not at the start', () => {
    const sign = signUpForRace(null, 5000, 0);
    if (!sign.ok) throw new Error(sign.message);
    expect(stepRace(sign.entry, { x: 9999, z: 9999 }, true, sign.entry.startedAt)?.kind).toBe('missed');
  });
  it('a slow finish loses to the rivals', () => {
    const sign = signUpForRace(null, 5000, 0);
    if (!sign.ok) throw new Error(sign.message);
    const entry = sign.entry, race = raceDefinitions()[entry.index % 3];
    stepRace(entry, race.checkpoints[0], true, entry.startedAt);
    const slow = Math.max(...rivalTimes(race, entry.index).map(r => r.time)) + 1;
    let result = null;
    for (let i = 1; i < race.checkpoints.length; i++) result = stepRace(entry, race.checkpoints[i], true, entry.startedAt + slow * i / (race.checkpoints.length - 1));
    expect(result?.kind).toBe('finish');
    expect(entry.place).toBe(4);
    expect(result?.payout).toBe(0);
  });
  it('schedules a race every period and closes sign-up at the start', () => {
    const first = upcomingRace(0), next = upcomingRace(first.startAt + 1);
    expect(next.startAt - first.startAt).toBe(RACE_PERIOD);
    expect(signUpForRace(null, 5000, first.startAt - 1).ok).toBe(false);
  });
});

describe('couriers', () => {
  it('ride along the streets and reach a moving target', () => {
    const target = { x: -20, z: 80 }, courier = dispatchCourier(KITCHENS, target, 10, 70);
    expect(courier.path.length).toBeGreaterThan(1);
    let arrived = false;
    for (let i = 0; i < 2000 && !arrived; i++) { target.x += .005; arrived = stepCourier(courier, target, .1, 2.6); }
    expect(arrived).toBe(true);
    expect(Math.hypot(courier.position.x - target.x, courier.position.z - target.z)).toBeLessThanOrEqual(2.6);
  });
  it('mechanic only comes when the own car needs help', () => {
    expect(towNeeded(null, 0, 0)).toMatch(/Stratus/);
    expect(towNeeded({ health: 100 }, 40, 0)).toMatch(/sprawne/);
    expect(towNeeded({ health: 100 }, 1, 0)).toBeNull();
    expect(towNeeded({ health: 30 }, 40, 0)).toBeNull();
  });
});

describe('rental property', () => {
  it('buys, accrues rent with game time, caps it and sells at a loss', () => {
    const estate = createEstate(), first = PROPERTIES[0];
    expect(buyProperty(estate, 10, first.id).ok).toBe(false);
    const bought = buyProperty(estate, 100000, first.id);
    expect(bought.ok && bought.cost).toBe(first.price);
    expect(buyProperty(estate, 100000, first.id).ok).toBe(false);
    for (let t = 0; t < DAY_SECONDS; t += 10) accrueRent(estate, 10);
    expect(Math.round(estate.pending)).toBe(first.rentPerDay);
    expect(collectRent(estate)).toBe(Math.floor(first.rentPerDay));
    for (let t = 0; t < DAY_SECONDS * 10; t += 50) accrueRent(estate, 50);
    expect(estate.pending).toBeLessThanOrEqual(estateIncomePerDay(estate) * 3);
    const sold = sellProperty(estate, first.id);
    expect(sold.ok && sold.refund).toBe(Math.round(first.price * .7));
    expect(parseEstate({ owned: ['nope', first.id, first.id], pending: -4 })).toEqual({ owned: [first.id], pending: 0 });
  });
});

describe('weather and black market', () => {
  it('forecast matches the city weather cycle', () => {
    const hours = forecast(170, 8);
    expect(hours).toHaveLength(8);
    expect(hours[0].clock).toBe('Teraz');
    const change = nextWeatherChange(170);
    expect(change.rain).toBe(true);
    expect(change.inSeconds).toBeLessThanOrEqual(15);
  });
  it('offers cheaper tuning and gear, deterministically per window', () => {
    const garage = createGarage(), offers = marketOffers(3, garage);
    expect(marketOffers(3, garage)).toEqual(offers);
    expect(offers.length).toBeGreaterThanOrEqual(2);
    for (const offer of offers) { expect(offer.price).toBeLessThan(offer.normal); expect(typeof marketBusted(offer)).toBe('boolean'); }
    expect(offers.some(offer => offer.upgrade)).toBe(true);
  });
});

describe('food items', () => {
  it('energy drink gives a sprint boost even at full health', () => {
    const inventory = createInventory();
    inventory.slots.push({ item: 'energy', count: 1 }, { item: 'burger', count: 1 });
    const energy = useItem(inventory, 'energy', { health: 100, car: null });
    expect(energy.ok && energy.effect.sprintSeconds).toBe(120);
    const burger = useItem(inventory, 'burger', { health: 40, car: null });
    expect(burger.ok && burger.effect.health).toBe(45);
  });
});

import { describe, expect, it } from 'vitest';
import { nearestStreet, BUILDINGS } from '../src/city-map';
import { decorationBlocker } from '../src/city-placement';
import { FUEL_STATIONS, FUEL_TANK, PUMP_ISLANDS, PUMP_SIDES, STATION_HALF, atShopCounter, canLeavePump, createFuelSession, fuelAction, fuelFlapPoint, fuelStationCollision, nearestPump, owed, stationLocal, stationPoint, stepFuel, SHOP_DOOR, type FuelTank } from '../src/fuel-stations';
import { createEngineCare, createEngineRun, enginePower, engineWarnings, stepEngine } from '../src/engine';

const pour = (session: ReturnType<typeof createFuelSession>, tank: FuelTank, seconds: number) => { const messages: string[] = []; for (let t = 0; t < seconds; t += .1) { const message = stepFuel(session, tank, .1); if (message) messages.push(message); } return messages; };

describe('fuel station sites', () => {
  it('sit on free roadside lots facing their street, clear of buildings and walkways', () => {
    expect(FUEL_STATIONS.length).toBeGreaterThanOrEqual(4);
    for (const station of FUEL_STATIONS) {
      expect(decorationBlocker({ x: station.x, z: station.z, width: STATION_HALF.u * 2, depth: STATION_HALF.v * 2, rotation: station.rotation }, undefined, { walkingPadding: .3 }), station.id).toBeNull();
      const front = nearestStreet(stationPoint(station, 0, -STATION_HALF.v))!, back = nearestStreet(stationPoint(station, 0, STATION_HALF.v))!;
      expect(front.distance).toBeLessThan(back.distance);
      // The frame is orthonormal and matches the Three.js rotation used by the art.
      expect(Math.hypot(station.along.x, station.along.z)).toBeCloseTo(1, 6);
      expect(station.along.x * station.out.x + station.along.z * station.out.z).toBeCloseTo(0, 6);
      expect(Math.sin(station.rotation)).toBeCloseTo(station.out.x, 6); expect(Math.cos(station.rotation)).toBeCloseTo(station.out.z, 6);
      const local = stationLocal(station, stationPoint(station, 2, -3)); expect(local.u).toBeCloseTo(2, 6); expect(local.v).toBeCloseTo(-3, 6);
      for (const building of BUILDINGS) expect(Math.abs(building.x - station.x) < building.halfX + 6 && Math.abs(building.z - station.z) < building.halfZ + 4).toBe(false);
    }
    expect(PUMP_SIDES).toHaveLength(FUEL_STATIONS.length * PUMP_ISLANDS.length * 2);
  });
  it('blocks the shop and islands but leaves both pump lanes drivable', () => {
    for (const station of FUEL_STATIONS) {
      expect(fuelStationCollision(stationPoint(station, 3, 4.8), .55)).toBe(true);
      for (const island of PUMP_ISLANDS) {
        expect(fuelStationCollision(stationPoint(station, island.u, island.v), 1.5)).toBe(true);
        expect(fuelStationCollision(stationPoint(station, island.u, -3.4), 1.5)).toBe(false);
        expect(fuelStationCollision(stationPoint(station, island.u, 1.2), 1.5)).toBe(false);
      }
      // A pedestrian can walk up to the pump face and to the till.
      expect(nearestPump(stationPoint(station, PUMP_ISLANDS[0].u, -2.1))?.station.id).toBe(station.id);
      expect(atShopCounter(stationPoint(station, SHOP_DOOR.u, SHOP_DOOR.v - .8))?.id).toBe(station.id);
    }
  });
  it('places the filler flap on the right rear of the car', () => {
    const flap = fuelFlapPoint({ x: 0, z: 0, heading: 0 }, 'sport');
    expect(flap.x).toBeCloseTo(1, 6); expect(flap.z).toBeCloseTo(1.55, 6);
  });
});

describe('refuelling at the pump', () => {
  it('runs the whole sale: flap, grade, nozzle, click-off and money owed', () => {
    const session = createFuelSession(PUMP_SIDES[0].id), tank: FuelTank = { fuel: 10, wrongFuel: 0, premium: 0 };
    expect(fuelAction(session, tank, 'nozzle', true).ok).toBe(false); // no grade yet
    expect(fuelAction(session, tank, 'fuelFlap', false).ok).toBe(false); // hose does not reach
    expect(fuelAction(session, tank, 'fuelFlap', true).ok).toBe(true); expect(session.flapOpen).toBe(true);
    expect(fuelAction(session, tank, 'grade95', true).ok).toBe(true);
    expect(fuelAction(session, tank, 'nozzle', true).ok).toBe(true); expect(session.nozzle).toBe('hand');
    expect(fuelAction(session, tank, 'grade98', true).ok).toBe(false);
    expect(fuelAction(session, tank, 'fuelFlap', true).ok).toBe(true); expect(session.pouring).toBe(true);
    expect(canLeavePump(session)).not.toBeNull();
    const messages = pour(session, tank, 70);
    expect(tank.fuel).toBeCloseTo(FUEL_TANK, 1); expect(session.pouring).toBe(false); expect(messages.join()).toMatch(/Klik/);
    expect(session.litres).toBeCloseTo(40, 1); expect(owed(session)).toBe(Math.round(40 * 1.79));
    fuelAction(session, tank, 'fuelFlap', true); expect(session.nozzle).toBe('hand');
    fuelAction(session, tank, 'nozzle', true); expect(session.nozzle).toBe('pump');
    expect(canLeavePump(session)).toMatch(/klapk/i);
    fuelAction(session, tank, 'fuelFlap', true); expect(canLeavePump(session)).toBeNull();
  });
  it('lets the wrong fuel in and the petrol engine suffers for it', () => {
    const care = createEngineCare(), session = createFuelSession(PUMP_SIDES[1].id);
    for (const part of ['fuelFlap', 'gradeON', 'nozzle', 'fuelFlap'] as const) fuelAction(session, care, part, true);
    pour(session, care, 20);
    expect(care.wrongFuel).toBeGreaterThan(10); expect(engineWarnings(care)).toContain('wrong-fuel');
    expect(enginePower(care)).toBeLessThan(.8);
    const engine = createEngineRun(), wear = care.wear;
    for (let i = 0; i < 100; i++) stepEngine(care, engine, { speed: 15, throttle: true, driving: true, dt: .25 });
    expect(care.wear).toBeGreaterThan(wear);
  });
  it('burns fuel while driving and stalls on an empty tank', () => {
    const care = createEngineCare(), engine = createEngineRun(); care.fuel = 1;
    for (let i = 0; i < 400 && engine.running; i++) stepEngine(care, engine, { speed: 25, throttle: true, driving: true, dt: .25 });
    expect(care.fuel).toBe(0); expect(engine.running).toBe(false); expect(engineWarnings(care)).toContain('no-fuel');
  });
});

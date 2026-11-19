import { nearestStreet } from './city-map';
import type { Point } from './model';

/** A forecourt is laid out in its own frame: u runs along the street, v away from it. */
export interface FuelStation {
  id: string; name: string; district: string;
  x: number; z: number;
  /** Unit vector along the street and unit vector pointing away from it. */
  along: Point; out: Point;
  /** Three.js Y rotation whose local X is `along` and local Z is `out`. */
  rotation: number;
}
export type FuelGrade = '95' | '98' | 'ON';
export const FUEL_GRADES: Record<FuelGrade, { name: string; price: number; color: string }> = {
  '95': { name: 'Benzyna 95', price: 1.79, color: '#3fae5a' },
  '98': { name: 'Benzyna 98', price: 1.99, color: '#d9a326' },
  ON: { name: 'Olej napędowy', price: 1.69, color: '#2c2f33' },
};
export const FUEL_GRADE_IDS = Object.keys(FUEL_GRADES) as FuelGrade[];
export const FUEL_TANK = 50;
export const STATION_HALF = { u: 9, v: 6.5 };
/** Pump islands are long along the street; each pump serves both sides. */
export const PUMP_ISLANDS = [{ u: -3.8, v: -1.2 }, { u: 3.8, v: -1.2 }] as const;
export const ISLAND_HALF = { u: 1.7, v: .38 };
export const SHOP = { u: 3.2, v: 4.85, halfU: 5, halfV: 1.6 };
export const SHOP_DOOR = { u: 3.2, v: 3.0 };
export const CANOPY = { u: 0, v: -1.2, halfU: 7.6, halfV: 3.7, height: 4.7 };
/** Canopy columns stand on the pump islands, leaving both lanes clear. */
export const CANOPY_COLUMNS = [-5, -2.6, 2.6, 5].map(u => ({ u, v: -1.2 }));
const STATION_SITES: readonly { id: string; name: string; district: string; x: number; z: number }[] = [
  { id: 'southside', name: 'PetroCoast Southside', district: 'Downtown', x: -62, z: 94.7 },
  { id: 'westwood', name: 'PetroCoast Westwood', district: 'Westwood', x: -127.6, z: 64.8 },
  { id: 'exchange', name: 'PetroCoast Exchange', district: 'North Financial', x: -16.2, z: -141 },
  { id: 'harbor', name: 'PetroCoast Harbor', district: 'Port Nelson', x: -152.7, z: 161.9 },
  { id: 'southbay', name: 'PetroCoast South Bay', district: 'South Bay', x: 86.8, z: 201.2 },
];

function frame(site: typeof STATION_SITES[number]): FuelStation {
  const projection = nearestStreet(site)!, heading = projection.heading;
  // Street heading uses the city convention: forward = (sin h, -cos h).
  let along = { x: Math.sin(heading), z: -Math.cos(heading) };
  const toLot = { x: site.x - projection.point.x, z: site.z - projection.point.z };
  let out = { x: -along.z, z: along.x };
  if (out.x * toLot.x + out.z * toLot.z < 0) out = { x: -out.x, z: -out.z };
  // A Y rotation r maps local X to (cos r, -sin r) and local Z to (-along.z, along.x);
  // flip `along` when needed so that local Z is exactly `out`.
  if (-along.z * out.x + along.x * out.z < 0) along = { x: -along.x, z: -along.z };
  return { ...site, along, out, rotation: Math.atan2(-along.z, along.x) };
}
export const FUEL_STATIONS: readonly FuelStation[] = STATION_SITES.map(frame);

export const stationPoint = (station: FuelStation, u: number, v: number): Point => ({
  x: station.x + station.along.x * u + station.out.x * v, z: station.z + station.along.z * u + station.out.z * v,
});
export function stationLocal(station: FuelStation, point: Point) {
  const dx = point.x - station.x, dz = point.z - station.z;
  return { u: dx * station.along.x + dz * station.along.z, v: dx * station.out.x + dz * station.out.z };
}
export interface PumpSide { station: FuelStation; island: number; side: -1 | 1; point: Point; id: string }
/** Each island has a dual pump: side -1 faces the street lane, +1 the inner lane. */
export const PUMP_SIDES: readonly PumpSide[] = FUEL_STATIONS.flatMap(station => PUMP_ISLANDS.flatMap((island, index) => ([-1, 1] as const).map(side => ({
  station, island: index, side, id: `${station.id}-${index}-${side < 0 ? 'a' : 'b'}`,
  point: stationPoint(station, island.u, island.v + side * (ISLAND_HALF.v + .05)),
}))));

const inside = (local: { u: number; v: number }, u: number, v: number, halfU: number, halfV: number, pad: number) =>
  Math.abs(local.u - u) < halfU + pad && Math.abs(local.v - v) < halfV + pad;
/** Solid parts of every forecourt: shop, canopy columns and (for vehicles) pump islands. */
export function fuelStationCollision(point: Point, radius: number): boolean {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return false;
  for (const station of FUEL_STATIONS) {
    if (Math.abs(point.x - station.x) > 16 || Math.abs(point.z - station.z) > 16) continue;
    const local = stationLocal(station, point);
    if (inside(local, SHOP.u, SHOP.v, SHOP.halfU, SHOP.halfV, radius)) return true;
    for (const column of CANOPY_COLUMNS) if (inside(local, column.u, column.v, .2, .2, radius)) return true;
    if (radius > .8) for (const island of PUMP_ISLANDS) if (inside(local, island.u, island.v, ISLAND_HALF.u, ISLAND_HALF.v, radius * .62)) return true;
  }
  return false;
}

export function nearestStation(point: Point): { station: FuelStation; distance: number } | null {
  let best: { station: FuelStation; distance: number } | null = null;
  for (const station of FUEL_STATIONS) { const distance = Math.hypot(point.x - station.x, point.z - station.z); if (!best || distance < best.distance) best = { station, distance }; }
  return best;
}
export function nearestPump(point: Point, reach = 2.1): PumpSide | null {
  let best: PumpSide | null = null, bestDistance = reach;
  for (const pump of PUMP_SIDES) { const distance = Math.hypot(point.x - pump.point.x, point.z - pump.point.z); if (distance < bestDistance) { best = pump; bestDistance = distance; } }
  return best;
}
export function atShopCounter(point: Point): FuelStation | null {
  for (const station of FUEL_STATIONS) {
    const door = stationPoint(station, SHOP_DOOR.u, SHOP_DOOR.v);
    if (Math.hypot(point.x - door.x, point.z - door.z) < 2.2) return station;
  }
  return null;
}
/** The filler flap sits on the right-hand rear quarter of the player's car. */
export function fuelFlapPoint(car: Point & { heading: number }, kind: string): Point {
  const back = kind === 'sport' ? 1.55 : 1.6, right = 1.0;
  const forward = { x: Math.sin(car.heading), z: -Math.cos(car.heading) }, rightward = { x: Math.cos(car.heading), z: Math.sin(car.heading) };
  return { x: car.x - forward.x * back + rightward.x * right, z: car.z - forward.z * back + rightward.z * right };
}
export const HOSE_REACH = 3.6;

// ---- Refuelling session ------------------------------------------------------
export type FuelPart = 'grade95' | 'grade98' | 'gradeON' | 'nozzle' | 'fuelFlap';
export interface FuelSession {
  pump: string;
  grade: FuelGrade | null;
  nozzle: 'pump' | 'hand' | 'car';
  flapOpen: boolean;
  pouring: boolean;
  /** Litres dispensed in this sale and the price owed for them. */
  litres: number; owed: number;
}
export interface FuelTank { fuel: number; wrongFuel: number; premium: number }
export const createFuelSession = (pump: string): FuelSession => ({ pump, grade: null, nozzle: 'pump', flapOpen: false, pouring: false, litres: 0, owed: 0 });
export interface FuelResult { ok: boolean; message: string }
const ok = (message: string): FuelResult => ({ ok: true, message }), no = (message: string): FuelResult => ({ ok: false, message });
export function fuelAction(session: FuelSession, tank: FuelTank, part: FuelPart, flapInReach: boolean): FuelResult {
  switch (part) {
    case 'grade95': case 'grade98': case 'gradeON': {
      if (session.nozzle !== 'pump') return no('Odwieś pistolet, zanim zmienisz paliwo.');
      const grade = part.slice(5) as FuelGrade;
      session.grade = grade;
      return ok(`${FUEL_GRADES[grade].name} · $${FUEL_GRADES[grade].price.toFixed(2)}/L. Zdejmij pistolet z dystrybutora.${grade === 'ON' ? ' Uwaga: to olej napędowy!' : ''}`);
    }
    case 'nozzle':
      if (session.nozzle === 'car') return no('Najpierw wyjmij pistolet z wlewu (kliknij klapkę).');
      if (session.nozzle === 'hand') { session.nozzle = 'pump'; return ok(session.litres > 0 ? `Pistolet odwieszony. Do zapłaty $${owed(session)} przy kasie w sklepie.` : 'Pistolet odwieszony.'); }
      if (!session.grade) return no('Wybierz rodzaj paliwa przyciskiem na dystrybutorze.');
      session.nozzle = 'hand';
      return ok('Pistolet w ręku. Otwórz klapkę wlewu i włóż go do baku.');
    case 'fuelFlap':
      if (!flapInReach) return no('Wąż nie sięga. Zaparkuj tak, by klapka wlewu (prawy tył) była przy dystrybutorze.');
      if (session.nozzle === 'car') { session.pouring = false; session.nozzle = 'hand'; return ok(`Pistolet wyjęty. W baku ${tank.fuel.toFixed(1).replace('.', ',')} L. Odwieś go na dystrybutorze.`); }
      if (!session.flapOpen) { session.flapOpen = true; return ok('Klapka i korek wlewu odkręcone.'); }
      if (session.nozzle === 'hand') {
        if (tank.fuel >= FUEL_TANK - .05) return no('Bak jest pełny.');
        session.nozzle = 'car'; session.pouring = true;
        return ok('Tankowanie… Pistolet odbije sam przy pełnym baku. Kliknij klapkę, aby przerwać.');
      }
      session.flapOpen = false; return ok('Korek wlewu zakręcony, klapka zamknięta.');
  }
}
export const owed = (session: FuelSession) => Math.round(session.owed);
/** Pumps 0.75 L/s and clicks off when the tank is full. */
export function stepFuel(session: FuelSession, tank: FuelTank, dt: number): string | null {
  if (!session.pouring || !session.grade) return null;
  const step = Math.max(0, Math.min(dt, .25)), amount = Math.min(FUEL_TANK - tank.fuel, .75 * step);
  const before = tank.fuel;
  tank.fuel += amount; session.litres += amount; session.owed += amount * FUEL_GRADES[session.grade].price;
  if (session.grade === 'ON') tank.wrongFuel += amount;
  else if (tank.fuel > 0) tank.premium = (before * tank.premium + (session.grade === '98' ? amount : 0)) / tank.fuel;
  if (tank.fuel >= FUEL_TANK - .02) { session.pouring = false; return `Klik! Bak pełny: ${session.litres.toFixed(1).replace('.', ',')} L, $${owed(session)}. Wyjmij pistolet.`; }
  return null;
}
export function canLeavePump(session: FuelSession): string | null {
  if (session.nozzle === 'car') return 'Pistolet jest wciąż w baku!';
  if (session.nozzle === 'hand') return 'Odwieś pistolet na dystrybutorze.';
  if (session.flapOpen) return 'Zakręć korek i zamknij klapkę wlewu.';
  return null;
}
export const FUEL_STEPS = [
  'Otwórz klapkę wlewu (prawy tył auta)',
  'Wybierz paliwo na dystrybutorze: 95, 98 lub ON',
  'Zdejmij pistolet z dystrybutora',
  'Włóż pistolet do wlewu i tankuj',
  'Wyjmij i odwieś pistolet',
  'Zamknij klapkę i zapłać przy kasie w sklepie',
] as const;
export function fuelHint(session: FuelSession, tank: FuelTank): string {
  if (session.pouring) return `Tankowanie: ${tank.fuel.toFixed(1).replace('.', ',')} / ${FUEL_TANK} L · $${owed(session)}`;
  if (!session.flapOpen && session.nozzle === 'pump' && session.litres === 0) return FUEL_STEPS[0];
  if (!session.grade) return FUEL_STEPS[1];
  if (session.nozzle === 'pump' && session.litres === 0) return FUEL_STEPS[2];
  if (session.nozzle === 'hand' && session.litres === 0) return FUEL_STEPS[3];
  if (session.nozzle !== 'pump') return FUEL_STEPS[4];
  if (session.flapOpen) return 'Zamknij klapkę wlewu.';
  return session.litres > 0 ? `Zapłać $${owed(session)} przy kasie w sklepie (E przy drzwiach).` : 'Gotowe — E, aby odejść od dystrybutora.';
}
export function fuelPartPrompt(part: FuelPart, session: FuelSession): string {
  switch (part) {
    case 'grade95': return 'Wybierz Benzynę 95'; case 'grade98': return 'Wybierz Benzynę 98'; case 'gradeON': return 'Wybierz olej napędowy (ON)';
    case 'nozzle': return session.nozzle === 'hand' ? 'Odwieś pistolet' : 'Zdejmij pistolet';
    case 'fuelFlap': return session.nozzle === 'car' ? 'Wyjmij pistolet z wlewu' : !session.flapOpen ? 'Otwórz klapkę wlewu' : session.nozzle === 'hand' ? 'Włóż pistolet i tankuj' : 'Zamknij klapkę wlewu';
  }
}

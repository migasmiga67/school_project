/**
 * Phone apps: police scanner, street races, food delivery, rental property,
 * roadside mechanic, weather + radio and the black market. Pure rules, no DOM.
 */
import type { GameState, Point } from './model';
import { routeStreets } from './city-map';
import { getCityEnvironment } from './city-life';
import { FUEL_STATIONS } from './fuel-stations';
import { CASINO } from './casino-location';
import { GARAGE_LOCATION, GARAGE_MAX_LEVEL, UPGRADE_PRICES, GARAGE_UPGRADE_NAMES, type GarageState, type GarageUpgrade } from './garage';
import { ITEMS, type ItemId } from './inventory';
import { districtAt } from './world-layout';

export type PhoneAppId = 'scanner' | 'races' | 'food' | 'estate' | 'tow' | 'weather' | 'market';
export const PHONE_APPS: readonly { id: PhoneAppId; name: string; icon: string }[] = [
  { id: 'scanner', name: 'Skaner', icon: '📡' },
  { id: 'races', name: 'Wyścigi', icon: '🏁' },
  { id: 'food', name: 'Jedzenie', icon: '🍔' },
  { id: 'estate', name: 'Nieruchomości', icon: '🏠' },
  { id: 'tow', name: 'Mechanik', icon: '🛻' },
  { id: 'weather', name: 'Pogoda i radio', icon: '☂' },
  { id: 'market', name: 'Czarny rynek', icon: '🕶' },
];
/** One in-game day lasts twelve minutes; one in-game hour is thirty seconds. */
export const DAY_SECONDS = 720, HOUR_SECONDS = 30;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const finite = (n: number) => Number.isFinite(n);
/** Deterministic 0..1 value so every player sees the same offers and outcomes. */
export function hash01(...parts: (string | number)[]) {
  let h = 2166136261;
  for (const ch of parts.join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
export const pathLength = (path: readonly Point[]) => path.reduce((sum, p, i) => i ? sum + dist(path[i - 1], p) : 0, 0);

// ---------------------------------------------------------------- Police scanner
export interface ScannerUnit { id: string; kind: 'patrol' | 'pursuit' | 'helicopter' | 'roadblock'; point: Point; distance: number; district: string }
export function scannerUnits(state: GameState): ScannerUnit[] {
  const units: ScannerUnit[] = [], at = (point: Point) => ({ point: { x: point.x, z: point.z }, distance: Math.round(dist(point, state.player)), district: districtAt(point) });
  for (const car of state.police) units.push({ id: car.id, kind: 'patrol', ...at(car) });
  for (const car of state.pursuit?.patrols ?? []) units.push({ id: car.id, kind: 'pursuit', ...at(car) });
  for (const block of state.pursuit?.roadblocks ?? []) units.push({ id: block.id, kind: 'roadblock', ...at(block) });
  if (state.pursuit?.helicopter) units.push({ id: 'heli', kind: 'helicopter', ...at(state.pursuit.helicopter) });
  return units.sort((a, b) => a.distance - b.distance);
}
const CHATTER = [
  'Jednostka {n}, rutynowy patrol: {d}. Bez zgłoszeń.',
  'Dyspozytor: zgłoszenie hałasu w okolicy {d}. Jednostka {n} sprawdzi.',
  'Jednostka {n}: kontrola prędkości, {d}.',
  'Dyspozytor: kolizja drogowa, {d}. Drogówka w drodze.',
  'Jednostka {n} wraca na komendę przez {d}.',
  'Dyspozytor: podejrzany pojazd bez świateł, {d}. Obserwować.',
];
/** Background radio traffic, one line per 40 world seconds. */
export function scannerChatter(state: GameState, seconds: number): string {
  const slot = Math.floor(seconds / 40), units = scannerUnits(state).filter(unit => unit.kind === 'patrol');
  const unit = units.length ? units[Math.floor(hash01('unit', slot) * units.length)] : null;
  const line = CHATTER[Math.floor(hash01('line', slot) * CHATTER.length)];
  return line.replace('{n}', String(1 + Math.floor(hash01('n', slot) * 12))).replace('{d}', unit?.district ?? districtAt({ x: (hash01('x', slot) - .5) * 300, z: (hash01('z', slot) - .5) * 300 }));
}
/** What the dispatcher says when the chase state changes. */
export function scannerAlert(before: { wanted: number; status: string; heli: boolean; blocks: number }, state: GameState): string | null {
  const where = districtAt(state.player), status = state.pursuit?.status ?? 'clear';
  if (state.wanted > before.wanted) return `⚠ Dyspozytor: poszukiwany pojazd, ${where}. Poziom ${state.wanted}. Wszystkie jednostki!`;
  if (state.pursuit?.helicopter && !before.heli) return `⚠ Śmigłowiec Air-1 startuje nad ${where}.`;
  if ((state.pursuit?.roadblocks.length ?? 0) > before.blocks) return `⚠ Blokada drogi ustawiona w rejonie ${where}.`;
  if (status === 'search' && before.status === 'pursuit') return 'Dyspozytor: utracono kontakt wzrokowy. Przeszukać okolicę.';
  if (state.wanted === 0 && before.wanted > 0) return 'Dyspozytor: odwołać pościg. Wracać na patrole.';
  return null;
}

// ---------------------------------------------------------------- Street races
export interface RaceRival { name: string; speed: number }
export interface RaceDefinition { id: string; name: string; entry: number; checkpoints: Point[]; length: number; rivals: RaceRival[] }
const RACE_PLANS = [
  { id: 'ocean', name: 'Sprint Ocean Drive', entry: 150, via: [{ x: 20, z: 80 }, { x: 80, z: 160 }, { x: -120, z: 160 }, { x: -160, z: 40 }] },
  { id: 'westwood', name: 'Pętla Westwood', entry: 250, via: [GARAGE_LOCATION, { x: -160, z: 40 }, { x: -40, z: -160 }, { x: 20, z: 0 }] },
  { id: 'harbour', name: 'Nocny maraton portowy', entry: 400, via: [{ x: -120, z: 160 }, { x: -160, z: 40 }, { x: 60, z: -74 }, CASINO.door] },
];
const RIVALS = ['Kaja „Turbo” Wolska', 'Dex Moreno', 'Szymon Iskra', 'Lena Vox', 'Bruno „Pit” Sala', 'Mia Kowal'];
/** Checkpoints sit on the street graph every ~80 m between the plan's stops. */
function buildCheckpoints(via: readonly Point[]): Point[] {
  const line: Point[] = [];
  for (let i = 1; i < via.length; i++) {
    const leg = routeStreets(via[i - 1], via[i]);
    const inner = leg.length > 2 ? leg.slice(1, -1) : leg;
    for (const p of inner) if (!line.length || dist(line[line.length - 1], p) > 1) line.push(p);
  }
  if (line.length < 2) return [...via];
  const out: Point[] = [line[0]];let carried = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], length = dist(a, b);let t = 80 - carried;
    while (t < length) { out.push({ x: a.x + (b.x - a.x) * t / length, z: a.z + (b.z - a.z) * t / length }); t += 80; }
    carried = (carried + length) % 80;
  }
  const end = line[line.length - 1];if (dist(out[out.length - 1], end) > 25) out.push(end);else out[out.length - 1] = end;
  return out;
}
let raceCache: RaceDefinition[] | null = null;
export function raceDefinitions(): RaceDefinition[] {
  return raceCache ??= RACE_PLANS.map((plan, index) => {
    const checkpoints = buildCheckpoints(plan.via);
    return { id: plan.id, name: plan.name, entry: plan.entry, checkpoints, length: Math.round(pathLength(checkpoints)),
      rivals: [0, 1, 2].map(k => ({ name: RIVALS[(index * 2 + k) % RIVALS.length], speed: 15.5 + k * 1.6 + index * .5 })) };
  });
}
/** A race starts every eight in-game hours (four minutes). Sign-up closes at the start. */
export const RACE_PERIOD = 240, RACE_OFFSET = 75, RACE_GATHER = 35;
export function upcomingRace(seconds: number) {
  const index = Math.max(0, Math.ceil((seconds - RACE_OFFSET) / RACE_PERIOD));
  const races = raceDefinitions();
  return { index, startAt: index * RACE_PERIOD + RACE_OFFSET, race: races[index % races.length] };
}
export type RaceStatus = 'signed' | 'running' | 'finished';
export interface RaceEntry { index: number; status: RaceStatus; next: number; startedAt: number; time?: number; place?: number; payout?: number }
export function rivalTimes(race: RaceDefinition, index: number) {
  return race.rivals.map((rival, k) => ({ name: rival.name, time: race.length / rival.speed * (.94 + hash01('rival', index, k) * .12) }));
}
export function signUpForRace(entry: RaceEntry | null, wallet: number, seconds: number): { ok: true; entry: RaceEntry; cost: number; message: string } | { ok: false; message: string } {
  if (entry && entry.status !== 'finished') return { ok: false, message: 'Jesteś już zapisany na wyścig.' };
  const next = upcomingRace(seconds);
  if (next.startAt - seconds < 4) return { ok: false, message: 'Zapisy na ten wyścig są zamknięte. Poczekaj na kolejny.' };
  if (wallet < next.race.entry) return { ok: false, message: `Wpisowe wynosi $${next.race.entry}.` };
  return { ok: true, cost: next.race.entry, entry: { index: next.index, status: 'signed', next: 0, startedAt: next.startAt }, message: `Zapisano: ${next.race.name}. Wpisowe $${next.race.entry}. Stawka startuje o czasie z aplikacji.` };
}
export type RaceEvent = { kind: 'start' | 'checkpoint' | 'missed' | 'finish' | 'dnf'; text: string; payout?: number };
/** Advances an entry. `driving` must be true at the start line and for checkpoints. */
export function stepRace(entry: RaceEntry, player: Point, driving: boolean, seconds: number): RaceEvent | null {
  const race = raceDefinitions()[entry.index % raceDefinitions().length];
  if (entry.status === 'signed') {
    if (seconds < entry.startedAt) return null;
    if (!driving || dist(player, race.checkpoints[0]) > 30) { entry.status = 'finished'; entry.place = 0; return { kind: 'missed', text: `${race.name} wystartował bez ciebie — wpisowe przepadło.` }; }
    entry.status = 'running'; entry.next = 1; entry.startedAt = seconds;
    return { kind: 'start', text: `START! ${race.name}: ${race.checkpoints.length - 1} punktów kontrolnych. Jedź za złotym znacznikiem!` };
  }
  if (entry.status !== 'running') return null;
  const elapsed = seconds - entry.startedAt, rivals = rivalTimes(race, entry.index), slowest = Math.max(...rivals.map(r => r.time));
  if (elapsed > slowest * 1.6) { entry.status = 'finished'; entry.place = 0; return { kind: 'dnf', text: 'Rywale dawno na mecie. Wyścig zakończony bez klasyfikacji.' }; }
  if (!driving || dist(player, race.checkpoints[entry.next]) > 13) return null;
  entry.next++;
  if (entry.next < race.checkpoints.length) return { kind: 'checkpoint', text: `Punkt ${entry.next - 1}/${race.checkpoints.length - 1} · ${elapsed.toFixed(1)} s` };
  entry.status = 'finished'; entry.time = elapsed;
  entry.place = 1 + rivals.filter(r => r.time < elapsed).length;
  entry.payout = entry.place === 1 ? race.entry * (race.rivals.length + 1) : 0;
  return { kind: 'finish', payout: entry.payout, text: entry.place === 1 ? `ZWYCIĘSTWO! ${elapsed.toFixed(1)} s — zgarniasz pulę $${entry.payout}.` : `Meta: miejsce ${entry.place} (${elapsed.toFixed(1)} s). Pulę zgarnia ${[...rivals].sort((a, b) => a.time - b.time)[0].name}.` };
}
export function raceTarget(entry: RaceEntry | null): Point | null {
  if (!entry || entry.status === 'finished') return null;
  const race = raceDefinitions()[entry.index % raceDefinitions().length];
  return race.checkpoints[entry.status === 'signed' ? 0 : entry.next] ?? null;
}

// ---------------------------------------------------------------- Couriers (food scooter, tow truck)
export interface Courier { path: Point[]; segment: number; position: Point; heading: number; speed: number; arrived: boolean }
/** The nearest kitchen or depot at least `min` metres away, then a street route to the target. */
export function dispatchCourier(depots: readonly Point[], target: Point, speed: number, min = 60): Courier {
  const sorted = [...depots].sort((a, b) => dist(a, target) - dist(b, target));
  const origin = sorted.find(p => dist(p, target) >= min) ?? sorted[sorted.length - 1] ?? { x: target.x + min, z: target.z };
  const route = routeStreets(origin, target);
  const path = route.length > 1 ? route.map(p => ({ ...p })) : [{ ...origin }, { ...target }];
  return { path, segment: 1, position: { ...path[0] }, heading: 0, speed, arrived: false };
}
/** Moves along the street path; the final point follows a moving target. */
export function stepCourier(courier: Courier, target: Point, dt: number, reach = 3): boolean {
  if (courier.arrived || !(dt > 0)) return courier.arrived;
  const last = courier.path.length - 1;
  courier.path[last] = { x: target.x, z: target.z };
  let move = courier.speed * dt;
  while (move > 0) {
    const goal = courier.path[courier.segment], d = dist(courier.position, goal);
    if (d > .01) courier.heading = Math.atan2(goal.x - courier.position.x, goal.z - courier.position.z);
    if (d <= move) {
      courier.position = { ...goal }; move -= d;
      if (courier.segment >= last) break;
      courier.segment++;
    } else {
      courier.position = { x: courier.position.x + (goal.x - courier.position.x) * move / d, z: courier.position.z + (goal.z - courier.position.z) * move / d }; move = 0;
    }
  }
  if (dist(courier.position, target) <= reach) courier.arrived = true;
  return courier.arrived;
}

// ---------------------------------------------------------------- Food delivery
export const FOOD_MENU: readonly { item: ItemId; price: number }[] = [
  { item: 'burger', price: 15 }, { item: 'energy', price: 9 }, { item: 'coffee', price: 5 }, { item: 'hotdog', price: 7 }, { item: 'water', price: 3 },
];
export const FOOD_DELIVERY_FEE = 8;
export const foodPrice = (item: ItemId) => (FOOD_MENU.find(entry => entry.item === item)?.price ?? ITEMS[item].price) + FOOD_DELIVERY_FEE;
export const KITCHENS: readonly Point[] = [...FUEL_STATIONS.map(s => ({ x: s.x, z: s.z })), { x: CASINO.door.x, z: CASINO.door.z + 4 }];

// ---------------------------------------------------------------- Roadside mechanic
export const TOW_PRICE = 150;
export const DEPOTS: readonly Point[] = [GARAGE_LOCATION, ...FUEL_STATIONS.map(s => ({ x: s.x, z: s.z }))];
export function towNeeded(car: { health: number } | null, fuel: number, wear: number): string | null {
  if (!car) return 'Laweta przyjeżdża tylko do twojego auta (Stratus). Wybierz je w garażu.';
  if (fuel >= 6 && car.health >= 60 && wear < .5) return 'Twoje auto jest sprawne i ma paliwo — mechanik nie jest potrzebny.';
  return null;
}
export const TOW_FUEL = 15, TOW_HEALTH = 80;

// ---------------------------------------------------------------- Rental property
export interface Property { id: string; name: string; kind: string; point: Point; price: number; rentPerDay: number }
export const PROPERTIES: readonly Property[] = [
  { id: 'garage-port', name: 'Garaż w Port Nelson', kind: 'Garaż', point: { x: -110, z: 150 }, price: 1200, rentPerDay: 75 },
  { id: 'studio-west', name: 'Kawalerka Westwood', kind: 'Mieszkanie', point: { x: -150, z: 40 }, price: 2400, rentPerDay: 160 },
  { id: 'flat-south', name: 'Mieszkanie South Bay', kind: 'Mieszkanie', point: { x: 75, z: 150 }, price: 4800, rentPerDay: 330 },
  { id: 'office-north', name: 'Biuro North Financial', kind: 'Lokal użytkowy', point: { x: -40, z: -150 }, price: 9000, rentPerDay: 650 },
  { id: 'penthouse', name: 'Penthouse Ocean Drive', kind: 'Apartament', point: { x: 60, z: -60 }, price: 16000, rentPerDay: 1200 },
];
export interface EstateState { owned: string[]; pending: number }
export const createEstate = (): EstateState => ({ owned: [], pending: 0 });
export const estateIncomePerDay = (estate: EstateState) => PROPERTIES.filter(p => estate.owned.includes(p.id)).reduce((sum, p) => sum + p.rentPerDay, 0);
/** Rent accrues with game time and waits (up to three days) until collected. */
export function accrueRent(estate: EstateState, worldDt: number) {
  if (!(worldDt > 0) || !finite(worldDt)) return;
  const perDay = estateIncomePerDay(estate);
  estate.pending = Math.min(perDay * 3, estate.pending + perDay * Math.min(worldDt, 60) / DAY_SECONDS);
}
export function buyProperty(estate: EstateState, wallet: number, id: string): { ok: true; cost: number; message: string } | { ok: false; message: string } {
  const property = PROPERTIES.find(p => p.id === id);
  if (!property) return { ok: false, message: 'Nie ma takiej oferty.' };
  if (estate.owned.includes(id)) return { ok: false, message: 'Ta nieruchomość już jest twoja.' };
  if (wallet < property.price) return { ok: false, message: `${property.name} kosztuje $${property.price.toLocaleString('pl-PL')}.` };
  estate.owned.push(id);
  return { ok: true, cost: property.price, message: `Akt notarialny podpisany: ${property.name}. Czynsz $${property.rentPerDay} na dobę.` };
}
export const SELL_RATE = .7;
export function sellProperty(estate: EstateState, id: string): { ok: true; refund: number; message: string } | { ok: false; message: string } {
  const property = PROPERTIES.find(p => p.id === id);
  if (!property || !estate.owned.includes(id)) return { ok: false, message: 'Nie masz tej nieruchomości.' };
  estate.owned = estate.owned.filter(item => item !== id);
  const refund = Math.round(property.price * SELL_RATE);
  return { ok: true, refund, message: `Sprzedano ${property.name} za $${refund.toLocaleString('pl-PL')}.` };
}
export function collectRent(estate: EstateState): number { const amount = Math.floor(estate.pending + 1e-6); estate.pending -= amount; return amount; }
export function parseEstate(value: unknown): EstateState {
  const raw = value as Partial<EstateState> | null;
  const owned = Array.isArray(raw?.owned) ? raw!.owned.filter((id): id is string => PROPERTIES.some(p => p.id === id)) : [];
  const pending = typeof raw?.pending === 'number' && finite(raw.pending) && raw.pending >= 0 ? Math.min(raw.pending, 1e6) : 0;
  return { owned: [...new Set(owned)], pending };
}

// ---------------------------------------------------------------- Weather
export interface ForecastHour { clock: string; rain: boolean; temp: number; period: string }
export function forecast(seconds: number, hours = 8): ForecastHour[] {
  return Array.from({ length: hours }, (_, k) => {
    const env = getCityEnvironment(seconds + k * HOUR_SECONDS);
    return { clock: k ? `${String(Math.floor(env.hour)).padStart(2, '0')}:00` : 'Teraz', rain: env.rain > .01, temp: Math.round(13 + env.daylight * 11 - env.rain * 4), period: env.period };
  });
}
/** Seconds until the weather next changes, with what it changes to. */
export function nextWeatherChange(seconds: number): { inSeconds: number; rain: boolean } {
  const now = getCityEnvironment(seconds).rain > .01;
  for (let t = 5; t <= 400; t += 5) if ((getCityEnvironment(seconds + t).rain > .01) !== now) return { inSeconds: t, rain: !now };
  return { inSeconds: 400, rain: now };
}

// ---------------------------------------------------------------- Black market
export const MARKET_WINDOW = 120;
export interface MarketOffer { id: string; title: string; detail: string; price: number; normal: number; risk: number; upgrade?: GarageUpgrade; item?: ItemId; count?: number }
export interface MarketState { window: number; bought: string[] }
export const marketWindow = (seconds: number) => Math.floor(Math.max(0, seconds) / MARKET_WINDOW);
/** Three offers per window: cheap tuning for the selected car and cheap "fallen off a truck" gear. */
export function marketOffers(window: number, garage: GarageState): MarketOffer[] {
  const car = garage.cars[garage.selected], offers: MarketOffer[] = [];
  const upgrades = (['engine', 'brakes', 'nitro'] as GarageUpgrade[]).filter(u => car && car[u] < GARAGE_MAX_LEVEL);
  if (upgrades.length) {
    const upgrade = upgrades[Math.floor(hash01('up', window) * upgrades.length)], level = car![upgrade], normal = UPGRADE_PRICES[upgrade][level];
    const discount = .55 + hash01('disc', window) * .15;
    offers.push({ id: `w${window}-${upgrade}`, upgrade, title: `${GARAGE_UPGRADE_NAMES[upgrade]} · poziom ${level + 1}`, detail: 'Części bez faktury. Montaż w ciemnym zaułku od ręki.', price: Math.round(normal * discount), normal, risk: .35 });
  }
  const gear: ItemId[] = ['repair', 'canister', 'medkit', 'flashlight', 'oil'];
  for (let k = 0; k < 2; k++) {
    const item = gear[Math.floor(hash01('item', window, k) * gear.length)], count = item === 'flashlight' ? 1 : 2, normal = ITEMS[item].price * count;
    if (offers.some(o => o.item === item)) continue;
    offers.push({ id: `w${window}-${item}`, item, count, title: `${ITEMS[item].name} ×${count}`, detail: 'Spadło z ciężarówki. Nie pytaj skąd.', price: Math.max(1, Math.round(normal * (.45 + hash01('ip', window, k) * .15))), normal, risk: .15 });
  }
  return offers;
}
/** Whether the police noticed this deal: same answer for the same deal. */
export const marketBusted = (offer: MarketOffer) => hash01('busted', offer.id) < offer.risk;
export function parseMarket(value: unknown): MarketState {
  const raw = value as Partial<MarketState> | null;
  return { window: Number.isSafeInteger(raw?.window) ? raw!.window! : -1, bought: Array.isArray(raw?.bought) ? raw!.bought.filter((id): id is string => typeof id === 'string').slice(0, 10) : [] };
}

// ---------------------------------------------------------------- Radio
export const RADIO_STATIONS = [
  { id: 'neon', name: 'Neon FM 101.4', genre: 'Synthwave nocą' },
  { id: 'chill', name: 'Coast Chill 94.2', genre: 'Lo-fi i spokój' },
  { id: 'street', name: 'Bass Street 88.8', genre: 'Hip-hop i trap' },
] as const;
export type RadioStationId = typeof RADIO_STATIONS[number]['id'];

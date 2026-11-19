import type { EngineBayPose, EnginePartId } from './vehicle-model';

/** Long-lived condition of one car's engine. Saved with the solo profile. */
export interface EngineCare {
  /** Litres of oil in the engine. */
  oil: number;
  /** Oil quality, 1 = fresh. */
  life: number;
  /** Filter condition, 1 = new. */
  filter: number;
  /** Mechanical damage, 1 = seized (limp mode). */
  wear: number;
  km: number;
}
/** Live state of the running engine. */
export interface EngineRun { running: boolean; rpm: number; gear: number; temp: number }
export const OIL_CAPACITY = 4.5;
export const OIL_PRICE_PER_LITRE = 9;
export const FILTER_PRICE = 18;
export const ENGINE_REBUILD_PRICE = 350;
export const IDLE_RPM = 820;
export const REDLINE_RPM = 6900;
const GEAR_RATIOS = [3.55, 2.15, 1.48, 1.14, .92, .76];
const FINAL_DRIVE = 3.6;
const TYRE_RADIUS = .37;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export const createEngineCare = (): EngineCare => ({ oil: 3.7, life: .3, filter: .3, wear: 0, km: 48210 });
export const createEngineRun = (): EngineRun => ({ running: true, rpm: IDLE_RPM, gear: 0, temp: 86 });
export function parseEngineCare(value: unknown): EngineCare {
  const base = createEngineCare();
  if (!value || typeof value !== 'object') return base;
  const v = value as Record<string, unknown>;
  return { oil: clamp(finite(v.oil, base.oil), 0, 6), life: clamp(finite(v.life, base.life), 0, 1), filter: clamp(finite(v.filter, base.filter), 0, 1), wear: clamp(finite(v.wear, 0), 0, 1), km: clamp(finite(v.km, base.km), 0, 1e7) };
}

/** Multiplier for acceleration and top speed. Neglect costs power but never strands the player. */
export function enginePower(care: EngineCare): number {
  let power = 1 - care.wear * .55;
  if (care.life < .2) power -= (.2 - care.life) * .9;
  if (care.oil < 2.6) power -= (2.6 - care.oil) * .12;
  return clamp(power, .35, 1);
}
export type EngineWarning = 'no-oil' | 'low-oil' | 'old-oil' | 'overfilled' | 'hot' | 'damaged';
export function engineWarnings(care: EngineCare, run?: EngineRun): EngineWarning[] {
  const list: EngineWarning[] = [];
  if (care.oil < 1.4) list.push('no-oil'); else if (care.oil < 3) list.push('low-oil');
  if (care.oil > 5.1) list.push('overfilled');
  if (care.life < .25) list.push('old-oil');
  if (run && run.temp > 108) list.push('hot');
  if (care.wear > .35) list.push('damaged');
  return list;
}
export const WARNING_TEXT: Record<EngineWarning, string> = {
  'no-oil': 'BRAK OLEJU — zatrzymaj silnik!', 'low-oil': 'Niski poziom oleju', 'old-oil': 'Olej zużyty — wymień w MOD SHOP',
  overfilled: 'Za dużo oleju', hot: 'Silnik się przegrzewa', damaged: 'Silnik uszkodzony',
};

export interface EngineInput { speed: number; throttle: boolean; driving: boolean; dt: number }
/** Automatic six-speed gearbox, oil ageing and lubrication damage. Mutates both records. */
export function stepEngine(care: EngineCare, run: EngineRun, input: EngineInput): void {
  const dt = clamp(finite(input.dt, 0), 0, .25), speed = Math.abs(finite(input.speed, 0));
  if (!run.running) { run.rpm = Math.max(0, run.rpm - dt * 3000); run.temp += (24 - run.temp) * (1 - Math.exp(-dt / 400)); return; }
  const wheelRpm = speed / (2 * Math.PI * TYRE_RADIUS) * 60;
  if (input.driving && speed > .4) {
    if (run.gear < 1) run.gear = 1;
    const upshift = input.throttle ? 6100 : 2600, downshift = input.throttle ? 2400 : 1300;
    let rpm = wheelRpm * GEAR_RATIOS[run.gear - 1] * FINAL_DRIVE;
    if (rpm > upshift && run.gear < GEAR_RATIOS.length) { run.gear++; rpm = wheelRpm * GEAR_RATIOS[run.gear - 1] * FINAL_DRIVE; }
    else if (rpm < downshift && run.gear > 1) { run.gear--; rpm = wheelRpm * GEAR_RATIOS[run.gear - 1] * FINAL_DRIVE; }
    const target = clamp(rpm + (input.throttle ? 350 : 0), IDLE_RPM, REDLINE_RPM);
    run.rpm += (target - run.rpm) * (1 - Math.exp(-dt * 12));
  } else {
    run.gear = 0;
    const target = input.throttle && input.driving ? 2800 : IDLE_RPM;
    run.rpm += (target - run.rpm) * (1 - Math.exp(-dt * 6));
  }
  const km = input.driving ? speed * dt / 1000 : 0;
  care.km += km;
  // Oil ages with distance and high revs; a clogged filter accelerates it.
  const strain = 1 + Math.max(0, run.rpm - 5000) / 2500;
  care.life = clamp(care.life - km / 9 * strain * (care.filter < .25 ? 1.5 : 1), 0, 1);
  care.filter = clamp(care.filter - km / 14, 0, 1);
  care.oil = Math.max(0, care.oil - km * .018);
  const starving = care.oil < 1.4, poor = care.life < .1;
  const heat = 88 + (starving ? 40 : 0) + (poor ? 12 : 0) + Math.max(0, run.rpm - 4500) / 400 + (care.oil > 5.4 ? 6 : 0);
  run.temp += (heat - run.temp) * (1 - Math.exp(-dt / 6));
  if (starving) care.wear = clamp(care.wear + dt * (.012 + run.rpm / 300000), 0, 1);
  else if (poor) care.wear = clamp(care.wear + km * .02, 0, 1);
}
export function gearLabel(run: EngineRun, speed: number): string {
  if (!run.running) return 'OFF';
  if (speed < -.5) return 'R';
  return run.gear ? String(run.gear) : 'N';
}

// ---- Oil change in the workshop -------------------------------------------

export type ServiceStep = 'hood' | 'dipstick' | 'cap' | 'drain' | 'filter' | 'plug' | 'fill' | 'closeCap' | 'check' | 'closeHood';
export const SERVICE_STEPS: readonly { id: ServiceStep; text: string }[] = [
  { id: 'hood', text: 'Otwórz maskę' },
  { id: 'dipstick', text: 'Wyciągnij bagnet i sprawdź olej' },
  { id: 'cap', text: 'Odkręć korek wlewu oleju' },
  { id: 'drain', text: 'Kucnij (X) i odkręć korek spustowy — spuść olej' },
  { id: 'filter', text: 'Wykręć stary filtr i załóż nowy' },
  { id: 'plug', text: 'Wkręć korek spustowy' },
  { id: 'fill', text: `Wlej świeży olej do ${OIL_CAPACITY.toLocaleString('pl-PL')} L` },
  { id: 'closeCap', text: 'Zakręć korek wlewu' },
  { id: 'check', text: 'Sprawdź poziom bagnetem' },
  { id: 'closeHood', text: 'Zamknij maskę' },
];
export interface OilService {
  hood: boolean; dipstick: boolean; cap: boolean; plugOut: boolean;
  filter: 'old' | 'none' | 'new'; pouring: boolean;
  /** Litres collected in the drain pan. */
  pan: number; poured: number; bottle: number;
  done: ServiceStep[];
  /** Quality of the oil currently in the sump at the start of the service. */
  startLife: number;
}
export const createOilService = (): OilService => ({ hood: false, dipstick: false, cap: false, plugOut: false, filter: 'old', pouring: false, pan: 0, poured: 0, bottle: 5, done: [], startLife: 1 });
export interface ServiceResult { ok: boolean; message: string; cost: number }
const litres = (value: number) => `${value.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`;
function mark(service: OilService, step: ServiceStep) { if (!service.done.includes(step)) service.done.push(step); }
export function dipstickReading(care: EngineCare): string {
  const level = care.oil / OIL_CAPACITY, colour = care.life > .75 ? 'bursztynowy, czysty' : care.life > .4 ? 'ciemny' : 'czarny i gęsty';
  const verdict = care.oil < 1 ? 'bagnet suchy!' : level < .7 ? 'poniżej MIN' : level > 1.12 ? 'powyżej MAX' : level < .88 ? 'między MIN a MAX' : 'na poziomie MAX';
  return `Bagnet: ${verdict} (${litres(care.oil)} / ${litres(OIL_CAPACITY)}), olej ${colour}.`;
}

/** One mechanic action on a part. Pure apart from mutating `care` and `service`. */
export function serviceAction(care: EngineCare, service: OilService, part: EnginePartId, wallet: number, engineRunning: boolean): ServiceResult {
  const ok = (message: string, cost = 0): ServiceResult => ({ ok: true, message, cost });
  const no = (message: string): ServiceResult => ({ ok: false, message, cost: 0 });
  if (part !== 'hood' && part !== 'drainPlug' && part !== 'bottle' && !service.hood) return no('Najpierw otwórz maskę.');
  switch (part) {
    case 'hood':
      if (!service.hood) { service.hood = true; mark(service, 'hood'); return ok('Maska otwarta. Podpórka zabezpieczona.'); }
      if (service.dipstick) return no('Włóż bagnet na miejsce, zanim zamkniesz maskę.');
      if (service.cap) return no('Zakręć korek wlewu oleju, zanim zamkniesz maskę.');
      if (service.pouring) return no('Najpierw odstaw kanister.');
      service.hood = false;
      if (service.done.includes('fill')) mark(service, 'closeHood');
      return ok('Maska zamknięta.');
    case 'dipstick':
      service.dipstick = !service.dipstick;
      if (!service.dipstick) return ok('Bagnet wsunięty do rurki.');
      if (service.done.includes('fill') && !service.cap) mark(service, 'check'); else mark(service, 'dipstick');
      return ok(dipstickReading(care));
    case 'cap':
      if (service.pouring) return no('Nie zakręcisz korka podczas wlewania oleju.');
      service.cap = !service.cap;
      if (service.cap) { mark(service, 'cap'); return ok('Korek wlewu odkręcony — olej spłynie szybciej.'); }
      if (service.done.includes('fill')) mark(service, 'closeCap');
      return ok('Korek wlewu zakręcony.');
    case 'drainPlug':
      if (!service.plugOut) {
        service.plugOut = true;
        return ok(engineRunning ? 'Uwaga: silnik pracuje! Gorący olej leje się do miski — wyłącz silnik (Q).' : 'Korek spustowy odkręcony. Stary olej spływa do miski.');
      }
      service.plugOut = false;
      if (service.done.includes('drain')) mark(service, 'plug');
      return ok('Korek spustowy wkręcony z nową podkładką.');
    case 'filter':
      if (service.filter === 'old') { service.filter = 'none'; const spill = Math.min(care.oil, .15); care.oil -= spill; service.pan += spill; return ok('Stary filtr wykręcony. Kliknij ponownie, by założyć nowy filtr.'); }
      if (service.filter === 'none') {
        if (wallet < FILTER_PRICE) return no(`Nowy filtr kosztuje $${FILTER_PRICE}.`);
        service.filter = 'new'; care.filter = 1; mark(service, 'filter');
        return ok(`Nowy filtr oleju dokręcony ręcznie (−$${FILTER_PRICE}).`, FILTER_PRICE);
      }
      return no('Nowy filtr jest już założony.');
    case 'bottle':
      if (service.pouring) { service.pouring = false; return ok(`Kanister odstawiony. W silniku: ${litres(care.oil)}.`); }
      if (!service.hood || !service.cap) return no('Otwórz maskę i odkręć korek wlewu, aby wlać olej.');
      if (service.bottle <= .01) return no('Kanister jest pusty.');
      if (wallet < OIL_PRICE_PER_LITRE) return no(`Olej kosztuje $${OIL_PRICE_PER_LITRE} za litr.`);
      service.pouring = true;
      return ok(service.plugOut ? 'Korek spustowy jest odkręcony — olej wyleci od spodu!' : 'Wlewasz olej. Kliknij ponownie, aby przestać.');
  }
}

export interface ServiceTick { messages: string[]; cost: number }
/** Continuous flows: draining through the sump plug and pouring from the jug. */
export function stepService(care: EngineCare, service: OilService, dt: number, wallet: number): ServiceTick {
  const tick: ServiceTick = { messages: [], cost: 0 };
  const step = clamp(finite(dt, 0), 0, .25);
  if (service.pouring) {
    const before = Math.floor(service.poured);
    const amount = Math.min(service.bottle, .45 * step);
    service.bottle -= amount; service.poured += amount;
    const fresh = care.oil;
    care.oil += amount;
    // Fresh oil mixes with what is left in the sump.
    care.life = care.oil > 0 ? (fresh * care.life + amount) / care.oil : 1;
    if (Math.floor(service.poured) > before) {
      if (wallet < OIL_PRICE_PER_LITRE) { service.pouring = false; tick.messages.push('Brak pieniędzy na kolejny litr oleju.'); }
      else tick.cost += OIL_PRICE_PER_LITRE;
    }
    if (service.bottle <= .001) { service.pouring = false; tick.messages.push('Kanister pusty.'); }
    if (!service.plugOut && care.oil >= OIL_CAPACITY - .05 && care.oil - amount < OIL_CAPACITY - .05) tick.messages.push('Poziom MAX — wystarczy. Zakręć korek i sprawdź bagnetem.');
    if (care.oil > 5.1 && care.oil - amount <= 5.1) tick.messages.push('Za dużo oleju! Odkręć na chwilę korek spustowy, aby spuścić nadmiar.');
    if (!service.plugOut && care.oil >= OIL_CAPACITY - .05 && service.done.includes('plug')) mark(service, 'fill');
  }
  if (service.plugOut && care.oil > 0) {
    const rate = service.cap ? .7 : .3;
    const amount = Math.min(care.oil, rate * step);
    care.oil -= amount; service.pan += amount;
    if (care.oil <= .05) { care.oil = 0; if (!service.done.includes('drain')) { mark(service, 'drain'); tick.messages.push('Olej spuszczony. Wymień filtr i wkręć korek spustowy.'); } }
  }
  // Fill is only meaningful after the old oil left the sump.
  if (service.done.includes('fill') && !service.done.includes('drain')) service.done.splice(service.done.indexOf('fill'), 1);
  return tick;
}

/** Suggestion shown next to the checklist. */
export function serviceHint(care: EngineCare, service: OilService): string {
  if (service.plugOut && care.oil > .05) return 'Olej spływa do miski…';
  if (service.pouring) return `Wlewanie: ${litres(care.oil)} / ${litres(OIL_CAPACITY)}`;
  const next = SERVICE_STEPS.find(step => !service.done.includes(step.id));
  return next ? next.text : 'Gotowe! Naciśnij O, aby zakończyć serwis.';
}
export function canFinishService(service: OilService): string | null {
  if (service.plugOut) return 'Korek spustowy jest odkręcony — olej wyleje się na podłogę.';
  if (service.filter === 'none') return 'Brakuje filtra oleju. Załóż nowy filtr.';
  if (service.pouring) return 'Najpierw odstaw kanister.';
  return null;
}
export function partPrompt(part: EnginePartId, service: OilService): string {
  switch (part) {
    case 'hood': return service.hood ? 'Zamknij maskę' : 'Otwórz maskę';
    case 'dipstick': return service.dipstick ? 'Włóż bagnet' : 'Wyciągnij bagnet';
    case 'cap': return service.cap ? 'Zakręć korek wlewu' : 'Odkręć korek wlewu oleju';
    case 'drainPlug': return service.plugOut ? 'Wkręć korek spustowy' : 'Odkręć korek spustowy';
    case 'filter': return service.filter === 'old' ? 'Wykręć stary filtr' : service.filter === 'none' ? `Załóż nowy filtr ($${FILTER_PRICE})` : 'Nowy filtr (założony)';
    case 'bottle': return service.pouring ? 'Przestań wlewać' : `Wlej olej ($${OIL_PRICE_PER_LITRE}/L)`;
  }
}
const OLD_OIL = 0x1c1206, FRESH_OIL = 0xc58f1d;
export function oilColour(life: number): number {
  const t = clamp(life, 0, 1), a = [OLD_OIL >> 16, OLD_OIL >> 8 & 255, OLD_OIL & 255], b = [FRESH_OIL >> 16, FRESH_OIL >> 8 & 255, FRESH_OIL & 255];
  const c = a.map((value, index) => Math.round(value + (b[index] - value) * t * t));
  return c[0] << 16 | c[1] << 8 | c[2];
}
export function engineBayPose(care: EngineCare, run: EngineRun, service: OilService | null, highlight: EnginePartId | null): EngineBayPose {
  return {
    hood: service?.hood ? 1 : 0, dipstick: service?.dipstick ? 1 : 0, cap: service?.cap ? 1 : 0, plug: service?.plugOut ? 1 : 0,
    filter: service?.filter ?? 'old', draining: service?.plugOut && care.oil > .02 ? Math.min(1, care.oil / 2 + .3) : 0,
    pouring: Boolean(service?.pouring), pan: service ? clamp(service.pan / 5, 0, 1) : 0,
    oilColor: oilColour(care.life), oilLevel: care.oil / OIL_CAPACITY,
    running: run.running, rpm: run.rpm, service: Boolean(service), highlight,
  };
}

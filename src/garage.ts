import type { GameState, Point, VehicleKind } from './model';

export type GarageCarId = 'stratus' | 'sentinel' | 'comet';
export type GarageUpgrade = 'engine' | 'brakes' | 'nitro';
export interface GarageCarSettings { paint: number; engine: number; brakes: number; nitro: number }
export interface GarageState {
  owned: GarageCarId[];
  selected: GarageCarId;
  cars: Partial<Record<GarageCarId, GarageCarSettings>>;
}
export type GarageAction =
  | { type: 'buy' | 'select'; car: GarageCarId }
  | { type: 'paint'; color: number }
  | { type: 'upgrade'; upgrade: GarageUpgrade };
export type GarageResult = { ok: true; garage: GarageState; wallet: number; message: string } | { ok: false; reason: string };
export interface GarageCarDefinition { id: GarageCarId; name: string; kind: VehicleKind; price: number; paint: number; description: string }

export const GARAGE_LOCATION: Readonly<Point> = { x: -20, z: 74 };
export const GARAGE_CARS: Record<GarageCarId, GarageCarDefinition> = {
  stratus: { id: 'stratus', name: 'Stratus XS', kind: 'sport', price: 0, paint: 0xded8cb, description: 'Twój pierwszy sportowy samochód. Lekki i zwinny.' },
  sentinel: { id: 'sentinel', name: 'Sentinel GT', kind: 'sedan', price: 900, paint: 0x387e9a, description: 'Miejski sedan z większym nadwoziem.' },
  comet: { id: 'comet', name: 'Comet RS', kind: 'sport', price: 2000, paint: 0xe88a67, description: 'Sportowe auto. W cenie silnik i nitro na poziomie 1.' },
};
export const GARAGE_PAINTS = [
  { color: 0xded8cb, name: 'Perłowy' }, { color: 0x387e9a, name: 'Oceaniczny' },
  { color: 0xe88a67, name: 'Koralowy' }, { color: 0x8d7cba, name: 'Ametystowy' },
  { color: 0x63a9a2, name: 'Miętowy' }, { color: 0x263341, name: 'Grafitowy' },
] as const;
export const GARAGE_PAINT_PRICE = 80;
export const UPGRADE_PRICES: Record<GarageUpgrade, readonly number[]> = {
  engine: [350, 600], brakes: [250, 450], nitro: [300, 500],
};
export const GARAGE_UPGRADE_NAMES: Record<GarageUpgrade, string> = { engine: 'Silnik', brakes: 'Hamulce', nitro: 'Nitro' };
const carIds: GarageCarId[] = ['stratus', 'sentinel', 'comet'];
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const isCar = (value: unknown): value is GarageCarId => typeof value === 'string' && carIds.includes(value as GarageCarId);
const isUpgrade = (value: unknown): value is GarageUpgrade => value === 'engine' || value === 'brakes' || value === 'nitro';
const level = (value: unknown) => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 2 ? Number(value) : 0;
const defaults = (id: GarageCarId): GarageCarSettings => ({ paint: GARAGE_CARS[id].paint, engine: id === 'comet' ? 1 : 0, brakes: 0, nitro: id === 'comet' ? 1 : 0 });
const paint = (value: unknown, fallback: number) => GARAGE_PAINTS.some(item => item.color === value) ? Number(value) : fallback;

export function createGarage(): GarageState { return { owned: ['stratus'], selected: 'stratus', cars: { stratus: defaults('stratus') } }; }

/** Read old or damaged local profiles without inventing vehicles or tuning levels. */
export function parseGarage(value: unknown): GarageState {
  const result = createGarage();
  if (!isRecord(value)) return result;
  if (Array.isArray(value.owned)) for (const id of value.owned) if (isCar(id) && !result.owned.includes(id)) result.owned.push(id);
  for (const id of result.owned) {
    const stored = isRecord(value.cars) ? value.cars[id] : undefined;
    const settings = defaults(id);
    if (isRecord(stored)) Object.assign(settings, { paint: paint(stored.paint, settings.paint), engine: level(stored.engine), brakes: level(stored.brakes), nitro: level(stored.nitro) });
    result.cars[id] = settings;
  }
  if (isCar(value.selected) && result.owned.includes(value.selected)) result.selected = value.selected;
  return result;
}

export function garageUpgradePrice(garage: GarageState, upgrade: GarageUpgrade): number | null {
  const current = garage.cars[garage.selected]?.[upgrade] ?? 0;
  return UPGRADE_PRICES[upgrade][current] ?? null;
}

/** One atomic transaction is used by solo play and the online room authority. */
export function garageAction(original: GarageState, wallet: number, action: GarageAction): GarageResult {
  const fail = (reason: string): GarageResult => ({ ok: false, reason });
  if (!Number.isSafeInteger(wallet) || wallet < 0) return fail('Portfel garażu jest nieprawidłowy.');
  if (!isRecord(action)) return fail('Niepoprawne zlecenie garażu.');
  const garage = parseGarage(original);
  let cost = 0, message = '';
  if (action.type === 'buy') {
    if (!isCar(action.car)) return fail('Nieznany model samochodu.');
    if (garage.owned.includes(action.car)) return fail('Ten samochód już stoi w twoim garażu.');
    const model = GARAGE_CARS[action.car]; cost = model.price;
    if (wallet < cost) return fail(`Potrzebujesz $${cost}, aby kupić ${model.name}.`);
    garage.owned.push(action.car); garage.cars[action.car] = defaults(action.car); garage.selected = action.car;
    message = `${model.name} kupiony i wybrany. Szerokiej drogi!`;
  } else if (action.type === 'select') {
    if (!isCar(action.car) || !garage.owned.includes(action.car)) return fail('Najpierw kup ten samochód.');
    if (garage.selected === action.car) return fail('Ten samochód jest już wybrany.');
    garage.selected = action.car; message = `Wybrano ${GARAGE_CARS[action.car].name}.`;
  } else if (action.type === 'paint') {
    const color = GARAGE_PAINTS.find(item => item.color === action.color);
    if (!color) return fail('Wybierz lakier z palety warsztatu.');
    const settings = garage.cars[garage.selected]!;
    if (settings.paint === color.color) return fail('Samochód ma już ten lakier.');
    cost = GARAGE_PAINT_PRICE;
    if (wallet < cost) return fail('Lakierowanie kosztuje $80.');
    settings.paint = color.color; message = `Nowy lakier: ${color.name.toLowerCase()}.`;
  } else if (action.type === 'upgrade') {
    if (!isUpgrade(action.upgrade)) return fail('Nieznane ulepszenie samochodu.');
    const price = garageUpgradePrice(garage, action.upgrade);
    if (price === null) return fail('To ulepszenie jest już na maksymalnym poziomie.');
    cost = price;
    if (wallet < cost) return fail(`Potrzebujesz $${cost} na to ulepszenie.`);
    const settings = garage.cars[garage.selected]!; settings[action.upgrade]++;
    message = `${GARAGE_UPGRADE_NAMES[action.upgrade]}: poziom ${settings[action.upgrade]}/2.`;
  } else return fail('Nieznane zlecenie garażu.');
  return { ok: true, garage, wallet: wallet - cost, message };
}

/** Car configuration never repairs, moves or respawns the current vehicle. */
export function garageVehicle(garage: GarageState) {
  const profile = parseGarage(garage), model = GARAGE_CARS[profile.selected], settings = profile.cars[profile.selected]!;
  return { kind: model.kind, color: settings.paint, label: model.name, tuning: { engine: settings.engine, brakes: settings.brakes, nitro: settings.nitro } };
}
export function applyGarage(state: GameState, garage: GarageState): void {
  const vehicle = state.vehicles.find(car => car.id === 'stratus');
  if (vehicle) Object.assign(vehicle, garageVehicle(garage));
}

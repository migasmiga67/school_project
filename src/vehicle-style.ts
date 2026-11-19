/** Visual tuning shared by the garage, the simulation snapshot and the 3D model. */
export type VehiclePart = 'spoiler' | 'rims' | 'kit' | 'height' | 'tint' | 'finish' | 'rimColor' | 'hood' | 'exhaust';
export type VehicleStyle = Record<VehiclePart, number>;

export interface VehiclePartDefinition {
  name: string;
  description: string;
  options: readonly { name: string; price: number }[];
}

export const RIM_COLORS = [
  { color: 0xc3cacc, name: 'Srebrne' }, { color: 0x24292d, name: 'Czarne' },
  { color: 0xc9a45a, name: 'Złote' }, { color: 0x6f777b, name: 'Grafitowe' },
  { color: 0xd9dcdc, name: 'Polerowane' }, { color: 0xb33a3a, name: 'Czerwone' },
] as const;

export const VEHICLE_PARTS: Record<VehiclePart, VehiclePartDefinition> = {
  spoiler: { name: 'Spojler', description: 'Docisk nad tylną osią.', options: [
    { name: 'Brak', price: 0 }, { name: 'Lotka', price: 150 }, { name: 'Skrzydło', price: 320 }, { name: 'GT', price: 520 }] },
  rims: { name: 'Felgi', description: 'Wzór felg ze stopów lekkich.', options: [
    { name: '5 ramion', price: 0 }, { name: 'Wieloramienne', price: 220 }, { name: 'Sportowe Y', price: 280 }, { name: 'Głęboki rant', price: 360 }] },
  rimColor: { name: 'Kolor felg', description: 'Lakier proszkowy felg.', options: RIM_COLORS.map((item, index) => ({ name: item.name, price: index ? 70 : 0 })) },
  kit: { name: 'Pakiet nadwozia', description: 'Zderzaki, progi i dyfuzor.', options: [
    { name: 'Seryjny', price: 0 }, { name: 'Sport', price: 420 }, { name: 'Szeroki', price: 760 }] },
  hood: { name: 'Maska', description: 'Pokrywa komory silnika.', options: [
    { name: 'Seryjna', price: 0 }, { name: 'Z wlotem', price: 240 }, { name: 'Karbonowa', price: 380 }] },
  exhaust: { name: 'Wydech', description: 'Końcówki układu wydechowego.', options: [
    { name: 'Pojedynczy', price: 0 }, { name: 'Podwójny', price: 160 }, { name: 'Poczwórny', price: 280 }] },
  height: { name: 'Zawieszenie', description: 'Niższe auto lepiej skręca.', options: [
    { name: 'Seryjne', price: 0 }, { name: 'Obniżone', price: 190 }, { name: 'Gwint nisko', price: 290 }] },
  tint: { name: 'Szyby', description: 'Przyciemnienie szyb.', options: [
    { name: 'Przejrzyste', price: 0 }, { name: 'Przyciemnione', price: 60 }, { name: 'Limo', price: 95 }] },
  finish: { name: 'Wykończenie lakieru', description: 'Połysk, metalik albo mat.', options: [
    { name: 'Połysk', price: 0 }, { name: 'Metalik', price: 130 }, { name: 'Mat', price: 150 }] },
};
export const VEHICLE_PART_IDS = Object.keys(VEHICLE_PARTS) as VehiclePart[];

export const createVehicleStyle = (): VehicleStyle => ({ spoiler: 0, rims: 0, rimColor: 0, kit: 0, hood: 0, exhaust: 0, height: 0, tint: 1, finish: 0 });

export function isVehiclePart(value: unknown): value is VehiclePart {
  return typeof value === 'string' && (VEHICLE_PART_IDS as string[]).includes(value);
}
export function validPartOption(part: VehiclePart, value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) < VEHICLE_PARTS[part].options.length;
}
/** Tolerates missing or damaged saved data; unknown values fall back to stock. */
export function parseVehicleStyle(value: unknown): VehicleStyle {
  const style = createVehicleStyle();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return style;
  for (const part of VEHICLE_PART_IDS) {
    const option = (value as Record<string, unknown>)[part];
    if (validPartOption(part, option)) style[part] = option;
  }
  return style;
}
export const vehicleStyleKey = (style: VehicleStyle | undefined) => style ? VEHICLE_PART_IDS.map(part => style[part]).join('') : '';

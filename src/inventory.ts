/** Backpack contents and the PetroCoast shop catalogue. Pure data, no DOM. */
export type ItemId = 'canister' | 'oil' | 'repair' | 'medkit' | 'hotdog' | 'coffee' | 'water' | 'flashlight';
export interface ItemDefinition {
  id: ItemId; name: string; icon: string; description: string;
  price: number; weight: number; stack: number;
  /** Where the item can be used. */
  use: 'car' | 'self' | 'passive';
}
export const ITEMS: Record<ItemId, ItemDefinition> = {
  canister: { id: 'canister', name: 'Kanister 5 L', icon: '⛽', description: 'Benzyna 95 na zapas. Użyj przy własnym aucie — wleje 5 L do baku.', price: 14, weight: 4.2, stack: 2, use: 'car' },
  oil: { id: 'oil', name: 'Olej silnikowy 1 L', icon: '🛢', description: 'Dolewka oleju. Użyj przy własnym aucie, gdy poziom jest niski.', price: 11, weight: 1, stack: 3, use: 'car' },
  repair: { id: 'repair', name: 'Zestaw naprawczy', icon: '🔧', description: 'Taśma, klucze i bezpieczniki. Przywraca 35% stanu auta.', price: 45, weight: 2.5, stack: 2, use: 'car' },
  medkit: { id: 'medkit', name: 'Apteczka', icon: '✚', description: 'Opatrunki i środki przeciwbólowe. +60 zdrowia.', price: 30, weight: 1.2, stack: 3, use: 'self' },
  hotdog: { id: 'hotdog', name: 'Hot-dog', icon: '🌭', description: 'Ciepły i tani. +25 zdrowia.', price: 6, weight: .3, stack: 5, use: 'self' },
  coffee: { id: 'coffee', name: 'Kawa na wynos', icon: '☕', description: '+10 zdrowia i szybszy sprint pieszo przez 60 sekund.', price: 4, weight: .4, stack: 5, use: 'self' },
  water: { id: 'water', name: 'Woda 0,5 L', icon: '💧', description: 'Orzeźwia: +12 zdrowia.', price: 2, weight: .5, stack: 6, use: 'self' },
  flashlight: { id: 'flashlight', name: 'Latarka', icon: '🔦', description: 'Nocą świeci przed tobą, gdy chodzisz pieszo. Działa z plecaka.', price: 18, weight: .4, stack: 1, use: 'passive' },
};
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
export const INVENTORY_SLOTS = 12;
export const INVENTORY_MAX_WEIGHT = 20;
export interface InventorySlot { item: ItemId; count: number }
export interface Inventory { slots: InventorySlot[] }

export const createInventory = (): Inventory => ({ slots: [{ item: 'hotdog', count: 1 }, { item: 'water', count: 2 }] });
const isItem = (value: unknown): value is ItemId => typeof value === 'string' && (ITEM_IDS as string[]).includes(value);
export function parseInventory(value: unknown): Inventory {
  if (!value || typeof value !== 'object' || !Array.isArray((value as Inventory).slots)) return createInventory();
  const result: Inventory = { slots: [] };
  for (const slot of (value as Inventory).slots) {
    if (!slot || !isItem(slot.item) || !Number.isInteger(slot.count) || slot.count < 1) continue;
    let left = Math.min(slot.count, 99);
    while (left > 0 && result.slots.length < INVENTORY_SLOTS) { const count = Math.min(left, ITEMS[slot.item].stack); result.slots.push({ item: slot.item, count }); left -= count; }
  }
  return result;
}
export const inventoryWeight = (inventory: Inventory) => inventory.slots.reduce((sum, slot) => sum + ITEMS[slot.item].weight * slot.count, 0);
export const itemCount = (inventory: Inventory, item: ItemId) => inventory.slots.filter(slot => slot.item === item).reduce((sum, slot) => sum + slot.count, 0);
export const hasItem = (inventory: Inventory, item: ItemId) => itemCount(inventory, item) > 0;

/** Adds into partial stacks first, then free slots. Fails without changes when it cannot fit. */
export function addItem(inventory: Inventory, item: ItemId, count = 1): string | null {
  if (!isItem(item) || !Number.isInteger(count) || count < 1) return 'Nieznany przedmiot.';
  const definition = ITEMS[item];
  if (inventoryWeight(inventory) + definition.weight * count > INVENTORY_MAX_WEIGHT + 1e-9) return `Plecak jest za ciężki (limit ${INVENTORY_MAX_WEIGHT} kg).`;
  if (definition.use === 'passive' && hasItem(inventory, item)) return `${definition.name} już jest w plecaku.`;
  const slots = inventory.slots.map(slot => ({ ...slot }));
  let left = count;
  for (const slot of slots) if (slot.item === item && slot.count < definition.stack && left > 0) { const add = Math.min(left, definition.stack - slot.count); slot.count += add; left -= add; }
  while (left > 0) {
    if (slots.length >= INVENTORY_SLOTS) return 'Brak wolnego miejsca w plecaku.';
    const add = Math.min(left, definition.stack); slots.push({ item, count: add }); left -= add;
  }
  inventory.slots = slots; return null;
}
export function removeItem(inventory: Inventory, item: ItemId, count = 1): boolean {
  if (itemCount(inventory, item) < count) return false;
  let left = count;
  for (let index = inventory.slots.length - 1; index >= 0 && left > 0; index--) {
    const slot = inventory.slots[index]; if (slot.item !== item) continue;
    const take = Math.min(left, slot.count); slot.count -= take; left -= take;
    if (slot.count === 0) inventory.slots.splice(index, 1);
  }
  return true;
}

/** What using an item needs and changes. `car` is the player's own car when they stand next to it. */
export interface UseContext {
  health: number;
  car: { health: number; fuel: number; oil: number; tank: number } | null;
}
export interface UseEffect { health?: number; carHealth?: number; fuel?: number; oil?: number; sprintSeconds?: number }
export type UseResult = { ok: true; message: string; effect: UseEffect } | { ok: false; message: string };
export function useItem(inventory: Inventory, item: ItemId, context: UseContext): UseResult {
  const definition = ITEMS[item];
  if (!definition || !hasItem(inventory, item)) return { ok: false, message: 'Nie masz tego przedmiotu.' };
  if (definition.use === 'passive') return { ok: false, message: `${definition.name} działa sama, gdy jest w plecaku.` };
  const fail = (message: string): UseResult => ({ ok: false, message });
  let effect: UseEffect, message: string;
  if (definition.use === 'car') {
    const car = context.car;
    if (!car) return fail('Stań pieszo przy swoim aucie, aby tego użyć.');
    if (item === 'canister') {
      if (car.fuel >= car.tank - .5) return fail('Bak jest pełny.');
      const fuel = Math.min(5, car.tank - car.fuel); effect = { fuel }; message = `Wlano ${fuel.toFixed(1).replace('.', ',')} L benzyny z kanistra.`;
    } else if (item === 'oil') {
      if (car.oil >= 4.4) return fail('Poziom oleju jest prawidłowy — nie przelewaj.');
      effect = { oil: 1 }; message = 'Dolano 1 L oleju. Pamiętaj o wymianie w MOD SHOP.';
    } else {
      if (car.health >= 99) return fail('Auto jest sprawne.');
      const repair = Math.min(35, 100 - car.health); effect = { carHealth: repair }; message = `Prowizoryczna naprawa: +${Math.round(repair)}% stanu auta.`;
    }
  } else {
    const heal = item === 'medkit' ? 60 : item === 'hotdog' ? 25 : item === 'coffee' ? 10 : 12;
    if (context.health >= 100 && item !== 'coffee') return fail('Jesteś w pełni sił.');
    effect = { health: Math.min(heal, 100 - context.health), ...(item === 'coffee' ? { sprintSeconds: 60 } : {}) };
    message = item === 'medkit' ? 'Opatrunek założony: +60 zdrowia.' : item === 'coffee' ? 'Kawa: +10 zdrowia i szybszy sprint przez minutę.' : `${definition.name}: +${heal} zdrowia.`;
  }
  removeItem(inventory, item);
  return { ok: true, message, effect };
}
export function buyItem(inventory: Inventory, wallet: number, item: ItemId): { ok: true; cost: number; message: string } | { ok: false; message: string } {
  const definition = ITEMS[item];
  if (!definition) return { ok: false, message: 'Tego nie ma w sklepie.' };
  if (wallet < definition.price) return { ok: false, message: `${definition.name} kosztuje $${definition.price}.` };
  const problem = addItem(inventory, item);
  if (problem) return { ok: false, message: problem };
  return { ok: true, cost: definition.price, message: `Kupiono: ${definition.name} (−$${definition.price}).` };
}

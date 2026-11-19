import { describe, expect, it } from 'vitest';
import { INVENTORY_MAX_WEIGHT, INVENTORY_SLOTS, ITEMS, addItem, buyItem, createInventory, inventoryWeight, itemCount, parseInventory, removeItem, useItem } from '../src/inventory';
import { createGame } from '../src/game';
import { step } from '../src/game';

describe('backpack', () => {
  it('stacks items, respects slot and weight limits and never half-adds', () => {
    const inventory = { slots: [] };
    expect(addItem(inventory, 'hotdog', 7)).toBeNull();
    expect(inventory.slots).toEqual([{ item: 'hotdog', count: 5 }, { item: 'hotdog', count: 2 }]);
    expect(addItem(inventory, 'canister', 5)).toMatch(/ciężki/); expect(itemCount(inventory, 'canister')).toBe(0);
    expect(addItem(inventory, 'flashlight')).toBeNull(); expect(addItem(inventory, 'flashlight')).toMatch(/już/);
    for (let i = 0; i < 30; i++) addItem(inventory, 'water');
    expect(inventory.slots.length).toBeLessThanOrEqual(INVENTORY_SLOTS);
    expect(inventoryWeight(inventory)).toBeLessThanOrEqual(INVENTORY_MAX_WEIGHT);
    expect(removeItem(inventory, 'hotdog', 6)).toBe(true); expect(itemCount(inventory, 'hotdog')).toBe(1);
    expect(removeItem(inventory, 'hotdog', 2)).toBe(false);
  });
  it('restores saved packs safely', () => {
    expect(parseInventory(null)).toEqual(createInventory());
    expect(parseInventory({ slots: [{ item: 'medkit', count: 7 }, { item: 'rocket', count: 1 }, { item: 'water', count: -2 }] }).slots).toEqual([{ item: 'medkit', count: 3 }, { item: 'medkit', count: 3 }, { item: 'medkit', count: 1 }]);
  });
  it('buys from the shop shelf only with enough money and space', () => {
    const inventory = createInventory();
    const bought = buyItem(inventory, 100, 'canister'); expect(bought.ok && bought.cost).toBe(ITEMS.canister.price);
    expect(buyItem(inventory, 2, 'medkit').ok).toBe(false);
  });
  it('uses items on yourself or your car and refuses useless use', () => {
    const inventory = { slots: [] };
    addItem(inventory, 'medkit'); addItem(inventory, 'canister'); addItem(inventory, 'repair'); addItem(inventory, 'coffee');
    expect(useItem(inventory, 'medkit', { health: 100, car: null }).ok).toBe(false);
    const heal = useItem(inventory, 'medkit', { health: 30, car: null }); expect(heal.ok && heal.effect.health).toBe(60);
    expect(useItem(inventory, 'canister', { health: 100, car: null }).ok).toBe(false);
    const fuel = useItem(inventory, 'canister', { health: 100, car: { health: 50, fuel: 47, oil: 4, tank: 50 } }); expect(fuel.ok && fuel.effect.fuel).toBe(3);
    const repair = useItem(inventory, 'repair', { health: 100, car: { health: 50, fuel: 0, oil: 4, tank: 50 } }); expect(repair.ok && repair.effect.carHealth).toBe(35);
    const coffee = useItem(inventory, 'coffee', { health: 100, car: null }); expect(coffee.ok && coffee.effect.sprintSeconds).toBe(60);
    expect(inventory.slots).toEqual([]);
  });
  it('coffee makes the sprint faster', () => {
    const run = (caffeine: number) => { const state = createGame(); state.player.mode = 'foot'; state.player.vehicleId = null; state.player.caffeine = caffeine; const start = { ...state.player }; for (let i = 0; i < 10; i++) step(state, { throttle: true, brake: false, left: false, right: false, handbrake: false, boost: true, sprint: true, interact: false, nextMission: false, reset: false, viewHeading: Math.PI }, .05); return Math.hypot(state.player.x - start.x, state.player.z - start.z); };
    expect(run(30)).toBeGreaterThan(run(0) + .3);
  });
});

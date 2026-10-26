import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBattle } from '../src/core/engine';
import { chooseRelic, exportSave, freshSave, loadSave, newRun, parseSave, persistSave, RELICS, SAVE_KEY, settleBattle, unlockRelic } from '../src/progression';
import type { SaveData } from '../src/progression';

function cleared(save: SaveData): SaveData {
  const next = structuredClone(save);
  if (!next.run) throw new Error('Missing run');
  next.run.battle.phase = 'won';
  for (const unit of Object.values(next.run.battle.units)) if (unit.team === 'enemies') delete next.run.battle.units[unit.id];
  return next;
}
function reward(): SaveData { return settleBattle(cleared(newRun(freshSave()))); }
function storage() {
  const map = new Map<string, string>();
  return { map, getItem: vi.fn((key: string) => map.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { map.set(key, value); }) };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('run progression', () => {
  it('starts a fresh team without consuming the profile or changing the input', () => {
    const save = freshSave(); save.profile.echoes = 4; save.profile.unlocked = ['cloak'];
    const before = structuredClone(save);
    const started = newRun(save);
    expect(save).toEqual(before);
    expect(started.profile).toEqual(before.profile);
    expect(started.run?.relics).toEqual([]);
    expect(started.run?.battle.units.ignis.hp).toBe(12);
    expect(started.run?.status).toBe('battle');
    expect(parseSave(exportSave(started))).toEqual(started);
  });

  it('awards an echo and stored deterministic offers exactly once per cleared room', () => {
    const source = cleared(newRun(freshSave()));
    const first = settleBattle(source);
    expect(first.profile.echoes).toBe(1);
    expect(first.run?.status).toBe('reward');
    expect(first.run?.offers).toHaveLength(3);
    expect(new Set(first.run?.offers).size).toBe(3);
    expect(settleBattle(source)).toEqual(first);
    expect(settleBattle(first)).toEqual(first);
    expect(parseSave(exportSave(first))).toEqual(first);
    expect(source.profile.echoes).toBe(0);
  });

  it('rejects a reward not offered and does not mutate the original', () => {
    const save = reward();
    const absent = Object.keys(RELICS).find(id => !save.run!.offers.includes(id))!;
    expect(chooseRelic(save, absent)).toEqual(save);
    expect(chooseRelic(newRun(freshSave()), 'seal').run?.room).toBe(0);
  });

  it('heals living heroes, revives a fallen Lyra with rounded-up HP, and resets battle state', () => {
    const save = reward();
    save.run!.battle.units.ignis.hp = 4;
    save.run!.battle.units.ignis.ap = 0;
    save.run!.battle.units.ignis.shield = 3;
    save.run!.battle.units.ignis.readyRound.shield = 10;
    delete save.run!.battle.units.lyra;
    save.run!.offers = ['seal', 'lens', 'teeth'];
    const next = chooseRelic(save, 'seal');
    expect(next.run?.room).toBe(1);
    expect(next.run?.battle.units.ignis.hp).toBe(6);
    expect(next.run?.battle.units.ignis.ap).toBe(2);
    expect(next.run?.battle.units.ignis.shield).toBe(0);
    expect(next.run?.battle.units.ignis.readyRound).toEqual({});
    expect(next.run?.battle.units.lyra.hp).toBe(4);
    expect(next.run?.relics).toEqual(['seal']);
    expect(next.run?.battle.relics).toEqual(['seal']);
    expect(next.run?.offers).toEqual([]);
    expect(parseSave(exportSave(next))).toEqual(next);
  });

  it('applies bandages and the immediate HP bonus of a newly chosen heart', () => {
    const bandage = reward(); bandage.run!.offers = ['bandage']; bandage.run!.battle.units.kael.hp = 2;
    expect(chooseRelic(bandage, 'bandage').run?.battle.units.kael.hp).toBe(5);
    const heart = reward(); heart.profile.unlocked = ['heart']; heart.run!.offers = ['heart']; heart.run!.battle.units.ignis.hp = 4;
    const next = chooseRelic(heart, 'heart');
    expect(next.run?.battle.units.ignis.maxHp).toBe(14);
    expect(next.run?.battle.units.ignis.hp).toBe(8);
  });

  it('does not offer a relic already owned in this run', () => {
    const first = reward(); first.run!.offers = ['seal'];
    const next = settleBattle(cleared(chooseRelic(first, 'seal')));
    expect(next.run?.offers).toHaveLength(3);
    expect(next.run?.offers).not.toContain('seal');
  });

  it('settles the final battle once and preserves the completed run for summary', () => {
    const save = newRun(freshSave());
    save.run!.room = 2; save.run!.battle = createBattle(2); save.run!.settledRooms = [0, 1];
    const next = settleBattle(cleared(save));
    expect(next.profile.echoes).toBe(3);
    expect(next.profile.completedRuns).toBe(1);
    expect(next.run?.status).toBe('won');
    expect(next.run?.offers).toEqual([]);
    expect(settleBattle(next)).toEqual(next);
    expect(parseSave(exportSave(next))).toEqual(next);
  });

  it('losing retains echoes and a new timeline discards old relics', () => {
    const save = newRun(freshSave()); save.profile.echoes = 2;
    save.run!.battle.phase = 'lost'; save.run!.battle.objects.obelisk.hp = 0;
    const lost = settleBattle(save);
    expect(lost.run?.status).toBe('lost');
    expect(lost.profile.echoes).toBe(2);
    const restarted = newRun(lost);
    expect(restarted.profile.echoes).toBe(2);
    expect(restarted.run?.relics).toEqual([]);
    expect(restarted.run?.id).not.toBe(lost.run?.id);
    expect(restarted.run?.battle.units.ignis.hp).toBe(12);
  });

  it('unlocks only known affordable sidegrades and cannot charge twice', () => {
    const save = freshSave(); save.profile.echoes = 5;
    expect(unlockRelic(save, 'arbitrary')).toEqual(save);
    const first = unlockRelic(save, 'cloak');
    expect(first.profile.echoes).toBe(2);
    expect(first.profile.unlocked).toEqual(['cloak']);
    expect(unlockRelic(first, 'cloak')).toEqual(first);
    expect(unlockRelic(first, 'heart')).toEqual(first);
    expect(save.profile.echoes).toBe(5);
  });
});

describe('local persistence and import validation', () => {
  it('stores a single complete envelope and reloads an unchanged reward', () => {
    const mock = storage(); vi.stubGlobal('localStorage', mock);
    const save = reward();
    expect(persistSave(save)).toBe(true);
    expect(mock.setItem).toHaveBeenCalledTimes(1);
    expect(mock.setItem.mock.calls[0][0]).toBe(SAVE_KEY);
    expect(loadSave()).toEqual({ data: save, error: null });
  });

  it('preserves corrupted data instead of silently overwriting it', () => {
    const mock = storage(); mock.map.set(SAVE_KEY, '{broken'); vi.stubGlobal('localStorage', mock);
    const loaded = loadSave();
    expect(loaded.error).toBeTruthy();
    expect(loaded.data.run).toBeNull();
    expect(mock.map.get(SAVE_KEY)).toBe('{broken');
    expect(mock.setItem).not.toHaveBeenCalled();
  });

  it('reports blocked/quota-exceeded storage and does not pretend it saved', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); } });
    expect(loadSave().error).toBeTruthy();
    expect(persistSave(newRun(freshSave()))).toBe(false);
  });

  it('rejects malformed coordinates, overlapping units and unknown save versions', () => {
    const base = newRun(freshSave());
    const outside = structuredClone(base); outside.run!.battle.units.ignis.cell.x = 8;
    expect(() => parseSave(exportSave(outside))).toThrow();
    const overlap = structuredClone(base); overlap.run!.battle.units.ignis.cell = overlap.run!.battle.units.kael.cell;
    expect(() => parseSave(exportSave(overlap))).toThrow();
    const version = { ...base, version: 999 };
    expect(() => parseSave(JSON.stringify(version))).toThrow();
  });

  it('rejects duplicate relics, negative AP and missing settings before handing data to the game', () => {
    const relics = newRun(freshSave()); relics.run!.relics = ['seal', 'seal'];
    expect(() => parseSave(exportSave(relics))).toThrow();
    const ap = newRun(freshSave()); ap.run!.battle.units.ignis.ap = -1;
    expect(() => parseSave(exportSave(ap))).toThrow();
    expect(() => parseSave(JSON.stringify({ version: 1, profile: { echoes: 0, unlocked: [], completedRuns: 0 }, run: null }))).toThrow();
  });
});

describe('save invariants required by the controller', () => {
  it('requires canonical hero IDs while allowing arbitrary legal enemy IDs', () => {
    const renamedHero = newRun(freshSave());
    const hero = renamedHero.run!.battle.units.ignis;
    delete renamedHero.run!.battle.units.ignis;
    hero.id = 'other-knight';
    renamedHero.run!.battle.units[hero.id] = hero;
    expect(() => parseSave(exportSave(renamedHero))).toThrow(/identyfikator bohatera/);
    const renamedEnemy = newRun(freshSave());
    const battle = renamedEnemy.run!.battle;
    const enemy = battle.units['husk-1'];
    delete battle.units[enemy.id];
    const oldId = enemy.id; enemy.id = 'last-0'; battle.units[enemy.id] = enemy;
    battle.enemyOrder = battle.enemyOrder.map(id => id === oldId ? enemy.id : id);
    battle.intents = battle.intents.map(intent => intent.actorId === oldId ? { ...intent, actorId: enemy.id } : intent);
    expect(parseSave(exportSave(renamedEnemy))).toEqual(renamedEnemy);
  });

  it('requires the canonical Obelisk identity, kind and maximum HP', () => {
    const renamed = newRun(freshSave());
    const obelisk = renamed.run!.battle.objects.obelisk;
    delete renamed.run!.battle.objects.obelisk;
    obelisk.id = 'other-core'; renamed.run!.battle.objects[obelisk.id] = obelisk;
    expect(() => parseSave(exportSave(renamed))).toThrow(/identyfikator Obelisku/);
    const disguised = newRun(freshSave()); disguised.run!.battle.objects.obelisk.kind = 'cover';
    expect(() => parseSave(exportSave(disguised))).toThrow(/identyfikator Obelisku/);
    const altered = newRun(freshSave()); altered.run!.battle.objects.obelisk.maxHp = 12;
    expect(() => parseSave(exportSave(altered))).toThrow(/zdrowie Obelisku/);
  });

  it('rejects active runs with terminal phases or an already-settled current room', () => {
    const terminal = cleared(newRun(freshSave()));
    expect(() => parseSave(exportSave(terminal))).toThrow(/aktywna walka/);
    const settled = newRun(freshSave()); settled.run!.settledRooms = [0];
    expect(() => parseSave(exportSave(settled))).toThrow(/aktywna walka/);
  });

  it('accepts only real victories: no enemies, surviving hero and living Obelisk', () => {
    const valid = reward();
    expect(parseSave(exportSave(valid))).toEqual(valid);
    const enemySurvives = structuredClone(valid);
    const enemy = createBattle(0).units['husk-1'];
    enemySurvives.run!.battle.units[enemy.id] = enemy;
    expect(() => parseSave(exportSave(enemySurvives))).toThrow(/obecność wrogów/);
    const coreDead = structuredClone(valid); coreDead.run!.battle.objects.obelisk.hp = 0;
    expect(() => parseSave(exportSave(coreDead))).toThrow(/drużyna i Obelisk/);
    const partyDead = structuredClone(valid); partyDead.run!.battle.units = {};
    expect(() => parseSave(exportSave(partyDead))).toThrow(/drużyna i Obelisk/);
  });

  it('rejects stale or empty reward offers without performing storage writes', () => {
    const mock = storage(); vi.stubGlobal('localStorage', mock);
    const stray = newRun(freshSave()); stray.run!.offers = ['seal'];
    expect(() => parseSave(exportSave(stray))).toThrow(/oferta poza/);
    const empty = reward(); empty.run!.offers = [];
    expect(() => parseSave(exportSave(empty))).toThrow(/oczekująca nagroda/);
    const locked = reward(); locked.run!.offers = ['heart'];
    expect(() => parseSave(exportSave(locked))).toThrow(/nieodblokowany relikt/);
    expect(persistSave(locked)).toBe(false);
    expect(mock.setItem).not.toHaveBeenCalled();
    expect(mock.getItem).not.toHaveBeenCalled();
  });
});

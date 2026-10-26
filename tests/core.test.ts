import { describe, expect, it } from 'vitest';
import {
  ABILITIES, HEROES, abilityError, createBattle, forecast, planIntents,
  reachable, reduce,
} from '../src/core/engine';
import type { BattleState, Cell, Command, Resolution, Unit } from '../src/core/model';

function unit(id: string, kind: Unit['kind'], cell: Cell, hp = 8): Unit {
  return {
    id, name: id, kind, team: ['ignis', 'kael', 'lyra'].includes(kind) ? 'heroes' : 'enemies',
    cell, hp, maxHp: hp, shield: 0, ap: 2, readyRound: {}, rootedActivations: 0,
  };
}
function fixture(): BattleState {
  return {
    room: 0, round: 1, phase: 'player',
    board: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => 'floor' as const)),
    units: {
      ignis: unit('ignis', 'ignis', { x: 2, y: 4 }, 12),
      kael: unit('kael', 'kael', { x: 1, y: 6 }),
      lyra: unit('lyra', 'lyra', { x: 5, y: 5 }, 7),
      enemy: unit('enemy', 'husk', { x: 3, y: 4 }, 4),
      reserve: unit('reserve', 'thorn', { x: 7, y: 0 }, 3),
    },
    objects: { obelisk: { id: 'obelisk', kind: 'obelisk', cell: { x: 0, y: 0 }, hp: 6, maxHp: 6 } },
    traps: [], enemyOrder: ['enemy', 'reserve'],
    intents: [{ actorId: 'enemy', kind: 'wait' }, { actorId: 'reserve', kind: 'wait' }],
    actionSequence: 0, relics: [],
  };
}
function accepted(result: Resolution): BattleState {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}
function execute(state: BattleState, command: Command): BattleState {
  return accepted(reduce(state, command));
}
const copy = <T>(value: T): T => structuredClone(value);

// Fixtures retain an Obelisk and at least one enemy so unrelated terminal rules
// do not mask the mechanic under test.
describe('content and action economy', () => {
  it('defines the three roles, all six skills and the complete three-room run', () => {
    expect(Object.keys(HEROES).sort()).toEqual(['ignis', 'kael', 'lyra']);
    expect(Object.keys(ABILITIES).sort()).toEqual(['bash', 'lightning', 'shield', 'shoot', 'snare', 'swap']);
    expect([0, 1, 2].map(room => Object.values(createBattle(room).units).filter(u => u.team === 'enemies').length))
      .toEqual([3, 4, 3]);
    for (const room of [0, 1, 2]) {
      const state = createBattle(room);
      expect(Object.values(state.units).filter(u => u.team === 'heroes')).toHaveLength(3);
      expect(state.board).toHaveLength(8);
      expect(state.board.every(row => row.length === 8)).toBe(true);
      expect(Object.values(state.objects).filter(o => o.kind === 'obelisk')).toHaveLength(1);
    }
  });
  it('rejects actions with zero AP, wrong class, missing actor and terminal phase without mutation', () => {
    const state = fixture();
    state.units.ignis.ap = 0;
    const before = copy(state);
    expect(reduce(state, { type: 'bash', actorId: 'ignis', targetId: 'enemy' }).ok).toBe(false);
    expect(reduce(state, { type: 'lightning', actorId: 'kael', anchor: { x: 2, y: 3 } }).ok).toBe(false);
    expect(reduce(state, { type: 'shield', actorId: 'missing' }).ok).toBe(false);
    expect(state).toEqual(before);
    state.phase = 'lost';
    expect(reduce(state, { type: 'endTurn' }).ok).toBe(false);
  });
  it('allows two movements, but cannot move through occupied or wall destinations', () => {
    let state = fixture();
    const targets = reachable(state, 'ignis');
    expect(targets).not.toContainEqual({ x: 3, y: 4 });
    expect(targets).not.toContainEqual({ x: 7, y: 4 });
    state = execute(state, { type: 'move', actorId: 'ignis', destination: { x: 2, y: 3 } });
    expect(state.units.ignis.ap).toBe(1);
    state = execute(state, { type: 'move', actorId: 'ignis', destination: { x: 2, y: 2 } });
    expect(state.units.ignis.ap).toBe(0);
    expect(reduce(state, { type: 'move', actorId: 'ignis', destination: { x: 2, y: 1 } }).ok).toBe(false);
    const walled = fixture();
    walled.board[3][2] = 'wall';
    expect(reduce(walled, { type: 'move', actorId: 'ignis', destination: { x: 2, y: 3 } }).ok).toBe(false);
    expect(reduce(walled, { type: 'move', actorId: 'ignis', destination: { x: 2, y: 4 } }).ok).toBe(false);
  });
  it('enforces class-specific movement range and the cloak relic', () => {
    const state = fixture();
    state.units.kael.cell = { x: 0, y: 7 };
    expect(reachable(state, 'kael')).toContainEqual({ x: 4, y: 7 });
    expect(reachable(state, 'kael')).not.toContainEqual({ x: 5, y: 7 });
    state.relics.push('cloak');
    expect(reachable(state, 'kael')).toContainEqual({ x: 5, y: 7 });
  });
  it('stores cooldown as an absolute round without refreshing it by a swap', () => {
    let state = fixture();
    state.round = 3;
    state = execute(state, { type: 'shield', actorId: 'ignis' });
    expect(state.units.ignis.readyRound.shield).toBe(5);
    state = execute(state, { type: 'swap', actorId: 'lyra', firstId: 'ignis', secondId: 'kael' });
    expect(state.units.ignis.readyRound.shield).toBe(5);
    state.round = 4;
    state.units.ignis.ap = 2;
    expect(abilityError(state, 'ignis', 'shield')).not.toBeNull();
    state.round = 5;
    expect(abilityError(state, 'ignis', 'shield')).toBeNull();
  });
  it('does not allow a second use of a C=1 ability in the same round', () => {
    let state = fixture();
    state = execute(state, { type: 'bash', actorId: 'ignis', targetId: 'enemy' });
    state.units.enemy.cell = { x: 3, y: 4 };
    expect(state.units.ignis.ap).toBe(1);
    expect(reduce(state, { type: 'bash', actorId: 'ignis', targetId: 'enemy' }).ok).toBe(false);
  });
});

describe('Ignis: pushes, collisions and shields', () => {
  it('damages before pushing and leaves the input state untouched', () => {
    const state = fixture();
    const before = copy(state);
    const next = execute(state, { type: 'bash', actorId: 'ignis', targetId: 'enemy' });
    expect(next.units.enemy.hp).toBe(2);
    expect(next.units.enemy.cell).toEqual({ x: 4, y: 4 });
    expect(next.units.ignis.ap).toBe(1);
    expect(state).toEqual(before);
  });
  it('does not push a target killed by the initial hit or hurt a unit behind it', () => {
    const state = fixture();
    state.units.enemy.hp = 2;
    state.units.kael.cell = { x: 4, y: 4 };
    const next = execute(state, { type: 'bash', actorId: 'ignis', targetId: 'enemy' });
    expect(next.units.enemy).toBeUndefined();
    expect(next.units.kael.hp).toBe(8);
  });
  it('damages both collision participants without a chain push', () => {
    const state = fixture();
    state.units.kael.cell = { x: 4, y: 4 };
    const next = execute(state, { type: 'bash', actorId: 'ignis', targetId: 'enemy' });
    expect(next.units.enemy.hp).toBe(1);
    expect(next.units.kael.hp).toBe(7);
    expect(next.units.enemy.cell).toEqual({ x: 3, y: 4 });
    expect(next.units.kael.cell).toEqual({ x: 4, y: 4 });
  });
  it('adds collision damage for a wall, but does not move through destroyed cover', () => {
    const state = fixture();
    state.board[4][4] = 'wall';
    const wall = execute(state, { type: 'bash', actorId: 'ignis', targetId: 'enemy' });
    expect(wall.units.enemy.hp).toBe(1);
    expect(wall.units.enemy.cell).toEqual({ x: 3, y: 4 });
    state.board[4][4] = 'floor';
    state.objects.cover = { id: 'cover', kind: 'cover', cell: { x: 4, y: 4 }, hp: 1, maxHp: 2 };
    const cover = execute(state, { type: 'bash', actorId: 'ignis', targetId: 'enemy' });
    expect(cover.objects.cover).toBeUndefined();
    expect(cover.units.enemy.cell).toEqual({ x: 3, y: 4 });
  });
  it('kills on falling into a pit even if the initial damage was shielded', () => {
    const state = fixture();
    state.board[4][4] = 'void';
    state.units.enemy.shield = 9;
    const next = execute(state, { type: 'bash', actorId: 'ignis', targetId: 'enemy' });
    expect(next.units.enemy).toBeUndefined();
  });
  it('protects only the caster and orthogonally adjacent heroes, never stacks shields', () => {
    const state = fixture();
    state.units.kael.cell = { x: 2, y: 5 };
    state.units.lyra.cell = { x: 3, y: 5 };
    state.units.kael.shield = 5;
    const next = execute(state, { type: 'shield', actorId: 'ignis' });
    expect(next.units.ignis.shield).toBe(3);
    expect(next.units.kael.shield).toBe(5);
    expect(next.units.lyra.shield).toBe(0);
    expect(next.units.enemy.shield).toBe(0);
  });
  it('absorbs damage before HP and expires shields at the next player phase', () => {
    const state = fixture();
    state.units.ignis.shield = 3;
    state.units.enemy.cell = { x: 2, y: 3 };
    state.intents = [{ actorId: 'enemy', kind: 'line', direction: 'S', range: 1, damage: 5 }];
    const next = execute(state, { type: 'endTurn' });
    expect(next.units.ignis.hp).toBe(10);
    expect(next.units.ignis.shield).toBe(0);
    expect(next.round).toBe(2);
    expect(next.units.ignis.ap).toBe(2);
  });
});

describe('Kael: blocked shots and traps', () => {
  it('cannot shoot through a hero, but can destroy the first cover instead of the enemy behind it', () => {
    const state = fixture();
    state.units.kael.cell = { x: 0, y: 4 };
    expect(reduce(state, { type: 'shoot', actorId: 'kael', direction: 'E' }).ok).toBe(false);
    state.units.ignis.cell = { x: 2, y: 5 };
    state.objects.cover = { id: 'cover', kind: 'cover', cell: { x: 1, y: 4 }, hp: 2, maxHp: 2 };
    const next = execute(state, { type: 'shoot', actorId: 'kael', direction: 'E' });
    expect(next.objects.cover).toBeUndefined();
    expect(next.units.enemy.hp).toBe(4);
  });
  it('shoots across a void and enforces range, including the lens upgrade', () => {
    const state = fixture();
    state.units.kael.cell = { x: 0, y: 3 };
    state.units.enemy.cell = { x: 7, y: 3 };
    state.board[3][2] = 'void';
    expect(reduce(state, { type: 'shoot', actorId: 'kael', direction: 'E' }).ok).toBe(false);
    state.relics = ['lens'];
    const next = execute(state, { type: 'shoot', actorId: 'kael', direction: 'E' });
    expect(next.units.enemy.hp).toBe(1);
  });
  it('places traps only on empty floor in range and rejects a third active trap', () => {
    const state = fixture();
    const next = execute(state, { type: 'snare', actorId: 'kael', cell: { x: 1, y: 5 } });
    expect(next.traps).toHaveLength(1);
    expect(next.traps[0]).toMatchObject({ cell: { x: 1, y: 5 }, damage: 1, expiresAfterEnemyRound: 3 });
    expect(next.units.kael.ap).toBe(1);
    expect(reduce(state, { type: 'snare', actorId: 'kael', cell: state.units.ignis.cell }).ok).toBe(false);
    expect(reduce(state, { type: 'snare', actorId: 'kael', cell: { x: 7, y: 7 } }).ok).toBe(false);
    state.traps = [
      { id: 'a', cell: { x: 0, y: 6 }, damage: 1, expiresAfterEnemyRound: 3 },
      { id: 'b', cell: { x: 0, y: 7 }, damage: 1, expiresAfterEnemyRound: 3 },
    ];
    expect(reduce(state, { type: 'snare', actorId: 'kael', cell: { x: 1, y: 5 } }).ok).toBe(false);
  });
  it('does not trigger for a hero walking over it', () => {
    const state = fixture();
    state.traps = [{ id: 'a', cell: { x: 1, y: 5 }, damage: 1, expiresAfterEnemyRound: 3 }];
    const next = execute(state, { type: 'move', actorId: 'kael', destination: { x: 1, y: 5 } });
    expect(next.traps).toHaveLength(1);
    expect(next.units.kael.hp).toBe(8);
  });
  it('triggers once on a pushed enemy and blocks its next movement', () => {
    const state = fixture();
    state.traps = [{ id: 'a', cell: { x: 4, y: 4 }, damage: 1, expiresAfterEnemyRound: 3 }];
    state.intents = [{ actorId: 'enemy', kind: 'move', path: [{ x: 5, y: 4 }] }];
    const pushed = execute(state, { type: 'bash', actorId: 'ignis', targetId: 'enemy' });
    expect(pushed.traps).toHaveLength(0);
    expect(pushed.units.enemy.hp).toBe(1);
    expect(pushed.units.enemy.rootedActivations).toBe(1);
    const next = execute(pushed, { type: 'endTurn' });
    expect(next.units.enemy.cell).toEqual({ x: 4, y: 4 });
    expect(next.units.enemy.rootedActivations).toBe(0);
  });
  it('consumes root in the current activation when a moving enemy enters a trap', () => {
    const state = fixture();
    state.traps = [{ id: 'a', cell: { x: 3, y: 5 }, damage: 1, expiresAfterEnemyRound: 3 }];
    state.intents = [{ actorId: 'enemy', kind: 'move', path: [{ x: 3, y: 5 }, { x: 3, y: 6 }] }];
    const next = execute(state, { type: 'endTurn' });
    expect(next.units.enemy.cell).toEqual({ x: 3, y: 5 });
    expect(next.units.enemy.hp).toBe(3);
    expect(next.units.enemy.rootedActivations).toBe(0);
    expect(next.traps).toHaveLength(0);
  });
  it('does not suppress an attack by a rooted enemy and expires unused traps on schedule', () => {
    const state = fixture();
    state.units.enemy.cell = { x: 2, y: 3 };
    state.units.enemy.rootedActivations = 1;
    state.intents = [{ actorId: 'enemy', kind: 'line', direction: 'S', range: 1, damage: 2 }];
    state.traps = [{ id: 'a', cell: { x: 4, y: 7 }, damage: 1, expiresAfterEnemyRound: 1 }];
    const next = execute(state, { type: 'endTurn' });
    expect(next.units.ignis.hp).toBe(10);
    expect(next.units.enemy.rootedActivations).toBe(0);
    expect(next.traps).toHaveLength(0);
  });
});

describe('Lyra: atomic swaps and simultaneous AoE', () => {
  it('swaps without refreshing AP or cooldowns and triggers enemy entry on a trap', () => {
    const state = fixture();
    state.units.kael.ap = 1;
    state.units.kael.readyRound.shoot = 2;
    state.traps = [{ id: 'a', cell: { ...state.units.kael.cell }, damage: 1, expiresAfterEnemyRound: 3 }];
    const next = execute(state, { type: 'swap', actorId: 'lyra', firstId: 'enemy', secondId: 'kael' });
    expect(next.units.enemy.cell).toEqual(state.units.kael.cell);
    expect(next.units.kael.cell).toEqual(state.units.enemy.cell);
    expect(next.units.kael.ap).toBe(1);
    expect(next.units.kael.readyRound.shoot).toBe(2);
    expect(next.units.lyra.ap).toBe(1);
    expect(next.units.enemy.hp).toBe(3);
    expect(next.units.enemy.rootedActivations).toBe(1);
    expect(next.traps).toHaveLength(0);
    expect(next.enemyOrder).toEqual(state.enemyOrder);
  });
  it('permits swapping the caster or a boss but rejects self-swap and an object', () => {
    const state = fixture();
    state.units.enemy.kind = 'warden';
    const next = execute(state, { type: 'swap', actorId: 'lyra', firstId: 'lyra', secondId: 'enemy' });
    expect(next.units.lyra.cell).toEqual(state.units.enemy.cell);
    expect(reduce(state, { type: 'swap', actorId: 'lyra', firstId: 'enemy', secondId: 'enemy' }).ok).toBe(false);
    expect(reduce(state, { type: 'swap', actorId: 'lyra', firstId: 'enemy', secondId: 'obelisk' }).ok).toBe(false);
  });
  it('damages every unit and Obelisk in the 2x2 area and charges two AP', () => {
    const state = fixture();
    state.units.lyra.cell = { x: 1, y: 2 };
    state.units.enemy.cell = { x: 3, y: 2 };
    state.units.kael.cell = { x: 2, y: 3 };
    state.objects.obelisk.cell = { x: 3, y: 3 };
    const next = execute(state, { type: 'lightning', actorId: 'lyra', anchor: { x: 2, y: 2 } });
    expect(next.units.enemy.hp).toBe(2);
    expect(next.units.kael.hp).toBe(6);
    expect(next.objects.obelisk.hp).toBe(4);
    expect(next.units.lyra.ap).toBe(0);
    expect(next.units.lyra.readyRound.lightning).toBe(3);
  });
  it('rejects out-of-board AoE, empty AoE, and a two-AP cast after moving', () => {
    let state = fixture();
    expect(reduce(state, { type: 'lightning', actorId: 'lyra', anchor: { x: 7, y: 7 } }).ok).toBe(false);
    expect(reduce(state, { type: 'lightning', actorId: 'lyra', anchor: { x: 4, y: 1 } }).ok).toBe(false);
    state = execute(state, { type: 'move', actorId: 'lyra', destination: { x: 4, y: 5 } });
    expect(reduce(state, { type: 'lightning', actorId: 'lyra', anchor: { x: 3, y: 4 } }).ok).toBe(false);
  });
  it('gives loss priority when the last enemy and Obelisk die in the same AoE', () => {
    const state = fixture();
    delete state.units.reserve;
    state.units.lyra.cell = { x: 1, y: 2 };
    state.units.enemy.cell = { x: 3, y: 2 };
    state.units.enemy.hp = 1;
    state.objects.obelisk.cell = { x: 3, y: 3 };
    state.objects.obelisk.hp = 1;
    const next = execute(state, { type: 'lightning', actorId: 'lyra', anchor: { x: 2, y: 2 } });
    expect(next.phase).toBe('lost');
  });
  it('applies relic effects without changing action costs', () => {
    const state = fixture();
    state.relics = ['spark', 'seal', 'weight', 'teeth'];
    state.units.lyra.cell = { x: 1, y: 2 };
    state.units.enemy.cell = { x: 3, y: 2 };
    state.units.kael.cell = { x: 2, y: 3 };
    state.objects.obelisk.cell = { x: 3, y: 3 };
    const next = execute(state, { type: 'lightning', actorId: 'lyra', anchor: { x: 2, y: 2 } });
    expect(next.units.kael.hp).toBe(8);
    expect(next.objects.obelisk.hp).toBe(4);
    expect(next.units.lyra.ap).toBe(0);
    const shield = execute(state, { type: 'shield', actorId: 'ignis' });
    expect(shield.units.ignis.shield).toBe(4);
  });
});

describe('enemy execution and exact forecasts', () => {
  it('executes fixed-direction attacks from the current origin after a swap', () => {
    const state = fixture();
    state.units.enemy.cell = { x: 3, y: 4 };
    state.units.reserve.cell = { x: 6, y: 3 };
    state.intents = [
      { actorId: 'enemy', kind: 'line', direction: 'W', range: 1, damage: 2 },
      { actorId: 'reserve', kind: 'line', direction: 'W', range: 6, damage: 2 },
    ];
    state.objects.obelisk.cell = { x: 3, y: 3 };
    state.board[4][4] = 'void';
    const swapped = execute(state, { type: 'swap', actorId: 'lyra', firstId: 'enemy', secondId: 'reserve' });
    expect(swapped.intents).toEqual(state.intents);
    const pushed = execute(swapped, { type: 'bash', actorId: 'ignis', targetId: 'reserve' });
    const next = execute(pushed, { type: 'endTurn' });
    expect(next.units.reserve).toBeUndefined();
    expect(next.units.ignis.hp).toBe(12);
    expect(next.objects.obelisk.hp).toBe(6);
    expect(next.units.enemy.cell).toEqual({ x: 6, y: 3 });
  });
  it('stops a fixed movement path at the first blockage without attacking or rerouting', () => {
    const state = fixture();
    state.intents = [{ actorId: 'enemy', kind: 'move', path: [{ x: 3, y: 5 }, { x: 3, y: 6 }] }];
    state.board[5][3] = 'wall';
    const next = execute(state, { type: 'endTurn' });
    expect(next.units.enemy.cell).toEqual({ x: 3, y: 4 });
    expect(next.units.ignis.hp).toBe(12);
  });
  it('enemy friendly fire kills an actor before it can execute its intention', () => {
    const state = fixture();
    state.units.enemy.cell = { x: 2, y: 1 };
    state.units.enemy.hp = 2;
    state.units.reserve.cell = { x: 2, y: 0 };
    state.units.ignis.cell = { x: 2, y: 2 };
    state.enemyOrder = ['reserve', 'enemy'];
    state.intents = [
      { actorId: 'reserve', kind: 'line', direction: 'S', range: 6, damage: 2 },
      { actorId: 'enemy', kind: 'line', direction: 'S', range: 1, damage: 2 },
    ];
    const next = execute(state, { type: 'endTurn' });
    expect(next.units.enemy).toBeUndefined();
    expect(next.units.ignis.hp).toBe(12);
  });
  it('forecast matches real endTurn exactly, without mutating the state or its intents', () => {
    for (const room of [0, 1, 2]) {
      const state = createBattle(room);
      const before = copy(state);
      const predicted = forecast(state);
      const actual = accepted(reduce(state, { type: 'endTurn' }));
      expect(predicted.state).toEqual(actual);
      expect(state).toEqual(before);
    }
  });
  it('plans identical intents from identical states and keeps all coordinates legal', () => {
    for (const room of [0, 1, 2]) {
      const state = createBattle(room);
      expect(planIntents(state)).toEqual(planIntents(copy(state)));
      const next = execute(state, { type: 'endTurn' });
      const positions = Object.values(next.units).map(u => `${u.cell.x},${u.cell.y}`);
      expect(new Set(positions).size).toBe(positions.length);
      for (const u of Object.values(next.units)) {
        expect(u.cell.x).toBeGreaterThanOrEqual(0);
        expect(u.cell.x).toBeLessThan(8);
        expect(u.cell.y).toBeGreaterThanOrEqual(0);
        expect(u.cell.y).toBeLessThan(8);
        expect(next.board[u.cell.y][u.cell.x]).toBe('floor');
        expect(u.hp).toBeGreaterThan(0);
        expect(u.ap).toBeGreaterThanOrEqual(0);
      }
    }
  });
  it('ends a battle on the last enemy kill and loses if the last hero is killed', () => {
    const state = fixture();
    delete state.units.reserve;
    state.units.enemy.hp = 2;
    const victory = execute(state, { type: 'bash', actorId: 'ignis', targetId: 'enemy' });
    expect(victory.phase).toBe('won');
    const doomed = fixture();
    delete doomed.units.kael;
    delete doomed.units.lyra;
    doomed.units.ignis.hp = 1;
    doomed.intents = [{ actorId: 'enemy', kind: 'line', direction: 'W', range: 1, damage: 2 }];
    const defeat = execute(doomed, { type: 'endTurn' });
    expect(defeat.phase).toBe('lost');
  });
});

describe('legal command sequences', () => {
  it('preserves board invariants and exact replay/forecast over varied deterministic runs', () => {
    let random = 0x5eed;
    for (const room of [0, 1, 2]) {
      let state = createBattle(room);
      for (let step = 0; step < 45 && state.phase === 'player'; step++) {
        const commands: Command[] = [{ type: 'endTurn' }];
        const heroes = Object.values(state.units).filter(u => u.team === 'heroes');
        const enemies = Object.values(state.units).filter(u => u.team === 'enemies');
        for (const hero of heroes) {
          for (const destination of reachable(state, hero.id)) commands.push({ type: 'move', actorId: hero.id, destination });
          if (hero.kind === 'ignis') {
            commands.push({ type: 'shield', actorId: hero.id });
            for (const enemy of enemies) commands.push({ type: 'bash', actorId: hero.id, targetId: enemy.id });
          } else if (hero.kind === 'kael') {
            for (const direction of ['N', 'E', 'S', 'W'] as const) commands.push({ type: 'shoot', actorId: hero.id, direction });
            for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) commands.push({ type: 'snare', actorId: hero.id, cell: { x, y } });
          } else if (hero.kind === 'lyra') {
            for (const enemy of enemies) commands.push({ type: 'swap', actorId: hero.id, firstId: hero.id, secondId: enemy.id });
            for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) commands.push({ type: 'lightning', actorId: hero.id, anchor: { x, y } });
          }
        }
        const legal = commands.filter(command => reduce(state, command).ok);
        expect(legal.length).toBeGreaterThan(0);
        random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
        const command = legal[random % legal.length];
        const before = copy(state);
        const result = reduce(state, command);
        expect(result).toEqual(reduce(copy(state), command));
        expect(state).toEqual(before);
        state = accepted(result);
        const occupied = Object.values(state.units).map(u => `${u.cell.x},${u.cell.y}`);
        expect(new Set(occupied).size).toBe(occupied.length);
        for (const actor of Object.values(state.units)) {
          expect(actor.hp).toBeGreaterThan(0);
          expect(actor.ap).toBeGreaterThanOrEqual(0);
          expect(state.board[actor.cell.y]?.[actor.cell.x]).toBe('floor');
          expect(Object.values(state.objects).some(o => o.hp > 0 && o.cell.x === actor.cell.x && o.cell.y === actor.cell.y)).toBe(false);
        }
        if (state.phase === 'player') {
          expect(forecast(state).state).toEqual(accepted(reduce(state, { type: 'endTurn' })));
        }
      }
    }
  });
});

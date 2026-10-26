import { describe, expect, it } from 'vitest';
import { createBattle, forecast, reduce } from '../src/core/engine';
import type { BattleState, Command } from '../src/core/model';
import { chooseRelic, freshSave, newRun, parseSave, settleBattle } from '../src/progression';
import recordedSolutions from './fixtures/campaign-solutions.json';

// These are legal recorded player commands, discovered offline by a bounded
// tactical search. CI replays them without a solver, altered HP, or skipped AI.
export const CAMPAIGN_SOLUTIONS = recordedSolutions as Command[][];

function replay(initial: BattleState, commands: Command[]): BattleState {
  let state = initial;
  for (const [index, command] of commands.entries()) {
    const before = JSON.stringify(state);
    const expected = command.type === 'endTurn' ? forecast(state).state : null;
    const result = reduce(state, command);
    if (!result.ok) throw new Error(`Action ${index} (${JSON.stringify(command)}) rejected: ${result.reason}`);
    expect(JSON.stringify(state)).toBe(before);
    state = result.state;
    if (expected) expect(state).toEqual(expected);
  }
  return state;
}

describe('recorded solutions prove the shipped campaign can be won', () => {
  for (let room = 0; room < 3; room++) {
    it(`wins room ${room + 1} at full starting HP without relics`, () => {
      const final = replay(createBattle(room), CAMPAIGN_SOLUTIONS[room]);
      expect(final.phase).toBe('won');
      expect(final.objects.obelisk.hp).toBe(6);
      expect(Object.values(final.units).filter(unit => unit.team === 'enemies')).toHaveLength(0);
      expect(Object.values(final.units).filter(unit => unit.team === 'heroes')).toHaveLength(3);
    });
  }

  it('wins a complete run through actual rewards, carried HP, and final settlement', () => {
    let save = newRun(freshSave());
    // Seed is chosen before the first action, not rerolled at reward screens.
    save.run!.seed = 1;
    const selected = ['teeth', 'lens'];
    for (let room = 0; room < 3; room++) {
      expect(save.run!.room).toBe(room);
      expect(save.run!.status).toBe('battle');
      if (room === 2) {
        // Lyra ended room 2 at 5 HP and naturally healed by 2 before this room.
        expect(save.run!.battle.units.lyra.hp).toBe(7);
      }
      save.run!.battle = replay(save.run!.battle, CAMPAIGN_SOLUTIONS[room]);
      save = settleBattle(save);
      expect(settleBattle(save)).toEqual(save);
      expect(parseSave(JSON.stringify(save))).toEqual(save);
      if (room < 2) {
        expect(save.run!.status).toBe('reward');
        expect(save.run!.offers).toContain(selected[room]);
        save = chooseRelic(save, selected[room]);
      }
    }
    expect(save.run!.status).toBe('won');
    expect(save.profile.echoes).toBe(5);
    expect(save.profile.completedRuns).toBe(1);
    expect(save.run!.relics).toEqual(selected);
    expect(save.run!.settledRooms).toEqual([0, 1, 2]);
    expect(save.run!.battle.units.kael.hp).toBe(6);
  });
});

import { step } from './game';
import type { GameEvent, GameState, Input } from './model';

/** Keep real-time speed independent of rendering, with bounded catch-up. */
export function advanceSimulation(state: GameState, input: Input, elapsed: number): GameEvent[] {
  if (!Number.isFinite(elapsed) || elapsed <= 0) return [];
  let remaining = Math.min(elapsed, 0.2);
  const events: GameEvent[] = [];
  let first = true;
  while (remaining > 1e-8) {
    const delta = Math.min(remaining, 1 / 60);
    const controls = first ? input : { ...input, interact: false, nextMission: false, reset: false };
    events.push(...step(state, controls, delta));
    first = false;
    remaining -= delta;
  }
  return events;
}

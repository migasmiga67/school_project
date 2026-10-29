import type { Point } from './model';

/** All stations are on the open south side of the existing poker table. */
export const CASINO_GAMES = {
  blackjack: { x: -7, z: 3 },
  roulette: { x: 7, z: 3 },
  tournament: { x: -7, z: -5 },
} satisfies Record<string, Point>;
export type CasinoStation = keyof typeof CASINO_GAMES;
export function casinoStationAt(point: Point): CasinoStation | null {
  return (Object.keys(CASINO_GAMES) as CasinoStation[]).find(kind => Math.hypot(point.x - CASINO_GAMES[kind].x, point.z - CASINO_GAMES[kind].z) <= 2.4) ?? null;
}

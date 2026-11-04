import { describe, expect, it } from 'vitest';
import { CasinoGames } from '../src/casino-games';
import { RoulettePlayback } from '../src/roulette-view';

function running() {
  const game=new CasinoGames(42);
  game.command({kind:'rouletteSpin',bet:20,choice:'red',version:0},1000,10000);
  return game;
}

describe('roulette presentation clock',()=>{
  it('never rewinds when RAF timestamps precede synchronous paints or a peer repeats an older snapshot',()=>{
    const game=running(),clock=new RoulettePlayback();
    clock.update(game.snapshot().roulette,1000);
    expect(clock.time(4100)).toBe(3100);
    expect(clock.time(4090)).toBe(3100);
    clock.update(game.snapshot().roulette,4110);
    expect(clock.time(4105)).toBe(3110);
    expect(clock.time(9000)).toBe(7200);
    expect(clock.time(15000)).toBe(7200);
  });
  it('resumes from authoritative progress, freezes settled poses, and resets only for a new spin',()=>{
    const game=running(),clock=new RoulettePlayback();
    game.update(13000);clock.update(game.snapshot().roulette,1000);
    expect(clock.time(1400)).toBe(3400);
    game.update(17200);clock.update(game.snapshot().roulette,1500);
    expect(clock.time(5000)).toBe(7200);
    game.command({kind:'rouletteSpin',bet:20,choice:'black',version:game.snapshot().version},1000,20000);
    clock.update(game.snapshot().roulette,6000);
    expect(clock.time(6050)).toBe(50);
  });
});

import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game';
import { advanceSimulation } from '../src/simulation';
import type { Input } from '../src/model';
const idle: Input = { throttle:false,brake:false,left:false,right:false,handbrake:false,boost:false,sprint:false,interact:false,nextMission:false,reset:false };

describe('render-independent simulation', () => {
 it('drives the same distance at 60 and 10 rendered frames per second', () => {
  const fast=createGame(),slow=createGame();
  for(let i=0;i<60;i++)advanceSimulation(fast,{...idle,throttle:true},1/60);
  for(let i=0;i<10;i++)advanceSimulation(slow,{...idle,throttle:true},.1);
  expect(slow.time).toBeCloseTo(1,8);
  expect(slow.player.z).toBeCloseTo(fast.player.z,8);
  expect(slow.vehicles[0].speed).toBeCloseTo(fast.vehicles[0].speed,8);
 });
 it('uses an interaction pulse once even when a frame has multiple simulation steps', () => {
  const state=createGame();
  advanceSimulation(state,{...idle,interact:true},.1);
  expect(state.player.mode).toBe('foot');
 });
 it('bounds catch-up and ignores nonfinite time without charging repeated recovery fees', () => {
  const state=createGame();
  advanceSimulation(state,{...idle,reset:true},10);
  expect(state.money).toBe(1150);
  expect(state.time).toBeCloseTo(.2,8);
  for(const elapsed of [NaN,Infinity,-1,0])advanceSimulation(state,idle,elapsed);
  expect(state.time).toBeCloseTo(.2,8);
 });
});

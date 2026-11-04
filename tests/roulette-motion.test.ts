import { describe,expect,it } from 'vitest';
import { createRouletteSpin,isRouletteSpin,rouletteMotion,rouletteNumberAtAngle,ROULETTE_POCKETS,ROULETTE_SPIN_MS,ROULETTE_STEP } from '../src/roulette-motion';

const TAU=Math.PI*2;
const clockwise=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
function spinAt(index:number){const values=[.4,(index+.5)/37,.6];return createRouletteSpin(1,()=>values.shift()!);}

describe('shared European roulette motion',()=>{
 it('uses the real clockwise single-zero pocket order, including angular wraparound',()=>{
  expect(ROULETTE_POCKETS).toEqual(clockwise);expect([...ROULETTE_POCKETS].sort((a,b)=>a-b)).toEqual(Array.from({length:37},(_,i)=>i));
  clockwise.forEach((number,index)=>{
   expect(rouletteNumberAtAngle(index*ROULETTE_STEP)).toBe(number);
   expect(rouletteNumberAtAngle(index*ROULETTE_STEP-4*TAU)).toBe(number);
   expect(rouletteNumberAtAngle(index*ROULETTE_STEP+3*TAU)).toBe(number);
  });
 });
 it('accelerates the wheel, orbits the ball in the opposite direction, and visibly drops it before rest',()=>{
  const spin=spinAt(12),pose=(fraction:number)=>rouletteMotion(spin,fraction*ROULETTE_SPIN_MS);
  const start=pose(0),early=pose(.03),later=pose(.06),cruise=pose(.30),slow=pose(.60),drop=pose(.77),captured=pose(.88),rest=pose(1);
  expect(start.phase).toBe('accelerating');expect(later.wheelAngle-early.wheelAngle).toBeGreaterThan(early.wheelAngle-start.wheelAngle);
  expect(cruise.phase).toBe('spinning');expect(cruise.wheelAngle).toBeGreaterThan(start.wheelAngle);expect(cruise.ballAngle).toBeLessThan(start.ballAngle);
  expect(slow.phase).toBe('slowing');expect(drop.phase).toBe('dropping');expect(drop.ballRadius).toBeLessThan(1.45);expect(drop.ballRadius).toBeGreaterThan(1);
  expect(captured.phase).toBe('settling');expect(captured.captured).toBe(true);
  expect(rest).toMatchObject({phase:'settled',ballRadius:1,ballHeight:0,captured:true});
  expect(pose(1.5)).toEqual(rest);expect(pose(-1)).toEqual(start);
  expect(rest.wheelAngle-pose(.99).wheelAngle).toBeLessThan(.001);
 });
 it('lands at the centre of every possible pocket and stays with that pocket as the wheel stops',()=>{
  for(let index=0;index<37;index++){
   const spin=spinAt(index);expect(isRouletteSpin(spin)).toBe(true);
   const final=rouletteMotion(spin,spin.durationMs),relative=((final.ballAngle-final.wheelAngle)%TAU+TAU)%TAU;
   expect(Math.min(Math.abs(relative-index*ROULETTE_STEP),Math.abs(relative-index*ROULETTE_STEP-TAU))).toBeLessThan(1e-12);
   expect(rouletteNumberAtAngle(relative)).toBe(clockwise[index]);
   for(const fraction of [.84,.88,.94,.99]){
    const pose=rouletteMotion(spin,fraction*spin.durationMs);
    expect(rouletteNumberAtAngle(pose.ballAngle-pose.wheelAngle)).toBe(clockwise[index]);
   }
  }
 });
 it('resumes the same pose at any frame rate and starts the next spin at the previous landing',()=>{
  const spin=spinAt(5),at=rouletteMotion(spin,3871);
  for(let elapsed=0;elapsed<3871;elapsed+=17)rouletteMotion(spin,elapsed);
  expect(rouletteMotion(spin,3871)).toEqual(at);
  const next=createRouletteSpin(2,()=>.5,spin),prior=rouletteMotion(spin,spin.durationMs),start=rouletteMotion(next,0);
  expect(rouletteNumberAtAngle(start.ballAngle-start.wheelAngle)).toBe(rouletteNumberAtAngle(prior.ballAngle-prior.wheelAngle));
  expect(isRouletteSpin({...spin,durationMs:1})).toBe(false);expect(isRouletteSpin({...spin,ballTravel:Infinity})).toBe(false);expect(isRouletteSpin({...spin,ballTravel:spin.ballTravel+.03})).toBe(false);expect(isRouletteSpin({...spin,id:0})).toBe(false);
 });
});

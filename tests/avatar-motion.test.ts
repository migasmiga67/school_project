import {describe,expect,it} from 'vitest';
import {AvatarMotion} from '../src/avatar-motion';

describe('blended character movement',()=>{
 it('accelerates a walking stride and lets it settle instead of snapping between poses',()=>{
  const motion=new AvatarMotion(),first=motion.update(true,0,{speed:3.2,dt:1/60});
  expect(first.strideWeight).toBeGreaterThan(0);expect(first.strideWeight).toBeLessThan(.2);
  let steady=first;for(let frame=1;frame<=90;frame++)steady=motion.update(true,frame/60,{speed:3.2,dt:1/60});
  expect(steady.speed).toBeCloseTo(3.2,3);expect(steady.strideWeight).toBeGreaterThan(.99);
  const slowing=motion.update(false,91/60,{dt:1/60});expect(slowing.strideWeight).toBeGreaterThan(.5);expect(slowing.speed).toBeLessThan(steady.speed);
  for(let frame=92;frame<=210;frame++)motion.update(false,frame/60,{dt:1/60});
  expect(motion.snapshot.strideWeight).toBeLessThan(.001);expect(Math.abs(motion.snapshot.leftLeg)).toBeLessThan(.001);
 });
 it('gives sprinting a faster cadence, longer stride and stronger forward lean',()=>{
  const walking=new AvatarMotion(),running=new AvatarMotion();
  for(let frame=0;frame<=120;frame++){walking.update(true,frame/60,{speed:3.2,dt:1/60});running.update(true,frame/60,{speed:6,dt:1/60});}
  expect(running.snapshot.cadence).toBeGreaterThan(walking.snapshot.cadence+.8);expect(running.snapshot.lean).toBeGreaterThan(walking.snapshot.lean+.07);
  expect(running.snapshot.speed).toBeCloseTo(6,3);
 });
 it('turns along the short arc through the angle boundary and eases head/body anticipation',()=>{
  const motion=new AvatarMotion();motion.update(true,0,{heading:Math.PI-.05,dt:1/60});
  const turn=motion.update(true,1/60,{heading:-Math.PI+.05,dt:1/60});
  expect(Math.abs(turn.yawOffset)).toBeLessThan(.11);expect(Math.abs(turn.yawOffset)).toBeGreaterThan(.01);
  expect(Math.abs(turn.headYaw)).toBeGreaterThan(Math.abs(turn.torsoYaw));
  for(let frame=2;frame<90;frame++)motion.update(true,frame/60,{heading:-Math.PI+.05,dt:1/60});
  expect(Math.abs(motion.snapshot.yawOffset)).toBeLessThan(.001);
 });
 it('has breathing and relaxed arms while standing without making the feet walk',()=>{
  const motion=new AvatarMotion();const a=motion.update(false,0,{dt:1/60});
  for(let frame=1;frame<60;frame++)motion.update(false,frame/60,{dt:1/60});
  const b=motion.snapshot;expect(b.leftLeg).toBe(0);expect(b.rightLeg).toBe(0);expect(b.bob).not.toBe(a.bob);expect(b.leftArm).not.toBe(a.leftArm);
 });
 it('keeps the acceleration blend independent of render frequency and pauses at zero dt',()=>{
  const slow=new AvatarMotion(),fast=new AvatarMotion();
  for(let frame=0;frame<30;frame++)slow.update(true,frame/30,{dt:1/30,speed:6});
  for(let frame=0;frame<120;frame++)fast.update(true,frame/120,{dt:1/120,speed:6});
  expect(slow.snapshot.speed).toBeCloseTo(fast.snapshot.speed,8);expect(slow.snapshot.strideWeight).toBeCloseTo(fast.snapshot.strideWeight,8);
  const before=slow.snapshot;slow.update(true,99,{dt:0,speed:6});expect(slow.snapshot).toEqual(before);
 });
 it('never produces NaN poses after invalid input or backwards clocks',()=>{
  const motion=new AvatarMotion();for(const seconds of[2,1,NaN,Infinity,-50]){const pose=motion.update(true,seconds,{dt:NaN,speed:Infinity,heading:NaN});expect(Object.values(pose).every(Number.isFinite)).toBe(true);}
 });
});

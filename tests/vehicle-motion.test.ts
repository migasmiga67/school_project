import {describe,expect,it} from 'vitest';
import {createVehicleMotion,stepVehicleMotion} from '../src/vehicle-motion';

const input={speed:0,steer:0,heading:0};
function drive(fps:number,seconds:number,sample:(seconds:number)=>typeof input){
 let motion=createVehicleMotion();
 for(let frame=0;frame<fps*seconds;frame++)motion=stepVehicleMotion(motion,sample((frame+1)/fps),1/fps);
 return motion;
}
describe('vehicle presentation motion',()=>{
 it('steers stationary tyres progressively in the correct direction while the body stays settled',()=>{
  let motion=createVehicleMotion(),prior=0;
  for(let frame=0;frame<60;frame++){
   motion=stepVehicleMotion(motion,{...input,steer:1},1/60);
   expect(motion.steering).toBeLessThan(prior);expect(motion.steering).toBeGreaterThanOrEqual(-.48);prior=motion.steering;
   expect(motion.wheelRotation).toBe(0);expect(motion.roll).toBe(0);expect(motion.pitch).toBe(0);
  }
  expect(motion.steering).toBeCloseTo(-.48,4);
 });
 it('rolls tyres by signed travelled distance independently of rendering frame rate',()=>{
  for(const speed of [12,-6]){
   const slow=drive(30,2,()=>({...input,speed})),fast=drive(120,2,()=>({...input,speed}));
   expect(slow.wheelRotation).toBeCloseTo(speed*2/.42,8);expect(fast.wheelRotation).toBeCloseTo(slow.wheelRotation,8);
  }
 });
 it('keeps steering response stable across frame rates and returns smoothly to centre',()=>{
  const slow=drive(30,1,()=>({...input,steer:-1})),fast=drive(120,1,()=>({...input,steer:-1}));
  expect(slow.steering).toBeCloseTo(fast.steering,8);
  let returned=slow;
  for(let i=0;i<120;i++)returned=stepVehicleMotion(returned,input,1/60);
  expect(Math.abs(returned.steering)).toBeLessThan(.0001);
 });
 it('dips the nose and illuminates brake lamps during forward and reverse deceleration',()=>{
  for(const direction of [-1,1]){
   let motion=stepVehicleMotion(createVehicleMotion(),{...input,speed:direction*20},1/60);
   for(let frame=1;frame<=30;frame++)motion=stepVehicleMotion(motion,{...input,speed:direction*(20-frame/3)},1/60);
   expect(motion.braking).toBeGreaterThan(.9);expect(Math.sign(motion.pitch)).toBe(-direction);
   for(let frame=0;frame<180;frame++)motion=stepVehicleMotion(motion,{...input,speed:direction*10},1/60);
   expect(motion.braking).toBeLessThan(.001);expect(Math.abs(motion.pitch)).toBeLessThan(.001);
  }
 });
 it('leans outside a moving turn and infers front wheel steering for ambient cars',()=>{
  const motion=drive(60,1,time=>({...input,speed:15,heading:time*.6}));
  expect(motion.roll).toBeGreaterThan(.03);expect(motion.steering).toBeLessThan(0);expect(motion.yaw).toBeGreaterThan(0);
  const wrapped=stepVehicleMotion({...motion,previousHeading:Math.PI-.01},{...input,speed:15,heading:-Math.PI+.01},1/60);
  expect(wrapped.roll).toBeGreaterThan(0);
 });
 it('leaves brake lamps off while the car simply coasts',()=>{
  let speed=30,motion=stepVehicleMotion(createVehicleMotion(),{...input,speed},1/60);
  for(let frame=0;frame<60;frame++){
   speed-=(3.6+speed*.12)/60;motion=stepVehicleMotion(motion,{...input,speed},1/60);
  }
  expect(motion.braking).toBe(0);
 });
 it('leaves state and inputs untouched and survives invalid or paused frame timing',()=>{
  const state=Object.freeze(createVehicleMotion()),sample=Object.freeze({...input,speed:10});
  expect(stepVehicleMotion(state,sample,0)).toEqual(state);
  const next=stepVehicleMotion(state,sample,1/60);expect(state.initialized).toBe(false);expect(next.initialized).toBe(true);
  const invalid=stepVehicleMotion(next,{speed:NaN,steer:Infinity,heading:NaN},NaN);
  expect(Object.values(invalid).every(value=>typeof value!=='number'||Number.isFinite(value))).toBe(true);
 });
});

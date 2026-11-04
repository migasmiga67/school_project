import {describe,expect,it} from 'vitest';
import {surfaceWeatherProfile} from '../src/surface-weather';

describe('shared wet surface response',()=>{
 it('darkens porous roads and fills their grain as a rain film becomes smoother',()=>{
  let previous=surfaceWeatherProfile(0,1);
  for(let step=1;step<=20;step++){
   const current=surfaceWeatherProfile(step/20,1);
   expect(current.roadTint).toBeLessThanOrEqual(previous.roadTint);
   expect(current.roadRoughness).toBeLessThanOrEqual(previous.roadRoughness);
   expect(current.roadNormalScale).toBeLessThanOrEqual(previous.roadNormalScale);
   expect(current.reflectionIntensity).toBeGreaterThanOrEqual(previous.reflectionIntensity);
   expect(current.masonryTint).toBeGreaterThan(current.roadTint);
   expect(current.roadRoughness).toBeGreaterThan(.15);
   previous=current;
  }
  expect(previous.roadRoughness).toBeLessThan(.3);
  expect(previous.masonryRoughness).toBeGreaterThan(previous.roadRoughness);
 });
 it('keeps weather and wetness identical when lowering texture detail',()=>{
  const high=surfaceWeatherProfile(.75,.3,'high'),low=surfaceWeatherProfile(.75,.3,'low');
  expect(low.detail).toBe(false);expect(high.detail).toBe(true);
  expect({...low,detail:true}).toEqual(high);
 });
 it('reduces reflected sky energy at night without changing the accepted rain',()=>{
  const day=surfaceWeatherProfile(.8,1),night=surfaceWeatherProfile(.8,0);
  expect(night.rain).toBe(day.rain);expect(night.wetness).toBe(day.wetness);
  expect(night.reflectionIntensity).toBeLessThan(day.reflectionIntensity);
  expect(night.glassRoughness).toBe(day.glassRoughness);
 });
 it('clamps malformed environment values to finite usable material parameters',()=>{
  for(const rain of[-8,2,NaN,Infinity])for(const daylight of[-2,5,NaN,Infinity]){
   const profile=surfaceWeatherProfile(rain,daylight);
   for(const value of Object.values(profile))if(typeof value==='number')expect(Number.isFinite(value)).toBe(true);
   expect(profile.rain).toBeGreaterThanOrEqual(0);expect(profile.rain).toBeLessThanOrEqual(1);
   expect(profile.daylight).toBeGreaterThanOrEqual(0);expect(profile.daylight).toBeLessThanOrEqual(1);
   expect(profile.roadTint).toBeGreaterThan(0);expect(profile.roadTint).toBeLessThanOrEqual(1);
  }
  expect(surfaceWeatherProfile(NaN,NaN)).toEqual(surfaceWeatherProfile(0,1));
 });
});

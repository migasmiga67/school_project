import {describe,expect,it} from 'vitest';
import {graphicsProfile,parseGraphicsQuality} from '../src/graphics';

describe('graphics resource budgets',()=>{
 it('keeps software rendering free of real-time shadows and spot lights at every preset',()=>{
  const profiles=(['low','medium','high'] as const).map(q=>graphicsProfile(q,true,1440,900,2));
  for(const p of profiles){expect(p.shadows).toBe(false);expect(p.headlightBudget).toBe(0);expect(p.pixelRatio).toBeLessThanOrEqual(.85);}
  expect(profiles[2].viewDistance).toBeGreaterThan(profiles[0].viewDistance);
  expect(profiles[2].pixelRatio).toBeGreaterThan(profiles[0].pixelRatio);
 });
 it('bounds the drawing buffer on 4K/high-DPI displays while increasing visible detail',()=>{
  for(const software of [true,false])for(const q of ['low','medium','high'] as const){
   const p=graphicsProfile(q,software,3840,2160,3);
   expect(3840*2160*p.pixelRatio**2).toBeLessThanOrEqual(software?900001:2800001);
   expect(p.pixelRatio).toBeGreaterThan(0);expect(p.fogFar).toBeLessThan(p.viewDistance);expect(p.fogNear).toBeLessThan(p.fogFar);
  }
  const low=graphicsProfile('low',false,1440,900),high=graphicsProfile('high',false,1440,900);
  expect(high.shadows).toBe(true);expect(high.headlightBudget).toBe(4);expect(low.shadows).toBe(false);expect(low.headlightBudget).toBe(0);
 });
 it('chooses a safe automatic profile and ignores invalid stored values',()=>{
  expect(graphicsProfile('auto',true,1440,900).resolved).toBe('low');
  expect(graphicsProfile('auto',false,390,844).resolved).toBe('medium');
  expect(graphicsProfile('auto',false,1440,900).resolved).toBe('high');
  for(const value of [null,{},'ultra',42])expect(parseGraphicsQuality(value)).toBe('auto');
  expect(parseGraphicsQuality('high')).toBe('high');
 });
});

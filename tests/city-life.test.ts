import { describe,expect,it } from 'vitest';
import { BUILDINGS } from '../src/model';
import { cityEventAt,getCityEnvironment,pedestrianPose,PEDESTRIAN_COUNT } from '../src/city-life';

describe('shared city clock and opportunities',()=>{
  it('starts at18:42, completes a day in720seconds and stays finite on invalid input',()=>{
    const start=getCityEnvironment(0);
    expect(start.clock).toBe('18:42');expect(start.period).toBe('ZACHÓD SŁOŃCA');
    expect(getCityEnvironment(720).clock).toBe(start.clock);
    expect(getCityEnvironment(180).period).toBe('NOC');
    for(const seconds of [-1,NaN,Infinity])expect(getCityEnvironment(seconds)).toEqual(start);
  });
  it('fades deterministic rain every three minutes and never exceeds valid intensity',()=>{
    expect(getCityEnvironment(179).rain).toBe(0);expect(getCityEnvironment(195).rain).toBe(1);
    expect(getCityEnvironment(350).rain).toBeCloseTo(2/3);expect(getCityEnvironment(360).rain).toBe(0);
    for(let seconds=0;seconds<1500;seconds+=7){const e=getCityEnvironment(seconds);expect(e.rain).toBeGreaterThanOrEqual(0);expect(e.rain).toBeLessThanOrEqual(1);expect(e.daylight).toBeGreaterThanOrEqual(0);expect(e.daylight).toBeLessThanOrEqual(1);}
  });
  it('keeps event ids stable during a window, expires exactly and gives each new window a unique id',()=>{
    const first=cityEventAt(0)!;
    expect(first).toMatchObject({id:'city-0-package',target:{x:-40,z:40},reward:150,expiresAt:40});
    expect(cityEventAt(39.999)).toEqual(first);expect(cityEventAt(40)).toBeNull();expect(cityEventAt(119.99)).toBeNull();
    expect(cityEventAt(120)).toMatchObject({id:'city-1-roadside',reward:180,expiresAt:160});
    expect(cityEventAt(360)?.id).toBe('city-3-package');
    first.target.x=999;expect(cityEventAt(1)?.target.x).toBe(-40);
  });
  it('places opportunities and pedestrians outside building footprints across a full route',()=>{
    for(const seconds of [0,120,240]){
      const target=cityEventAt(seconds)!.target;
      expect(BUILDINGS.some(b=>Math.abs(target.x-b.x)<b.halfX&&Math.abs(target.z-b.z)<b.halfZ)).toBe(false);
    }
    for(let i=0;i<PEDESTRIAN_COUNT;i++)for(let seconds=0;seconds<150;seconds+=3){
      const p=pedestrianPose(i,seconds);
      expect(BUILDINGS.some(b=>Math.abs(p.x-b.x)<b.halfX+.55&&Math.abs(p.z-b.z)<b.halfZ+.55)).toBe(false);
      expect(p.heading).toBeGreaterThanOrEqual(-Math.PI);expect(p.heading).toBeLessThanOrEqual(Math.PI);
    }
  });
});

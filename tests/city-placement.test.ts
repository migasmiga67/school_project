import {describe,expect,it} from 'vitest';
import {CITY_BUILDINGS,CITY_JUNCTIONS,CITY_STREETS} from '../src/city-map';
import {CITY_ACCESS_CLEARANCES,CITY_BENCH_PLACEMENTS,CITY_CROSSWALK_FOOTPRINTS,CITY_STREET_SIGN_PLACEMENTS,canPlaceDecoration,decorationBlocker,decorationWalkingClearance,findStreetDecoration,footprintCorners,footprintDistanceToSegment,type DecorationFootprint,type PlacementContext} from '../src/city-placement';
import {AMBIENT_PEDESTRIAN_ROUTES} from '../src/traffic-flow';

const empty:PlacementContext={streets:[],buildings:[],junctions:[]};
const roadContext:PlacementContext={...empty,streets:[{width:8,points:[{x:-30,z:0},{x:30,z:0}]}]};

describe('complete street furniture footprints',()=>{
  it('rejects a rotated bench end inside a road although its centre is clear',()=>{
    const bench={x:0,z:6.4,width:8,depth:.6,rotation:Math.PI/4};
    expect(bench.z).toBeGreaterThan(roadContext.streets[0].width/2+.35);
    expect(decorationBlocker(bench,roadContext)).toBe('road');
    expect(canPlaceDecoration({...bench,z:9},roadContext)).toBe(true);
  });
  it('checks secondary crossing streets and segments crossing an entire rectangle',()=>{
    const bench={x:7,z:6,width:4,depth:.6};
    expect(canPlaceDecoration(bench,roadContext)).toBe(true);
    const crossing={...roadContext,streets:[...roadContext.streets,{width:4,points:[{x:10,z:-20},{x:10,z:20}]}]};
    expect(decorationBlocker(bench,crossing)).toBe('road');
    expect(footprintDistanceToSegment({x:0,z:0,width:12,depth:1},{x:0,z:-10},{x:0,z:10})).toBe(0);
  });
  it('keeps sharp ribbon miters and residential turning bulbs clear',()=>{
    const corner={...empty,streets:[{width:8,points:[{x:-20,z:0},{x:0,z:0},{x:0,z:20}]}]};
    expect(decorationBlocker({x:3.8,z:-3.8,width:.2,depth:.2},corner)).toBe('road');
    expect(canPlaceDecoration({x:7,z:-7,width:.2,depth:.2},corner)).toBe(true);
    const close={...empty,streets:[{width:8,kind:'residential' as const,points:[{x:-20,z:0},{x:0,z:0}]}]};
    expect(decorationBlocker({x:5,z:0,width:.2,depth:.2},close)).toBe('road');
  });
  it('protects the complete intersection and crossing apron, beyond the object centre',()=>{
    const context={...empty,junctions:[{x:0,z:0,radius:5,degree:3}]};
    expect(decorationBlocker({x:10,z:0,width:6,depth:.7},context)).toBe('junction');
    expect(canPlaceDecoration({x:12,z:0,width:6,depth:.7},context)).toBe(true);
  });
  it('checks rotated corners against buildings, access areas, neighbours and map edges',()=>{
    const bench={x:5,z:5,width:6,depth:.7,rotation:Math.PI/4};
    expect(decorationBlocker(bench,{...empty,buildings:[{x:7,z:3,halfX:.8,halfZ:.8}]})).toBe('building');
    expect(decorationBlocker(bench,{...empty,accessAreas:[{x:7,z:3,radius:.6}]})).toBe('access');
    expect(decorationBlocker(bench,{...empty,occupied:[{x:7,z:3,width:.5,depth:1}]})).toBe('occupied');
    expect(decorationBlocker(bench,{...empty,bounds:{minX:0,maxX:6,minZ:0,maxZ:10}})).toBe('bounds');
    expect(decorationBlocker({...bench,width:NaN},empty)).toBe('invalid');
  });
  it('places actual benches and street signs outside every road, crossing, building and doorway',()=>{
    expect(CITY_BENCH_PLACEMENTS.length).toBeGreaterThan(20);expect(CITY_STREET_SIGN_PLACEMENTS.length).toBeGreaterThan(10);
    for(const footprint of[...CITY_BENCH_PLACEMENTS,...CITY_STREET_SIGN_PLACEMENTS]){
      expect(canPlaceDecoration(footprint),footprint.id).toBe(true);
      for(const street of CITY_STREETS)for(let index=1;index<street.points.length;index++)expect(footprintDistanceToSegment(footprint,street.points[index-1],street.points[index]),`${footprint.id} / ${street.id}`).toBeGreaterThanOrEqual(street.width/2+.35-1e-6);
    }
    const all=[...CITY_BENCH_PLACEMENTS,...CITY_STREET_SIGN_PLACEMENTS];for(let i=0;i<all.length;i++)expect(canPlaceDecoration(all[i],{...empty,occupied:all.slice(0,i)}),all[i].id).toBe(true);
    for(const access of CITY_ACCESS_CLEARANCES)expect(canPlaceDecoration({...access,width:.2,depth:.2},{...empty,accessAreas:CITY_ACCESS_CLEARANCES})).toBe(false);
    expect(CITY_BUILDINGS.length).toBeGreaterThan(50);expect(CITY_JUNCTIONS.some(j=>j.degree>=3)).toBe(true);
  });
  it('searches deterministically and retains complete bench dimensions and orientation',()=>{
    const street=CITY_STREETS.find(street=>street.id==='westwood-boulevard')!;
    const occupied:DecorationFootprint[]=[];
    const first=findStreetDecoration(street,35,2.8,.8,{occupied});
    expect(first).not.toBeNull();expect(findStreetDecoration(street,35,2.8,.8,{occupied})).toEqual(first);expect(occupied).toEqual([]);
    expect(first).toMatchObject({width:2.8,depth:.8});
    const corners=footprintCorners(first!);expect(Math.hypot(corners[1].x-corners[0].x,corners[1].z-corners[0].z)).toBeCloseTo(2.8);
    expect(Math.hypot(corners[2].x-corners[1].x,corners[2].z-corners[1].z)).toBeCloseTo(.8);
  });
  it('moves furniture outside a narrow sidewalk walking lane or omits it when a facade blocks that space',()=>{
    const street={...CITY_STREETS[0],width:8,sidewalkWidth:1.5,points:[{x:-30,z:0},{x:30,z:0}]};
    const context={...empty,streets:[street]};
    const oldBench={x:0,z:5.02,width:2.8,depth:.8};
    expect(canPlaceDecoration(oldBench,context)).toBe(true);
    expect(decorationBlocker(oldBench,context,{walkingPadding:.55})).toBe('walkway');
    const bench=findStreetDecoration(street,30,2.8,.8,{context,walkingPadding:.55,searchDistance:0});
    expect(bench).not.toBeNull();expect(decorationWalkingClearance(bench!,[street])).toBeGreaterThanOrEqual(.55-1e-6);
    const blocked={...context,buildings:[{x:0,z:7,halfX:10,halfZ:1.4},{x:0,z:-7,halfX:10,halfZ:1.4}]};
    expect(findStreetDecoration(street,30,2.8,.8,{context:blocked,walkingPadding:.55,searchDistance:0})).toBeNull();
  });
  it('keeps every actual pedestrian path and complete painted crossing clear of bench ends',()=>{
    expect(AMBIENT_PEDESTRIAN_ROUTES.length).toBeGreaterThan(20);expect(CITY_CROSSWALK_FOOTPRINTS.length).toBeGreaterThan(30);
    for(const bench of CITY_BENCH_PLACEMENTS){
      let pedestrianClearance=Infinity;
      for(const route of AMBIENT_PEDESTRIAN_ROUTES)for(let index=1;index<route.points.length;index++){
        pedestrianClearance=Math.min(pedestrianClearance,footprintDistanceToSegment(bench,route.points[index-1],route.points[index]));
      }
      expect(pedestrianClearance,bench.id).toBeGreaterThanOrEqual(.55-1e-6);
      expect(canPlaceDecoration(bench,{...empty,crossings:CITY_CROSSWALK_FOOTPRINTS}),bench.id).toBe(true);
      expect(canPlaceDecoration(bench,{...empty,junctions:CITY_JUNCTIONS},{junctionPadding:4}),bench.id).toBe(true);
    }
  });
});

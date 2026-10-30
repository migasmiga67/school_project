import { describe,expect,it } from 'vitest';
import { activeVehicle,createGame,step,synchronizeOnlineTraffic } from '../src/game';
import { BUILDINGS,NATURAL_BLOCKS,ROAD_NODES,ROAD_X,ROAD_Z,ROADS,WORLD_BOUNDS,type GameState,type Input,type Point } from '../src/model';
import { DOCK,WATER_BOUNDS } from '../src/mobility';
import { getPhoneDeliveryPoint } from '../src/phone';
import { RoomAuthority } from '../src/room-authority';
import { MAP_AREA_RATIO,WORLD_LANDMARKS,districtAt } from '../src/world-layout';

const idle:Input={throttle:false,brake:false,left:false,right:false,handbrake:false,boost:false,sprint:false,interact:false,nextMission:false,reset:false};
const occupied=(point:Point,radius=0)=>BUILDINGS.some(building=>Math.abs(point.x-building.x)<building.halfX+radius&&Math.abs(point.z-building.z)<building.halfZ+radius);
function advance(state:GameState,seconds:number,input:Partial<Input>={}){for(let i=0;i<Math.ceil(seconds*30);i++)step(state,{...idle,...input},1/30);}
function emptyCity(){const state=createGame();state.vehicles=[activeVehicle(state)!];state.mission.active=false;state.mission.waypoint=null;return state;}

describe('larger connected city',()=>{
 it('preserves the original blocks and missions while adding a connected grid more than three times larger',()=>{
  const original=ROADS.slice(0,-1).flatMap((x,ix)=>ROADS.slice(0,-1).filter((_,iz)=>ix!==1||iz!==1).map(z=>({x:x+20,z:z+20,halfX:12,halfZ:12})));
  expect(BUILDINGS.slice(0,15)).toEqual(original);expect(MAP_AREA_RATIO).toBeGreaterThan(3.5);expect(BUILDINGS).toHaveLength(67);
  expect(new Set(ROAD_NODES.map(point=>`${point.x},${point.z}`)).size).toBe(ROAD_X.length*ROAD_Z.length);
  for(const point of ROAD_NODES)expect(occupied(point,1.5)).toBe(false);
  for(const point of NATURAL_BLOCKS)expect(occupied(point)).toBe(false);
  for(const landmark of WORLD_LANDMARKS){expect(ROAD_NODES).toContainEqual(landmark.point);expect(occupied(landmark.point,1.5)).toBe(false);expect(districtAt(landmark.point)).not.toBe('Downtown');}
 });
 it('lets pedestrians and drivers cross the former map edges on actual open streets',()=>{
  const foot=emptyCity();Object.assign(foot.player,{mode:'foot',vehicleId:null,x:-92,z:40});advance(foot,30,{throttle:true,viewHeading:-Math.PI/2});
  expect(foot.player.x).toBeLessThan(-180);expect(foot.player.x).toBeGreaterThan(WORLD_BOUNDS.minX);expect(foot.player.z).toBeCloseTo(40);
  const driving=emptyCity(),car=activeVehicle(driving)!;Object.assign(car,{x:0,z:-90,heading:0});Object.assign(driving.player,{x:0,z:-90,heading:0});advance(driving,5,{throttle:true});
  expect(car.z).toBeLessThan(-180);expect(car.z).toBeGreaterThanOrEqual(WORLD_BOUNDS.minZ+1.5);expect(car.health).toBe(100);
 });
 it('makes the new building footprints solid rather than allowing movement through scenery',()=>{
  const state=emptyCity();Object.assign(state.player,{mode:'foot',vehicleId:null,x:-160,z:-140});advance(state,8,{right:true});
  expect(state.player.x).toBeGreaterThan(-160);expect(state.player.x).toBeLessThanOrEqual(-152.5);expect(occupied(state.player,.5)).toBe(false);
 });
 it('routes pursuing police around new blocks and places roadblocks on the expanded street grid',()=>{
  const pursuit=emptyCity();Object.assign(pursuit.player,{mode:'foot',vehicleId:null,x:-160,z:-140});pursuit.wanted=1;
  const cop={...pursuit.vehicles[0],id:'extension-cop',kind:'police' as const,x:-200,z:-140,speed:0,parked:false};pursuit.police=[cop];
  for(let i=0;i<150;i++){step(pursuit,idle,1/30);expect(occupied(cop,1.4)).toBe(false);}
  expect(cop.x).toBeGreaterThan(-170);expect(Math.hypot(cop.x-pursuit.player.x,cop.z-pursuit.player.z)).toBeLessThan(15);
  const blocked=emptyCity();Object.assign(blocked.player,{mode:'foot',vehicleId:null,x:-160,z:-140});blocked.wanted=2;step(blocked,idle,1/30);
  expect(blocked.police).toHaveLength(2);expect(blocked.police.every(car=>Math.abs(car.x)>98||Math.abs(car.z)>98)).toBe(true);
  const block=blocked.pursuit!.roadblocks[0];expect(block).toBeDefined();expect(ROAD_NODES).toContainEqual({x:block.x,z:block.z});expect(occupied(block,1.4)).toBe(false);
 });
 it('supports sailing far beyond the former water limit while keeping the boat in the expanded bay',()=>{
  const state=createGame(),boat=state.vehicles.find(vehicle=>vehicle.kind==='boat')!;
  Object.assign(boat,{x:280,z:180,heading:Math.PI/2,speed:20});Object.assign(state.player,{x:280,z:180,heading:Math.PI/2,mode:'drive',vehicleId:boat.id});state.mission.active=false;advance(state,3,{throttle:true});
  expect(boat.x).toBeGreaterThan(300);expect(boat.x).toBeLessThanOrEqual(WATER_BOUNDS.maxX-1.4);expect(boat.z).toBeGreaterThan(92);expect(boat.z).toBeLessThanOrEqual(WATER_BOUNDS.maxZ);
 });
 it('adds moving traffic in all three extensions without altering the original traffic clocks',()=>{
  const state=createGame();synchronizeOnlineTraffic(state,0);
  const original=state.vehicles.filter(vehicle=>/^traffic-[0-7]$/.test(vehicle.id)).map(vehicle=>({id:vehicle.id,x:vehicle.x,z:vehicle.z}));
  expect(original).toEqual([{id:'traffic-0',x:-30,z:-80},{id:'traffic-1',x:-40,z:36},{id:'traffic-2',x:80,z:-72},{id:'traffic-3',x:18,z:40},{id:'traffic-4',x:80,z:46},{id:'traffic-5',x:40,z:0},{id:'traffic-6',x:-4,z:80},{id:'traffic-7',x:18,z:-40}]);
  expect(state.vehicles.filter(vehicle=>vehicle.id.startsWith('traffic-'))).toHaveLength(16);
  for(let time=0;time<=120;time+=4){synchronizeOnlineTraffic(state,time);for(const vehicle of state.vehicles.filter(vehicle=>/^traffic-(?:[89]|1[0-5])$/.test(vehicle.id))){expect(Math.abs(vehicle.x)>98||Math.abs(vehicle.z)>98).toBe(true);expect(occupied(vehicle,1.5)).toBe(false);}}
  synchronizeOnlineTraffic(state,0);expect(state.vehicles.filter(vehicle=>/^traffic-[0-7]$/.test(vehicle.id)).map(vehicle=>({id:vehicle.id,x:vehicle.x,z:vehicle.z}))).toEqual(original);
 });
 it('finds safe nearby delivery streets throughout every new district',()=>{
  for(const player of [...WORLD_LANDMARKS.map(landmark=>landmark.point),{x:-210,z:205},{x:90,z:-207}]){
   const target=getPhoneDeliveryPoint(player);expect(target).not.toBeNull();if(!target)continue;
   expect(ROAD_X.includes(target.x)||ROAD_Z.includes(target.z)).toBe(true);expect(occupied(target,2)).toBe(false);
   expect(Math.hypot(target.x-player.x,target.z-player.z)).toBeGreaterThanOrEqual(4.5);expect(Math.hypot(target.x-player.x,target.z-player.z)).toBeLessThanOrEqual(20);
  }
 });
 it('accepts online driving, phone delivery and traffic claims in the extensions while rejecting positions outside new bounds',()=>{
  const room=new RoomAuthority('ABCDEFGH','host','Gospodarz');room.tick(0);
  const pose={x:-200,z:160,heading:0,mode:'foot' as const,interior:null,seated:false,vehicle:null};
  expect(room.command('host',{type:'pose',pose},0).ok).toBe(true);expect(room.command('host',{type:'phone',action:{kind:'requestCar'}},1).ok).toBe(true);
  expect(room.snapshot('host').wallet).toBe(1200);expect(room.snapshot('host').deliveryEffect.target!.x).toBeLessThan(-96);
  const car={id:'traffic-15',kind:'sedan' as const,x:-160,z:200,heading:0,speed:0,color:0xffffff,health:100};
  expect(room.command('host',{type:'pose',pose:{...pose,x:car.x,z:car.z,mode:'drive',vehicle:car}},2).ok).toBe(true);
  expect(room.snapshot('host').vehicles.find(vehicle=>vehicle.id==='traffic-15')).toMatchObject({x:-160,z:200});
  expect(room.command('host',{type:'pose',pose:{...pose,x:WORLD_BOUNDS.minX-1}},3).ok).toBe(false);
  expect(room.command('host',{type:'pose',pose:{...pose,...DOCK.land}},4).ok).toBe(true);
  const boat={id:'boat-1',kind:'boat' as const,...DOCK.mooring,heading:0,speed:0,color:0xffffff,health:100};
  expect(room.command('host',{type:'pose',pose:{...pose,...DOCK.mooring,mode:'drive',vehicle:boat}},5).ok).toBe(true);
  const farBoat={...boat,x:300,z:190};expect(room.command('host',{type:'pose',pose:{...pose,x:300,z:190,mode:'drive',vehicle:farBoat}},6).ok).toBe(true);
  expect(room.snapshot('host').members.find(member=>member.id==='host')!.pose).toMatchObject({x:300,z:190});
  expect(room.command('host',{type:'pose',pose:{...pose,x:WATER_BOUNDS.maxX+1,z:190,mode:'drive',vehicle:{...farBoat,x:WATER_BOUNDS.maxX+1}}},7).ok).toBe(false);
 });
});

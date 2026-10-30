import { BUILDINGS, ROAD_X, ROAD_Z, ROAD_NODES, WORLD_BOUNDS } from './model';
import { CASINO } from './casino-location';
import { BIKE_LOCATION, DOCK, advanceBikeFlight, advanceBoat, canBoardDockBoat, canDisembarkBoat, resetMobilityMotion } from './mobility';
import type { GameEvent, GameState, Input, Point, Vehicle, PursuitState, Roadblock } from './model';

const START: Point = { x: 0, z: 68 };
const PICKUP: Point = { x: -40, z: 0 };
const DROP: Point = { x: 80, z: -40 };
const RACE: Point[] = [{ x: 80, z: 80 }, { x: -80, z: 80 }, { x: -80, z: -80 }, { x: 80, z: -80 }];
export const POLICE_SAFEHOUSE: Readonly<Point> = { x: -80, z: 0 };
const SAFEHOUSE = POLICE_SAFEHOUSE;
const RACE_LIMIT = 120;
const TAU = Math.PI * 2;
const length = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const angle = (v: number) => Math.atan2(Math.sin(v), Math.cos(v));
const vehicle = (id: string, kind: Vehicle['kind'], x: number, z: number, heading: number, color: number, parked: boolean, owned = false): Vehicle => ({ id, kind, x, z, heading, speed: 0, color, parked, health: 100, owned, steer: 0, wheelPhase: 0 });

interface Runtime { traffic: Map<string, number>; policeRoutes: Map<string, { target: Point; path: Point[]; at: number }>; serial: number; lastSeen:Point|null; lastWanted:number; nextRoadblock:number; concealment:number }
const runtimes = new WeakMap<GameState, Runtime>();
function runtime(s: GameState): Runtime {
  let r = runtimes.get(s);
  if (!r) { r = { traffic: new Map(), policeRoutes: new Map(), serial: 0, lastSeen:null, lastWanted:0, nextRoadblock:0, concealment:0 }; runtimes.set(s, r); }
  return r;
}
function pursuitState(s:GameState):PursuitState {
  return s.pursuit??=( {status:'clear',visible:false,hidden:false,searchSeconds:0,concealmentSeconds:0,patrols:[],roadblocks:[],helicopter:null} );
}
function roadblockHit(s:GameState,p:Point,radius:number):boolean {
  return s.wanted>=2&&Boolean(s.pursuit?.roadblocks.some(b=>s.time<b.expiresAt&&Math.abs(p.x-b.x)<b.halfX+radius&&Math.abs(p.z-b.z)<b.halfZ+radius));
}
const trafficLoops: Point[][] = [
  [{ x: -80, z: -80 }, { x: 80, z: -80 }, { x: 80, z: 80 }, { x: -80, z: 80 }],
  [{ x: -40, z: -40 }, { x: -40, z: 40 }, { x: 40, z: 40 }, { x: 40, z: -40 }],
  [{x:-200,z:-80},{x:-120,z:-80},{x:-120,z:80},{x:-200,z:80}],
  [{x:-80,z:-200},{x:80,z:-200},{x:80,z:-120},{x:-80,z:-120}],
  [{x:-160,z:120},{x:80,z:120},{x:80,z:200},{x:-160,z:200}],
];
const trafficSeed=(index:number)=>index<8?(index%2?index*31+45:index*59+50):(index-8)*61+24;
const trafficLoop=(index:number)=>trafficLoops[index<8?index%2:2+(index-8)%3];
function loopPose(points: Point[], progress: number): Point & { heading: number } {
  const perimeter = points.reduce((sum, p, i) => sum + length(p, points[(i + 1) % points.length]), 0);
  let distance = ((progress % perimeter) + perimeter) % perimeter;
  for (let i = 0; i < points.length; i++) {
    const from = points[i], to = points[(i + 1) % points.length], segment = length(from, to);
    if (distance <= segment) return { x: from.x + (to.x - from.x) * distance / segment, z: from.z + (to.z - from.z) * distance / segment, heading: Math.atan2(to.x - from.x, -(to.z - from.z)) };
    distance -= segment;
  }
  return { ...points[0], heading: 0 };
}

export function createGame(): GameState {
  const cars = [
    vehicle('stratus', 'sport', START.x, START.z, 0, 0xded8cb, true, true),
    vehicle('parked-1', 'sedan', -4.5, 44, Math.PI, 0x387e9a, true),
    vehicle('parked-2', 'sport', 75, 6, Math.PI / 2, 0xe88a67, true),
    vehicle('parked-3', 'sedan', -75, -44, 0, 0xcdbd7d, true),
    vehicle('parked-4', 'sport', 4.5, -65, 0, 0x8d7cba, true),
    {...vehicle('bike-1','bike',BIKE_LOCATION.x,BIKE_LOCATION.z,0,0x67cabc,true,true),label:'Vortex R · MOTOCYKL'},
    {...vehicle('boat-1','boat',DOCK.mooring.x,DOCK.mooring.z,Math.PI/2,0xf0dfbd,true,true),label:'TideRunner · MOTORÓWKA'},
  ];
  for (let i = 0; i < 16; i++) {
    const p = loopPose(trafficLoop(i),trafficSeed(i));
    cars.push(vehicle(`traffic-${i}`, i % 3 === 0 ? 'sport' : 'sedan', p.x, p.z, p.heading, [0x51a89e, 0xe0b878, 0x926f9b, 0xa5b6c4][i % 4], false));
  }
  const s: GameState = {
    interior: null,
    player: { ...START, heading: 0, mode: 'drive', vehicleId: 'stratus', health: 100 }, vehicles: cars, police: [],
    pursuit:{status:'clear',visible:false,hidden:false,searchSeconds:0,concealmentSeconds:0,patrols:[],roadblocks:[],helicopter:null},
    money: 1250, wanted: 0, heat: 0, time: 0, arrestProgress: 0, collisionCooldown: 0, escapeTimer: 0,
    missionsWon: 0, bestRace: null,
    mission: { kind: 'delivery', stage: 0, active: true, clock: 0, completed: 0, waypoint: { ...PICKUP }, title: 'Specjalna przesyłka', instruction: 'Podjedź do punktu odbioru w dzielnicy Downtown.', reward: 450 },
  };
  const rt = runtime(s);
  for (let i = 0; i < 16; i++) rt.traffic.set(`traffic-${i}`,trafficSeed(i));
  return s;
}

export function activeVehicle(s: GameState): Vehicle | undefined {
  return s.player.mode === 'drive' ? s.vehicles.find(v => v.id === s.player.vehicleId) : undefined;
}
/** Online rooms share a deterministic ambient traffic clock; claimed cars stay parked. */
export function synchronizeOnlineTraffic(s: GameState, seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return;
  const rt = runtime(s), own = activeVehicle(s);
  for (let i = 0; i < 16; i++) {
    const car = s.vehicles.find(item => item.id === `traffic-${i}`);
    if (!car || car.parked || car === own) continue;
    const speed = 8 + i % 4;
    const progress = trafficSeed(i) + speed * seconds;
    Object.assign(car, loopPose(trafficLoop(i), progress), { speed, wheelPhase: speed * seconds * 1.6 });
    rt.traffic.set(car.id, progress);
  }
}
export function nearestVehicle(s: GameState): Vehicle | undefined {
  if (s.interior) return undefined;
  return s.vehicles.filter(v => v.kind !== 'police' && v.health > 0 && (v.kind==='boat'?canBoardDockBoat(s.player,v):length(v, s.player) <= 4)).sort((a, b) => (a.kind==='boat'?1:length(a,s.player))-(b.kind==='boat'?1:length(b,s.player)))[0];
}
/** Contextual E prompt has the same priority as the actual interaction. */
export function casinoAction(s: GameState): 'enter' | 'exit' | 'poker' | null {
  if (s.player.mode !== 'foot') return null;
  if (s.interior === 'casino') {
    if (length(s.player, CASINO.exit) <= 2) return 'exit';
    if (length(s.player, CASINO.table) <= 5.5) return 'poker';
    return null;
  }
  return length(s.player, CASINO.door) <= 3 ? 'enter' : null;
}
function moveIndoor(p: Point, dx: number, dz: number, radius: number) {
  const { bounds, tableCollider: table } = CASINO;
  const occupied = (point: Point) => point.x > table.x - table.halfX - radius && point.x < table.x + table.halfX + radius && point.z > table.z - table.halfZ - radius && point.z < table.z + table.halfZ + radius;
  const x = clamp(p.x + dx, bounds.minX + radius, bounds.maxX - radius);
  if (!occupied({ x, z: p.z })) p.x = x;
  const z = clamp(p.z + dz, bounds.minZ + radius, bounds.maxZ - radius);
  if (!occupied({ x: p.x, z })) p.z = z;
}
function blocked(p: Point, radius: number): boolean {
  return BUILDINGS.some(b => p.x > b.x - b.halfX - radius && p.x < b.x + b.halfX + radius && p.z > b.z - b.halfZ - radius && p.z < b.z + b.halfZ + radius);
}
function move(p: Point, dx: number, dz: number, radius: number): boolean {
  let hit = false;
  const x = clamp(p.x + dx, WORLD_BOUNDS.minX + radius, WORLD_BOUNDS.maxX - radius);
  if (x !== p.x + dx) hit = true;
  if (!blocked({ x, z: p.z }, radius)) p.x = x; else if (Math.abs(dx) > .0001) hit = true;
  const z = clamp(p.z + dz, WORLD_BOUNDS.minZ + radius, WORLD_BOUNDS.maxZ - radius);
  if (z !== p.z + dz) hit = true;
  if (!blocked({ x: p.x, z }, radius)) p.z = z; else if (Math.abs(dz) > .0001) hit = true;
  return hit;
}
function clearSight(a: Point, b: Point): boolean {
  const steps = Math.max(1, Math.ceil(length(a, b) / 2));
  for (let i = 1; i < steps; i++) if (blocked({ x: a.x + (b.x - a.x) * i / steps, z: a.z + (b.z - a.z) * i / steps }, .1)) return false;
  return true;
}
function attention(s: GameState, amount: number, events: GameEvent[]) {
  const old = s.wanted;
  s.wanted = clamp(s.wanted + amount, 0, 3); s.heat = 0; s.escapeTimer = 0;
  if (old < s.wanted) events.push({ kind: 'wanted', text: `Poziom pościgu: ${s.wanted}. Zgub patrol i ukryj się poza jego zasięgiem.` });
}
function recover(s: GameState, events: GameEvent[], arrested = false) {
  const previous=activeVehicle(s);
  if(previous?.kind==='boat'){resetMobilityMotion(previous);Object.assign(previous,DOCK.mooring,{speed:0,health:100,parked:true,heading:Math.PI/2});}
  else if(previous?.kind==='bike'){resetMobilityMotion(previous);previous.speed=0;previous.parked=true;}
  let car = s.vehicles.find(v => v.id === 'stratus');
  if (!car) { car = vehicle('stratus', 'sport', START.x, START.z, 0, 0xded8cb, true, true); s.vehicles.push(car); }
  Object.assign(car, START, { heading: 0, speed: 0, health: 100, parked: true, owned: true, steer: 0 });
  Object.assign(s.player, START, { heading: 0, health: 100, mode: 'drive', vehicleId: car.id });
  const fine = Math.min(s.money, arrested ? 200 : 100); s.money -= fine;
  s.wanted = 0; s.heat = 0; s.police = []; s.arrestProgress = 0; s.escapeTimer = 0; s.collisionCooldown = 2;
  Object.assign(pursuitState(s),{status:'clear',visible:false,hidden:false,searchSeconds:0,concealmentSeconds:0,roadblocks:[],helicopter:null});
  runtime(s).lastWanted=0;runtime(s).lastSeen=null;runtime(s).concealment=0;
  runtime(s).policeRoutes.clear();
  if (s.mission.active) {
    if (s.mission.kind === 'delivery') { s.mission.stage = 0; s.mission.waypoint = { ...PICKUP }; s.mission.instruction = 'Przesyłka wróciła do nadawcy. Podjedź do punktu odbioru.'; }
    else { s.mission.active = false; s.mission.outcome = 'failed'; s.mission.waypoint = null; s.mission.instruction = 'Zlecenie przerwane. Naciśnij M, by spróbować ponownie.'; }
  }
  events.push({ kind: arrested ? 'arrest' : 'info', text: arrested ? `Patrol zatrzymał cię. Mandat $${fine}. Wróciłeś do garażu.` : `Pomoc drogowa przywróciła samochód. Koszt: $${fine}.` });
}
function interact(s: GameState, events: GameEvent[]) {
  const car = activeVehicle(s);
  if (car) {
    if(car.kind==='boat'){
      if(Math.abs(car.speed)>3){events.push({kind:'info',text:'Zatrzymaj motorówkę przy pomoście, aby bezpiecznie wysiąść.'});return;}
      if(!canDisembarkBoat(car)){events.push({kind:'info',text:'Wróć do pomostu przy boi (124, 26). Wysiadanie jest możliwe tylko przy przystani.'});return;}
      resetMobilityMotion(car);car.speed=0;car.parked=true;Object.assign(s.player,DOCK.land,{heading:-Math.PI/2,mode:'foot',vehicleId:null});
      events.push({kind:'info',text:'Wysiadłeś na przystani. E przy wejściu na pomost pozwala ponownie wsiąść.'});return;
    }
    if(car.kind==='bike'&&(car.airHeight??0)>.35){events.push({kind:'info',text:'Poczekaj na lądowanie motocykla, zanim zsiądziesz.'});return;}
    if (Math.abs(car.speed) > 4) { events.push({ kind: 'info', text: 'Zatrzymaj samochód, aby bezpiecznie wysiąść.' }); return; }
    const offset=car.kind==='bike'?1.65:2.6;
    const side = [{ x: Math.cos(car.heading) * offset, z: Math.sin(car.heading) * offset }, { x: -Math.cos(car.heading) * offset, z: -Math.sin(car.heading) * offset }];
    const exit = side.map(p => ({ x: car.x + p.x, z: car.z + p.z })).find(p => !blocked(p, .5) && p.x > WORLD_BOUNDS.minX && p.x < WORLD_BOUNDS.maxX && p.z > WORLD_BOUNDS.minZ && p.z < WORLD_BOUNDS.maxZ);
    if (!exit) { events.push({ kind: 'info', text: 'Brak miejsca przy drzwiach. Zaparkuj na otwartej przestrzeni.' }); return; }
    car.speed = 0; car.parked = true; Object.assign(s.player, exit, { mode: 'foot', vehicleId: null });
    events.push({ kind: 'info', text: 'Wysiadłeś. WASD — ruch, Shift — sprint, E — wejdź do pobliskiego auta.' });
  } else {
    const action = casinoAction(s);
    if (action === 'enter') {
      if (s.wanted > 0) { events.push({ kind: 'info', text: 'Zgub pościg, zanim wejdziesz do kasyna.' }); return; }
      s.interior = 'casino';
      Object.assign(s.player, CASINO.entry, { heading: 0, mode: 'foot', vehicleId: null });
      events.push({ kind: 'interior', text: `Witaj w ${CASINO.name}. Podejdź do stołu i naciśnij E, aby zagrać w pokera.` });
      return;
    }
    if (action === 'exit') {
      s.interior = null;
      Object.assign(s.player, { x: CASINO.door.x, z: CASINO.door.z + 1.8, heading: Math.PI, mode: 'foot', vehicleId: null });
      events.push({ kind: 'interior', text: 'Wyszedłeś z kasyna. Miasto znów czeka.' });
      return;
    }
    if (action === 'poker') { events.push({ kind: 'poker', text: 'Texas Hold’em — zajmij miejsce przy stole.' }); return; }
    if (s.interior) { events.push({ kind: 'info', text: 'Podejdź do stołu pokerowego lub drzwi wyjściowych.' }); return; }
    const target = nearestVehicle(s);
    if (!target) { events.push({ kind: 'info', text: 'Podejdź bliżej samochodu, aby do niego wsiąść.' }); return; }
    target.parked = true; target.speed = 0;
    if(target.kind==='boat'||target.kind==='bike')resetMobilityMotion(target);
    Object.assign(s.player, { x: target.x, z: target.z, heading: target.heading, mode: 'drive', vehicleId: target.id });
    if(target.kind==='boat'){events.push({kind:'info',text:'Za sterem TideRunnera. WASD — silnik i ster, Shift — pełna moc. Wysiądziesz po powrocie do pomostu.'});return;}
    if(target.kind==='bike'){events.push({kind:'info',text:'Vortex R: szybki skręt, wąskie przejazdy i rampy przy ulicach. Shift — przyspieszenie, E — zsiądź po zatrzymaniu.'});return;}
    if (!target.owned) { attention(s, 1, events); target.owned = true; events.push({ kind: 'info', text: 'Przejąłeś samochód. Patrol otrzymał zgłoszenie.' }); }
    else events.push({ kind: 'info', text: 'Za kierownicą. W — gaz, S — hamulec / wsteczny, Spacja — hamulec ręczny.' });
  }
}
function collision(s: GameState, car: Vehicle, speed: number, events: GameEvent[]) {
  if (s.collisionCooldown > 0 || Math.abs(speed) < 6) return;
  const amount = clamp(Math.round(Math.abs(speed) * .8), 5, 24); car.health = Math.max(0, car.health - amount); s.player.health = Math.max(1, s.player.health - Math.ceil(amount * .15)); s.collisionCooldown = 1.4;
  events.push({ kind: 'damage', text: `Kolizja. Stan pojazdu −${amount}%.`, amount }); attention(s, 1, events);
}
function drive(s: GameState, car: Vehicle, input: Input, dt: number, events: GameEvent[]) {
  if(car.kind==='boat'){advanceBoat(car,input,dt);Object.assign(s.player,{x:car.x,z:car.z,heading:car.heading});return;}
  const bike=car.kind==='bike';
  const tuning = car.tuning;
  const tuningLevel = (value: number | undefined) => Number.isFinite(value) ? clamp(Math.floor(value!), 0, 3) : 0;
  const engine = tuningLevel(tuning?.engine), brakes = tuningLevel(tuning?.brakes), nitro = tuningLevel(tuning?.nitro);
  const acceleration = input.throttle ? (bike?(input.boost?23:18):(input.boost ? 19 + engine * 2 + nitro * 3 : 13 * (1 + engine * .18))) : input.brake ? (car.speed > .5 ? (bike?-28:-23 * (1 + brakes * .25)) : -10) : -Math.sign(car.speed) * Math.min(Math.abs(car.speed) / Math.max(dt, .0001), (bike?2.6:3.6) + Math.abs(car.speed) * .12);
  car.speed = clamp(car.speed + acceleration * dt, bike?-5:-9, bike?(input.boost?42:34):(input.boost ? 35 + engine * 2 + nitro * 3 : 26 + engine * 3));
  if (input.handbrake) car.speed *= Math.exp(-dt * (3.5 + brakes * .6));
  const axis = Number(input.right) - Number(input.left);
  car.steer += (axis - car.steer) * Math.min(1, dt * (bike?10:7));
  car.heading = angle(car.heading + car.steer * Math.min(Math.abs(car.speed) / 5, 1) * Math.sign(car.speed || 1) * dt * (bike?(input.handbrake?3.1:2.15):(input.handbrake ? 2.4 : 1.45)) / (1 + Math.abs(car.speed) / 42));
  const speed = car.speed;
  const previous={x:car.x,z:car.z};
  const radius=bike ? .68 : 1.5;
  if (move(car, Math.sin(car.heading) * speed * dt, -Math.cos(car.heading) * speed * dt, radius)) { collision(s, car, speed, events); car.speed *= -.18; }
  if((car.airHeight??0)<1.65&&roadblockHit(s,car,radius)){
    Object.assign(car,previous);collision(s,car,speed,events);car.speed*=-.24;
  }
  car.wheelPhase += car.speed * dt * 1.6;
  if(bike){const flight=advanceBikeFlight(car,dt);if(flight.launched)events.push({kind:'info',text:'Skok! Motocykl może przelecieć nad niską blokadą i ruchem ulicznym.'});}
  Object.assign(s.player, { x: car.x, z: car.z, heading: car.heading });
}
function walk(s: GameState, input: Input, dt: number) {
  const forward = Number(input.throttle) - Number(input.brake);
  const right = Number(input.right) - Number(input.left);
  const viewHeading = Number.isFinite(input.viewHeading) ? input.viewHeading! : 0;
  const x = Math.sin(viewHeading) * forward + Math.cos(viewHeading) * right;
  const z = -Math.cos(viewHeading) * forward + Math.sin(viewHeading) * right;
  const norm = Math.hypot(x, z);
  if (norm) {
    const speed = input.sprint ? 6 : 3.2;
    s.player.heading = Math.atan2(x, -z);
    if (s.interior === 'casino') moveIndoor(s.player, x / norm * speed * dt, z / norm * speed * dt, .55);
    else {
      const previous={x:s.player.x,z:s.player.z};
      move(s.player, x / norm * speed * dt, z / norm * speed * dt, .55);
      if(roadblockHit(s,s.player,.55))Object.assign(s.player,previous);
    }
  }
}
function traffic(s: GameState, dt: number, events: GameEvent[]) {
  const rt = runtime(s), playerCar = activeVehicle(s);
  for (const car of s.vehicles) {
    if (car === playerCar || car.parked || car.health <= 0 || car.kind==='boat'||car.kind==='bike') continue;
    const index = Number(car.id.split('-').at(-1)); if (!Number.isFinite(index)) continue;
    const speed = 8 + index % 4;
    const old = rt.traffic.get(car.id) ?? trafficSeed(index);
    const next = old + speed * dt; rt.traffic.set(car.id, next);
    const p = loopPose(trafficLoop(index), next); Object.assign(car, p, { speed }); car.wheelPhase += speed * dt;
    if (playerCar && playerCar.kind!=='boat'&&(playerCar.airHeight??0)<1.7&&length(car, playerCar) < (playerCar.kind==='bike'?2.2:3.05)) {
      const impact = Math.abs(playerCar.speed - car.speed) + 5;
      collision(s, playerCar, impact, events); playerCar.speed *= -.2; car.speed = 0; car.parked = true;
      const dist = length(car, playerCar) || 1;
      move(playerCar, (playerCar.x - car.x) / dist * .3, (playerCar.z - car.z) / dist * .3, 1.5);
      Object.assign(s.player, { x: playerCar.x, z: playerCar.z });
    }
  }
  // Parked vehicles are physical obstacles too, including abandoned traffic.
  if (playerCar && playerCar.kind!=='boat'&&(playerCar.airHeight??0)<1.7&&Math.abs(playerCar.speed) > .2) for (const car of s.vehicles) {
    if (car === playerCar || car.kind==='boat'||!car.parked || length(car, playerCar) >= (car.kind==='bike'||playerCar.kind==='bike'?2.2:2.8)) continue;
    collision(s, playerCar, Math.abs(playerCar.speed) + 3, events); playerCar.speed *= -.2;
    const d = length(car, playerCar) || 1;
    move(playerCar, (playerCar.x - car.x) / d * .4, (playerCar.z - car.z) / d * .4, 1.5);
    Object.assign(s.player, { x: playerCar.x, z: playerCar.z });
  }
}

function roadPoint(p: Point): Point {
  const x = ROAD_X.reduce((a, b) => Math.abs(b - p.x) < Math.abs(a - p.x) ? b : a);
  const z = ROAD_Z.reduce((a, b) => Math.abs(b - p.z) < Math.abs(a - p.z) ? b : a);
  return Math.abs(x - p.x) < Math.abs(z - p.z) ? { x, z: clamp(p.z, ROAD_Z[0], ROAD_Z.at(-1)!) } : { x: clamp(p.x, ROAD_X[0], ROAD_X.at(-1)!), z };
}
/** Small Dijkstra graph with virtual points on road segments avoids cutting across buildings. */
function roadRoute(from: Point, target: Point): Point[] {
  const start = roadPoint(from), goal = roadPoint(target);
  const nodes: Point[] = [...ROAD_NODES,start,goal];
  const startIndex = nodes.length - 2, goalIndex = nodes.length - 1, distances = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Set<number>(); distances[startIndex] = 0;
  for (let count = 0; count < nodes.length; count++) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (current < 0 || distances[i] < distances[current])) current = i;
    if (current < 0 || !Number.isFinite(distances[current])) break;
    if (current === goalIndex) break; visited.add(current);
    for (let i = 0; i < nodes.length; i++) {
      if (i === current || visited.has(i)) continue;
      // Virtual start/goal points can share an off-grid coordinate. Alignment
      // alone would connect parallel streets straight through a building.
      const verticalRoad = Math.abs(nodes[i].x - nodes[current].x) < .01 && ROAD_X.some(road => Math.abs(road - nodes[current].x) < .01);
      const horizontalRoad = Math.abs(nodes[i].z - nodes[current].z) < .01 && ROAD_Z.some(road => Math.abs(road - nodes[current].z) < .01);
      if (!verticalRoad && !horizontalRoad) continue;
      const cost = distances[current] + length(nodes[current], nodes[i]);
      if (cost < distances[i]) { distances[i] = cost; previous[i] = current; }
    }
  }
  const route: Point[] = []; let i = goalIndex;
  while (i !== startIndex && i >= 0) { route.unshift({ ...nodes[i] }); i = previous[i]; }
  if (length(from, start) > .5) route.unshift(start);
  if (length(goal, target) > .5 && clearSight(goal, target)) route.push({ ...target });
  return route;
}
function spawnPolice(s: GameState) {
  const rt = runtime(s);
  while (s.police.length < s.wanted) {
    const candidates = ROAD_NODES.filter(p => length(p, s.player) >= 36 && s.police.every(c => length(c, p) > 15)).sort((a, b) => Math.abs(length(a, s.player) - 48) - Math.abs(length(b, s.player) - 48));
    const p = candidates[0] ?? { x: -80, z: -80 };
    s.police.push(vehicle(`police-${++rt.serial}`, 'police', p.x, p.z, 0, 0xf0f0e5, false));
  }
  if (s.police.length > s.wanted) s.police.length = s.wanted;
}
function updatePatrols(s:GameState,dt:number,events:GameEvent[]){
  const state=pursuitState(s),car=activeVehicle(s);
  if(s.wanted>0){state.patrols=[];return;}
  if(state.patrols.length!==2)state.patrols=[0,1].map(index=>vehicle(`patrol-${index}`,'police',0,0,0,0xe3e9ed,false));
  state.patrols.forEach((cop,index)=>{
    const pose=loopPose(trafficLoops[index],(index===0?205:63)+s.time*7);
    Object.assign(cop,pose,{speed:7,wheelPhase:s.time*11.2});
    if(car&&length(car,cop)<2.8&&Math.abs(car.speed)>5){
      collision(s,car,Math.max(7,Math.abs(car.speed)*.6),events);car.speed*=.65;
    }
  });
}
function updateRoadblocks(s:GameState,events:GameEvent[]){
  const state=pursuitState(s),rt=runtime(s);
  state.roadblocks=state.roadblocks.filter(block=>block.expiresAt>s.time&&s.wanted>=2);
  if(s.wanted<2||s.time<rt.nextRoadblock||state.roadblocks.length)return;
  const heading=activeVehicle(s)?.heading??s.player.heading;
  const direction={x:Math.sin(heading),z:-Math.cos(heading)};
  const candidates=ROAD_NODES.filter(point=>{
    const d=length(point,s.player);
    return d>=28&&d<=75&&length(point,SAFEHOUSE)>15;
  }).sort((a,b)=>{
    const score=(point:Point)=>length(point,s.player)-((point.x-s.player.x)*direction.x+(point.z-s.player.z)*direction.z)*1.5;
    return score(a)-score(b);
  });
  const point=candidates[0];rt.nextRoadblock=s.time+24;
  if(!point)return;
  const horizontal=Math.abs(direction.z)>=Math.abs(direction.x);
  const block:Roadblock={...point,id:`block-${++rt.serial}`,halfX:horizontal?3.8:.65,halfZ:horizontal?.65:3.8,heading:horizontal?0:Math.PI/2,expiresAt:s.time+22};
  state.roadblocks.push(block);
  events.push({kind:'wanted',text:'Policja ustawiła blokadę na skrzyżowaniu. Omiń barierę poboczem albo wybierz inną ulicę.'});
}
function updateHelicopter(s:GameState,dt:number,target:Point,concealed:boolean):boolean{
  const state=pursuitState(s);
  if(s.wanted<3){state.helicopter=null;return false;}
  if(!state.helicopter)state.helicopter={x:target.x+38,z:target.z+22,heading:0,spotted:false,searching:true};
  const helicopter=state.helicopter;
  // Search the last reported block rather than tracking a hidden player's coordinates.
  const searching=!state.visible;
  const destination=searching?{x:target.x+Math.sin(s.time*.45)*19,z:target.z+Math.cos(s.time*.45)*19}:target;
  const dx=destination.x-helicopter.x,dz=destination.z-helicopter.z,d=Math.hypot(dx,dz),travel=Math.min(d,18*dt);
  if(d>.01){helicopter.x+=dx/d*travel;helicopter.z+=dz/d*travel;helicopter.heading=Math.atan2(dx,-dz);}
  helicopter.x=clamp(helicopter.x,WORLD_BOUNDS.minX,WORLD_BOUNDS.maxX);helicopter.z=clamp(helicopter.z,WORLD_BOUNDS.minZ,WORLD_BOUNDS.maxZ);
  helicopter.spotted=!concealed&&length(helicopter,s.player)<42&&clearSight(helicopter,s.player);
  helicopter.searching=!helicopter.spotted;
  return helicopter.spotted;
}
function pursuit(s: GameState, dt: number, events: GameEvent[]) {
  const state=pursuitState(s),rt=runtime(s),car=activeVehicle(s);
  updatePatrols(s,dt,events);
  if(s.wanted<=0){
    s.police=[];s.arrestProgress=0;s.heat=0;rt.lastWanted=0;rt.lastSeen=null;rt.concealment=0;rt.nextRoadblock=0;
    state.status='clear';state.visible=false;state.hidden=false;state.searchSeconds=0;state.concealmentSeconds=0;state.roadblocks=[];state.helicopter=null;
    return;
  }
  state.patrols=[];
  if(rt.lastWanted===0||!rt.lastSeen)rt.lastSeen={x:s.player.x,z:s.player.z};
  rt.lastWanted=s.wanted;
  // Hide only after breaking visual contact and stopping near the safehouse.
  // A nearby officer prevents concealment; entering the zone cannot erase an active tail.
  const groundVisible=()=>s.police.some(c=>length(c,s.player)<35&&clearSight(c,s.player));
  const shelter=length(s.player,SAFEHOUSE)<=8&&Math.abs(car?.speed??0)<=1.5;
  const wasVisible=groundVisible();
  const concealed=shelter&&!wasVisible&&!s.police.some(c=>length(c,s.player)<15);
  spawnPolice(s);
  updateRoadblocks(s,events);
  const helicopterVisible=updateHelicopter(s,dt,rt.lastSeen,concealed);
  if(wasVisible||helicopterVisible)rt.lastSeen={x:s.player.x,z:s.player.z};
  const suspect=rt.lastSeen;
  for (const cop of s.police) {
    let route = rt.policeRoutes.get(cop.id);
    if (!route || s.time >= route.at || length(route.target, suspect) > 8) {
      route = { target: { ...suspect }, path: roadRoute(cop, suspect), at: s.time + 1.2 }; rt.policeRoutes.set(cop.id, route);
    }
    while (route.path.length && length(cop, route.path[0]) < .5) route.path.shift();
    const target = route.path[0];
    if (target) {
      const dx = target.x - cop.x, dz = target.z - cop.z, distance = Math.hypot(dx, dz), speed = Math.min(13 + s.wanted * 1.5, distance / Math.max(dt, .001));
      cop.heading = Math.atan2(dx, -dz); cop.speed = speed;
      if (distance > .01) move(cop, dx / distance * speed * dt, dz / distance * speed * dt, 1.4);
      cop.wheelPhase += speed * dt;
    } else cop.speed = 0;
    if (car && length(cop, car) < 2.8 && Math.abs(car.speed) > 5) { collision(s, car, Math.max(7, Math.abs(car.speed) * .6), events); car.speed *= .65; }
  }
  const visible=groundVisible()||helicopterVisible;
  if(visible){s.heat=0;rt.lastSeen={x:s.player.x,z:s.player.z};rt.concealment=0;}else{s.heat+=dt;rt.concealment=concealed?rt.concealment+dt:0;}
  state.visible=visible;state.hidden=concealed&&!visible;state.status=state.hidden?'hidden':visible?'pursuit':'search';state.searchSeconds=s.heat;state.concealmentSeconds=rt.concealment;
  if(rt.concealment>=6){
    s.wanted=0;s.heat=0;s.police=[];rt.policeRoutes.clear();state.status='clear';state.visible=false;state.hidden=false;state.roadblocks=[];state.helicopter=null;state.searchSeconds=0;state.concealmentSeconds=0;
    events.push({kind:'info',text:'Przeczekałeś obławę w kryjówce. Policja straciła twój ślad.'});
  }else if (s.heat >= 12) {
    s.wanted--;s.heat=0;state.searchSeconds=0;
    if(s.wanted<3)state.helicopter=null;
    if(s.wanted<2)state.roadblocks=[];
    if(s.wanted===0){s.police=[];rt.policeRoutes.clear();state.status='clear';state.visible=false;state.hidden=false;events.push({kind:'info',text:'Zgubiłeś patrol. Wybrzeże jest spokojne.'});}
  }
  const close=s.wanted>0&&s.police.some(c=>length(c,s.player)<3);
  s.arrestProgress=close&&(!car||Math.abs(car.speed)<3)?Math.min(3,s.arrestProgress+dt):Math.max(0,s.arrestProgress-dt*2);
  if(s.arrestProgress>=3)recover(s,events,true);
}

export function missionStart(s: GameState): GameEvent[] {
  if (s.interior) return [{ kind: 'info', text: 'Zlecenia możesz wybierać po wyjściu z kasyna.' }];
  if (s.mission.active) return [{ kind: 'info', text: 'Masz już aktywne zlecenie. Podążaj do znacznika na mapie.' }];
  // Lifetime statistics can be restored independently from a fresh city session.
  // Advance the current story only after success; a failed story is retried.
  const kinds = ['delivery', 'race', 'escape'] as const;
  const current = kinds.indexOf(s.mission.kind);
  const index = s.mission.outcome === 'completed' ? (current + 1) % kinds.length : current;
  if (index === 0) s.mission = { kind: 'delivery', stage: 0, active: true, clock: 0, completed: s.missionsWon, waypoint: { ...PICKUP }, title: 'Specjalna przesyłka', instruction: 'Podjedź do punktu odbioru w Downtown.', reward: 450 };
  else if (index === 1) s.mission = { kind: 'race', stage: 0, active: true, clock: RACE_LIMIT, completed: s.missionsWon, waypoint: { ...RACE[0] }, title: 'Objazd po zachodzie', instruction: 'Przejedź 4 punkty kontrolne, zanim skończy się czas.', reward: 700 };
  else {
    s.mission = { kind: 'escape', stage: 0, active: true, clock: 0, completed: s.missionsWon, waypoint: { ...SAFEHOUSE }, title: 'Zniknąć z radaru', instruction: 'Dotrzyj do kryjówki i pozostań niezauważony przez 12 sekund.', reward: 900 };
    s.wanted = Math.max(2, s.wanted); s.heat = 0; s.escapeTimer = 0;
  }
  return [{ kind: 'mission', text: `Nowe zlecenie: ${s.mission.title}.` }];
}
function complete(s: GameState, events: GameEvent[]) {
  const reward = s.mission.reward; s.money += reward; s.missionsWon++; s.mission.completed = s.missionsWon; s.mission.active = false; s.mission.outcome = 'completed'; s.mission.waypoint = null; s.mission.instruction = 'Zlecenie wykonane. Naciśnij M, aby rozpocząć kolejne.';
  if (s.mission.kind === 'race') { const elapsed = RACE_LIMIT - s.mission.clock; s.bestRace = Math.min(s.bestRace ?? Infinity, elapsed); }
  events.push({ kind: 'reward', text: `Zlecenie wykonane! +$${reward}. Naciśnij M po kolejną historię.`, amount: reward });
}
function missions(s: GameState, dt: number, events: GameEvent[]) {
  const mission = s.mission; if (!mission.active) return;
  if (mission.kind === 'race') {
    mission.clock = Math.max(0, mission.clock - dt);
    if (mission.clock <= 0) { mission.active = false; mission.outcome = 'failed'; mission.waypoint = null; mission.instruction = 'Czas minął. Naciśnij M, aby powtórzyć trasę.'; events.push({ kind: 'mission', text: 'Wyścig zakończony. Następnym razem zetnij zakręty i użyj dopalacza.' }); return; }
  }
  if (mission.kind === 'escape') {
    const hidden = !s.police.some(c => length(c, s.player) < 35 && clearSight(c, s.player))&&!s.pursuit?.helicopter?.spotted;
    if (mission.waypoint && length(s.player, mission.waypoint) < 9 && hidden) s.escapeTimer += dt; else s.escapeTimer = 0;
    mission.clock = Math.max(0, 12 - s.escapeTimer);
    if (s.escapeTimer >= 12) { s.wanted = 0; s.police = []; s.heat = 0; complete(s, events); }
    return;
  }
  if (s.player.mode !== 'drive' || !mission.waypoint || length(s.player, mission.waypoint) > 5.5) return;
  if (mission.kind === 'delivery') {
    if (mission.stage === 0) { mission.stage = 1; mission.waypoint = { ...DROP }; mission.instruction = 'Przesyłka odebrana. Dostarcz ją do punktu na Ocean Drive.'; events.push({ kind: 'mission', text: 'Przesyłka jest w bagażniku. Cel: Ocean Drive.' }); }
    else complete(s, events);
  } else {
    mission.stage++;
    if (mission.stage >= RACE.length) complete(s, events);
    else { mission.waypoint = { ...RACE[mission.stage] }; events.push({ kind: 'mission', text: `Punkt kontrolny ${mission.stage} / 4. Jedź dalej!` }); }
  }
}

/** Real-time simulation owns gameplay. Rendering never changes positions, money or mission state. */
export function step(s: GameState, input: Input, delta: number): GameEvent[] {
  const dt = Number.isFinite(delta) ? clamp(delta, 0, .05) : 0;
  const events: GameEvent[] = [];
  if (dt <= 0) return events;
  s.time += dt;
  if (s.interior === 'casino') {
    if (input.reset) {
      Object.assign(s.player, CASINO.entry, { heading: 0 });
      events.push({ kind: 'info', text: 'Wróciłeś do wejścia kasyna.' });
      return events;
    }
    if (input.interact) interact(s, events);
    // A portal transition is one action; do not reinterpret the same E outdoors.
    if (s.interior !== 'casino') return events;
    if (input.nextMission) events.push(...missionStart(s));
    walk(s, input, dt);
    return events;
  }
  s.collisionCooldown = Math.max(0, s.collisionCooldown - dt);
  if (input.reset) { recover(s, events); return events; }
  if (input.interact) interact(s, events);
  if (s.interior === 'casino') return events;
  if (input.nextMission) events.push(...missionStart(s));
  const car = activeVehicle(s);
  if (car) drive(s, car, input, dt, events); else walk(s, input, dt);
  traffic(s, dt, events); pursuit(s, dt, events);
  const currentCar = activeVehicle(s);
  if (currentCar && currentCar.health <= 0) { recover(s, events); return events; }
  if (s.wanted === 0) s.player.health = Math.min(100, s.player.health + dt * 2);
  missions(s, dt, events);
  return events;
}

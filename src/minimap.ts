import { CASINO } from './casino-location';
import { BUILDINGS, ROADS, type GameState, type Point } from './model';
import type { OnlineMember } from './multiplayer-model';

export const TEAM_MAP_COLORS = ['#e0bb75', '#83c3d5', '#c390c0', '#8fc4a0'];
export interface MinimapOptions {
  casinoNavigation: boolean;
  onlineMembers: OnlineMember[];
  selfId: string;
  /** Undefined uses the current mission or casino; null explicitly hides GPS. */
  target?: Point | null;
  targetKind?: 'crew' | 'casino' | 'mission';
  time?: number;
}

interface Projection { point: Point; axis: 'x' | 'z' }
const distance = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
const equal = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z) < 1e-7;
const finite = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.z);
const mapPoint = (p: Point) => ({ x: p.x + 104, y: (p.z + 104) / 208 * 200 });

/** Both the approach to a road and the final walk to a doorway avoid buildings. */
function clearSegment(a: Point, b: Point) {
  return !BUILDINGS.some(building => {
    if (a.x === b.x) return Math.abs(a.x - building.x) < building.halfX &&
      Math.max(a.z, b.z) > building.z - building.halfZ && Math.min(a.z, b.z) < building.z + building.halfZ;
    return Math.abs(a.z - building.z) < building.halfZ &&
      Math.max(a.x, b.x) > building.x - building.halfX && Math.min(a.x, b.x) < building.x + building.halfX;
  });
}

function entrances(point: Point): Projection[] {
  const candidates: Projection[] = ROADS.flatMap(road => [
    { point: { x: road, z: point.z }, axis: 'x' as const },
    { point: { x: point.x, z: road }, axis: 'z' as const },
  ]).filter(candidate => clearSegment(point, candidate.point));
  const nearest = Math.min(...candidates.map(candidate => distance(point, candidate.point)));
  // Keep road connectors short. In particular, the casino entrance is reached
  // from the boulevard at z=80, rather than by a long line across its block.
  return candidates.filter(candidate => distance(point, candidate.point) <= nearest + 1e-7);
}

function simplify(points: Point[]) {
  const result: Point[] = [];
  for (const point of points) {
    if (result.length && equal(result[result.length - 1], point)) continue;
    while (result.length >= 2) {
      const a = result[result.length - 2], b = result[result.length - 1];
      const ab = { x: b.x - a.x, z: b.z - a.z }, bc = { x: point.x - b.x, z: point.z - b.z };
      if (Math.abs(ab.x * bc.z - ab.z * bc.x) > 1e-7 || ab.x * bc.x + ab.z * bc.z < 0) break;
      result.pop();
    }
    result.push({ ...point });
  }
  return result;
}

/** GPS follows the connected street grid, with only short endpoint connectors. */
export function planRoadRoute(start: Point, target: Point): Point[] {
  if (!finite(start) || !finite(target)) return [];
  if (equal(start, target)) return [{ ...start }];
  let best: Point[] = [], bestDistance = Infinity;
  for (const from of entrances(start)) for (const to of entrances(target)) {
    const a = from.point, b = to.point;
    let middle: Point[];
    if (from.axis !== to.axis) {
      middle = [a, from.axis === 'x' ? { x: a.x, z: b.z } : { x: b.x, z: a.z }, b];
    } else if ((from.axis === 'x' && a.x === b.x) || (from.axis === 'z' && a.z === b.z)) middle = [a, b];
    else {
      const coordinate = from.axis === 'x' ? 'z' : 'x';
      const crossing = ROADS.reduce((best, road) =>
        Math.abs(a[coordinate] - road) + Math.abs(b[coordinate] - road) <
        Math.abs(a[coordinate] - best) + Math.abs(b[coordinate] - best) ? road : best);
      middle = from.axis === 'x'
        ? [a, { x: a.x, z: crossing }, { x: b.x, z: crossing }, b]
        : [a, { x: crossing, z: a.z }, { x: crossing, z: b.z }, b];
    }
    const points = simplify([start, ...middle, target]);
    const length = points.slice(1).reduce((sum, point, index) => sum + distance(points[index], point), 0);
    if (length < bestDistance) { bestDistance = length; best = points; }
  }
  return best;
}

function arrow(ctx: CanvasRenderingContext2D, point: {x:number;y:number}, heading: number) {
  ctx.save(); ctx.translate(point.x, point.y); ctx.rotate(heading);
  ctx.fillStyle = '#fff7e3'; ctx.strokeStyle = '#11262e'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(-4.5, 5); ctx.lineTo(0, 3); ctx.lineTo(4.5, 5); ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.restore();
}

function teammate(ctx: CanvasRenderingContext2D, point: {x:number;y:number}, member: OnlineMember, outline = false) {
  const color = TEAM_MAP_COLORS[member.slot % TEAM_MAP_COLORS.length] ?? TEAM_MAP_COLORS[0];
  ctx.beginPath(); ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
  ctx.fillStyle = outline ? '#15282e' : color; ctx.strokeStyle = outline ? color : '#11262e'; ctx.lineWidth = 2; ctx.fill(); ctx.stroke();
  ctx.fillStyle = outline ? color : '#14232a'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(member.slot + 1), point.x, point.y + .5);
}

function indoorMap(ctx: CanvasRenderingContext2D, state: GameState, others: OnlineMember[]) {
  ctx.fillStyle = '#14252d'; ctx.fillRect(0, 0, 224, 200); ctx.fillStyle = '#29484b'; ctx.fillRect(16, 12, 192, 176);
  ctx.strokeStyle = '#cbb581'; ctx.lineWidth = 2; ctx.strokeRect(16, 12, 192, 176);
  ctx.fillStyle = '#236c62'; ctx.beginPath(); ctx.ellipse(112, 78, 31, 17, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#efdcb3'; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('♠', 112, 79);
  ctx.fillStyle = '#e2b47e'; ctx.fillRect(100, 181, 24, 8);
  let visible = 0;
  for (const member of others) if (member.pose.interior === 'casino') {
    const position = member.pose.seated
      ? { x: 112 + Math.sin(member.slot * Math.PI / 2) * 37, y: 78 + Math.cos(member.slot * Math.PI / 2) * 23 }
      : { x: 112 + member.pose.x * 8.4, y: 94 + member.pose.z * 8.4 };
    teammate(ctx, position, member); visible++;
  }
  arrow(ctx, { x: 112 + state.player.x * 8.4, y: 94 + state.player.z * 8.4 }, state.player.heading);
  return visible;
}

/** A single renderer keeps solo, shared challenges and casino maps consistent. */
export function renderMinimap(ctx: CanvasRenderingContext2D, state: GameState, options: MinimapOptions): {remotePlayers:number;route:Point[]} {
  const others = options.onlineMembers.filter(member => member.id !== options.selfId);
  const time = options.time ?? state.time;
  ctx.save(); ctx.scale(ctx.canvas.width / 224, ctx.canvas.height / 200);
  ctx.beginPath(); ctx.rect(0, 0, 224, 200); ctx.clip();
  if (state.interior === 'casino') {
    const remotePlayers = indoorMap(ctx, state, others); ctx.restore(); return { remotePlayers, route: [] };
  }
  ctx.fillStyle = '#1b3239'; ctx.fillRect(0, 0, 224, 200); ctx.fillStyle = '#417d8b'; ctx.fillRect(201, 0, 23, 200); ctx.fillStyle = '#b39f76'; ctx.fillRect(196, 0, 7, 200);
  ctx.strokeStyle = '#6b8585'; ctx.lineWidth = 8;
  for (const road of ROADS) {
    const p = mapPoint({ x: road, z: road }); ctx.beginPath(); ctx.moveTo(p.x, 0); ctx.lineTo(p.x, 200); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p.y); ctx.lineTo(198, p.y); ctx.stroke();
  }
  const park = mapPoint({ x: -32, z: -32 }); ctx.fillStyle = '#365d4c'; ctx.fillRect(park.x, park.y, 24, 24);
  for (const building of BUILDINGS) {
    const p = mapPoint({ x: building.x - building.halfX, z: building.z - building.halfZ });
    ctx.fillStyle = '#a1ad98'; ctx.fillRect(p.x, p.y, building.halfX * 2, building.halfZ * 2 * 200 / 208);
    ctx.fillStyle = '#546f65'; ctx.fillRect(p.x + 2, p.y + 2, building.halfX * 2 - 4, building.halfZ * 2 * 200 / 208 - 4);
  }
  const target = options.target === undefined ? options.casinoNavigation ? CASINO.door : state.mission.waypoint : options.target;
  const route = target ? planRoadRoute(state.player, target) : [];
  const targetColor = options.targetKind === 'crew' ? '#8df0c3' : '#ffe0a1';
  if (target) {
    if (route.length > 1) {
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (const [color, width] of [['#15282c', 5], [targetColor, 2.5]] as const) {
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
        route.map(mapPoint).forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); ctx.stroke();
      }
    }
    const p = mapPoint(target); ctx.strokeStyle = targetColor; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, 6 + Math.sin(time * 3), 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = targetColor; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
  }
  const club = mapPoint(CASINO.door); ctx.fillStyle = '#d8b6ff'; ctx.beginPath(); ctx.arc(club.x, club.y, 5.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#36234b'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('♠', club.x, club.y + .5);
  for (const car of state.vehicles) if (car.id !== state.player.vehicleId) {
    const p = mapPoint(car); ctx.fillStyle = '#d4e2d466'; ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
  }
  for (const police of state.police) {
    const p = mapPoint(police); ctx.fillStyle = Math.sin(time * 10) > 0 ? '#ff7b7b' : '#79bfff'; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
  }
  for (const member of others) {
    if (member.pose.interior === 'casino') {
      const angle = member.slot * Math.PI / 2;
      teammate(ctx, { x: club.x + Math.sin(angle) * 12, y: club.y + Math.cos(angle) * 12 }, member, true);
    } else teammate(ctx, mapPoint(member.pose), member);
  }
  arrow(ctx, mapPoint(state.player), state.player.heading);
  ctx.restore(); return { remotePlayers: others.length, route };
}

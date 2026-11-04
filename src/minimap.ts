import { CASINO } from './casino-location';
import { WORLD_BOUNDS, type GameState, type Point } from './model';
import { CITY_BUILDINGS, CITY_SPACES, CITY_STREETS, routeStreets } from './city-map';
import type { OnlineMember } from './multiplayer-model';
import { GARAGE_LOCATION } from './garage';
import { HOMES, CREW_BASE } from './career';
import { DOCK, WATER_BOUNDS } from './mobility';
import { districtAt, WORLD_LANDMARKS } from './world-layout';

export const TEAM_MAP_COLORS = ['#e0bb75', '#83c3d5', '#c390c0', '#8fc4a0'];
export interface MinimapOptions {
  casinoNavigation: boolean;
  onlineMembers: OnlineMember[];
  selfId: string;
  /** Undefined uses the current mission or casino; null explicitly hides GPS. */
  target?: Point | null;
  targetKind?: 'crew' | 'casino' | 'mission';
  time?: number;
  cityEvent?: {target:Point}|null;
}

/** Keep the neighborhood readable as the overall world grows. North stays up. */
export function neighborhoodProjection(center:Point,span=200){
  const scale=224/span;
  return(point:Point)=>({x:112+(point.x-center.x)*scale,y:100+(point.z-center.z)*scale});
}

/** GPS uses the shared street graph, including bends, alleys and dead ends. */
export function planRoadRoute(start: Point, target: Point): Point[] {
  return routeStreets(start, target);
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
  const mapPoint=neighborhoodProjection(state.player),scale=224/200;
  const visible=(point:{x:number;y:number},pad=10)=>point.x>=-pad&&point.x<=224+pad&&point.y>=-pad&&point.y<=200+pad;
  const edge=(point:{x:number;y:number})=>({x:Math.min(216,Math.max(8,point.x)),y:Math.min(192,Math.max(8,point.y))});
  ctx.save(); ctx.scale(ctx.canvas.width / 224, ctx.canvas.height / 200);
  ctx.beginPath(); ctx.rect(0, 0, 224, 200); ctx.clip();
  if (state.interior === 'casino') {
    const remotePlayers = indoorMap(ctx, state, others); ctx.restore(); return { remotePlayers, route: [] };
  }
  const vessel=state.vehicles.find(vehicle=>vehicle.id===state.player.vehicleId)??options.onlineMembers.find(member=>member.id===state.player.passengerOf)?.pose.vehicle;
  if(vessel?.kind==='boat'){
    const project=(p:Point)=>({x:12+(p.x-WATER_BOUNDS.minX)/(WATER_BOUNDS.maxX-WATER_BOUNDS.minX)*200,y:12+(p.z-WATER_BOUNDS.minZ)/(WATER_BOUNDS.maxZ-WATER_BOUNDS.minZ)*176});
    ctx.fillStyle='#224f62';ctx.fillRect(0,0,224,200);ctx.strokeStyle='#52839055';ctx.lineWidth=1;
    for(let y=10;y<200;y+=20){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(224,y);ctx.stroke();}
    const raw=options.target===undefined?state.mission.waypoint:options.target,target=raw?(raw.x<WATER_BOUNDS.minX?DOCK.mooring:raw):null;
    const route=target?[{x:state.player.x,z:state.player.z},{...target}]:[];
    if(target){const a=project(state.player),b=project(target);ctx.strokeStyle='#ffe0a1';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.fillStyle='#ffe0a1';ctx.beginPath();ctx.arc(b.x,b.y,5,0,Math.PI*2);ctx.fill();}
    const dock=project(DOCK.mooring);ctx.fillStyle='#dfc58e';ctx.fillRect(dock.x-4,dock.y-4,8,8);ctx.font='9px Arial';ctx.fillText('PRZYSTAŃ',dock.x+8,dock.y+3);
    for(const member of others)if(member.pose.x>=WATER_BOUNDS.minX&&!member.pose.interior&&!member.pose.homeId)teammate(ctx,project(member.pose),member);
    arrow(ctx,project(state.player),state.player.heading);ctx.restore();return{remotePlayers:others.length,route};
  }
  ctx.fillStyle='#263d38';ctx.fillRect(0,0,224,200);
  const coast=mapPoint({x:115,z:0}).x,beach=mapPoint({x:94,z:0}).x;
  const waterEdge=Math.min(224,Math.max(0,coast));ctx.fillStyle='#355e70';ctx.fillRect(waterEdge,0,224-waterEdge,200);
  ctx.fillStyle='#b09f7e';ctx.fillRect(beach,0,coast-beach,200);
  const landStart=mapPoint({x:WORLD_BOUNDS.minX,z:WORLD_BOUNDS.minZ}),landEnd=mapPoint({x:94,z:WORLD_BOUNDS.maxZ});
  ctx.fillStyle='#515e54';ctx.fillRect(landStart.x,landStart.y,landEnd.x-landStart.x,landEnd.y-landStart.y);
  for(const area of CITY_SPACES){
    ctx.fillStyle={park:'#426b54',plaza:'#8d9381',parking:'#657170',loading:'#766e5e'}[area.kind];
    ctx.beginPath();area.points.map(mapPoint).forEach((point,index)=>index?ctx.lineTo(point.x,point.y):ctx.moveTo(point.x,point.y));ctx.closePath();ctx.fill();
  }
  ctx.lineJoin='round';ctx.lineCap='round';
  for(const pavement of [true,false])for(const street of CITY_STREETS){
    ctx.strokeStyle=pavement?'#84918c':street.kind==='alley'||street.kind==='service'?'#495452':'#303c42';
    ctx.lineWidth=(street.width+(pavement?street.sidewalkWidth*2:0))*scale;
    ctx.beginPath();street.points.map(mapPoint).forEach((point,index)=>index?ctx.lineTo(point.x,point.y):ctx.moveTo(point.x,point.y));ctx.stroke();
  }
  for (const building of CITY_BUILDINGS) {
    const p = mapPoint({ x: building.x - building.halfX, z: building.z - building.halfZ });
    const width=building.halfX*2*scale,height=building.halfZ*2*scale;
    if(p.x+width<0||p.x>224||p.y+height<0||p.y>200)continue;
    ctx.fillStyle='#9ba59c';ctx.fillRect(p.x,p.y,width,height);
    const inset=Math.min(2,building.halfX*scale*.3,building.halfZ*scale*.3);
    ctx.fillStyle='#707e77';ctx.fillRect(p.x+inset,p.y+inset,width-inset*2,height-inset*2);
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
    const p = edge(mapPoint(target)); ctx.strokeStyle = targetColor; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, 6 + Math.sin(time * 3), 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = targetColor; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
  }
  const club = mapPoint(CASINO.door); ctx.fillStyle = '#d8b6ff'; ctx.beginPath(); ctx.arc(club.x, club.y, 5.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#36234b'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('♠', club.x, club.y + .5);
  const shop=mapPoint(GARAGE_LOCATION);ctx.fillStyle='#78d7cd';ctx.fillRect(shop.x-5,shop.y-5,10,10);ctx.fillStyle='#153b3e';ctx.font='bold 9px Arial';ctx.fillText('G',shop.x,shop.y+.5);
  for(const [id,point] of [...Object.entries(HOMES).map(([id,home])=>[id,home.door] as const),['crew',CREW_BASE.door] as const]){const p=mapPoint(point);ctx.fillStyle=id==='crew'?'#e7bd74':'#a6dccb';ctx.fillRect(p.x-4,p.y-4,8,8);ctx.fillStyle='#183c3f';ctx.font='bold 8px Arial';ctx.fillText(id==='crew'?'B':'H',p.x,p.y+.5);}
  for(const place of WORLD_LANDMARKS){const p=mapPoint(place.point);if(!visible(p))continue;ctx.fillStyle='#b9d1c9';ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fill();}
  if(options.cityEvent){const p=mapPoint(options.cityEvent.target);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.PI/4);ctx.fillStyle='#84dbff';ctx.fillRect(-3,-3,6,6);ctx.restore();}
  for (const car of state.vehicles) if (car.id !== state.player.vehicleId) {
    const p = mapPoint(car); ctx.fillStyle = '#d4e2d466'; ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
  }
  for (const police of state.police) {
    const p = mapPoint(police); ctx.fillStyle = Math.sin(time * 10) > 0 ? '#ff7b7b' : '#79bfff'; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
  }
  for (const member of others) {
    if (member.pose.homeId==='crew'||member.pose.homeId==='canal'||member.pose.homeId==='loft') {
      const point=mapPoint(member.pose.homeId==='crew'?CREW_BASE.door:HOMES[member.pose.homeId].door);
      teammate(ctx,edge({x:point.x+(member.slot-1.5)*7,y:point.y-9}),member,true);
    } else if (member.pose.interior === 'casino') {
      const angle = member.slot * Math.PI / 2;
      teammate(ctx,edge({x:club.x+Math.sin(angle)*12,y:club.y+Math.cos(angle)*12}),member,true);
    } else {const p=mapPoint(member.pose);teammate(ctx,edge(p),member,!visible(p,0));}
  }
  ctx.fillStyle='#d9e4d4bb';ctx.font='8px Arial';ctx.textAlign='left';ctx.fillText(districtAt(state.player).toUpperCase(),8,12);
  arrow(ctx, mapPoint(state.player), state.player.heading);
  ctx.restore(); return { remotePlayers: others.length, route };
}

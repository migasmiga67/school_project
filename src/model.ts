export interface Point { x: number; z: number }
export interface Collider extends Point { halfX: number; halfZ: number }
export type VehicleKind = 'sport' | 'sedan' | 'police' | 'bike' | 'boat';
export interface Vehicle extends Point { id: string; kind: VehicleKind; heading: number; speed: number; color: number; parked: boolean; health: number; owned: boolean; steer: number; wheelPhase: number; tuning?:{engine:number;brakes:number;nitro:number}; label?:string; airHeight?:number;airVelocity?:number;lean?:number }
export interface Mission { kind: 'delivery'|'race'|'escape'; stage: number; active: boolean; outcome?: 'completed'|'failed'; clock: number; completed: number; waypoint: Point|null; title: string; instruction: string; reward: number }
export interface Roadblock extends Collider { id:string; heading:number; expiresAt:number }
export interface PoliceHelicopter extends Point { heading:number; spotted:boolean; searching:boolean }
export interface PursuitState {
  status:'clear'|'pursuit'|'search'|'hidden'; visible:boolean; hidden:boolean;
  /** Time without visual contact; a concealed safehouse clears the chase after six seconds. */
  searchSeconds:number; concealmentSeconds:number; patrols:Vehicle[]; roadblocks:Roadblock[]; helicopter:PoliceHelicopter|null;
}
export interface GameState { interior:'casino'|null; player: Point & {heading:number;mode:'drive'|'foot';vehicleId:string|null;health:number;passengerOf?:string|null}; vehicles:Vehicle[]; police:Vehicle[]; pursuit?:PursuitState; money:number; wanted:number; heat:number; mission:Mission; time:number; arrestProgress:number; missionsWon:number; bestRace:number|null; collisionCooldown:number; escapeTimer:number; }
export interface Input { throttle:boolean;brake:boolean;left:boolean;right:boolean;handbrake:boolean;boost:boolean;sprint:boolean;interact:boolean;nextMission:boolean;reset:boolean;viewHeading?:number }
export interface GameEvent { kind:'info'|'damage'|'reward'|'wanted'|'arrest'|'mission'|'interior'|'poker'; text:string; amount?:number }
export const ROADS=[-80,-40,0,40,80];
/** The original grid remains an alias for existing missions and save data. */
export const ROAD_X=[-200,-160,-120,-80,-40,0,40,80];
export const ROAD_Z=[-200,-160,-120,-80,-40,0,40,80,120,160,200];
export const ROAD_NODES:Point[]=ROAD_X.flatMap(x=>ROAD_Z.map(z=>({x,z})));
export const WORLD_BOUNDS={minX:-216,maxX:98,minZ:-218,maxZ:218};
export const NATURAL_BLOCKS:Readonly<Point>[]=[{x:-20,z:-20},{x:-180,z:20},{x:-180,z:60}];
const originalBuildings:Collider[]=ROADS.slice(0,-1).flatMap((x,ix)=>ROADS.slice(0,-1).filter((_,iz)=>!(ix===1&&iz===1)).map(z=>({x:x+20,z:z+20,halfX:12,halfZ:12})));
const extensionBuildings:Collider[]=ROAD_X.slice(0,-1).flatMap(x=>ROAD_Z.slice(0,-1).map(z=>({x:x+20,z:z+20,halfX:12,halfZ:12}))).filter(block=>
  !originalBuildings.some(original=>original.x===block.x&&original.z===block.z)&&!NATURAL_BLOCKS.some(park=>park.x===block.x&&park.z===block.z));
/** Old indices and silhouettes stay stable; extensions share the exact physics footprint. */
export const BUILDINGS:Collider[]=[...originalBuildings,...extensionBuildings];

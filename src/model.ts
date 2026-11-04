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
export { ROADS, ROAD_X, ROAD_Z, ROAD_NODES, WORLD_BOUNDS, NATURAL_BLOCKS, BUILDINGS } from './city-map';

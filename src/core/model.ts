export type Cell = { x: number; y: number };
export type HeroId = 'ignis' | 'kael' | 'lyra';
export type AbilityId = 'bash' | 'shield' | 'shoot' | 'snare' | 'swap' | 'lightning';
export type Direction = 'N' | 'E' | 'S' | 'W';
export type Tile = 'floor' | 'wall' | 'void';
export interface Unit { id: string; name: string; kind: HeroId | 'husk' | 'thorn' | 'warden'; team: 'heroes' | 'enemies'; cell: Cell; hp: number; maxHp: number; shield: number; ap: number; readyRound: Partial<Record<AbilityId, number>>; rootedActivations: number; }
export interface BoardObject { id: string; kind: 'cover' | 'obelisk'; cell: Cell; hp: number; maxHp: number; }
export interface Trap { id: string; cell: Cell; damage: number; expiresAfterEnemyRound: number; }
export type EnemyIntent = {actorId: string; kind: 'move'; path: Cell[]} | {actorId: string; kind: 'line'; direction: Direction; range: number; damage: number} | {actorId: string; kind: 'wait'};
export interface BattleState { room: number; round: number; phase: 'player' | 'won' | 'lost'; board: Tile[][]; units: Record<string, Unit>; objects: Record<string, BoardObject>; traps: Trap[]; enemyOrder: string[]; intents: EnemyIntent[]; actionSequence: number; relics: string[]; }
export type Command = {type:'move';actorId:string;destination:Cell} | {type:'bash';actorId:string;targetId:string} | {type:'shield';actorId:string} | {type:'shoot';actorId:string;direction:Direction} | {type:'snare';actorId:string;cell:Cell} | {type:'swap';actorId:string;firstId:string;secondId:string} | {type:'lightning';actorId:string;anchor:Cell} | {type:'endTurn'};
export interface GameEvent {type:'move'|'damage'|'death'|'shield'|'swap'|'trap'|'round'; actorId?:string; targetId?:string; from?:Cell; to?:Cell; amount?:number; text:string;}
export type Resolution = {ok:true;state:BattleState;events:GameEvent[]} | {ok:false;reason:string};
export interface HeroInfo {name:string;role:string;maxHp:number;movement:number;abilities:AbilityId[];color:string;}
export interface AbilityInfo {name:string;cost:number;cooldown:number;description:string;}
export const DIRECTIONS: Record<Direction,Cell> = {N:{x:0,y:-1},E:{x:1,y:0},S:{x:0,y:1},W:{x:-1,y:0}};

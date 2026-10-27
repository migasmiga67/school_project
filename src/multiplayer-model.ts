import type { PokerAction, PokerState } from './poker-model';
import type { VehicleKind } from './model';

export const MAX_ROOM_PLAYERS = 4;
export const ROOM_PROTOCOL = 1;
export const ONLINE_BUY_IN = 200;
export const ONLINE_TURN_MS = 30000;
export interface OnlineVehicle {
  id: string; kind: VehicleKind; x: number; z: number; heading: number;
  color: number; speed: number; health: number;
}
export interface OnlinePose {
  x: number; z: number; heading: number; mode: 'drive' | 'foot';
  interior: 'casino' | null; seated: boolean; vehicle: OnlineVehicle | null;
}
export interface OnlineMember { id: string; name: string; slot: number; pose: OnlinePose }
/** Poker is rotated so the recipient is seat zero. Unseen holes use rank 0 backs;
 * the deck and shuffle seed never leave the room host. */
export interface RoomSnapshot {
  code: string; hostId: string; youId: string; members: OnlineMember[];
  vehicles: OnlineVehicle[]; worldTime: number;
  wallet: number; seated: boolean; poker: PokerState | null;
  tableVersion: number; turnDeadline: number | null;
}
export type RoomCommand =
  | { type: 'pose'; pose: OnlinePose }
  | { type: 'sit' | 'stand' | 'deal' | 'ping' }
  | { type: 'action'; action: PokerAction; version: number }
  | { type: 'spend'; amount: number };
export type RoomResult = { ok: true } | { ok: false; reason: string };
export type RoomStatus = 'offline' | 'connecting' | 'online' | 'error';
export interface MultiplayerState { status: RoomStatus; message: string; snapshot: RoomSnapshot | null }
/** UI contract: online play has its own host-maintained session wallet. */
export interface MultiplayerSession {
  readonly state: MultiplayerState;
  subscribe(listener: (state: MultiplayerState) => void): () => void;
  create(name: string): Promise<void>;
  join(code: string, name: string): Promise<void>;
  leave(): void;
  updatePose(pose: OnlinePose): void;
  sit(): void;
  stand(): void;
  deal(): void;
  action(action: PokerAction): void;
  spend(amount: number): void;
}

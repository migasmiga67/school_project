import type { PokerAction, PokerState } from './poker-model';
import type { Point, VehicleKind } from './model';
import type { GarageAction, GarageState } from './garage';
import type { JobAction, JobsSnapshot } from './online-jobs';
import type { CasinoGameAction, CasinoGamesSnapshot } from './casino-games';
import type { TournamentAction, TournamentSnapshot } from './poker-tournament';
import type { CityEventAction, CityEventsSnapshot } from './city-events';
import type { CareerAction, CareerEffect, CareerState, CrewBaseAction, CrewBaseState, HomeId } from './career';
import type { AppearanceAction, AppearanceState } from './appearance';
import type { PhoneAction, PhoneSnapshot } from './phone';
import type { FactionAction, FactionsSnapshot, FactionId } from './factions';
import type { CampaignAction, CampaignSnapshot } from './campaign';
import type { MobilityTrialAction, MobilityTrialSnapshot } from './mobility';

export const MAX_ROOM_PLAYERS = 4;
export const ROOM_PROTOCOL = 6;
export const ONLINE_BUY_IN = 200;
export const ONLINE_TURN_MS = 30000;
export const CREW_DURATION_MS = 150000;
export const CREW_COOLDOWN_MS = 20000;
export const CREW_REWARD = 300;
export const CREW_CHECKPOINTS: readonly Readonly<Point>[] = [{x:0,z:40},{x:40,z:40},{x:40,z:80}];
export interface CrewChallenge {
  status: 'idle' | 'active' | 'completed' | 'failed';
  run: number; eligible: boolean;
  /** Zero-based next checkpoint; equals total after successful completion. */
  checkpoint: number; total: 3; target: Point | null;
  remainingMs: number; cooldownMs: number; reward: 300; contributors: string[];
}
export interface OnlineVehicle {
  id: string; kind: VehicleKind; x: number; z: number; heading: number;
  color: number; speed: number; health: number;
  tuning?: { engine: number; brakes: number; nitro: number }; label?: string;
  airHeight?: number; lean?: number;
}
export interface OnlinePose {
  x: number; z: number; heading: number; mode: 'drive' | 'foot';
  interior: 'casino' | null; seated: boolean; vehicle: OnlineVehicle | null;
  /** Assigned by the host; a client cannot acquire a seat through a pose. */
  passengerOf?: string | null;
  /** Host-authorized property interior. Coordinates use the shared room bounds. */
  homeId?: string | null;
}
export type HomeAction = {kind:'enter';home:HomeId|'crew'}|{kind:'exit'};
export interface OnlineCareerEffect { version:number; effect:CareerEffect|null; home:HomeId|null }
export interface OnlineDeliveryEffect { version:number; target:(Point&{heading:number})|null }
export interface OnlineMember { id: string; name: string; slot: number; pose: OnlinePose; appearance?:AppearanceState; factionId?:FactionId|null }
/** Poker is rotated so the recipient is seat zero. Unseen holes use rank 0 backs;
 * the deck and shuffle seed never leave the room host. */
export interface RoomSnapshot {
  code: string; hostId: string; youId: string; members: OnlineMember[];
  vehicles: OnlineVehicle[]; worldTime: number;
  wallet: number; seated: boolean; poker: PokerState | null;
  tableVersion: number; turnDeadline: number | null;
  challenge: CrewChallenge;
  garage: GarageState; jobs: JobsSnapshot; cityEventClaimed: boolean;
  career: CareerState; crewBase: CrewBaseState; careerEffect: OnlineCareerEffect;
  casinoGames: CasinoGamesSnapshot; tournament: TournamentSnapshot; cityActivities: CityEventsSnapshot;
  appearance:AppearanceState; phone:PhoneSnapshot; deliveryEffect:OnlineDeliveryEffect;
  factions:FactionsSnapshot; campaign:CampaignSnapshot; mobilityTrial:MobilityTrialSnapshot;
}
export type RoomCommand =
  | { type: 'pose'; pose: OnlinePose }
  | { type: 'sit' | 'stand' | 'deal' | 'ping' | 'challengeStart' }
  | { type: 'action'; action: PokerAction; version: number }
  | { type: 'spend'; amount: number }
  | { type: 'garage'; action: GarageAction }
  | { type: 'job'; action: JobAction }
  | { type: 'career'; action: CareerAction }
  | { type: 'crewBase'; action: CrewBaseAction }
  | { type: 'home'; action: HomeAction }
  | { type: 'casinoGame'; action: CasinoGameAction }
  | { type: 'tournament'; action: TournamentAction }
  | { type: 'cityActivity'; action: CityEventAction }
  | { type: 'appearance'; action: AppearanceAction }
  | { type: 'phone'; action: PhoneAction }
  | { type: 'faction'; action: FactionAction }
  | { type: 'campaign'; action: CampaignAction }
  | { type: 'mobilityTrial'; action: MobilityTrialAction }
  | { type: 'cityEventClaim'; eventId: string }
  | { type: 'ride'; driverId: string }
  | { type: 'exitRide' };
export type RoomResult = { ok: true } | { ok: false; reason: string };
export type RoomStatus = 'offline' | 'connecting' | 'online' | 'error';
export interface MultiplayerState {
  status: RoomStatus; message: string; snapshot: RoomSnapshot | null;
  /** Signaling can reconnect independently while existing RTC peers keep playing. */
  signaling?: 'connecting' | 'online' | 'reconnecting';
  /** Capability of the last connection attempt; never contains ICE credentials. */
  relayConfigured?: boolean;
}
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
  startChallenge(): void;
  garage(action: GarageAction): void;
  job(action: JobAction): void;
  career(action: CareerAction): void;
  crewBase(action: CrewBaseAction): void;
  home(action: HomeAction): void;
  casinoGame(action: CasinoGameAction): void;
  tournament(action: TournamentAction): void;
  cityActivity(action: CityEventAction): void;
  appearance(action:AppearanceAction):void;
  phone(action:PhoneAction):void;
  faction(action:FactionAction):void;
  campaign(action:CampaignAction):void;
  mobilityTrial(action:MobilityTrialAction):void;
  claimCityEvent(): void;
  ride(driverId: string): void;
  exitRide(): void;
}

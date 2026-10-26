import { createBattle } from './core/engine';
import type { BattleState, HeroId } from './core/model';

export const SAVE_KEY = 'grid-legends-save-v1';
export const UNLOCK_COSTS: Record<string, number> = { cloak: 3, heart: 5 };
export const RELICS: Record<string, { name: string; description: string; icon: string }> = {
  seal: { name: 'Pieczęć Strażnika', description: 'Mur Światła przyznaje 4 punkty tarczy zamiast 3.', icon: '◈' },
  weight: { name: 'Ciężar Przysięgi', description: 'Pchnięcie Tarczą zadaje 3 obrażenia przed odepchnięciem.', icon: '⚒' },
  lens: { name: 'Soczewka Zmierzchu', description: 'Zasięg Precyzyjnego Strzału rośnie do 7 pól.', icon: '◎' },
  teeth: { name: 'Zęby Pustki', description: 'Sidła Pustki zadają 2 obrażenia przy aktywacji.', icon: '⋈' },
  spark: { name: 'Żywa Iskra', description: 'Uderzenie Pioruna nie rani Strażników. Obelisk nadal jest zagrożony.', icon: 'ϟ' },
  bandage: { name: 'Bandaże Archiwisty', description: 'Żywi bohaterowie odzyskują po komnacie 3 HP zamiast 2.', icon: '✚' },
  cloak: { name: 'Podróżny Płaszcz', description: 'Kael przechodzi do 5 pól za jeden punkt akcji.', icon: '⌁' },
  heart: { name: 'Serce Światła', description: 'Ignis zyskuje 2 maksymalne HP i odzyskuje 2 HP przy zdobyciu.', icon: '♡' },
};

export interface SaveData {
  version: 1;
  profile: { echoes: number; unlocked: string[]; completedRuns: number };
  run: null | {
    id: string;
    room: number;
    relics: string[];
    battle: BattleState;
    offers: string[];
    settledRooms: number[];
    seed: number;
    status: 'battle' | 'reward' | 'won' | 'lost';
  };
  settings: { muted: boolean; reducedMotion: boolean; confirmEnd: boolean };
}

const BASE_RELICS = ['seal', 'weight', 'lens', 'teeth', 'spark', 'bandage'];
const HERO_IDS: HeroId[] = ['ignis', 'kael', 'lyra'];
const copy = <T>(data: T): T => structuredClone(data);
let runSerial = 0;

export function freshSave(): SaveData {
  return {
    version: 1,
    profile: { echoes: 0, unlocked: [], completedRuns: 0 },
    run: null,
    settings: { muted: true, reducedMotion: false, confirmEnd: true },
  };
}

function initialSeed(): number {
  const buffer = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(buffer);
  else buffer[0] = (Date.now() ^ (++runSerial * 2654435761)) >>> 0;
  return buffer[0] || 0x9e3779b9;
}

export function newRun(save: SaveData): SaveData {
  const next = copy(save);
  const seed = initialSeed();
  next.run = {
    id: `run-${Date.now().toString(36)}-${(++runSerial).toString(36)}-${seed.toString(36)}`,
    room: 0,
    relics: [],
    battle: createBattle(0),
    offers: [],
    settledRooms: [],
    seed,
    status: 'battle',
  };
  return next;
}

// Reward randomness is deliberately separate from combat; its state is saved.
function draw(seed: number): number {
  let value = seed >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

function rewardOffers(save: SaveData): void {
  const run = save.run!;
  const pool = [...BASE_RELICS, ...save.profile.unlocked].filter(id => !run.relics.includes(id));
  for (let i = pool.length - 1; i > 0; i--) {
    run.seed = draw(run.seed);
    const j = Math.floor((run.seed / 0x100000000) * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  run.offers = pool.slice(0, 3);
}

export function settleBattle(save: SaveData): SaveData {
  const next = copy(save);
  const run = next.run;
  if (!run || run.status !== 'battle') return next;
  if (run.battle.phase === 'lost') {
    run.status = 'lost';
    run.offers = [];
    return next;
  }
  if (run.battle.phase !== 'won') return next;
  if (run.settledRooms.includes(run.room)) return next;
  run.settledRooms.push(run.room);
  next.profile.echoes += 1;
  if (run.room === 2) {
    next.profile.echoes += 2;
    next.profile.completedRuns += 1;
    run.status = 'won';
    run.offers = [];
  } else {
    run.status = 'reward';
    rewardOffers(next);
  }
  return next;
}

export function chooseRelic(save: SaveData, id: string): SaveData {
  const next = copy(save);
  const run = next.run;
  if (!run || run.status !== 'reward' || run.room >= 2 || !run.offers.includes(id) || run.relics.includes(id)) return next;
  const before = run.battle;
  run.relics.push(id);
  run.room += 1;
  const fresh = createBattle(run.room, undefined, run.relics);
  const hp: Partial<Record<HeroId, number>> = {};
  for (const heroId of HERO_IDS) {
    const hero = Object.values(fresh.units).find(unit => unit.kind === heroId);
    if (!hero) continue;
    const previous = Object.values(before.units).find(unit => unit.kind === heroId && unit.team === 'heroes');
    const recovery = run.relics.includes('bandage') ? 3 : 2;
    const immediateHeart = id === 'heart' && heroId === 'ignis' ? 2 : 0;
    hp[heroId] = previous
      ? Math.min(hero.maxHp, previous.hp + recovery + immediateHeart)
      : Math.ceil(hero.maxHp / 2);
  }
  run.battle = createBattle(run.room, hp, run.relics);
  run.offers = [];
  run.status = 'battle';
  return next;
}

export function unlockRelic(save: SaveData, id: string): SaveData {
  const next = copy(save);
  const cost = UNLOCK_COSTS[id];
  if (cost === undefined || next.profile.unlocked.includes(id) || next.profile.echoes < cost) return next;
  next.profile.echoes -= cost;
  next.profile.unlocked.push(id);
  return next;
}

// Parse untrusted JSON before exposing any of it to the engine or view.
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Nieprawidłowy zapis: ${message}.`);
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
}
function identifier(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9_-]{0,95}$/.test(value);
}
function cell(value: unknown): value is { x: number; y: number } {
  return record(value) && integer(value.x, 0, 7) && integer(value.y, 0, 7);
}
function listOfIds(value: unknown, allowed?: string[]): value is string[] {
  return Array.isArray(value) && value.every(id => identifier(id) && (!allowed || allowed.includes(id))) && new Set(value).size === value.length;
}
function validateBattle(value: unknown): asserts value is BattleState {
  check(record(value), 'brak stanu walki');
  check(integer(value.room, 0, 2) && integer(value.round, 1, 100000) && integer(value.actionSequence), 'numer komnaty lub rundy');
  check(['player', 'won', 'lost'].includes(String(value.phase)), 'faza walki');
  const board = value.board;
  check(Array.isArray(board) && board.length === 8 && board.every(row => Array.isArray(row) && row.length === 8 && row.every(tile => ['floor', 'wall', 'void'].includes(tile))), 'plansza 8×8');
  check(record(value.units) && Object.keys(value.units).length <= 30, 'jednostki');
  const occupied = new Set<string>();
  const kinds = ['ignis', 'kael', 'lyra', 'husk', 'thorn', 'warden'];
  const abilities = ['bash', 'shield', 'shoot', 'snare', 'swap', 'lightning'];
  const heroKinds = new Set<string>();
  for (const [id, unit] of Object.entries(value.units)) {
    check(identifier(id) && record(unit) && unit.id === id, 'identyfikator jednostki');
    check(typeof unit.name === 'string' && unit.name.length > 0 && unit.name.length <= 120 && kinds.includes(String(unit.kind)), 'typ jednostki');
    check(['heroes', 'enemies'].includes(String(unit.team)), 'drużyna jednostki');
    check((unit.team === 'heroes') === HERO_IDS.includes(unit.kind as HeroId), 'klasa i drużyna jednostki');
    check(cell(unit.cell), 'pozycja jednostki');
    check(board[unit.cell.y][unit.cell.x] === 'floor', 'jednostka poza posadzką');
    const key = `${unit.cell.x},${unit.cell.y}`;
    check(!occupied.has(key), 'jednostki na jednym polu');
    occupied.add(key);
    if (unit.team === 'heroes') {
      check(unit.id === unit.kind, 'kanoniczny identyfikator bohatera');
      check(!heroKinds.has(String(unit.kind)), 'powtórzony bohater');
      heroKinds.add(String(unit.kind));
    } else {
      check(!HERO_IDS.includes(unit.id as HeroId), 'identyfikator wroga zarezerwowany dla bohatera');
    }
    check(integer(unit.maxHp, 1, 100) && integer(unit.hp, 1, unit.maxHp) && integer(unit.shield, 0, 30) && integer(unit.ap, 0, 2), 'statystyki jednostki');
    check(integer(unit.rootedActivations, 0, 1), 'status unieruchomienia');
    check(record(unit.readyRound), 'odnowienia jednostki');
    for (const [ability, round] of Object.entries(unit.readyRound)) check(abilities.includes(ability) && integer(round, 0, 100002), 'odnowienie umiejętności');
  }
  check(record(value.objects) && Object.keys(value.objects).length <= 64, 'obiekty planszy');
  let obelisks = 0;
  for (const [id, object] of Object.entries(value.objects)) {
    check(identifier(id) && record(object) && object.id === id, 'identyfikator obiektu');
    check(['cover', 'obelisk'].includes(String(object.kind)) && cell(object.cell), 'typ lub pozycja obiektu');
    check(board[object.cell.y][object.cell.x] === 'floor', 'obiekt poza posadzką');
    const key = `${object.cell.x},${object.cell.y}`;
    check(!occupied.has(key), 'nakładanie obiektów i jednostek');
    occupied.add(key);
    check(integer(object.maxHp, 1, 100) && integer(object.hp, 0, object.maxHp), 'zdrowie obiektu');
    check((id === 'obelisk') === (object.kind === 'obelisk'), 'kanoniczny identyfikator Obelisku');
    if (object.kind === 'obelisk') {
      check(object.maxHp === 6, 'maksymalne zdrowie Obelisku');
      obelisks += 1;
    }
  }
  check(obelisks <= 1 && (value.phase === 'lost' || obelisks === 1), 'Obelisk');
  const enemies = Object.values(value.units).filter(unit => record(unit) && unit.team === 'enemies').length;
  const obelisk = value.objects.obelisk;
  if (value.phase === 'player' || value.phase === 'won') {
    check(heroKinds.size > 0 && record(obelisk) && integer(obelisk.hp, 1, 6), 'aktywna drużyna i Obelisk');
    check(value.phase === 'won' ? enemies === 0 : enemies > 0, 'wynik walki a obecność wrogów');
  }
  check(Array.isArray(value.traps) && value.traps.length <= 2, 'pułapki');
  const trapIds = new Set<string>();
  const trapCells = new Set<string>();
  for (const trap of value.traps) {
    check(record(trap) && identifier(trap.id) && cell(trap.cell), 'pozycja lub identyfikator pułapki');
    const key = `${trap.cell.x},${trap.cell.y}`;
    check(board[trap.cell.y][trap.cell.x] === 'floor' && !trapIds.has(trap.id) && !trapCells.has(key), 'nakładanie pułapek');
    check(integer(trap.damage, 1, 20) && integer(trap.expiresAfterEnemyRound, 1, 100002), 'parametry pułapki');
    trapIds.add(trap.id); trapCells.add(key);
  }
  check(listOfIds(value.enemyOrder) && value.enemyOrder.length <= 30, 'kolejność wrogów');
  check(Array.isArray(value.intents) && value.intents.length <= 30, 'intencje wrogów');
  const actors = new Set<string>();
  for (const intent of value.intents) {
    check(record(intent) && identifier(intent.actorId) && !actors.has(intent.actorId), 'aktor intencji');
    actors.add(intent.actorId);
    check(['move', 'line', 'wait'].includes(String(intent.kind)), 'typ intencji');
    if (intent.kind === 'move') check(Array.isArray(intent.path) && intent.path.length <= 8 && intent.path.every(cell), 'ścieżka ruchu');
    if (intent.kind === 'line') check(['N', 'E', 'S', 'W'].includes(String(intent.direction)) && integer(intent.range, 1, 8) && integer(intent.damage, 1, 20), 'intencja ataku');
  }
  check(listOfIds(value.relics, Object.keys(RELICS)), 'relikty walki');
}

export function parseSave(raw: string): SaveData {
  check(typeof raw === 'string' && raw.length <= 2_000_000, 'rozmiar pliku');
  const value: unknown = JSON.parse(raw);
  check(record(value) && value.version === 1, 'wersja formatu');
  check(record(value.profile), 'profil');
  check(integer(value.profile.echoes, 0, 1000000) && integer(value.profile.completedRuns, 0, 1000000), 'postęp profilu');
  check(listOfIds(value.profile.unlocked, Object.keys(UNLOCK_COSTS)), 'odblokowania');
  check(record(value.settings) && typeof value.settings.muted === 'boolean' && typeof value.settings.reducedMotion === 'boolean' && typeof value.settings.confirmEnd === 'boolean', 'ustawienia');
  if (value.run !== null) {
    check(record(value.run) && identifier(value.run.id), 'identyfikator wyprawy');
    const run = value.run;
    check(integer(run.room, 0, 2) && integer(run.seed, 1, 0xffffffff), 'komnata lub seed');
    check(['battle', 'reward', 'won', 'lost'].includes(String(run.status)), 'status wyprawy');
    check(listOfIds(run.relics, Object.keys(RELICS)) && run.relics.length <= 2, 'relikty wyprawy');
    check(listOfIds(run.offers, Object.keys(RELICS)) && run.offers.length <= 3, 'oferta reliktów');
    check(run.offers.every(id => !(run.relics as string[]).includes(id)), 'posiadany relikt w ofercie');
    const availableRelics = [...BASE_RELICS, ...(value.profile.unlocked as string[])];
    check(run.offers.every(id => availableRelics.includes(id)), 'nieodblokowany relikt w ofercie');
    check(run.status === 'reward' || run.offers.length === 0, 'oferta poza ekranem nagrody');
    check(Array.isArray(run.settledRooms) && run.settledRooms.every(room => integer(room, 0, run.room as number)) && new Set(run.settledRooms).size === run.settledRooms.length, 'rozliczone komnaty');
    validateBattle(run.battle);
    check(run.battle.room === run.room && JSON.stringify(run.battle.relics) === JSON.stringify(run.relics), 'niespójna wyprawa');
    if (run.status === 'battle') check(run.battle.phase === 'player' && !run.settledRooms.includes(run.room), 'aktywna walka została już rozliczona');
    if (run.status === 'reward') check(run.battle.phase === 'won' && run.room < 2 && run.offers.length > 0 && run.settledRooms.includes(run.room), 'oczekująca nagroda');
    if (run.status === 'won') check(run.battle.phase === 'won' && run.room === 2 && run.settledRooms.includes(2), 'ukończona wyprawa');
    if (run.status === 'lost') check(run.battle.phase === 'lost', 'przegrana wyprawa');
  }
  return copy(value as unknown as SaveData);
}

export function loadSave(): { data: SaveData; error: string | null } {
  try {
    const raw = globalThis.localStorage.getItem(SAVE_KEY);
    return { data: raw === null ? freshSave() : parseSave(raw), error: null };
  } catch {
    return { data: freshSave(), error: 'Nie udało się odczytać zapisu. Istniejące dane nie zostały nadpisane. Możesz grać bez zapisu lub zaimportować poprawny plik.' };
  }
}

export function exportSave(data: SaveData): string {
  return JSON.stringify(data, null, 2);
}

export function persistSave(data: SaveData): boolean {
  try {
    // One localStorage key holds profile and run: rewards cannot be half-written.
    const raw = JSON.stringify(data);
    parseSave(raw);
    globalThis.localStorage.setItem(SAVE_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

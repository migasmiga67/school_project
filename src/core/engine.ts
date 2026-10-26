import { DIRECTIONS } from './model';
import type { AbilityId, AbilityInfo, BattleState, BoardObject, Cell, Command, Direction, EnemyIntent, GameEvent, HeroId, HeroInfo, Resolution, Unit } from './model';
export * from './model';

export const HEROES: Record<HeroId, HeroInfo> = {
  ignis: { name: 'Ignis', role: 'Rycerz · Kontrola i obrona', maxHp: 12, movement: 3, abilities: ['bash', 'shield'], color: '#edbc6b' },
  kael: { name: 'Kael', role: 'Cień · Dystans i pułapki', maxHp: 8, movement: 4, abilities: ['shoot', 'snare'], color: '#74c9ad' },
  lyra: { name: 'Lyra', role: 'Mag · Czas i żywioły', maxHp: 7, movement: 3, abilities: ['swap', 'lightning'], color: '#b69bee' },
};
export const ABILITIES: Record<AbilityId, AbilityInfo> = {
  bash: { name: 'Pchnięcie Tarczą', cost: 1, cooldown: 1, description: '2 obrażenia sąsiedniemu wrogowi i pchnięcie o 1 pole. Kolizja zadaje 1 obrażenie obu obiektom. Otchłań zabija.' },
  shield: { name: 'Mur Światła', cost: 1, cooldown: 2, description: '3 tarczy dla Ignisa i sąsiednich sojuszników do następnej fazy gracza. Tarcze nie sumują się.' },
  shoot: { name: 'Precyzyjny Strzał', cost: 1, cooldown: 1, description: '3 obrażenia, zasięg 6 w linii prostej. Pierwsza jednostka lub przeszkoda zatrzymuje strzałę.' },
  snare: { name: 'Sidła Pustki', cost: 1, cooldown: 2, description: 'Pułapka na pustym polu w zasięgu 3. Zadaje 1 obrażenie i blokuje najbliższy ruch wroga. Maksymalnie 2 sidła.' },
  swap: { name: 'Pętla Czasowa', cost: 1, cooldown: 2, description: 'Zamień miejscami dwie żywe jednostki, również przeciwników. Kierunki zapowiedzianych ataków pozostają bez zmian.' },
  lightning: { name: 'Uderzenie Pioruna', cost: 2, cooldown: 2, description: '2 obrażenia na obszarze 2×2. Kotwica w zasięgu 4. Rani też sojuszników i Obelisk.' },
};
export const ROOM_NAMES = ['Próg Wieży', 'Pęknięta Galeria', 'Komnata Echa'];
const IDS = ['ignis', 'kael', 'lyra'] as const;
const DIRS = ['N', 'E', 'S', 'W'] as const;
export const distance = (a: Cell, b: Cell): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const sameCell = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;
export const inside = (c: Cell): boolean => Number.isInteger(c.x) && Number.isInteger(c.y) && c.x >= 0 && c.y >= 0 && c.x < 8 && c.y < 8;
export const unitAt = (s: BattleState, c: Cell): Unit | undefined => Object.values(s.units).find(u => sameCell(u.cell, c));
export const objectAt = (s: BattleState, c: Cell): BoardObject | undefined => Object.values(s.objects).find(o => o.hp > 0 && sameCell(o.cell, c));
const step = (c: Cell, d: Direction): Cell => ({ x: c.x + DIRECTIONS[d].x, y: c.y + DIRECTIONS[d].y });
const clone = (s: BattleState): BattleState => structuredClone(s);
const has = (s: BattleState, relic: string) => s.relics.includes(relic);
const hero = (kind: Unit['kind']): kind is HeroId => kind === 'ignis' || kind === 'kael' || kind === 'lyra';
const walkable = (s: BattleState, c: Cell, actorId?: string): boolean => inside(c) && s.board[c.y]?.[c.x] === 'floor' && !objectAt(s, c) && (!unitAt(s, c) || unitAt(s, c)?.id === actorId);
const movement = (s: BattleState, u: Unit): number => hero(u.kind) ? HEROES[u.kind].movement + (u.kind === 'kael' && has(s, 'cloak') ? 1 : 0) : u.kind === 'warden' ? 1 : 2;

export function createBattle(room: number, hp: Partial<Record<HeroId, number>> = {}, relics: string[] = []): BattleState {
  const n = Math.max(0, Math.min(2, Math.floor(room)));
  const s: BattleState = { room: n, round: 1, phase: 'player', board: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => 'floor' as const)), units: {}, objects: {}, traps: [], enemyOrder: [], intents: [], actionSequence: 0, relics: [...relics] };
  const positions: Record<HeroId, Cell> = { ignis: { x: 2, y: 5 }, kael: { x: 4, y: 6 }, lyra: { x: 5, y: 5 } };
  for (const id of IDS) {
    const maxHp = HEROES[id].maxHp + (id === 'ignis' && relics.includes('heart') ? 2 : 0);
    s.units[id] = { id, name: HEROES[id].name, kind: id, team: 'heroes', cell: positions[id], hp: Math.max(1, Math.min(maxHp, hp[id] ?? maxHp)), maxHp, shield: 0, ap: 2, readyRound: {}, rootedActivations: 0 };
  }
  s.objects.obelisk = { id: 'obelisk', kind: 'obelisk', cell: { x: 3, y: 6 }, hp: 6, maxHp: 6 };
  function add(kind: 'husk' | 'thorn' | 'warden', id: string, x: number, y: number) {
    const maxHp = kind === 'husk' ? 4 : kind === 'thorn' ? 3 : 12;
    s.units[id] = { id, kind, name: kind === 'husk' ? 'Pusta Łuska' : kind === 'thorn' ? 'Krwawy Cierń' : 'Strażnik Szczeliny', team: 'enemies', cell: { x, y }, hp: maxHp, maxHp, shield: 0, ap: 0, readyRound: {}, rootedActivations: 0 };
  }
  function cover(x: number, y: number) { const id = `cover-${x}-${y}`; s.objects[id] = { id, kind: 'cover', cell: { x, y }, hp: 2, maxHp: 2 }; }
  if (n === 0) {
    add('husk', 'husk-1', 2, 2); add('husk', 'husk-2', 4, 1); add('husk', 'husk-3', 6, 3);
    s.board[2][0] = 'wall'; s.board[2][7] = 'wall'; cover(3, 3);
  } else if (n === 1) {
    add('husk', 'husk-1', 1, 2); add('husk', 'husk-2', 6, 2); add('thorn', 'thorn-1', 2, 0); add('thorn', 'thorn-2', 5, 1);
    s.board[3][2] = 'void'; s.board[4][5] = 'void'; s.board[3][0] = 'wall'; s.board[3][7] = 'wall'; s.board[1][3] = 'wall'; cover(3, 3);
  } else {
    add('warden', 'warden-1', 3, 1); add('thorn', 'thorn-1', 1, 2); add('thorn', 'thorn-2', 6, 2);
    s.board[4][0] = 'void'; s.board[4][7] = 'void'; s.board[2][2] = 'void'; s.board[2][5] = 'void'; cover(3, 3); cover(4, 3);
  }
  s.enemyOrder = Object.values(s.units).filter(u => u.team === 'enemies').sort((a, b) => enemyInitiative(a) - enemyInitiative(b) || a.id.localeCompare(b.id)).map(u => u.id);
  s.intents = planIntents(s);
  return s;
}
function enemyInitiative(u: Unit): number { return u.kind === 'thorn' ? 10 : u.kind === 'husk' ? 20 : 40; }

function paths(s: BattleState, actor: Unit): Map<string, Cell[]> {
  const result = new Map<string, Cell[]>();
  const queue: Cell[] = [actor.cell]; result.set(`${actor.cell.x},${actor.cell.y}`, []);
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i]; const prefix = result.get(`${cell.x},${cell.y}`)!;
    for (const d of DIRS) {
      const next = step(cell, d), key = `${next.x},${next.y}`;
      if (!result.has(key) && walkable(s, next, actor.id)) { result.set(key, [...prefix, next]); queue.push(next); }
    }
  }
  return result;
}
export function reachable(s: BattleState, actorId: string): Cell[] {
  const u = s.units[actorId];
  if (!u || u.team !== 'heroes' || s.phase !== 'player' || u.ap < 1) return [];
  return [...paths(s, u).values()].filter(p => p.length > 0 && p.length <= movement(s, u)).map(p => p[p.length - 1]);
}
export function abilityError(s: BattleState, actorId: string, ability: AbilityId): string | null {
  const u = s.units[actorId];
  if (s.phase !== 'player') return 'Walka została zakończona.';
  if (!u || u.team !== 'heroes' || !hero(u.kind)) return 'Wybierz żywego Strażnika.';
  if (!HEROES[u.kind].abilities.includes(ability)) return 'Ten Strażnik nie zna tej umiejętności.';
  if ((u.readyRound[ability] ?? 0) > s.round) return `Dostępne w rundzie ${u.readyRound[ability]}.`;
  if (u.ap < ABILITIES[ability].cost) return `Potrzeba ${ABILITIES[ability].cost} PA.`;
  if (ability === 'snare' && s.traps.length >= 2) return 'Na planszy mogą być najwyżej 2 sidła.';
  return null;
}

interface Hit { unit?: Unit; object?: BoardObject; cell: Cell }
function ray(s: BattleState, from: Cell, direction: Direction, range: number, ignoreId?: string): Hit | null {
  let c = from;
  for (let i = 0; i < range; i++) {
    c = step(c, direction); if (!inside(c)) return null;
    if (s.board[c.y][c.x] === 'wall') return { cell: c };
    const unit = unitAt(s, c); if (unit && unit.id !== ignoreId) return { unit, cell: c };
    const object = objectAt(s, c); if (object) return { object, cell: c };
  }
  return null;
}
function directionTo(a: Cell, b: Cell): Direction | null {
  if (a.x === b.x && a.y !== b.y) return b.y < a.y ? 'N' : 'S';
  if (a.y === b.y && a.x !== b.x) return b.x < a.x ? 'W' : 'E';
  return null;
}
function attackStats(u: Unit): {range:number;damage:number} { return { range: u.kind === 'husk' ? 1 : u.kind === 'warden' ? 7 : 6, damage: u.kind === 'warden' ? 3 : 2 }; }
function enemyTargets(s: BattleState, u: Unit): Array<Unit | BoardObject> {
  const heroes = Object.values(s.units).filter(x => x.team === 'heroes').sort((a,b) => a.hp - b.hp || a.id.localeCompare(b.id));
  const obelisk = s.objects.obelisk?.hp > 0 ? [s.objects.obelisk] : [];
  return u.kind === 'thorn' ? [...heroes, ...obelisk] : [...obelisk, ...heroes];
}
function canAttack(s: BattleState, actor: Unit, from: Cell, target: Unit | BoardObject): Direction | null {
  const d = directionTo(from, target.cell); if (!d) return null;
  const hit = ray(s, from, d, attackStats(actor).range, actor.id);
  return hit && (hit.unit?.id ?? hit.object?.id) === target.id ? d : null;
}
export function planIntents(s: BattleState): EnemyIntent[] {
  if (s.phase !== 'player') return [];
  return s.enemyOrder.flatMap<EnemyIntent>(id => {
    const u = s.units[id]; if (!u) return [];
    const stats = attackStats(u), targets = enemyTargets(s, u);
    for (const target of targets) { const d = canAttack(s, u, u.cell, target); if (d) return [{ actorId: id, kind: 'line' as const, direction: d, ...stats }]; }
    const routes = paths(s, u);
    for (const target of targets) {
      let best: Cell[] | null = null;
      for (const path of routes.values()) {
        if (!path.length || (best && path.length >= best.length)) continue;
        if (canAttack(s, u, path[path.length - 1], target)) best = path;
      }
      if (best) return [{ actorId: id, kind: 'move' as const, path: best.slice(0, movement(s, u)) }];
    }
    return [{ actorId: id, kind: 'wait' as const }];
  });
}

function damage(s: BattleState, id: string, amount: number, events: GameEvent[], label?: string): void {
  const u = s.units[id];
  if (u) {
    const absorbed = Math.min(u.shield, amount); u.shield -= absorbed; u.hp = Math.max(0, u.hp - (amount - absorbed));
    events.push({ type: 'damage', targetId: id, to: { ...u.cell }, amount, text: `${u.name}: ${label ?? 'obrażenia'} −${amount}${absorbed ? ` (tarcza ${absorbed})` : ''}.` });
    if (u.hp <= 0) { events.push({ type: 'death', targetId: id, to: { ...u.cell }, text: `${u.name} pada.` }); delete s.units[id]; }
    return;
  }
  const o = s.objects[id]; if (!o || o.hp <= 0) return;
  o.hp = Math.max(0, o.hp - amount); events.push({ type: 'damage', targetId: id, to: { ...o.cell }, amount, text: `${o.kind === 'obelisk' ? 'Obelisk' : 'Osłona'}: −${amount} HP.` });
  if (o.hp <= 0 && o.kind === 'cover') delete s.objects[id];
}
function enterTrap(s: BattleState, id: string, events: GameEvent[]): boolean {
  const u = s.units[id]; if (!u || u.team !== 'enemies') return false;
  const index = s.traps.findIndex(t => sameCell(t.cell, u.cell)); if (index < 0) return false;
  const trap = s.traps[index]; s.traps.splice(index, 1);
  events.push({ type: 'trap', targetId: id, to: { ...u.cell }, text: `${u.name} uruchamia sidła.` });
  damage(s, id, trap.damage, events, 'sidła'); if (s.units[id]) s.units[id].rootedActivations = 1;
  return true;
}
function terminal(s: BattleState): void {
  if (!s.objects.obelisk || s.objects.obelisk.hp <= 0 || !Object.values(s.units).some(u => u.team === 'heroes')) s.phase = 'lost';
  else if (!Object.values(s.units).some(u => u.team === 'enemies')) s.phase = 'won';
}
function enemyPhase(s: BattleState, events: GameEvent[]): void {
  for (const id of s.enemyOrder) {
    if (s.phase !== 'player') break;
    const u = s.units[id], intent = s.intents.find(i => i.actorId === id); if (!u || !intent) continue;
    if (intent.kind === 'move') {
      if (u.rootedActivations <= 0) {
        for (const c of intent.path) {
          if (distance(u.cell, c) !== 1 || !walkable(s, c, id)) break;
          const from = { ...u.cell }; u.cell = { ...c };
          events.push({ type: 'move', actorId: id, from, to: { ...c }, text: `${u.name} przemieszcza się.` });
          if (enterTrap(s, id, events)) break;
        }
      } else events.push({ type: 'trap', targetId: id, to: { ...u.cell }, text: `${u.name}: ruch zatrzymany przez sidła.` });
    } else if (intent.kind === 'line') {
      const hit = ray(s, u.cell, intent.direction, intent.range, id);
      events.push({ type: 'move', actorId: id, from: { ...u.cell }, to: hit?.cell ?? { ...u.cell }, text: `${u.name} atakuje ${intent.direction}.` });
      if (hit?.unit) damage(s, hit.unit.id, intent.damage, events);
      else if (hit?.object) damage(s, hit.object.id, intent.damage, events);
    }
    if (s.units[id]) s.units[id].rootedActivations = 0;
    terminal(s);
  }
  s.traps = s.traps.filter(t => t.expiresAfterEnemyRound > s.round);
  if (s.phase === 'player') {
    s.round++;
    for (const u of Object.values(s.units)) if (u.team === 'heroes') { u.ap = 2; u.shield = 0; }
    s.intents = planIntents(s);
    events.push({ type: 'round', text: `Runda ${s.round}. Strażnicy odzyskują PA.` });
  }
}

export function reduce(original: BattleState, command: Command): Resolution {
  if (original.phase !== 'player') return { ok: false, reason: 'Ta walka została zakończona.' };
  if (command.type === 'endTurn') {
    const state = clone(original), events: GameEvent[] = []; enemyPhase(state, events); state.actionSequence++;
    return { ok: true, state, events };
  }
  const source = original.units[command.actorId];
  if (!source || source.team !== 'heroes' || !hero(source.kind)) return { ok: false, reason: 'Wybierz żywego Strażnika.' };
  if (command.type === 'move') {
    if (source.ap < 1) return { ok: false, reason: 'Brak punktów akcji.' };
    if (!inside(command.destination)) return { ok: false, reason: 'Cel jest poza planszą.' };
    const route = paths(original, source).get(`${command.destination.x},${command.destination.y}`);
    if (!route?.length || route.length > movement(original, source)) return { ok: false, reason: 'Pole jest zablokowane lub poza zasięgiem ruchu.' };
    const state = clone(original), u = state.units[source.id], events: GameEvent[] = [];
    u.ap--; const from = { ...u.cell }; u.cell = { ...command.destination };
    events.push({ type: 'move', actorId: u.id, from, to: { ...u.cell }, text: `${u.name} porusza się na ${String.fromCharCode(65+u.cell.x)}${u.cell.y+1}.` }); state.actionSequence++;
    return { ok: true, state, events };
  }
  const ability = command.type;
  const error = abilityError(original, source.id, ability); if (error) return { ok: false, reason: error };
  // Validate every target before charging PA or cloning any persistent state.
  if (command.type === 'bash') {
    const target = original.units[command.targetId];
    if (!target || target.team !== 'enemies' || distance(source.cell, target.cell) !== 1) return { ok: false, reason: 'Wybierz przeciwnika na sąsiednim polu.' };
  } else if (command.type === 'shoot') {
    if (!DIRS.includes(command.direction)) return { ok: false, reason: 'Strzał wymaga kierunku N, E, S lub W.' };
    const hit = ray(original, source.cell, command.direction, has(original, 'lens') ? 7 : 6);
    if (!hit || (hit.unit?.team !== 'enemies' && hit.object?.kind !== 'cover')) return { ok: false, reason: 'Na linii musi być wróg lub krucha osłona, bez sojusznika po drodze.' };
  } else if (command.type === 'snare') {
    if (!inside(command.cell) || distance(source.cell, command.cell) > 3 || !walkable(original, command.cell) || original.traps.some(t => sameCell(t.cell, command.cell))) return { ok: false, reason: 'Sidła wymagają pustej posadzki w zasięgu 3.' };
  } else if (command.type === 'swap') {
    if (command.firstId === command.secondId || !original.units[command.firstId] || !original.units[command.secondId]) return { ok: false, reason: 'Wybierz dwie różne żywe jednostki.' };
  } else if (command.type === 'lightning') {
    const c = command.anchor;
    if (!inside(c) || c.x > 6 || c.y > 6 || distance(source.cell, c) > 4) return { ok: false, reason: 'Kwadrat 2×2 musi mieścić się na planszy, kotwica w zasięgu 4.' };
    const inArea = (cell: Cell) => cell.x >= c.x && cell.x <= c.x + 1 && cell.y >= c.y && cell.y <= c.y + 1;
    if (!Object.values(original.units).some(u => u.team === 'enemies' && inArea(u.cell)) && !Object.values(original.objects).some(o => o.kind === 'cover' && o.hp > 0 && inArea(o.cell))) return { ok: false, reason: 'Piorun musi obejmować wroga lub kruchą osłonę.' };
  }
  const state = clone(original), actor = state.units[source.id], events: GameEvent[] = [];
  actor.ap -= ABILITIES[ability].cost; actor.readyRound[ability] = state.round + ABILITIES[ability].cooldown;
  if (command.type === 'shield') {
    const amount = has(state, 'seal') ? 4 : 3;
    for (const u of Object.values(state.units)) if (u.team === 'heroes' && distance(actor.cell, u.cell) <= 1) { u.shield = Math.max(amount, u.shield); events.push({ type: 'shield', actorId: actor.id, targetId: u.id, to: { ...u.cell }, amount, text: `${u.name} otrzymuje tarczę ${amount}.` }); }
  } else if (command.type === 'bash') {
    const target = state.units[command.targetId], cell = { ...target.cell };
    const direction = directionTo(actor.cell, cell)!;
    damage(state, target.id, has(state, 'weight') ? 3 : 2, events);
    if (state.units[target.id]) {
      const next = step(cell, direction), blocker = inside(next) ? unitAt(state, next) : undefined, obstacle = inside(next) ? objectAt(state, next) : undefined;
      if (!inside(next) || state.board[next.y][next.x] === 'wall' || blocker || obstacle) {
        damage(state, target.id, 1, events, 'kolizja');
        if (blocker) damage(state, blocker.id, 1, events, 'kolizja');
        if (obstacle) damage(state, obstacle.id, 1, events, 'kolizja');
      } else if (state.board[next.y][next.x] === 'void') {
        events.push({ type: 'death', targetId: target.id, from: cell, to: next, text: `${target.name} wpada w Otchłań.` }); delete state.units[target.id];
      } else {
        state.units[target.id].cell = next; events.push({ type: 'move', actorId: target.id, from: cell, to: next, text: `${target.name} zostaje odepchnięty.` }); enterTrap(state, target.id, events);
      }
    }
  } else if (command.type === 'shoot') {
    const hit = ray(state, actor.cell, command.direction, has(state, 'lens') ? 7 : 6)!;
    damage(state, hit.unit?.id ?? hit.object!.id, 3, events);
  } else if (command.type === 'snare') {
    state.traps.push({ id: `trap-${state.actionSequence}`, cell: { ...command.cell }, damage: has(state, 'teeth') ? 2 : 1, expiresAfterEnemyRound: state.round + 2 });
    events.push({ type: 'trap', actorId: actor.id, to: { ...command.cell }, text: 'Kael ustawia Sidła Pustki.' });
  } else if (command.type === 'swap') {
    const first = state.units[command.firstId], second = state.units[command.secondId], from = { ...first.cell }, to = { ...second.cell };
    first.cell = to; second.cell = from;
    events.push({ type: 'swap', actorId: first.id, targetId: second.id, from, to, text: `${first.name} i ${second.name} zamieniają się miejscami.` });
    for (const id of [first.id, second.id].sort()) enterTrap(state, id, events);
  } else if (command.type === 'lightning') {
    const c = command.anchor, inArea = (cell: Cell) => cell.x >= c.x && cell.x <= c.x + 1 && cell.y >= c.y && cell.y <= c.y + 1;
    const targets = [...Object.values(state.units).filter(u => inArea(u.cell) && !(u.team === 'heroes' && has(state, 'spark'))), ...Object.values(state.objects).filter(o => o.hp > 0 && inArea(o.cell))].map(o => o.id);
    for (const id of targets) damage(state, id, 2, events, 'piorun');
  }
  state.actionSequence++; terminal(state);
  return { ok: true, state, events };
}
export function forecast(s: BattleState): { state: BattleState; events: GameEvent[] } {
  const result = reduce(s, { type: 'endTurn' });
  return result.ok ? { state: result.state, events: result.events } : { state: clone(s), events: [] };
}

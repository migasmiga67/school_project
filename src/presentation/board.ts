import Phaser from 'phaser';
import { DIRECTIONS } from '../core/model';
import type { BattleState, Cell, GameEvent, Unit } from '../core/model';

export interface BoardOptions {
  selectedId: string;
  mode: string;
  reachable: Cell[];
  targetCells: Cell[];
  hover: Cell | null;
  swapFirst: string | null;
  forecast: BattleState | null;
  reducedMotion: boolean;
}

const SIZE = 640;
const OFFSET = 40;
const TILE = 70;
const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
const center = (cell: Cell) => ({ x: OFFSET + cell.x * TILE + TILE / 2, y: OFFSET + cell.y * TILE + TILE / 2 });
const inside = (cell: Cell) => cell.x >= 0 && cell.x < 8 && cell.y >= 0 && cell.y < 8;
const ink = 0x0b0c16;
const heroColor: Record<string, number> = { ignis: 0xe6c079, kael: 0x69c4b1, lyra: 0xb394ed };

class TacticsScene extends Phaser.Scene {
  constructor(private owner: BoardView) { super({ key: 'tactics' }); }
  create() { this.owner.ready(this); }
  update(time: number) { this.owner.ambient(time); }
}

/** Phaser only presents immutable battle state; combat rules live in core/. */
export class BoardView {
  private game: Phaser.Game;
  private scene: Phaser.Scene | null = null;
  private world: Phaser.GameObjects.Container | null = null;
  private effects: Phaser.GameObjects.Container | null = null;
  private atmosphere: Phaser.GameObjects.Graphics | null = null;
  private state: BattleState | null = null;
  private options: BoardOptions | null = null;
  private lastHover = '';
  private destroyed = false;
  private observer: ResizeObserver | null = null;

  constructor(parent: HTMLElement, private onCell: (cell: Cell) => void, private onHover: (cell: Cell | null) => void) {
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width: SIZE,
      height: SIZE,
      backgroundColor: '#10111e',
      pixelArt: true,
      antialias: false,
      banner: false,
      audio: { noAudio: true },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: SIZE, height: SIZE },
      scene: [new TacticsScene(this)],
      render: { roundPixels: true },
    });
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => { if (!this.destroyed) this.game.scale.refresh(); });
      this.observer.observe(parent);
    }
  }

  ready(scene: Phaser.Scene) {
    if (this.destroyed) return;
    this.scene = scene;
    this.world = scene.add.container(0, 0).setDepth(0);
    this.atmosphere = scene.add.graphics().setDepth(8);
    this.effects = scene.add.container(0, 0).setDepth(10);
    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const cell = this.pointerCell(pointer);
      if (cell) this.onCell(cell);
    });
    scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const cell = this.pointerCell(pointer);
      const key = cell ? `${cell.x}:${cell.y}` : '';
      if (this.lastHover !== key) { this.lastHover = key; this.onHover(cell); }
    });
    scene.input.on('gameout', () => { this.lastHover = ''; this.onHover(null); });
    if (this.state && this.options) this.render(this.state, this.options);
  }

  private pointerCell(pointer: Phaser.Input.Pointer): Cell | null {
    const cell = { x: Math.floor((pointer.x - OFFSET) / TILE), y: Math.floor((pointer.y - OFFSET) / TILE) };
    return inside(cell) ? cell : null;
  }

  private text(x: number, y: number, text: string, color = '#9a96ae', size = 11, align: 'left' | 'center' | 'right' = 'center') {
    const t = this.scene!.add.text(x, y, text, { fontFamily: 'monospace', fontSize: `${size}px`, color, fontStyle: 'bold', align }).setOrigin(align === 'center' ? .5 : align === 'right' ? 1 : 0, .5);
    this.world!.add(t);
    return t;
  }

  render(state: BattleState, options: BoardOptions) {
    this.state = state;
    this.options = options;
    if (!this.scene || !this.world || this.destroyed) return;
    this.world.removeAll(true);
    const g = this.scene.add.graphics();
    this.world.add(g);
    g.fillStyle(0x11111d).fillRect(0, 0, SIZE, SIZE);
    // Recessed stone frame and a thin engraved border.
    g.fillStyle(0x1c1c2b).fillRect(24, 24, 592, 592);
    g.lineStyle(1, 0x49404c, .65).strokeRect(23.5, 23.5, 593, 593);
    g.lineStyle(2, 0x080a12).strokeRect(37, 37, 566, 566);
    for (const x of [26, 606]) for (const y of [26, 606]) {
      g.fillStyle(0x8d7652).fillRect(x, y, 8, 8);
      g.fillStyle(0xcfb580).fillRect(x + 2, y + 2, 3, 3);
    }
    for (let i = 0; i < 8; i++) {
      const c = OFFSET + i * TILE + TILE / 2;
      this.text(c, 12, String.fromCharCode(65 + i), '#77738b', 10);
      this.text(12, c, `${i + 1}`, '#77738b', 10);
      this.text(c, 628, '·', '#77738b', 10);
      this.text(628, c, '·', '#77738b', 10);
    }
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      this.tile(g, { x, y }, state.board[y][x]);
    }
    // Green diamonds describe legal movement; purple rims describe targeting.
    for (const cell of options.reachable) this.highlight(g, cell, 0x72b7a4, .10, .24);
    for (const cell of options.targetCells) this.highlight(g, cell, options.mode === 'lightning' || options.mode === 'swap' ? 0xaa82ea : 0xd7b56f, .10, .42);
    this.intentions(g, state);
    for (const trap of state.traps) {
      const p = center(trap.cell);
      g.lineStyle(2, 0xa575d6, .85);
      g.strokeCircle(p.x, p.y + 4, 17);
      g.strokeCircle(p.x, p.y + 4, 11);
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2;
        const px = p.x + Math.cos(angle) * 19, py = p.y + 4 + Math.sin(angle) * 19;
        g.fillStyle(0xca9ff4).fillTriangle(px - 3, py - 3, px + 3, py - 3, px, py + 3);
      }
    }
    for (const obj of Object.values(state.objects)) {
      const p = center(obj.cell);
      if (obj.kind === 'obelisk') {
        g.fillStyle(0xe6bd6b, .05).fillCircle(p.x, p.y, 36);
        g.fillStyle(0xe6bd6b, .08).fillCircle(p.x, p.y, 27);
        g.fillStyle(0x060910, .5).fillEllipse(p.x, p.y + 21, 45, 13);
        g.fillStyle(0x3d3b46).fillRect(p.x - 22, p.y + 13, 44, 11);
        g.fillStyle(0x6c6270).fillRect(p.x - 18, p.y + 10, 36, 6);
        g.fillStyle(0x9b815b).fillRect(p.x - 10, p.y + 6, 20, 6);
        g.fillStyle(0xf3d48c).fillPoints([{ x: p.x, y: p.y - 27 }, { x: p.x + 13, y: p.y - 8 }, { x: p.x, y: p.y + 11 }, { x: p.x - 13, y: p.y - 8 }], true);
        g.fillStyle(0xac8652).fillTriangle(p.x, p.y - 27, p.x + 13, p.y - 8, p.x, p.y + 11);
        g.fillStyle(0xffedb8).fillTriangle(p.x, p.y - 27, p.x, p.y + 11, p.x - 7, p.y - 8);
        g.lineStyle(1, 0xd9bb77, .6).strokeEllipse(p.x, p.y + 22, 55, 19);
      } else {
        g.fillStyle(ink, .5).fillEllipse(p.x, p.y + 17, 45, 15);
        g.fillStyle(0x454352).fillRect(p.x - 20, p.y - 15, 40, 32);
        g.fillStyle(0x65606c).fillRect(p.x - 20, p.y - 18, 40, 5);
        g.fillStyle(0x32313e).fillRect(p.x - 20, p.y + 12, 40, 7);
        g.lineStyle(2, 0x24232f).beginPath().moveTo(p.x + 3, p.y - 14).lineTo(p.x - 3, p.y - 3).lineTo(p.x + 6, p.y + 5).lineTo(p.x + 2, p.y + 14).strokePath();
        g.lineStyle(1, 0x77707d).strokeRect(p.x - 20, p.y - 18, 40, 37);
      }
      this.health(g, obj.cell, obj.hp, obj.maxHp, obj.kind === 'obelisk' ? 0xe4c57d : 0x8e8799, options.forecast?.objects[obj.id]?.hp ?? (options.forecast ? 0 : obj.hp), false);
    }
    for (const unit of Object.values(state.units)) this.unit(g, unit, options);
    if (options.hover && inside(options.hover)) {
      this.highlight(g, options.hover, 0xf1d598, .08, .9);
      if (options.mode === 'lightning') {
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const cell = { x: options.hover.x + dx, y: options.hover.y + dy };
          if (inside(cell)) this.highlight(g, cell, 0xc89bff, .14, .8);
        }
      }
    }
  }

  private tile(g: Phaser.GameObjects.Graphics, cell: Cell, type: string) {
    const x = OFFSET + cell.x * TILE, y = OFFSET + cell.y * TILE;
    const noise = (cell.x * 17 + cell.y * 31) % 7;
    if (type === 'void') {
      g.fillStyle(0x080912).fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
      g.fillStyle(0x22112e).fillRect(x + 7, y + 7, TILE - 14, TILE - 14);
      g.fillStyle(0x090a17).fillRect(x + 12, y + 11, TILE - 24, TILE - 22);
      g.lineStyle(1, 0x8052a9, .65).beginPath().moveTo(x + 4, y + 1).lineTo(x + 4, y + 19).lineTo(x + 10, y + 19).lineTo(x + 10, y + 39).strokePath();
      g.lineStyle(1, 0x593276, .7).beginPath().moveTo(x + 62, y + 25).lineTo(x + 56, y + 25).lineTo(x + 56, y + 60).lineTo(x + 39, y + 60).strokePath();
      g.fillStyle(0x73479a, .55).fillRect(x + 25, y + 27, 3, 3);
      g.fillStyle(0xa370d5, .3).fillRect(x + 38, y + 44, 2, 2);
      return;
    }
    const color = (cell.x + cell.y) % 2 === 0 ? 0x262634 : 0x22232f;
    g.fillStyle(color).fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
    g.fillStyle(0x393746, .55).fillRect(x + 3, y + 3, TILE - 6, 2);
    g.fillStyle(0x11131e, .7).fillRect(x + 3, y + TILE - 5, TILE - 6, 3);
    g.fillStyle(0x5a5260, .2).fillRect(x + 11 + noise * 3, y + 17, 2, 2);
    g.fillStyle(0x060911, .2).fillRect(x + 38, y + 43 + noise, 8, 2);
    if (noise < 2) {
      g.lineStyle(1, 0x141620, .8).beginPath().moveTo(x + 44, y + 3).lineTo(x + 38, y + 15).lineTo(x + 45, y + 21).strokePath();
    }
    if (type === 'wall') {
      g.fillStyle(0x10121e, .8).fillRect(x + 6, y + 14, 58, 49);
      g.fillStyle(0x343542).fillRect(x + 7, y + 3, 56, 49);
      g.fillStyle(0x575360).fillRect(x + 7, y + 3, 56, 6);
      g.fillStyle(0x1c1e2b).fillRect(x + 7, y + 43, 56, 9);
      g.lineStyle(2, 0x23232f).lineBetween(x + 8, y + 26, x + 62, y + 26);
      g.lineBetween(x + 26, y + 9, x + 26, y + 25);
      g.lineBetween(x + 44, y + 27, x + 44, y + 43);
      g.fillStyle(0x77707b, .25).fillRect(x + 12, y + 11, 8, 2);
    }
  }

  private highlight(g: Phaser.GameObjects.Graphics, cell: Cell, color: number, fill: number, border: number) {
    const x = OFFSET + cell.x * TILE + 3, y = OFFSET + cell.y * TILE + 3;
    g.fillStyle(color, fill).fillRect(x, y, TILE - 6, TILE - 6);
    g.lineStyle(1, color, border).strokeRect(x + .5, y + .5, TILE - 7, TILE - 7);
  }

  private intentions(g: Phaser.GameObjects.Graphics, state: BattleState) {
    for (const intent of state.intents) {
      const actor = state.units[intent.actorId];
      if (!actor) continue;
      const p = center(actor.cell);
      const index = state.enemyOrder.indexOf(actor.id) + 1;
      g.fillStyle(0x241521, .95).fillRect(p.x + 17, p.y - 29, 17, 16);
      g.lineStyle(1, 0xbd6a73, .6).strokeRect(p.x + 17, p.y - 29, 17, 16);
      this.text(p.x + 25, p.y - 21, `${index}`, '#f4abb1', 10);
      if (intent.kind === 'line') {
        const delta = DIRECTIONS[intent.direction];
        let last = actor.cell;
        for (let step = 1; step <= intent.range; step++) {
          const cell = { x: actor.cell.x + delta.x * step, y: actor.cell.y + delta.y * step };
          if (!inside(cell) || state.board[cell.y][cell.x] === 'wall') break;
          last = cell;
          this.highlight(g, cell, 0xd0596d, .055, .18);
          if (Object.values(state.units).some(u => same(u.cell, cell)) || Object.values(state.objects).some(o => same(o.cell, cell))) break;
        }
        if (!same(last, actor.cell)) {
          const endpoint = center(last);
          const endX = endpoint.x - delta.x * 14, endY = endpoint.y - delta.y * 14;
          g.lineStyle(2, 0xd16c7a, .48).lineBetween(p.x + delta.x * 26, p.y + delta.y * 26, endX, endY);
          const perp = { x: -delta.y * 5, y: delta.x * 5 };
          g.fillStyle(0xe18b94, .75).fillTriangle(endX + delta.x * 7, endY + delta.y * 7, endX - delta.x * 3 + perp.x, endY - delta.y * 3 + perp.y, endX - delta.x * 3 - perp.x, endY - delta.y * 3 - perp.y);
        }
      } else if (intent.kind === 'move') {
        let previous = actor.cell;
        for (const cell of intent.path) {
          if (!inside(cell) || Math.abs(previous.x - cell.x) + Math.abs(previous.y - cell.y) !== 1) break;
          if (state.board[cell.y][cell.x] !== 'floor' || Object.values(state.units).some(u => u.id !== actor.id && same(u.cell, cell)) || Object.values(state.objects).some(o => same(o.cell, cell))) break;
          const c = center(cell), from = center(previous);
          g.lineStyle(1, 0xd89183, .3).lineBetween(from.x, from.y, c.x, c.y);
          g.fillStyle(0xd89183, .5).fillCircle(c.x, c.y, 2);
          previous = cell;
        }
      }
    }
  }

  private unit(g: Phaser.GameObjects.Graphics, unit: Unit, options: BoardOptions) {
    const p = center(unit.cell);
    const selected = unit.id === options.selectedId;
    const color = heroColor[unit.kind] ?? 0xdb6c7d;
    if (selected || options.swapFirst === unit.id) {
      g.fillStyle(color, .09).fillCircle(p.x, p.y, 31);
      g.lineStyle(2, color, .75).strokeEllipse(p.x, p.y + 21, 49, 18);
      // Pixel corner brackets remain legible with reduced effects.
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const x = p.x + sx * 29, y = p.y + sy * 27;
        g.lineStyle(2, color, .9).lineBetween(x, y, x - sx * 6, y);
        g.lineBetween(x, y, x, y - sy * 6);
      }
    }
    g.fillStyle(0x050810, .65).fillEllipse(p.x, p.y + 18, unit.kind === 'warden' ? 48 : 36, 12);
    this.sprite(g, unit, p.x, p.y - 4);
    if (unit.shield > 0) {
      g.lineStyle(1, 0xf3d692, .5).strokeEllipse(p.x, p.y - 1, 48, 53);
      g.fillStyle(0xf3d692, .035).fillEllipse(p.x, p.y - 1, 48, 53);
      this.text(p.x - 23, p.y - 25, `◇${unit.shield}`, '#f5d897', 10);
    }
    if (unit.rootedActivations > 0) {
      g.lineStyle(2, 0xb18adf, .9).strokeEllipse(p.x, p.y + 15, 38, 10);
      this.text(p.x - 22, p.y - 15, '×', '#c9a0f6', 13);
    }
    const next = options.forecast?.units[unit.id];
    this.health(g, unit.cell, unit.hp, unit.maxHp, unit.team === 'heroes' ? color : 0xce697a, options.forecast ? next?.hp ?? 0 : unit.hp, unit.team === 'heroes');
    if (unit.team === 'heroes') {
      for (let i = 0; i < 2; i++) {
        g.fillStyle(i < unit.ap ? color : 0x3c3948).fillRect(p.x - 6 + i * 8, p.y + 31, 4, 4);
      }
    }
  }

  private health(g: Phaser.GameObjects.Graphics, cell: Cell, hp: number, maxHp: number, color: number, forecastHp: number, hero: boolean) {
    const p = center(cell), width = 36, y = p.y + 24;
    g.fillStyle(0x070a12).fillRect(p.x - width / 2 - 1, y - 1, width + 2, 5);
    g.fillStyle(0x34303f).fillRect(p.x - width / 2, y, width, 3);
    g.fillStyle(color).fillRect(p.x - width / 2, y, Math.max(0, hp / maxHp) * width, 3);
    if (forecastHp < hp) {
      g.fillStyle(0xf5c0be, .9).fillRect(p.x - width / 2 + Math.max(0, forecastHp) / maxHp * width, y, (hp - Math.max(0, forecastHp)) / maxHp * width, 3);
      if (forecastHp <= 0) this.text(p.x + 25, p.y + 25, '×', '#f8a2aa', 15);
    }
    if (hero) this.text(p.x + 25, p.y + 15, `${hp}`, '#ded9e7', 9);
  }

  private sprite(g: Phaser.GameObjects.Graphics, unit: Unit, x: number, y: number) {
    // Native pixel geometry: each silhouette has its own readable equipment.
    const rect = (dx: number, dy: number, w: number, h: number, color: number) => g.fillStyle(color).fillRect(Math.round(x + dx), Math.round(y + dy), w, h);
    const skin = 0xd6bca4;
    if (unit.kind === 'ignis') {
      rect(-14, -22, 28, 35, ink); rect(-10, -20, 20, 11, 0xb6bdc3);
      rect(-13, -11, 26, 20, 0x8c805f); rect(-10, -10, 20, 17, 0xc3ab73);
      rect(-5, -17, 13, 5, 0x353441); rect(-2, -16, 10, 2, 0x85c4c7);
      rect(-4, -23, 8, 4, 0xe2c285); rect(-11, 9, 8, 9, 0x56515a); rect(4, 9, 8, 9, 0x56515a);
      rect(-14, -10, 6, 8, 0xe0c88e); rect(9, -10, 6, 8, 0xe0c88e);
      rect(-22, -5, 17, 23, 0x181925); rect(-20, -3, 13, 18, 0xb49660);
      rect(-18, -1, 9, 14, 0x565065); rect(-15, 0, 3, 12, 0xe7c47c); rect(-18, 4, 9, 3, 0xe7c47c);
      rect(18, -23, 3, 28, 0xd2dfe3); rect(16, -22, 2, 25, 0x7e929e); rect(12, 3, 15, 3, 0xc3a369); rect(18, 6, 3, 8, 0x7d5b4f);
    } else if (unit.kind === 'kael') {
      rect(-12, -20, 24, 34, ink); rect(-9, -23, 18, 6, 0x508e82); rect(-12, -17, 24, 14, 0x3b6e68);
      rect(-7, -15, 14, 10, 0x111b26); rect(-5, -12, 10, 7, skin); rect(-4, -11, 8, 2, 0x73b8aa);
      rect(-10, -4, 20, 17, 0x3e7d75); rect(-7, 0, 14, 13, 0x526669); rect(-10, 12, 7, 7, 0x3c4251); rect(3, 12, 7, 7, 0x3c4251);
      rect(-13, -2, 5, 13, 0x7a6d64); rect(9, -2, 5, 13, skin); rect(-7, 2, 14, 3, 0xb1926a);
      g.lineStyle(3, 0xb68e62).beginPath().moveTo(x + 18, y - 16).lineTo(x + 25, y - 7).lineTo(x + 26, y + 6).lineTo(x + 18, y + 16).strokePath();
      g.lineStyle(1, 0xced5bc, .9).lineBetween(x + 18, y - 16, x + 18, y + 16);
      rect(-16, -24, 3, 20, 0x8b6c53); rect(-18, -25, 7, 4, 0xb7d1be);
    } else if (unit.kind === 'lyra') {
      rect(-7, -24, 14, 7, 0xa195cd); rect(-11, -17, 22, 12, 0x8c7ab1); rect(-6, -15, 12, 10, skin);
      rect(-6, -21, 12, 5, 0xb6a4e0); rect(-11, -4, 22, 10, 0x7e68a8); rect(-14, 6, 28, 12, 0x665082); rect(-17, 15, 34, 5, 0x9580ba);
      rect(-5, -3, 10, 15, 0x9d8eb9); rect(-2, 0, 4, 4, 0xf2d398); rect(-3, 17, 6, 3, 0xf1dba4);
      rect(-16, -3, 6, 12, skin); rect(11, -3, 6, 12, skin); rect(20, -26, 3, 46, 0x927695);
      g.fillStyle(0xb08bea, .12).fillCircle(x + 21, y - 24, 13);
      g.fillStyle(0xd0b2ff).fillPoints([{ x:x+21,y:y-34 }, {x:x+27,y:y-25}, {x:x+21,y:y-15},{x:x+15,y:y-25}],true);
      rect(20, -30, 2, 11, 0xf1e3ff);
    } else if (unit.kind === 'husk') {
      rect(-13,-18,26,31,ink); rect(-9,-22,18,6,0x6c5366); rect(-12,-16,24,12,0x7e5268); rect(-9,-9,18,10,0x4d344c);
      rect(-10,0,20,15,0x6b3d52); rect(-15,-3,6,16,0xa36e7d);rect(9,-3,6,16,0xa36e7d);
      rect(-8,14,6,6,0x50384e);rect(3,14,6,6,0x50384e);rect(-7,-13,4,3,0xf5a49b);rect(4,-13,4,3,0xf5a49b);rect(-2,-2,4,12,0x9b5b6b);
    } else if (unit.kind === 'thorn') {
      rect(-10,-20,20,6,0x64354c);rect(-14,-14,28,11,0x7b3e59);rect(-11,-3,22,18,0x522d45);rect(-7,15,6,5,0x7e4259);rect(2,15,6,5,0x7e4259);
      rect(-6,-12,4,3,0xf8a9a4);rect(4,-12,4,3,0xf8a9a4);rect(-2,-6,5,14,0xa66575);
      rect(-20,-11,5,17,0x9b5d74);rect(15,-11,5,17,0x9b5d74);rect(-22,-17,5,7,0xdb9eab);rect(17,-17,5,7,0xdb9eab);
      rect(-3,-25,6,6,0xbd798a); rect(-17,10,7,5,0x9b5d74);rect(11,10,7,5,0x9b5d74);
    } else {
      rect(-20,-24,40,40,ink);rect(-16,-26,32,13,0x8b6979);rect(-22,-14,44,12,0x795067);rect(-16,-2,32,20,0x4b334b);
      rect(-10,-22,20,9,0x31273a);rect(-8,-19,5,3,0xffa99e);rect(4,-19,5,3,0xffa99e);rect(-3,-10,6,22,0xcf9b8e);
      rect(-22,-8,8,20,0x9c6c79);rect(15,-8,8,20,0x9c6c79);rect(-15,15,10,8,0x736071);rect(5,15,10,8,0x736071);
      rect(-16,-31,5,8,0xd4a989);rect(12,-31,5,8,0xd4a989);rect(-3,-34,7,8,0xeac49b);
      rect(27,-13,4,37,0x9d7c7d);rect(23,-19,13,11,0xb58f91);rect(20,-18,5,17,0x67495e);
    }
  }

  ambient(time: number) {
    if (!this.atmosphere || !this.options) return;
    const g = this.atmosphere;
    g.clear();
    if (this.options.reducedMotion) return;
    // Sparse motes stay off UI and never hide a tactical overlay.
    for (let i = 0; i < 14; i++) {
      const x = 45 + (i * 97) % 551;
      const y = 45 + ((i * 73 + time * (.004 + i % 3 * .001)) % 551);
      const alpha = .12 + Math.sin(time * .001 + i) * .08;
      g.fillStyle(i % 3 === 0 ? 0xf1ca7e : 0xa78cd7, alpha).fillRect(x, y, i % 3 === 0 ? 2 : 1, 2);
    }
  }

  async play(events: GameEvent[], before: BattleState, after: BattleState): Promise<void> {
    if (!this.scene || !this.effects || this.destroyed || this.options?.reducedMotion) return;
    const scene = this.scene;
    const effects = this.effects;
    const actionable = events.filter(event => event.type !== 'round').slice(0, 18);
    for (let index = 0; index < actionable.length; index++) {
      const event = actionable[index];
      const unit = before.units[event.targetId ?? event.actorId ?? ''] ?? after.units[event.targetId ?? event.actorId ?? ''];
      const object = before.objects[event.targetId ?? ''] ?? after.objects[event.targetId ?? ''];
      const cell = event.to ?? unit?.cell ?? object?.cell ?? event.from;
      if (!cell) continue;
      const p = center(cell);
      const color = event.type === 'damage' || event.type === 'death' ? 0xeb8b98 : event.type === 'shield' ? 0xe9ca80 : 0xb795e4;
      const burst = scene.add.graphics();
      burst.lineStyle(2, color, .8).strokeCircle(0, 0, event.type === 'death' ? 24 : 15);
      burst.setPosition(p.x, p.y);
      burst.setAlpha(0);
      effects.add(burst);
      scene.tweens.add({targets:burst, alpha:{from:.8,to:0},scale:{from:.6,to:1.7},duration:320,delay:index*35,onComplete:()=>burst.destroy()});
      if (event.type === 'damage' && event.amount) {
        const text = scene.add.text(p.x, p.y - 18, `−${event.amount}`, {fontFamily:'monospace',fontSize:'19px',fontStyle:'bold',color:'#ffd4d6',stroke:'#170f23',strokeThickness:4}).setOrigin(.5).setAlpha(0);
        effects.add(text);
        scene.tweens.add({targets:text,y:p.y-48,alpha:{from:1,to:0},duration:650,delay:index*35,onComplete:()=>text.destroy()});
      }
    }
    // Effects are presentation only. A fallback timer resolves even in a hidden tab.
    await new Promise<void>(resolve => setTimeout(resolve, Math.min(1050, 380 + actionable.length * 35)));
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.observer?.disconnect();
    this.game.destroy(true);
    this.scene = null;
  }
}

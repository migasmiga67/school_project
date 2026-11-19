import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CityArt } from './city-art';
import { CANOPY, CANOPY_COLUMNS, FUEL_GRADES, FUEL_STATIONS, ISLAND_HALF, PUMP_ISLANDS, PUMP_SIDES, SHOP, SHOP_DOOR, STATION_HALF, stationPoint, type FuelGrade, type FuelPart, type FuelStation, type PumpSide } from './fuel-stations';
import type { SurfaceLibrary } from './surface-materials';

export interface FuelViewPose {
  pump: string; grade: FuelGrade | null; nozzle: 'pump' | 'hand' | 'car';
  litres: number; owed: number; highlight: FuelPart | null;
  /** World point the hose runs to: the hand or the car's filler neck. */
  hoseTarget: THREE.Vector3 | null;
}
const BRAND = 0x1f8f4f, BRAND_DARK = 0x14532f, WHITE = 0xe9ebe6;

/** Static forecourts share one CityArt batch; only the pump in use gets live parts. */
export class FuelStationsView {
  readonly group = new THREE.Group();
  private readonly art: CityArt;
  private readonly nozzles: THREE.InstancedMesh;
  private readonly matrices: THREE.Matrix4[] = [];
  private readonly live = new THREE.Group();
  private readonly picks = new Map<FuelPart, THREE.Mesh>();
  private readonly highlight: THREE.MeshBasicMaterial;
  private readonly hose: THREE.Mesh;
  private readonly display: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; mesh: THREE.Mesh; signature: string };
  private readonly owned: { geometries: THREE.BufferGeometry[]; materials: THREE.Material[] } = { geometries: [], materials: [] };
  private hidden = -1;

  constructor(software: boolean, surfaces: SurfaceLibrary) {
    this.group.name = 'fuel-stations';
    this.art = new CityArt(software, surfaces);
    for (const station of FUEL_STATIONS) this.station(station);
    this.art.finish(); this.group.add(this.art.group);
    // Nozzles hang on both faces of every pump; one instanced draw.
    const nozzleGeometry = this.nozzleGeometry();
    const nozzleMaterial = software ? new THREE.MeshLambertMaterial({ vertexColors: true }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .5, metalness: .2 });
    this.owned.geometries.push(nozzleGeometry); this.owned.materials.push(nozzleMaterial);
    this.nozzles = new THREE.InstancedMesh(nozzleGeometry, nozzleMaterial, PUMP_SIDES.length);
    PUMP_SIDES.forEach((pump, index) => { const matrix = this.holster(pump); this.matrices.push(matrix); this.nozzles.setMatrixAt(index, matrix); });
    this.nozzles.castShadow = !software; this.nozzles.name = 'pump-nozzles'; this.group.add(this.nozzles);
    // Live parts follow the active pump face: pick boxes, glow, display and hose.
    this.highlight = new THREE.MeshBasicMaterial({ color: 0x8ff0d0, transparent: true, opacity: .45, depthWrite: false });
    this.owned.materials.push(this.highlight);
    const pick = (part: FuelPart, w: number, h: number, d: number, x: number, y: number, z: number) => {
      const geometry = new THREE.BoxGeometry(w, h, d); this.owned.geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, this.highlight); mesh.position.set(x, y, z); mesh.visible = false; mesh.name = `pick-${part}`; this.live.add(mesh); this.picks.set(part, mesh);
    };
    // Live frame: x along the pump face, z outwards from the face.
    pick('grade95', .1, .09, .06, -.12, 1.28, .02); pick('grade98', .1, .09, .06, 0, 1.28, .02); pick('gradeON', .1, .09, .06, .12, 1.28, .02);
    pick('nozzle', .14, .3, .16, .34, 1.0, .07);
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 128;
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const displayMaterial = new THREE.MeshBasicMaterial({ map: texture }); const displayGeometry = new THREE.PlaneGeometry(.5, .25);
    this.owned.geometries.push(displayGeometry); this.owned.materials.push(displayMaterial);
    const screen = new THREE.Mesh(displayGeometry, displayMaterial); screen.position.set(0, 1.56, .012); this.live.add(screen);
    this.display = { canvas, texture, mesh: screen, signature: '' };
    this.live.visible = false; this.group.add(this.live);
    const hoseGeometry = new THREE.CylinderGeometry(.018, .018, 1, 8); hoseGeometry.translate(0, .5, 0);
    const hoseMaterial = software ? new THREE.MeshLambertMaterial({ color: 0x111316 }) : new THREE.MeshStandardMaterial({ color: 0x111316, roughness: .6 });
    this.owned.geometries.push(hoseGeometry); this.owned.materials.push(hoseMaterial);
    this.hose = new THREE.Mesh(hoseGeometry, hoseMaterial); this.hose.visible = false; this.group.add(this.hose);
  }

  private at(station: FuelStation, u: number, v: number) { return stationPoint(station, u, v); }
  /** Rotated box in the station frame: w along the street, d away from it. */
  private block(station: FuelStation, material: THREE.Material, u: number, v: number, y: number, w: number, h: number, d: number, kind: 'box' | 'cylinder' = 'box') {
    const p = this.at(station, u, v); this.art.instance(kind, material, p.x, y, p.z, w, h, d, station.rotation);
  }
  private station(station: FuelStation) {
    const art = this.art, m = (color: number, glow = 0) => art.material(color, glow);
    const concrete = m(0x9a9c97), paint = m(0xe7e3d2), white = m(WHITE), brand = m(BRAND), brandDark = m(BRAND_DARK), dark = m(0x1d2124), steel = m(0x8b9396), yellow = m(0xe2b638);
    const light = m(0xfff6dc, 0xfff1c8), glass = this.art.surfaces.windowGlass;
    // Forecourt slab with painted lanes and a kerb along the back.
    this.block(station, concrete, 0, 0, .055, STATION_HALF.u * 2, .05, STATION_HALF.v * 2);
    for (const island of PUMP_ISLANDS) for (const side of [-1, 1]) this.block(station, paint, island.u, island.v + side * 2.3, .085, 4.6, .012, .1);
    this.block(station, m(0xb8b5a8), 0, STATION_HALF.v - .15, .15, STATION_HALF.u * 2, .2, .3);
    // Canopy: roof slab, branded fascia, recessed light panels and four columns.
    this.block(station, white, CANOPY.u, CANOPY.v, CANOPY.height + .25, CANOPY.halfU * 2, .5, CANOPY.halfV * 2);
    for (const side of [-1, 1]) {
      this.block(station, brand, CANOPY.u, CANOPY.v + side * (CANOPY.halfV + .03), CANOPY.height + .3, CANOPY.halfU * 2 + .1, .62, .06);
      this.block(station, brand, CANOPY.u + side * (CANOPY.halfU + .03), CANOPY.v, CANOPY.height + .3, .06, .62, CANOPY.halfV * 2 + .1);
      this.block(station, white, CANOPY.u, CANOPY.v + side * (CANOPY.halfV + .07), CANOPY.height + .14, CANOPY.halfU * 2 + .1, .1, .02);
    }
    for (let i = 0; i < 3; i++) for (const side of [-1, 1]) this.block(station, light, -5 + i * 5, CANOPY.v + side * 1.6, CANOPY.height - .01, 2.6, .04, .9);
    for (const { u, v } of CANOPY_COLUMNS) {
      this.block(station, white, u, v, CANOPY.height / 2, .36, CANOPY.height, .36);
      this.block(station, brand, u, v, .6, .4, .9, .4);
    }
    // Pump islands with dual dispensers.
    for (const island of PUMP_ISLANDS) {
      this.block(station, m(0xc9c6ba), island.u, island.v, .13, ISLAND_HALF.u * 2, .16, ISLAND_HALF.v * 2);
      for (const end of [-1, 1]) this.block(station, yellow, island.u + end * (ISLAND_HALF.u - .12), island.v, .55, .14, .8, .14, 'cylinder');
      this.block(station, white, island.u, island.v, 1.15, 1, 1.9, .55);
      this.block(station, brand, island.u, island.v, 2.2, 1.06, .32, .6);
      this.block(station, dark, island.u, island.v, .23, 1.04, .1, .6);
      for (const side of [-1, 1]) {
        const face = island.v + side * .285;
        this.block(station, m(0x10221a, 0x1f5a3b), island.u, face, 1.56, .52, .27, .02);
        this.block(station, dark, island.u, face, 1.28, .42, .14, .02);
        this.block(station, m(0x3fae5a), island.u - .12 * side, face + side * .012, 1.28, .09, .08, .02);
        this.block(station, m(0xd9a326), island.u, face + side * .012, 1.28, .09, .08, .02);
        this.block(station, m(0x2c2f33), island.u + .12 * side, face + side * .012, 1.28, .09, .08, .02);
        for (const u of [-.34, .34]) this.block(station, dark, island.u + u, face + side * .03, 1.0, .12, .26, .06);
        this.block(station, steel, island.u, face + side * .012, .75, .2, .12, .02);
      }
    }
    // Convenience store with a glazed front, entrance and counter sign.
    const shopFront = SHOP.v - SHOP.halfV;
    this.block(station, m(0xd9d6cc), SHOP.u, SHOP.v, 1.8, SHOP.halfU * 2, 3.6, SHOP.halfV * 2);
    this.block(station, brand, SHOP.u, SHOP.v, 3.75, SHOP.halfU * 2 + .2, .5, SHOP.halfV * 2 + .2);
    this.block(station, dark, SHOP.u, shopFront - .02, .3, SHOP.halfU * 2, .6, .04);
    for (const u of [-1.4, 4.8, 7.4]) { const p = this.at(station, SHOP.u - 3.2 + u, shopFront - .03); this.art.instance('plane', glass, p.x, 1.75, p.z, 2.3, 2.2, 1, station.rotation + Math.PI); }
    this.block(station, m(0x2b3236), SHOP_DOOR.u, shopFront - .03, 1.2, 1.4, 2.4, .05);
    this.block(station, m(0x9fd4ba, 0x6fb894), SHOP_DOOR.u, shopFront - .06, 1.2, .9, 2.1, .02);
    const sign = this.at(station, SHOP.u, shopFront - .14);
    this.art.sign('SKLEP 24H · KASA', sign.x, 3.75, sign.z, 4.6, .5, station.rotation + Math.PI, '#ffffff', '#1f8f4f');
    // Price pylon facing the street on both sides.
    this.block(station, dark, -STATION_HALF.u + .7, -STATION_HALF.v + .9, 1.45, .26, 2.9, .26);
    this.block(station, brandDark, -STATION_HALF.u + .7, -STATION_HALF.v + .9, 4.4, 1.8, 3, .32);
    for (const facing of [-1, 1]) {
      const face = this.at(station, -STATION_HALF.u + .7, -STATION_HALF.v + .9 + facing * .175), rotation = station.rotation + (facing < 0 ? Math.PI : 0);
      this.art.sign('PETROCOAST', face.x, 5.55, face.z, 1.7, .45, rotation, '#ffffff', '#1f8f4f');
      (['95', '98', 'ON'] as FuelGrade[]).forEach((grade, row) => this.art.sign(`${grade}   ${FUEL_GRADES[grade].price.toFixed(2).replace('.', ',')}`, face.x, 4.85 - row * .58, face.z, 1.6, .5, rotation, grade === 'ON' ? '#e8e2cf' : '#ffe9a6', '#14201a'));
    }
    // Air and water post, bins and an ice chest by the shop.
    this.block(station, m(0x2f5f9a), -7.6, 4.6, .7, .45, 1.4, .4);
    for (const u of [-5.8, 8.6]) this.block(station, dark, u, 3.6, .45, .5, .9, .5, 'cylinder');
    this.block(station, m(0xdfe8ee), -2.6, 3.65, .55, 1.4, 1.1, .7);
    this.block(station, m(0x3a87c8), -2.6, 3.29, .75, 1.2, .3, .02);
  }
  private nozzleGeometry() {
    const parts = [
      { g: new THREE.BoxGeometry(.05, .17, .06).rotateX(.4), c: 0x2f8f4e, p: [0, 0, 0] },
      { g: new THREE.CylinderGeometry(.011, .011, .17, 6).rotateX(Math.PI / 2 - .5), c: 0x9aa1a5, p: [0, .08, .07] },
      { g: new THREE.BoxGeometry(.03, .06, .07), c: 0x111316, p: [0, -.08, .02] },
      { g: new THREE.CylinderGeometry(.018, .018, .7, 6), c: 0x111316, p: [0, -.43, -.02] },
    ];
    const prepared = parts.map(({ g, c, p }) => { const shape = g.toNonIndexed(); g.dispose(); shape.translate(p[0], p[1], p[2]); const color = new THREE.Color(c), values = new Float32Array(shape.getAttribute('position').count * 3); for (let i = 0; i < values.length; i += 3) { values[i] = color.r; values[i + 1] = color.g; values[i + 2] = color.b; } shape.setAttribute('color', new THREE.BufferAttribute(values, 3)); shape.deleteAttribute('uv'); return shape; });
    const merged = mergeGeometries(prepared, false)!; prepared.forEach(item => item.dispose()); return merged;
  }
  /** Each face's nozzle hangs in the holster on the face's right-hand side. */
  private holster(pump: PumpSide) {
    const island = PUMP_ISLANDS[pump.island], p = stationPoint(pump.station, island.u + .34 * pump.side, island.v + pump.side * .35);
    const rotation = pump.station.rotation + (pump.side < 0 ? Math.PI : 0);
    return new THREE.Matrix4().compose(new THREE.Vector3(p.x, 1.02, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotation, 0)), new THREE.Vector3(1, 1, 1));
  }
  /** Live parts sit on the active face: local +Z points out of the face. */
  private placeLive(pump: PumpSide) {
    const island = PUMP_ISLANDS[pump.island], p = stationPoint(pump.station, island.u, island.v + pump.side * .3);
    this.live.position.set(p.x, 0, p.z); this.live.rotation.set(0, pump.station.rotation + (pump.side < 0 ? Math.PI : 0), 0);
    // Mirror the nozzle pick so it matches the holster of this face.
    this.picks.get('nozzle')!.position.x = .34;
  }
  update(pose: FuelViewPose | null) {
    const pump = pose ? PUMP_SIDES.find(item => item.id === pose.pump) : undefined;
    this.live.visible = Boolean(pump);
    const index = pump && pose!.nozzle !== 'pump' ? PUMP_SIDES.indexOf(pump) : -1;
    if (index !== this.hidden) {
      if (this.hidden >= 0) this.nozzles.setMatrixAt(this.hidden, this.matrices[this.hidden]);
      if (index >= 0) this.nozzles.setMatrixAt(index, new THREE.Matrix4().makeScale(0, 0, 0));
      this.hidden = index; this.nozzles.instanceMatrix.needsUpdate = true;
    }
    if (!pump || !pose) { this.hose.visible = false; return; }
    this.placeLive(pump);
    for (const [part, mesh] of this.picks) mesh.visible = pose.highlight === part;
    this.drawDisplay(pose);
    // Hose from the top of the dispenser to the hand or the filler neck.
    if (pose.nozzle !== 'pump' && pose.hoseTarget) {
      const island = PUMP_ISLANDS[pump.island], top = stationPoint(pump.station, island.u + .34 * pump.side, island.v + pump.side * .3);
      const start = new THREE.Vector3(top.x, 1.9, top.z), direction = pose.hoseTarget.clone().sub(start), length = direction.length();
      this.hose.position.copy(start); this.hose.scale.set(1, Math.max(.01, length), 1);
      this.hose.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); this.hose.visible = true;
    } else this.hose.visible = false;
  }
  private drawDisplay(pose: FuelViewPose) {
    const signature = `${pose.grade}|${pose.litres.toFixed(2)}|${pose.owed.toFixed(2)}`;
    if (signature === this.display.signature) return; this.display.signature = signature;
    const context = this.display.canvas.getContext('2d'); if (!context) return;
    context.fillStyle = '#0c1a12'; context.fillRect(0, 0, 256, 128);
    context.fillStyle = '#9ff0b8'; context.font = 'bold 22px monospace'; context.textAlign = 'left';
    context.fillText(pose.grade ? FUEL_GRADES[pose.grade].name.toUpperCase() : 'WYBIERZ PALIWO', 12, 30);
    context.font = 'bold 34px monospace';
    context.fillText(`${pose.litres.toFixed(2).padStart(6, ' ')} L`, 12, 72);
    context.fillText(`$${pose.owed.toFixed(2).padStart(6, ' ')}`, 12, 112);
    this.display.texture.needsUpdate = true;
  }
  /** Interactive pump parts for the crosshair ray (they may be invisible). */
  get pickTargets(): readonly { part: FuelPart; object: THREE.Object3D }[] {
    return this.live.visible ? [...this.picks].map(([part, object]) => ({ part, object })) : [];
  }
  destroy() {
    this.art.destroy(); this.nozzles.dispose(); this.display.texture.dispose();
    this.owned.geometries.forEach(item => item.dispose()); this.owned.materials.forEach(item => item.dispose());
    this.group.removeFromParent();
  }
}

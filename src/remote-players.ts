import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { OnlineMember } from './multiplayer-model';
import type { VehicleKind } from './model';

type LitMaterial = THREE.MeshLambertMaterial | THREE.MeshStandardMaterial;
interface BodyPart { size: [number, number, number]; at: [number, number, number]; color: number; rotation?: [number, number, number] }
interface CarShape { paint: THREE.BufferGeometry; details: THREE.BufferGeometry }
interface RemoteVisual {
  root: THREE.Group;
  avatar: THREE.Group;
  body: THREE.Mesh;
  legs: THREE.Group[];
  arms: THREE.Group[];
  car: THREE.Group;
  carBody: THREE.Mesh;
  carDetails: THREE.Mesh;
  paint: LitMaterial;
  wheels: THREE.Mesh[];
  frontSteers: THREE.Group[];
  label: THREE.Sprite;
  labelTexture: THREE.CanvasTexture;
  name: string;
  slot: number;
  heading: number;
  wheelPhase: number;
  phase: number;
  kind: VehicleKind;
  paintColor: number;
  location: 'casino' | null;
  mode: 'drive' | 'foot';
  initialized: boolean;
}

const SLOT_COLORS = [0xe0bb75, 0x83c3d5, 0xc390c0, 0x8fc4a0];
const SKIN_COLORS = [0xc19074, 0x9e7159, 0xd1aa85, 0xba8468];
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const safeSlot = (slot: number) => Number.isInteger(slot) ? Math.abs(slot) % SLOT_COLORS.length : 0;

/** Remote presence is a view only. Local physics and room authority never read it. */
export class RemotePlayersView {
  readonly group = new THREE.Group();
  private readonly visuals = new Map<string, RemoteVisual>();
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly avatarBodies = new Map<number, THREE.BufferGeometry>();
  private readonly armShapes = new Map<number, THREE.BufferGeometry>();
  private readonly carShapes = new Map<VehicleKind, CarShape>();
  private readonly colored: LitMaterial;
  private readonly trousers: LitMaterial;
  private readonly wheelShape: THREE.BufferGeometry;
  private readonly legShape: THREE.BufferGeometry;
  private count = 0;
  private destroyed = false;

  constructor(private readonly software: boolean) {
    this.group.name = 'Other online players';
    this.colored = this.material(0xffffff, true);
    this.trousers = this.material(0x2c3b48);
    this.legShape = this.track(new THREE.BoxGeometry(.25, .7, .28));
    this.legShape.translate(0, -.35, 0);
    this.wheelShape = this.wheelGeometry();
  }

  get visibleCount() { return this.count; }

  private track<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.add(geometry);
    return geometry;
  }

  private material(color: number, vertexColors = false): LitMaterial {
    const material = this.software
      ? new THREE.MeshLambertMaterial({ color, vertexColors })
      : new THREE.MeshStandardMaterial({ color, vertexColors, roughness: .72, metalness: .15 });
    this.materials.add(material);
    return material;
  }

  private tintGeometry(geometry: THREE.BufferGeometry, color: number) {
    const value = new THREE.Color(color);
    const colors = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = value.r; colors[i + 1] = value.g; colors[i + 2] = value.b; }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
  }

  /** One mesh for all fixed details; animated limbs and wheels stay separate. */
  private boxes(parts: BodyPart[], colored = true) {
    const pieces = parts.map(part => {
      const geometry = new THREE.BoxGeometry(...part.size).toNonIndexed();
      if (part.rotation) {
        geometry.rotateX(part.rotation[0]); geometry.rotateY(part.rotation[1]); geometry.rotateZ(part.rotation[2]);
      }
      geometry.translate(...part.at);
      return colored ? this.tintGeometry(geometry, part.color) : geometry;
    });
    const merged = mergeGeometries(pieces)!;
    pieces.forEach(piece => piece.dispose());
    return this.track(merged);
  }

  private avatarGeometry(slot: number) {
    let body = this.avatarBodies.get(slot);
    if (!body) {
      const shirt = SLOT_COLORS[slot], skin = SKIN_COLORS[slot];
      body = this.boxes([
        { size: [.61, .71, .36], at: [0, 1.17, 0], color: shirt },
        { size: [.18, .16, .2], at: [0, 1.58, 0], color: skin },
        { size: [.41, .42, .37], at: [0, 1.77, -.015], color: skin },
        { size: [.43, .15, .39], at: [0, 2, 0], color: 0x2a2b2d },
        { size: [.42, .22, .1], at: [0, 1.87, .15], color: 0x2a2b2d },
        { size: [.07, .055, .025], at: [-.09, 1.81, -.21], color: 0x202b32 },
        { size: [.07, .055, .025], at: [.09, 1.81, -.21], color: 0x202b32 },
      ]);
      this.avatarBodies.set(slot, body);
    }
    let arm = this.armShapes.get(slot);
    if (!arm) {
      arm = this.boxes([
        { size: [.2, .35, .26], at: [0, -.175, 0], color: SLOT_COLORS[slot] },
        { size: [.18, .32, .24], at: [0, -.49, 0], color: SKIN_COLORS[slot] },
      ]);
      this.armShapes.set(slot, arm);
    }
    return { body, arm };
  }

  private wheelGeometry() {
    const tire = this.tintGeometry(new THREE.CylinderGeometry(.42, .42, .27, 10).toNonIndexed(), 0x1f272c);
    const hub = this.tintGeometry(new THREE.CylinderGeometry(.23, .23, .29, 8).toNonIndexed(), 0xbec7c6);
    tire.rotateZ(Math.PI / 2); hub.rotateZ(Math.PI / 2);
    const geometry = mergeGeometries([tire, hub])!;
    tire.dispose(); hub.dispose();
    return this.track(geometry);
  }

  private carGeometry(kind: VehicleKind): CarShape {
    const cached = this.carShapes.get(kind);
    if (cached) return cached;
    const sport = kind === 'sport', length = sport ? 4.5 : 4.7, roof = sport ? 1.54 : 1.75;
    const body: BodyPart[] = [
      { size: [1.95, .64, length], at: [0, .7, 0], color: 0xffffff },
      { size: [1.7, .22, 1.3], at: [0, 1.06, -1.4], color: 0xffffff },
      { size: [1.63, .12, 1.55], at: [0, roof, .18], color: 0xffffff },
    ];
    const details: BodyPart[] = [
      { size: [1.93, .13, length + .08], at: [0, .39, 0], color: 0x25353e },
      { size: [1.62, sport ? .58 : .78, 1.9], at: [0, sport ? 1.21 : 1.32, .1], color: 0x25353e },
      { size: [1.49, sport ? .45 : .58, .06], at: [0, sport ? 1.31 : 1.42, -.86], color: 0x76a4b2, rotation: [-.28, 0, 0] },
      { size: [1.46, .43, .06], at: [0, sport ? 1.29 : 1.43, 1.05], color: 0x76a4b2, rotation: [.24, 0, 0] },
      { size: [.62, .17, .05], at: [0, .6, length / 2 + .06], color: 0xe5dec5 },
    ];
    for (const side of [-1, 1]) {
      body.push({ size: [.06, .55, .09], at: [side * .86, 1.25, .3], color: 0xffffff });
      body.push({ size: [.16, .14, .35], at: [side * 1.04, 1.14, -.65], color: 0xffffff });
      details.push({ size: [.05, sport ? .38 : .5, 1.45], at: [side * .83, sport ? 1.28 : 1.42, .15], color: 0x76a4b2 });
      details.push({ size: [.48, .18, .08], at: [side * .65, .78, -length / 2 - .04], color: 0xffefbd });
      details.push({ size: [.56, .15, .08], at: [side * .65, .8, length / 2 + .04], color: 0xc75863 });
    }
    if (sport) body.push({ size: [1.8, .11, .4], at: [0, 1.15, 1.95], color: 0xffffff });
    if (kind === 'police') {
      details.push({ size: [1.35, .14, .4], at: [0, 1.89, .1], color: 0x25353e });
      details.push({ size: [.6, .2, .36], at: [-.34, 2.02, .1], color: 0xd9536a });
      details.push({ size: [.6, .2, .36], at: [.34, 2.02, .1], color: 0x5daae1 });
    }
    const result = { paint: this.boxes(body, false), details: this.boxes(details) };
    this.carShapes.set(kind, result);
    return result;
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = !this.software; mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private nameTexture(name: string, slot: number) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 112;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#071c25df'; ctx.beginPath(); ctx.roundRect(7, 14, 498, 84, 25); ctx.fill();
    ctx.strokeStyle = `#${new THREE.Color(SLOT_COLORS[slot]).getHexString()}`;
    ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = '#f3e5c4'; ctx.font = 'bold 38px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(name.slice(0, 24), 256, 58, 450);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private create(member: OnlineMember): RemoteVisual {
    const slot = safeSlot(member.slot), shape = this.avatarGeometry(slot);
    const root = new THREE.Group(); root.name = `Online player ${member.id}`; this.group.add(root);
    const avatar = new THREE.Group(); root.add(avatar);
    const body = this.mesh(shape.body, this.colored, avatar);
    const legs: THREE.Group[] = [], arms: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(side * .17, .8, 0); avatar.add(leg); this.mesh(this.legShape, this.trousers, leg); legs.push(leg);
      const arm = new THREE.Group(); arm.position.set(side * .43, 1.48, 0); avatar.add(arm); this.mesh(shape.arm, this.colored, arm); arms.push(arm);
    }
    const car = new THREE.Group(); root.add(car);
    const carShape = this.carGeometry('sport'), paint = this.material(SLOT_COLORS[slot]);
    const carBody = this.mesh(carShape.paint, paint, car), carDetails = this.mesh(carShape.details, this.colored, car);
    const wheels: THREE.Mesh[] = [], frontSteers: THREE.Group[] = [];
    for (const x of [-1.02, 1.02]) for (const z of [-1.4, 1.4]) {
      const steer = new THREE.Group(); steer.position.set(x, .45, z); car.add(steer);
      wheels.push(this.mesh(this.wheelShape, this.colored, steer));
      if (z < 0) frontSteers.push(steer);
    }
    const labelTexture = this.nameTexture(member.name, slot);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthWrite: false }));
    label.scale.set(2.9, .635, 1); label.position.y = 2.65; root.add(label);
    return { root, avatar, body, legs, arms, car, carBody, carDetails, paint, wheels, frontSteers, label, labelTexture, name: member.name, slot, heading: 0, wheelPhase: 0, phase: 0, kind: 'sport', paintColor: SLOT_COLORS[slot], location: member.pose.interior, mode: member.pose.mode, initialized: false };
  }

  private remove(id: string, visual: RemoteVisual) {
    visual.root.removeFromParent(); visual.labelTexture.dispose(); visual.label.material.dispose();
    visual.paint.dispose(); this.materials.delete(visual.paint);
    this.visuals.delete(id);
  }

  update(members: OnlineMember[], selfId: string, interior: 'casino' | null, dt: number) {
    if (this.destroyed) return;
    const step = Number.isFinite(dt) ? Math.min(.2, Math.max(0, dt)) : 0;
    const blend = 1 - Math.exp(-step * 14);
    const present = new Set<string>(); this.count = 0;
    for (const member of members) {
      if (member.id === selfId) continue;
      present.add(member.id);
      let visual = this.visuals.get(member.id);
      if (!visual) { visual = this.create(member); this.visuals.set(member.id, visual); }
      const pose = member.pose, driving = pose.mode === 'drive' && pose.vehicle !== null;
      const visible = pose.interior === interior && !(pose.interior === 'casino' && pose.seated);
      visual.root.visible = visible;
      if (!visible) { visual.initialized = false; continue; }
      this.count++;
      const slot = safeSlot(member.slot);
      if (member.name !== visual.name || slot !== visual.slot) {
        visual.labelTexture.dispose(); visual.labelTexture = this.nameTexture(member.name, slot);
        visual.label.material.map = visual.labelTexture; visual.label.material.needsUpdate = true;
        if (slot !== visual.slot) {
          const shape = this.avatarGeometry(slot); visual.body.geometry = shape.body;
          visual.arms.forEach(arm => { (arm.children[0] as THREE.Mesh).geometry = shape.arm; });
        }
        visual.name = member.name; visual.slot = slot;
      }
      const targetX = driving ? pose.vehicle!.x : pose.x, targetZ = driving ? pose.vehicle!.z : pose.z;
      const heading = driving ? pose.vehicle!.heading : pose.heading;
      const jump = !visual.initialized || visual.location !== pose.interior || visual.mode !== pose.mode || Math.hypot(targetX - visual.root.position.x, targetZ - visual.root.position.z) > 18;
      const previousX = visual.root.position.x, previousZ = visual.root.position.z, oldHeading = visual.heading;
      if (jump) { visual.root.position.set(targetX, driving ? .05 : .1, targetZ); visual.heading = heading; }
      else {
        visual.root.position.x += (targetX - visual.root.position.x) * blend;
        visual.root.position.z += (targetZ - visual.root.position.z) * blend;
        visual.heading = wrap(visual.heading + wrap(heading - visual.heading) * blend);
      }
      visual.root.position.y = driving ? .05 : .1;
      visual.initialized = true; visual.location = pose.interior; visual.mode = pose.mode;
      visual.avatar.visible = !driving; visual.car.visible = driving;
      visual.avatar.rotation.y = visual.car.rotation.y = -visual.heading;
      visual.label.position.y = driving ? 2.8 : 2.65;
      const travel = jump ? 0 : Math.hypot(visual.root.position.x - previousX, visual.root.position.z - previousZ);
      if (driving) {
        const vehicle = pose.vehicle!;
        if (vehicle.kind !== visual.kind) {
          const shape = this.carGeometry(vehicle.kind); visual.carBody.geometry = shape.paint; visual.carDetails.geometry = shape.details; visual.kind = vehicle.kind;
        }
        const color = Number.isFinite(vehicle.color) ? (vehicle.color >>> 0) & 0xffffff : SLOT_COLORS[slot];
        if (color !== visual.paintColor) { visual.paint.color.setHex(color); visual.paintColor = color; }
        visual.wheelPhase += vehicle.speed * step / .42;
        visual.wheels.forEach(wheel => { wheel.rotation.x = visual.wheelPhase; });
        const turn = step > 0 && !jump ? THREE.MathUtils.clamp(wrap(visual.heading - oldHeading) / step * .3, -.35, .35) : 0;
        visual.frontSteers.forEach(steer => { steer.rotation.y = turn; });
      } else {
        const moving = travel > .0003;
        if (moving) visual.phase += travel * 3.2;
        visual.legs.forEach((leg, index) => { leg.rotation.x = moving ? Math.sin(visual.phase + index * Math.PI) * .52 : 0; });
        visual.arms.forEach((arm, index) => { arm.rotation.x = moving ? -Math.sin(visual.phase + index * Math.PI) * .38 : 0; });
      }
    }
    for (const [id, visual] of this.visuals) if (!present.has(id)) this.remove(id, visual);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const [id, visual] of this.visuals) this.remove(id, visual);
    this.geometries.forEach(geometry => geometry.dispose()); this.materials.forEach(material => material.dispose());
    this.geometries.clear(); this.materials.clear(); this.group.removeFromParent(); this.count = 0;
  }
}

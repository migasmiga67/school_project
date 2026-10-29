import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CASINO } from './casino-location';
import { CASINO_GAMES } from './casino-games-location';
import { PokerTableView } from './poker-view';
import type { PokerState } from './poker-model';

type LitMaterial = THREE.MeshLambertMaterial | THREE.MeshStandardMaterial;

/** Procedural venue art. Entrances, collision and betting belong to the game. */
export class CasinoView {
  readonly exterior = new THREE.Group();
  readonly interior = new THREE.Group();
  private readonly textures = new Set<THREE.Texture>();
  private readonly animatedMaterials: LitMaterial[] = [];
  private readonly entranceRing: THREE.Mesh;
  private readonly tableRing: THREE.Mesh;
  private readonly software: boolean;
  private readonly poker: PokerTableView;

  constructor(software: boolean) {
    this.software = software;
    this.exterior.name = 'Sapphire Casino exterior';
    this.interior.name = 'Sapphire Casino interior';
    this.exterior.position.set(CASINO.center.x, 0, CASINO.center.z);
    this.makeExterior();
    this.makeInterior();

    const blue = this.material(0x80e0f0, 0x2875c2, 0.65);
    const gold = this.material(0xf3d394, 0xb28436, 0.45);
    this.animatedMaterials.push(blue, gold);
    this.entranceRing = this.mesh(new THREE.TorusGeometry(1.7, 0.055, 5, 44), blue, this.exterior, 0, 0.24, CASINO.door.z - CASINO.center.z);
    this.entranceRing.rotation.x = -Math.PI / 2;
    this.tableRing = this.mesh(new THREE.TorusGeometry(0.52, 0.035, 5, 32), gold, this.interior, 0, 1.36, CASINO.table.z);
    this.tableRing.rotation.x = -Math.PI / 2;
    this.interior.visible = false;
    this.compact(this.exterior);
    this.compact(this.interior);
    this.poker = new PokerTableView();
    this.poker.group.position.set(CASINO.table.x, 0, CASINO.table.z);
    this.interior.add(this.poker.group);
  }

  private material(color: number, emissive = 0x000000, intensity = 0): LitMaterial {
    if (this.software) return new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: intensity });
    return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, metalness: emissive ? 0.15 : 0.2, roughness: 0.65 });
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, root: THREE.Object3D, x = 0, y = 0, z = 0) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = !this.software;
    object.receiveShadow = true;
    root.add(object);
    return object;
  }

  private box(w: number, h: number, d: number, material: THREE.Material, root: THREE.Object3D, x: number, y: number, z: number) {
    return this.mesh(new THREE.BoxGeometry(w, h, d), material, root, x, y, z);
  }

  private label(text: string, color: string, width: number, height: number, root: THREE.Object3D, x: number, y: number, z: number, rotation = 0, background = '#122e36') {
    const canvas = document.createElement('canvas');
    canvas.width = text.length <= 2 ? 256 : 768; canvas.height = text.length <= 2 ? 256 : 160;
    const ctx = canvas.getContext('2d')!;
    if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(9, 9, canvas.width - 18, canvas.height - 18);
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${text.length <= 2 ? 154 : text.length > 19 ? 39 : text.length > 13 ? 48 : 67}px Georgia, serif`;
    ctx.shadowColor = color; ctx.shadowBlur = 7;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 3, canvas.width - 55);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    this.textures.add(texture);
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: !background, depthWrite: Boolean(background) });
    const object = this.mesh(new THREE.PlaneGeometry(width, height), material, root, x, y, z);
    object.rotation.y = rotation;
    object.castShadow = false;
    return object;
  }

  private makeExterior() {
    const root = this.exterior;
    const stone = this.material(0x17333e);
    const trim = this.material(0xd8b56e);
    const glass = this.material(0x234e61, 0x102d42, 0.35);
    const neon = this.material(0x9ce7ef, 0x469dcb, 0.6);
    const violet = this.material(0xafa1e8, 0x6254af, 0.45);
    const carpet = this.material(0x87374d);
    const z = 12.08;

    // The art covers the front of the existing collider, rather than adding a building.
    this.box(17.7, 10.2, 0.28, stone, root, 0, 5.25, z);
    this.box(18.7, 0.33, 0.5, trim, root, 0, 10.43, z + 0.08);
    this.box(18.3, 0.13, 0.5, neon, root, 0, 10.02, z + 0.13);
    for (const x of [-8.65, 8.65]) {
      this.box(0.3, 10.2, 0.46, trim, root, x, 5.25, z + 0.08);
      this.box(0.12, 9.5, 0.51, neon, root, x * 0.95, 5.2, z + 0.14);
    }
    this.label('SAPPHIRE', '#f2d69a', 12, 2.0, root, 0, 8.45, z + 0.2);
    this.label('C A S I N O', '#b8eff5', 11, 1.4, root, 0, 6.75, z + 0.22);
    this.label('POKER LOUNGE', '#d6b9ee', 6.9, 0.78, root, 0, 5.15, z + 0.24);
    this.label('♠', '#f5dbab', 1.9, 2.1, root, -6.7, 6.65, z + 0.22);
    this.label('♦', '#d6b5ee', 1.9, 2.1, root, 6.7, 6.65, z + 0.22);

    this.box(4.2, 3.6, 0.3, glass, root, 0, 1.98, z + 0.28);
    for (const x of [-2.22, 0, 2.22]) this.box(0.12, 3.8, 0.42, trim, root, x, 2.05, z + 0.35);
    this.box(4.6, 0.16, 0.47, trim, root, 0, 3.95, z + 0.32);
    for (const x of [-0.32, 0.32]) this.box(0.05, 0.72, 0.14, trim, root, x, 1.85, z + 0.52);
    this.box(10.1, 0.2, 2.7, trim, root, 0, 4.35, z + 0.7);
    this.box(9.7, 0.16, 2.6, stone, root, 0, 4.52, z + 0.7);
    this.box(9.8, 0.08, 0.1, neon, root, 0, 4.22, z + 2.02);
    for (const x of [-5.35, 5.35]) {
      this.mesh(new THREE.CylinderGeometry(0.23, 0.28, 4.2, 10), trim, root, x, 2.25, z + 0.9);
      this.mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.15, 12), stone, root, x, 0.24, z + 0.9);
    }
    this.box(6.0, 0.035, 3.5, carpet, root, 0, 0.205, z + 1.55);
    for (const x of [-3.05, 3.05]) this.box(0.06, 0.04, 3.55, trim, root, x, 0.23, z + 1.55);
    for (const x of [-7.2, 7.2]) {
      this.mesh(new THREE.CylinderGeometry(0.38, 0.5, 1.25, 8), stone, root, x, 0.82, z + 1.5);
      this.mesh(new THREE.SphereGeometry(0.31, 10, 8), violet, root, x, 1.58, z + 1.5);
    }
    this.label('WEJŚCIE · E', '#f4dca9', 3.2, 0.66, root, 0, 2.8, z + 0.51);
  }

  private makeInterior() {
    const root = this.interior;
    const ivory = this.material(0xc4b595);
    const tile = this.material(0x172f34);
    const dark = this.material(0x10262e);
    const green = this.material(0x176454);
    const wood = this.material(0x4b2d2a);
    const gold = this.material(0xd7b66e);
    const red = this.material(0x743245);
    const blue = this.material(0x5eabb8, 0x245565, 0.2);
    root.add(new THREE.HemisphereLight(0xffe8c4, 0x15333e, 2.0));
    const overhead = new THREE.PointLight(0xffddb0, 22, 24, 2);
    overhead.position.set(0, 6.2, -1); root.add(overhead);

    // A complete room surrounds the walking and seated cameras.
    this.box(22, 0.18, 20, dark, root, 0, -0.12, 0);
    for (let x = -10; x <= 10; x += 2) for (let z = -9; z <= 9; z += 2) {
      this.box(1.95, 0.05, 1.95, ((x / 2 + (z + 9) / 2) & 1) ? tile : ivory, root, x, 0.005, z);
    }
    this.box(22.4, 6.8, 0.3, dark, root, 0, 3.35, -10.0);
    this.box(22.4, 0.2, 20.3, dark, root, 0, 6.8, 0);
    for(const x of [-6.5,6.5])this.box(9,6.8,.3,dark,root,x,3.35,10);
    this.box(4,2.8,.3,dark,root,0,5.35,10);
    for(const x of [-2.1,2.1])this.box(.18,4,.35,gold,root,x,2,9.8);
    this.box(4.4,.15,.35,gold,root,0,4.05,9.8);
    this.label('WYJŚCIE · E','#c9f3dc',3.2,.58,root,0,3.56,9.78,Math.PI);
    for (const x of [-11, 11]) {
      this.box(0.3, 6.8, 20.3, dark, root, x, 3.35, 0);
      this.box(0.34, 0.12, 20.3, gold, root, x, 1.16, 0);
      this.box(0.34, 0.12, 20.3, gold, root, x, 5.7, 0);
      for(const z of [-7,-2,3,8]) {
        this.box(.4,5.5,.2,gold,root,x*.98,2.8,z);
        this.box(.41,3.7,.07,blue,root,x*.977,3,z+.2);
      }
    }
    this.box(22, 0.16, 0.22, gold, root, 0, 3.8, -9.8);
    this.label('SAPPHIRE CLUB', '#f4db9d', 9, 1.5, root, 0, 2.65, -9.78);
    for (const x of [-9, -5, 5, 9]) {
      this.box(0.22, 3.7, 0.28, gold, root, x, 1.9, -9.76);
      this.box(0.08, 3.1, 0.3, blue, root, x + 0.2, 1.95, -9.7);
    }
    this.box(4.25, 0.035, 7.4, red, root, 0, 0.07, 5.3);
    for (const x of [-2.18, 2.18]) this.box(0.045, 0.04, 7.4, gold, root, x, 0.09, 5.3);

    // The floor marker remains visible when approaching the actual doorway.
    const exitSign = this.label('WYJŚCIE · E', '#c9f3dc', 2.8, 0.65, root, 0, 0.13, 8.45);
    exitSign.rotation.x = -Math.PI / 2;
    this.mesh(new THREE.TorusGeometry(1.1, 0.04, 5, 36), blue, root, CASINO.exit.x, 0.12, CASINO.exit.z).rotation.x = -Math.PI / 2;

    // A physical table; dealt cards and chips are updated by PokerTableView.
    const table = new THREE.Group(); table.position.set(CASINO.table.x, 0, CASINO.table.z); root.add(table);
    const pedestal = this.mesh(new THREE.CylinderGeometry(0.65, 1.15, 0.92, 12), dark, table, 0, 0.58, 0);
    pedestal.scale.x = 1.4;
    const rim = this.mesh(new THREE.CylinderGeometry(1, 1, 0.23, 44), wood, table, 0, 1.05, 0);
    rim.scale.set(3.62, 1, 1.91);
    const edge = this.mesh(new THREE.CylinderGeometry(1, 1, 0.12, 44), gold, table, 0, 1.18, 0);
    edge.scale.set(3.49, 1, 1.79);
    const felt = this.mesh(new THREE.CylinderGeometry(1, 1, 0.06, 44), green, table, 0, 1.265, 0);
    felt.scale.set(3.34, 1, 1.65);
    const oval = this.mesh(new THREE.TorusGeometry(1, 0.008, 4, 48), gold, table, 0, 1.305, 0);
    oval.rotation.x = -Math.PI / 2; oval.scale.set(2.65, 1.08, 1);
    for (const [x, z, rotation] of [[0, 3.25, 0], [-4.35, 0, -Math.PI / 2], [4.35, 0, Math.PI / 2], [0, -3.3, Math.PI]]) {
      this.chair(table, x, z, rotation, wood, red, gold);
    }
    this.guest(table,-4.35,0,-Math.PI/2,0x8f4f66,0xc28c67,0x2b2227);
    this.guest(table,0,-3.3,Math.PI,0x3e6475,0xc7a080,0x343036);
    this.guest(table,4.35,0,Math.PI/2,0x3d715f,0x9f7256,0x29252b);
    this.label('TEXAS HOLD’EM', '#eddda9', 4.5, 0.6, root, 0, 1.55, -9.77);

    // Dedicated, reachable stations correspond to actual playable games.
    const blackjack = new THREE.Group(); blackjack.position.set(CASINO_GAMES.blackjack.x, 0, CASINO_GAMES.blackjack.z - 1.4); root.add(blackjack);
    this.box(2.7, .24, 1.5, wood, blackjack, 0, 1.05, 0);
    this.box(2.45, .06, 1.28, green, blackjack, 0, 1.205, 0);
    this.box(.8, .95, .8, dark, blackjack, 0, .54, 0);
    this.label('BLACKJACK 21', '#e9dbad', 2.8, .57, blackjack, 0, 2.1, -.6);
    for(let index=0;index<3;index++)this.box(.32,.015,.45,this.material(index===1?0xdfc2b7:0xe8e4d2),blackjack,(index-1)*.42,1.25,0);
    const roulette = new THREE.Group(); roulette.position.set(CASINO_GAMES.roulette.x, 0, CASINO_GAMES.roulette.z - 1.4); root.add(roulette);
    this.box(2.7, .24, 1.7, wood, roulette, 0, 1.05, 0);
    this.box(2.5, .05, 1.5, green, roulette, 0, 1.2, 0);
    this.box(.8, .95, .8, dark, roulette, 0, .54, 0);
    const wheel=this.mesh(new THREE.CylinderGeometry(.62,.62,.12,37),gold,roulette,-.52,1.3,0);
    const wheelFelt=this.mesh(new THREE.CylinderGeometry(.52,.52,.13,37),dark,roulette,-.52,1.33,0);
    wheelFelt.rotation.y=Math.PI/37;
    for(let index=0;index<12;index++){
      const angle=index*Math.PI/6,marker=this.box(.1,.02,.23,index%2?red:gold,roulette,-.52+Math.cos(angle)*.39,1.41,Math.sin(angle)*.39);marker.rotation.y=-angle;
    }
    this.mesh(new THREE.SphereGeometry(.055,7,5),blue,roulette,-.28,1.46,.3);
    for(let row=0;row<3;row++)for(let col=0;col<4;col++)this.box(.19,.02,.25,(row+col)%2?red:dark,roulette,.4+col*.24,1.245,-.4+row*.29);
    this.label('ROULETTE · 0–36', '#e9dbad', 2.8, .57, roulette, 0, 2.1, -.7);
    // The tournament registration stand is clear of the normal poker approach.
    const tournament = new THREE.Group(); tournament.position.set(CASINO_GAMES.tournament.x+.25,0,CASINO_GAMES.tournament.z);root.add(tournament);
    this.box(.95,1.2,.62,wood,tournament,0,.62,0);
    this.box(1.1,.14,.8,gold,tournament,0,1.3,0);
    this.box(.64,.07,.42,blue,tournament,0,1.42,0);
    this.label('TURNIEJ', '#f0d8a2', 2.2, .6, tournament, 0, 2.3, -.15);
    this.label('2–4 GRACZY', '#acdfe2', 2.2, .43, tournament, 0, 1.8, -.15);
    for(const point of Object.values(CASINO_GAMES)){
      const ring=this.mesh(new THREE.TorusGeometry(.8,.035,4,28),gold,root,point.x,.12,point.z);ring.rotation.x=-Math.PI/2;
    }

    // A lounge counter and art-deco trim frame the gaming floor.
    this.box(2.3, 1.2, 5.4, wood, root, -8.65, 0.7, -4.7);
    this.box(2.65, 0.14, 5.7, gold, root, -8.65, 1.36, -4.7);
    for (let i = 0; i < 5; i++) {
      const material = i % 2 ? green : blue;
      this.mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.55, 8), material, root, -8.9, 1.72, -6.7 + i * 0.8);
    }
    this.label('LOUNGE', '#c8e9e7', 2.5, 0.66, root, -8.5, 2.6, -7.8);
    for (const x of [-9, 9]) for (const z of [-7.8, 6.8]) {
      this.mesh(new THREE.CylinderGeometry(0.23, 0.34, 2.4, 10), gold, root, x, 1.25, z);
      this.mesh(new THREE.SphereGeometry(0.35, 10, 8), blue, root, x, 2.65, z);
    }
    const chandelier = this.mesh(new THREE.TorusGeometry(2.4, 0.065, 6, 40), gold, root, 0, 6.2, CASINO.table.z);
    chandelier.rotation.x = -Math.PI / 2;
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      this.mesh(new THREE.SphereGeometry(0.09, 8, 6), blue, root, Math.cos(angle) * 2.4, 6.18, CASINO.table.z + Math.sin(angle) * 2.4);
    }
  }

  private chair(root: THREE.Object3D, x: number, z: number, rotation: number, wood: LitMaterial, cushion: LitMaterial, gold: LitMaterial) {
    const seat = new THREE.Group(); seat.position.set(x, 0, z); seat.rotation.y = rotation; root.add(seat);
    this.box(1.12, 0.2, 1.0, cushion, seat, 0, 0.65, 0);
    this.box(1.08, 1.0, 0.18, wood, seat, 0, 1.13, 0.48);
    this.box(0.82, 0.67, 0.2, cushion, seat, 0, 1.17, 0.36);
    for (const x of [-0.43, 0.43]) for (const z of [-0.37, 0.37]) this.box(0.075, 0.6, 0.075, gold, seat, x, 0.32, z);
  }

  private guest(root:THREE.Object3D,x:number,z:number,rotation:number,jacketColor:number,skinColor:number,hairColor:number) {
    const guest=new THREE.Group();guest.position.set(x,0,z);guest.rotation.y=rotation;root.add(guest);
    const jacket=this.material(jacketColor),skin=this.material(skinColor),hair=this.material(hairColor),trousers=this.material(0x19292c),shirt=this.material(0xd1c9af);
    this.box(.68,.74,.39,jacket,guest,0,1.16,0);
    this.box(.15,.48,.41,shirt,guest,0,1.23,-.02);
    this.box(.22,.21,.22,skin,guest,0,1.62,0);
    this.box(.43,.45,.4,skin,guest,0,1.93,0);
    this.box(.45,.14,.42,hair,guest,0,2.13,.01);
    this.box(.45,.32,.12,hair,guest,0,1.99,.17);
    for(const side of [-1,1]) {
      this.box(.23,.24,.65,trousers,guest,side*.22,.72,-.33);
      this.box(.23,.57,.24,trousers,guest,side*.22,.39,-.57);
      this.box(.26,.17,.43,hair,guest,side*.22,.12,-.69);
      const arm=this.box(.23,.52,.24,jacket,guest,side*.44,1.22,-.12);arm.rotation.x=-.35;
      this.box(.2,.2,.56,jacket,guest,side*.44,1,-.46);
      this.box(.18,.15,.2,skin,guest,side*.44,1,-.82);
      this.box(.07,.05,.02,hair,guest,side*.11,1.96,-.211);
    }
  }

  updatePoker(state:PokerState|null,seated:boolean) {
    this.poker.update(state,seated);
    this.tableRing.visible=!seated;
  }

  /** Batch opaque meshes by material so low-end/software WebGL stays inexpensive. */
  private compact(root: THREE.Group) {
    root.updateMatrixWorld(true);
    const batches = new Map<string, { material: THREE.Material; meshes: THREE.Mesh[]; geometries: THREE.BufferGeometry[] }>();
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material) || object.material.transparent || object === this.entranceRing || object === this.tableRing) return;
      const key = `${object.material.uuid}:${Object.keys(object.geometry.attributes).sort().join(',')}`;
      let batch = batches.get(key);
      if (!batch) { batch = { material: object.material, meshes: [], geometries: [] }; batches.set(key, batch); }
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      // Root position is applied separately after the batch; keep local venue coordinates.
      const matrix = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(object.matrixWorld);
      geometry.applyMatrix4(matrix);
      batch.meshes.push(object); batch.geometries.push(geometry);
    });
    for (const batch of batches.values()) {
      if (batch.meshes.length > 1) {
        const geometry = mergeGeometries(batch.geometries);
        if (geometry) {
          for (const mesh of batch.meshes) mesh.removeFromParent();
          const mesh = new THREE.Mesh(geometry, batch.material); mesh.castShadow = !this.software; mesh.receiveShadow = true; root.add(mesh);
        }
      }
      for (const geometry of batch.geometries) geometry.dispose();
    }
  }

  update(time: number) {
    if (!Number.isFinite(time)) return;
    this.animatedMaterials.forEach((material, index) => { material.emissiveIntensity = 0.55 + Math.sin(time * 2 + index) * 0.16; });
    this.tableRing.scale.setScalar(1 + Math.sin(time * 1.8) * 0.04);
  }

  destroy() {
    this.poker.destroy();
    const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>();
    for (const root of [this.exterior, this.interior]) root.traverse(object => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      }
    });
    geometries.forEach(geometry => geometry.dispose());materials.forEach(material => material.dispose());this.textures.forEach(texture => texture.dispose());
    this.exterior.removeFromParent();this.interior.removeFromParent();
  }
}

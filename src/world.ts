import * as THREE from 'three';
import type { CameraPose } from './camera-controls';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILDINGS, ROADS, type GameState, type Vehicle } from './model';

type LitMaterial = THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;

interface CarVisual {
  group: THREE.Group;
  wheels: THREE.Group[];
  frontWheels: THREE.Group[];
  brake: LitMaterial;
  red?: LitMaterial;
  blue?: LitMaterial;
  smoke: THREE.Sprite[];
}

/** All art is generated here. The simulation, collisions and missions stay in game.ts. */
export class CityView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(58, 1, 0.15, 650);
  readonly renderer: THREE.WebGLRenderer;
  readonly softwareRendering: boolean;
  private lastPlayer: { x:number; z:number } | null = null;
  private readonly cars = new Map<string, CarVisual>();
  private readonly hero = new THREE.Group();
  private readonly heroLegs: THREE.Mesh[] = [];
  private readonly heroArms: THREE.Mesh[] = [];
  private readonly palms: THREE.Group[] = [];
  private readonly marker = new THREE.Group();
  private readonly markerRing: THREE.Mesh;
  private readonly markerArrow: THREE.Group;
  private readonly waterMaterial: THREE.ShaderMaterial;
  private readonly glowTexture: THREE.CanvasTexture;
  private readonly smokeTexture: THREE.CanvasTexture;
  private observer: ResizeObserver;
  private initialized = false;
  private lastMode = -1;
  private readonly parent: HTMLElement;
  private motion = 0;
  private readonly occluders: THREE.Mesh[] = [];
  private readonly raycaster = new THREE.Raycaster();

  constructor(parent: HTMLElement) {
    this.parent = parent;
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    } catch {
      throw new Error('Nie udało się uruchomić grafiki WebGL. Włącz akcelerację sprzętową lub użyj aktualnego Chrome / Firefox.');
    }
    const gl = this.renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const device = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : '';
    this.softwareRendering = /swiftshader|llvmpipe|software/i.test(device);
    this.renderer.setPixelRatio(this.softwareRendering ? 0.65 : Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = !this.softwareRendering;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.domElement.setAttribute('aria-label', 'Trójwymiarowe miasto Neon Coast');
    parent.append(this.renderer.domElement);
    this.scene.background = this.sky();
    this.scene.fog = new THREE.Fog(0xd5aeb1, 105, 360);
    this.glowTexture = this.radial('#fff3cc');
    this.smokeTexture = this.radial('#bac6d0');
    this.lighting();
    this.ground();
    this.city();
    this.beach();
    this.skyline();
    if (this.softwareRendering) this.batchStaticGeometry();
    this.avatar();
    this.markerRing = this.mesh(new THREE.TorusGeometry(3.7, 0.12, 6, 40), this.material(0xffd875, { emissive: 0xffbc4b, emissiveIntensity: 1.1 }), this.marker, 0, 0.22, 0);
    this.markerRing.rotation.x = -Math.PI / 2;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 3.6, 24, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xffdc8b, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 12;
    this.marker.add(beam);
    this.markerArrow = new THREE.Group();
    this.marker.add(this.markerArrow);
    const arrowMat = this.material(0xffe1a1, { emissive: 0xffc263, emissiveIntensity: 0.7 });
    this.box(0.55, 2, 0.55, arrowMat, this.markerArrow, 0, 7.5, 0);
    this.mesh(new THREE.ConeGeometry(1.15, 1.5, 4), arrowMat, this.markerArrow, 0, 6.05, 0).rotation.z = Math.PI;
    this.scene.add(this.marker);
    this.waterMaterial = this.water();
    this.scene.updateMatrixWorld(true);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(parent);
    this.resize();
  }

  private batchStaticGeometry() {
    this.scene.updateMatrixWorld(true);
    const batches = new Map<string, { material: LitMaterial; meshes: THREE.Mesh[]; geometries: THREE.BufferGeometry[] }>();
    this.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh || !(object.material instanceof THREE.MeshStandardMaterial || object.material instanceof THREE.MeshLambertMaterial) || object.material.transparent) return;
      const material = object.material;
      const key = [material.color.getHex(), material.emissive.getHex(), material.emissiveIntensity, material instanceof THREE.MeshStandardMaterial ? material.roughness : 0, material instanceof THREE.MeshStandardMaterial ? material.metalness : 0, material.side, material.map?.uuid, material.emissiveMap?.uuid, material.flatShading, Object.keys(object.geometry.attributes).sort().join(',')].join(':');
      let batch = batches.get(key);
      if (!batch) { batch = { material, meshes: [], geometries: [] }; batches.set(key, batch); }
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      geometry.applyMatrix4(object.matrixWorld);
      batch.meshes.push(object); batch.geometries.push(geometry);
    });
    for (const batch of batches.values()) {
      if (batch.meshes.length > 1) {
        const geometry = mergeGeometries(batch.geometries);
        if (geometry) {
          for (const mesh of batch.meshes) mesh.removeFromParent();
          const combined = new THREE.Mesh(geometry, batch.material);
          combined.receiveShadow = true; this.scene.add(combined);
        }
      }
      for (const geometry of batch.geometries) geometry.dispose();
    }
  }

  private material(color: number, props: THREE.MeshStandardMaterialParameters = {}): LitMaterial {
    if (this.softwareRendering) return new THREE.MeshLambertMaterial({ color, emissive: props.emissive ?? 0, emissiveIntensity: props.emissiveIntensity ?? 1, side: props.side ?? THREE.FrontSide, flatShading: props.flatShading ?? false });
    return new THREE.MeshStandardMaterial({ color, roughness: 0.82, ...props });
  }
  private batchCarBody(group: THREE.Group) {
    group.updateMatrixWorld(true);
    const batches = new Map<string, {material:THREE.Material;meshes:THREE.Mesh[];geometries:THREE.BufferGeometry[]}>();
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material) || object.material.transparent) return;
      const key = `${object.material.uuid}:${Object.keys(object.geometry.attributes).sort().join(',')}`;
      let batch=batches.get(key);
      if(!batch){batch={material:object.material,meshes:[],geometries:[]};batches.set(key,batch);}
      const geometry=object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone();
      geometry.applyMatrix4(object.matrixWorld);batch.meshes.push(object);batch.geometries.push(geometry);
    });
    for(const batch of batches.values()){
      if(batch.meshes.length>1){const geometry=mergeGeometries(batch.geometries);if(geometry){batch.meshes.forEach(mesh=>mesh.removeFromParent());group.add(new THREE.Mesh(geometry,batch.material));}}
      batch.geometries.forEach(geometry=>geometry.dispose());
    }
  }
  private mesh(geo: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  private box(w: number, h: number, d: number, material: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
    return this.mesh(new THREE.BoxGeometry(w, h, d), material, parent, x, y, z);
  }
  private sky() {
    const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 512;
    const context = canvas.getContext('2d')!; const gradient = context.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, '#56769d'); gradient.addColorStop(0.45, '#a68da9'); gradient.addColorStop(0.77, '#e2a6aa'); gradient.addColorStop(1, '#ffd4a8');
    context.fillStyle = gradient; context.fillRect(0, 0, 8, 512);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
  }
  private radial(color: string) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d')!; const g = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, color); g.addColorStop(0.15, color); g.addColorStop(1, 'rgba(255,255,255,0)'); context.fillStyle = g; context.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  }
  private lighting() {
    this.scene.add(new THREE.HemisphereLight(0xd6ebf8, 0x8a666c, 2.25));
    const sunlight = new THREE.DirectionalLight(0xffd1a1, 3.2); sunlight.position.set(-100, 100, -65); sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(2048, 2048); Object.assign(sunlight.shadow.camera, { left: -125, right: 125, top: 125, bottom: -125, near: 1, far: 360 });
    sunlight.shadow.normalBias = 0.12; sunlight.shadow.bias = -0.00015; this.scene.add(sunlight);
    const sun = new THREE.Mesh(new THREE.SphereGeometry(20, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffd0a0, fog: false })); sun.position.set(-180, 70, -270); this.scene.add(sun);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTexture, color: 0xffc995, transparent: true, opacity: 0.3, depthWrite: false, fog: false })); halo.position.copy(sun.position); halo.scale.set(140, 140, 1); this.scene.add(halo);
  }
  private ground() {
    const sidewalk = this.material(0xc0b4a6); const road = this.material(0x555963); const line = this.material(0xd3c6a2);
    const yellowMarks: THREE.Matrix4[] = [], whiteMarks: THREE.Matrix4[] = [];
    const marker = new THREE.Object3D();
    const mark = (list: THREE.Matrix4[], w: number, h: number, d: number, x: number, y: number, z: number) => {
      marker.position.set(x, y, z); marker.scale.set(w, h, d); marker.updateMatrix(); list.push(marker.matrix.clone());
    };
    this.box(215, 0.4, 225, this.material(0xa4b39d), this.scene, -5, -0.28, 0);
    for (const roadPosition of ROADS) {
      this.box(12, 0.08, 205, road, this.scene, roadPosition, -0.015, 0);
      this.box(205, 0.08, 12, road, this.scene, 0, -0.012, roadPosition);
      for (let i = -96; i <= 96; i += 7) {
        if (ROADS.some(cross => Math.abs(cross - i) < 9)) continue;
        mark(yellowMarks, 0.16, 0.025, 3.5, roadPosition - 0.2, 0.045, i);
        mark(yellowMarks, 0.16, 0.025, 3.5, roadPosition + 0.2, 0.045, i);
        mark(yellowMarks, 3.5, 0.025, 0.16, i, 0.05, roadPosition - 0.2);
        mark(yellowMarks, 3.5, 0.025, 0.16, i, 0.05, roadPosition + 0.2);
      }
    }
    const crosswalk = this.material(0xe1d9c7);
    for (const x of ROADS) for (const z of ROADS) for (let i = -4; i <= 4; i += 1.5) {
      mark(whiteMarks, 0.8, 0.025, 2, x + i, 0.06, z + 8);
      mark(whiteMarks, 2, 0.025, 0.8, x + 8, 0.06, z + i);
    }
    for (const [list, mat] of [[yellowMarks, line], [whiteMarks, crosswalk]] as const) {
      const markings = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, list.length);
      list.forEach((matrix, index) => markings.setMatrixAt(index, matrix)); markings.receiveShadow = true; this.scene.add(markings);
    }
    for (const x of ROADS.slice(0, -1)) for (const z of ROADS.slice(0, -1)) this.box(28, 0.28, 28, sidewalk, this.scene, x + 20, 0.03, z + 20);
    // Ocean Boulevard promenade and western boundary verge.
    this.box(6, 0.25, 205, this.material(0xd3c0aa), this.scene, 90, 0, 0);
    this.box(7, 0.22, 205, sidewalk, this.scene, -91, 0, 0);
  }

  private city() {
    const colors = [0xc4cec7, 0xd4a7a1, 0xc4b9cc, 0x9abfc5, 0xe4c5ad, 0x9eafb7, 0xc2c0a8];
    const trim = this.material(0xe7ded1); const glass = this.material(0x668c9e, { roughness: 0.3, metalness: 0.3 });
    const litGlass = this.material(0xd9c8a1, { emissive: 0x9f7740, emissiveIntensity: 0.18 });
    const windowGeo = new THREE.BoxGeometry(1.8, 2, 0.09); const windows: THREE.Matrix4[] = []; const litWindows: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();
    BUILDINGS.forEach((b, i) => {
      const height = [17, 30, 12, 36, 22, 14, 29, 18, 40, 16, 25, 12, 33, 21, 19][i % 15];
      const width = 21 + (i % 3); const depth = 21 + ((i + 1) % 3);
      const baseMat = this.material(colors[i % colors.length]);
      this.occluders.push(this.box(width, height, depth, baseMat, this.scene, b.x, height / 2 + 0.18, b.z));
      this.box(width + 0.4, 0.6, depth + 0.4, trim, this.scene, b.x, height + 0.4, b.z);
      this.box(width + 0.35, 0.42, depth + 0.35, trim, this.scene, b.x, 3.7, b.z);
      this.box(7, 2, 5, this.material(0x92999b), this.scene, b.x + 3, height + 1.5, b.z - 3);
      // Front arcade and door stay inside the known collider footprint.
      this.box(3.4, 2.9, 0.15, glass, this.scene, b.x, 1.7, b.z + depth / 2 + 0.09);
      this.box(7, 0.2, 1.2, trim, this.scene, b.x, 3.2, b.z + depth / 2);
      for (let y = 5.3; y < height - 1.7; y += 3.6) for (let offset = -7.7; offset <= 7.7; offset += 3.8) {
        for (const side of [0, 1, 2, 3]) {
          dummy.position.set(side === 1 ? b.x + width / 2 + 0.06 : side === 3 ? b.x - width / 2 - 0.06 : b.x + offset, y, side === 0 ? b.z + depth / 2 + 0.06 : side === 2 ? b.z - depth / 2 - 0.06 : b.z + offset);
          dummy.rotation.set(0, side % 2 ? Math.PI / 2 : 0, 0); dummy.updateMatrix();
          ((Math.round(y) + side + Math.round(offset) + i) % 5 === 0 ? litWindows : windows).push(dummy.matrix.clone());
        }
      }
      if (i % 3 === 1) {
        const stripe = this.material(i % 2 ? 0xd8c5cd : 0x89a9b4);
        this.box(0.5, height, depth + 0.12, stripe, this.scene, b.x - width / 2 + 2, height / 2 + 0.2, b.z);
      }
      const names = ['PALM HOTEL', 'AZURE', 'NOVA', 'SEABREEZE', 'SUNDOWN', 'COASTAL', 'MARINA'];
      if (i % 2 === 0) this.sign(names[i % names.length], i % 3 === 0 ? '#efb7c8' : '#b4e9e0', b.x, 5.1, b.z + depth / 2 + 0.14, 9, 1.4);
    });
    for (const [list, mat] of [[windows, glass], [litWindows, litGlass]] as const) {
      const instances = new THREE.InstancedMesh(windowGeo, mat, list.length); list.forEach((matrix, i) => instances.setMatrixAt(i, matrix)); instances.receiveShadow = true; this.scene.add(instances);
    }
    for (const z of [-90, -65, -40, -15, 10, 35, 60, 85]) this.palm(90, z, 8.5 + (z % 3), 0.3);
    for (const z of [-68, -28, 12, 52]) for (const x of [-88, -48, -8, 32, 72]) this.palm(x, z, 8.5, x * 0.04);
    for (const x of [-73, -33, 7, 47]) for (const z of [-72, -32, 8, 48, 88]) this.lamp(x, z);
    this.park();
  }
  private sign(text: string, color: string, x: number, y: number, z: number, width: number, height: number) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
    const c = canvas.getContext('2d')!; c.fillStyle = '#263b49'; c.fillRect(0, 0, 512, 96); c.strokeStyle = color; c.lineWidth = 4; c.strokeRect(5, 5, 502, 86); c.font = 'bold 50px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = color; c.fillText(text, 256, 49);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    this.mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.7 }), this.scene, x, y, z);
  }
  private palm(x: number, z: number, height: number, angle: number) {
    const tree = new THREE.Group(); tree.position.set(x, 0.1, z); tree.rotation.y = angle; this.scene.add(tree);
    const trunk = this.mesh(new THREE.CylinderGeometry(0.2, 0.42, height, 7), this.material(0x9d8165), tree, 0, height / 2, 0); trunk.rotation.z = 0.08;
    const geometry = new THREE.BufferGeometry(); const vertices: number[] = [];
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2; const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
      const start = [-height * 0.04, height, 0]; const mid = [start[0] + dx * 2.2, height + 0.35, dz * 2.2]; const tip = [start[0] + dx * 4.8, height - 1.45, dz * 4.8];
      vertices.push(...start, mid[0] + px * 0.75, mid[1], mid[2] + pz * 0.75, ...tip);
      vertices.push(...start, ...tip, mid[0] - px * 0.75, mid[1], mid[2] - pz * 0.75);
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.computeVertexNormals();
    this.mesh(geometry, this.material(0x487764, { side: THREE.DoubleSide, flatShading: true }), tree);
    this.palms.push(tree);
  }
  private lamp(x: number, z: number) {
    const metal = this.material(0x5a666c); this.box(0.18, 6.8, 0.18, metal, this.scene, x, 3.4, z);
    this.box(1.4, 0.15, 0.18, metal, this.scene, x + 0.6, 6.7, z);
    this.box(0.9, 0.12, 0.5, this.material(0xffe3ac, { emissive: 0xffcc85, emissiveIntensity: 0.7 }), this.scene, x + 1.2, 6.6, z);
  }
  private park() {
    this.box(25, 0.1, 25, this.material(0x839b78), this.scene, -20, 0.21, -20);
    this.box(25, 0.05, 3, this.material(0xcfbba1), this.scene, -20, 0.29, -20);
    this.box(3, 0.05, 25, this.material(0xcfbba1), this.scene, -20, 0.3, -20);
    const fountain = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 4.1, 0.7, 20), this.material(0xcac8b6)); fountain.position.set(-20, 0.65, -20); fountain.receiveShadow = true; this.scene.add(fountain);
    this.mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.12, 20), this.material(0x78bdbd, { roughness: 0.22 }), this.scene, -20, 1.05, -20);
    this.mesh(new THREE.CylinderGeometry(0.2, 0.6, 1.7, 8), this.material(0xc8dbd2), this.scene, -20, 1.6, -20);
    for (const x of [-28, -12]) for (const z of [-28, -12]) this.palm(x, z, 7, x);
    for (const z of [-26, -14]) {
      this.box(4, 0.2, 0.8, this.material(0x866851), this.scene, -20, 0.9, z);
      this.box(0.15, 0.7, 0.7, this.material(0x5a666c), this.scene, -21.6, 0.55, z);
      this.box(0.15, 0.7, 0.7, this.material(0x5a666c), this.scene, -18.4, 0.55, z);
    }
  }
  private beach() {
    this.box(23, 0.22, 240, this.material(0xddc4a2), this.scene, 105, -0.12, 0);
    const umbrellaColors = [0xea9e91, 0xa7d0c2, 0xdfc37f];
    for (let z = -65, i = 0; z <= 80; z += 24, i++) {
      const x = 103 + (i % 2) * 5;
      this.mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.8, 6), this.material(0xb69b7d), this.scene, x, 1.4, z);
      this.mesh(new THREE.ConeGeometry(2.8, 0.9, 8), this.material(umbrellaColors[i % 3], { side: THREE.DoubleSide }), this.scene, x, 2.8, z);
      this.box(1.3, 0.16, 2.7, this.material(0xe9dbc0), this.scene, x + 2.3, 0.18, z + 2.2);
    }
    const wood = this.material(0xb99878); this.box(40, 0.5, 6, wood, this.scene, 128, 0.6, 20);
    for (let x = 112; x < 147; x += 5) for (const z of [17.5, 22.5]) this.box(0.35, 3, 0.35, this.material(0x8a7968), this.scene, x, -0.5, z);
    this.box(8, 4, 6, this.material(0xc2d9d3), this.scene, 141, 2.8, 20);
    this.mesh(new THREE.ConeGeometry(6, 2, 4), this.material(0x8e9da2), this.scene, 141, 5.6, 20).rotation.y = Math.PI / 4;
    this.sign('PIER 09', '#f2d2ac', 141, 3.6, 23.05, 6, 1.2);
  }
  private water() {
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `varying vec2 vUv;uniform float uTime;void main(){float wave=sin(vUv.y*430.0+uTime*1.4+sin(vUv.x*50.0))*0.5+0.5;float shimmer=pow(wave,18.0)*0.16;vec3 water=mix(vec3(0.22,0.58,0.62),vec3(0.39,0.71,0.70),1.0-vUv.x);float shore=1.0-smoothstep(0.0,0.035,vUv.x);gl_FragColor=vec4(water+shimmer+shore*0.16,1.0);}`,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(340, 650), material); plane.rotation.x = -Math.PI / 2; plane.position.set(285, -0.23, 0); this.scene.add(plane); return material;
  }
  private skyline() {
    const mat = this.material(0x8d8ca4);
    for (let i = 0; i < 17; i++) {
      const h = 13 + ((i * 17) % 41); this.box(15 + i % 6, h, 18, mat, this.scene, -180 + i * 19, h / 2 - 0.2, -143 - (i % 3) * 14);
    }
    const mountains = new THREE.Group(); this.scene.add(mountains);
    for (let i = 0; i < 6; i++) this.mesh(new THREE.ConeGeometry(65, 35 + i * 4, 5), this.material(0x9e9cae), mountains, -245, 8, -200 + i * 85);
  }

  private avatar() {
    this.scene.add(this.hero);
    const shirt = this.material(0xd1c6ae), pants = this.material(0x324654), skin = this.material(0xc19074), hair = this.material(0x303333);
    this.box(0.6, 0.7, 0.34, shirt, this.hero, 0, 1.17, 0);
    this.box(0.4, 0.42, 0.36, skin, this.hero, 0, 1.75, -0.015);
    this.box(0.42, 0.16, 0.37, hair, this.hero, 0, 1.98, 0);
    this.box(0.41, 0.07, 0.04, this.material(0x35444d), this.hero, 0, 1.78, -0.21);
    for (const x of [-0.17, 0.17]) this.heroLegs.push(this.box(0.25, 0.7, 0.26, pants, this.hero, x, 0.45, 0));
    for (const x of [-0.43, 0.43]) this.heroArms.push(this.box(0.19, 0.65, 0.24, skin, this.hero, x, 1.13, 0));
  }
  private car(vehicle: Vehicle): CarVisual {
    const group = new THREE.Group(); this.scene.add(group);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 5.6), new THREE.MeshBasicMaterial({ color: 0x14202a, transparent: true, opacity: 0.14, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.015; group.add(shadow);
    const sporty = vehicle.kind === 'sport'; const paint = this.material(vehicle.color, { metalness: 0.3, roughness: 0.36 });
    const black = this.material(0x25353e, { metalness: 0.25, roughness: 0.35 }); const tire = this.material(0x20252a); const chrome = this.material(0xc1c7c5, { metalness: 0.65, roughness: 0.3 });
    const bodyLength = sporty ? 4.5 : 4.7;
    this.box(1.95, 0.64, bodyLength, paint, group, 0, 0.7, 0);
    this.box(1.93, 0.13, bodyLength + 0.08, black, group, 0, 0.39, 0);
    this.box(1.7, 0.22, 1.3, paint, group, 0, 1.06, -1.4);
    this.box(1.62, sporty ? 0.58 : 0.78, 1.9, black, group, 0, sporty ? 1.21 : 1.32, 0.1);
    this.box(1.63, 0.12, 1.55, paint, group, 0, sporty ? 1.54 : 1.75, 0.18);
    const glass = this.material(0x78a4b1, { roughness: 0.15, metalness: 0.5 });
    const windscreen = this.box(1.49, sporty ? 0.45 : 0.58, 0.06, glass, group, 0, sporty ? 1.31 : 1.42, -0.86); windscreen.rotation.x = -0.28;
    const rear = this.box(1.46, 0.43, 0.06, glass, group, 0, sporty ? 1.29 : 1.43, 1.05); rear.rotation.x = 0.24;
    for (const side of [-1, 1]) {
      this.box(0.05, sporty ? 0.38 : 0.5, 1.45, glass, group, side * 0.83, sporty ? 1.28 : 1.42, 0.15);
      this.box(0.06, 0.55, 0.09, paint, group, side * 0.86, 1.25, 0.3);
      this.box(0.16, 0.14, 0.35, paint, group, side * 1.04, 1.14, -0.65);
      this.box(0.06, 0.07, 0.28, chrome, group, side * 1.002, 0.98, 0.52);
    }
    const head = this.material(0xfff1c7, { emissive: 0xffe1aa, emissiveIntensity: 0.8 });
    const brake = this.material(0xca5965, { emissive: 0xc63743, emissiveIntensity: 0.25 });
    for (const x of [-0.65, 0.65]) {
      this.box(0.48, 0.18, 0.08, head, group, x, 0.78, -bodyLength / 2 - 0.04);
      this.box(0.56, 0.15, 0.08, brake, group, x, 0.8, bodyLength / 2 + 0.04);
    }
    this.box(0.62, 0.17, 0.05, this.material(0xe9e4cc), group, 0, 0.6, bodyLength / 2 + 0.06);
    const wheels: THREE.Group[] = [], frontWheels: THREE.Group[] = [];
    for (const x of [-1.02, 1.02]) for (const z of [-1.4, 1.4]) {
      const steer = new THREE.Group(); steer.position.set(x, 0.45, z); group.add(steer);
      const spin = new THREE.Group(); steer.add(spin);
      const wheel = this.mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.26, 12), tire, spin); wheel.rotation.z = Math.PI / 2;
      const hub = this.mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.28, 8), chrome, spin); hub.rotation.z = Math.PI / 2;
      wheels.push(spin); if (z < 0) frontWheels.push(steer);
    }
    const visual: CarVisual = { group, wheels, frontWheels, brake, smoke: [] };
    if (vehicle.kind === 'police') {
      this.box(1.98, 0.35, 1.4, this.material(0xe8e4d9), group, 0, 0.76, 0.05);
      this.box(1.35, 0.14, 0.4, black, group, 0, 1.89, 0.1);
      visual.red = this.material(0xef7180, { emissive: 0xed3d50, emissiveIntensity: 0.8 }); visual.blue = this.material(0x80c9ef, { emissive: 0x348be8, emissiveIntensity: 0.8 });
      this.box(0.6, 0.2, 0.36, visual.red, group, -0.34, 2.02, 0.1); this.box(0.6, 0.2, 0.36, visual.blue, group, 0.34, 2.02, 0.1);
    }
    if (sporty) {
      this.box(1.8, 0.11, 0.4, black, group, 0, 1.15, 1.95);
      for (const x of [-0.65, 0.65]) this.box(0.08, 0.3, 0.15, black, group, x, 1.03, 1.95);
    }
    for (let i = 0; i < 3; i++) {
      const smoke = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTexture, color: 0x9ea3a6, opacity: 0, transparent: true, depthWrite: false })); group.add(smoke); visual.smoke.push(smoke);
    }
    if (this.softwareRendering) this.batchCarBody(group);
    return visual;
  }

  update(state: GameState, dt: number, cameraMode: number, pose?: CameraPose) {
    const alive = new Set<string>();
    for (const vehicle of [...state.vehicles, ...state.police]) {
      alive.add(vehicle.id); let visual = this.cars.get(vehicle.id); if (!visual) { visual = this.car(vehicle); this.cars.set(vehicle.id, visual); }
      visual.group.visible = !(cameraMode === 2 && state.player.mode === 'drive' && state.player.vehicleId === vehicle.id);
      visual.group.position.set(vehicle.x, 0.05, vehicle.z); visual.group.rotation.y = -vehicle.heading;
      visual.wheels.forEach(wheel => { wheel.rotation.x = vehicle.wheelPhase; }); visual.frontWheels.forEach(wheel => { wheel.rotation.y = vehicle.steer * 0.35; });
      visual.brake.emissiveIntensity = vehicle.speed < 1 ? 0.8 : 0.2;
      if (visual.red && visual.blue) { const flash = Math.sin(state.time * 12 + vehicle.x) > 0; visual.red.emissiveIntensity = flash ? 2 : 0.1; visual.blue.emissiveIntensity = flash ? 0.1 : 2; }
      visual.smoke.forEach((sprite, index) => { sprite.visible = vehicle.health < 35; const phase = ((state.time * 0.6 + index / 3) % 1); sprite.position.set(0, 1 + phase * 2, -1.3 + phase * 0.6); sprite.scale.setScalar(0.5 + phase * 1.8); (sprite.material as THREE.SpriteMaterial).opacity = vehicle.health < 35 ? (1 - phase) * 0.3 : 0; });
    }
    for (const [id, visual] of this.cars) if (!alive.has(id)) visual.group.visible = false;
    const p = state.player; this.motion = this.lastPlayer ? Math.hypot(p.x - this.lastPlayer.x, p.z - this.lastPlayer.z) : 0; this.lastPlayer = {x:p.x,z:p.z}; this.hero.visible = p.mode === 'foot' && cameraMode !== 2; this.hero.position.set(p.x, 0.1, p.z); this.hero.rotation.y = -p.heading;
    const walking = this.motion > 0.003; this.heroLegs.forEach((leg, index) => { leg.rotation.x = walking ? Math.sin(state.time * 10 + index * Math.PI) * 0.45 : 0; }); this.heroArms.forEach((arm, index) => { arm.rotation.x = walking ? Math.sin(state.time * 10 + index * Math.PI) * -0.3 : 0; });
    const waypoint = state.mission.active ? state.mission.waypoint : null; this.marker.visible = Boolean(waypoint); if (waypoint) { this.marker.position.set(waypoint.x, 0, waypoint.z); this.markerArrow.position.y = Math.sin(state.time * 2.5) * 0.4; this.markerArrow.rotation.y = state.time * 0.7; this.markerRing.rotation.z = state.time * 0.25; }
    this.waterMaterial.uniforms.uTime.value = state.time;
    this.palms.forEach((palm, index) => { palm.rotation.z = Math.sin(state.time * 0.6 + index) * 0.009; });
    const heading = pose?.yaw ?? p.heading;
    const forward = new THREE.Vector3(Math.sin(heading), 0, -Math.cos(heading));
    const zoom = pose?.zoom ?? 1;
    const pitch = pose?.pitch ?? (cameraMode === 1 ? 1 : cameraMode === 2 ? .02 : .38);
    let destination: THREE.Vector3; let lookAt: THREE.Vector3;
    if (cameraMode === 2) {
      const vehicleForward = new THREE.Vector3(Math.sin(p.heading), 0, -Math.cos(p.heading));
      destination = new THREE.Vector3(p.x, p.mode === 'drive' ? 1.45 : 1.75, p.z);
      if(p.mode === 'drive')destination.addScaledVector(vehicleForward, .6);
      lookAt = destination.clone().addScaledVector(forward, 25);lookAt.y -= Math.tan(pitch) * 25;
    } else {
      const distance = (cameraMode === 1 ? 32 : p.mode === 'drive' ? 12 : 7) * zoom;
      const pivot = new THREE.Vector3(p.x, 1.6, p.z);
      destination = pivot.clone().addScaledVector(forward, -Math.cos(pitch) * distance);
      destination.y += Math.sin(pitch) * distance;
      lookAt = pivot.clone().addScaledVector(forward, cameraMode === 1 ? 0 : p.mode === 'drive' ? 4 : 1.4);
    }
    const fieldOfView = cameraMode === 2 ? THREE.MathUtils.clamp(58 / zoom, 35, 85) : 58;
    if(this.camera.fov !== fieldOfView){this.camera.fov = fieldOfView;this.camera.updateProjectionMatrix();}
    if (!this.initialized || this.lastMode !== cameraMode) { this.camera.position.copy(destination); this.initialized = true; this.lastMode = cameraMode; }
    else this.camera.position.lerp(destination, 1 - Math.exp(-Math.min(dt, 0.2) * 5.8));
    if (cameraMode !== 2) {
      const pivot = new THREE.Vector3(p.x, 1.8, p.z);
      const offset = this.camera.position.clone().sub(pivot);
      this.raycaster.set(pivot, offset.clone().normalize()); this.raycaster.far = offset.length();
      const obstruction = this.raycaster.intersectObjects(this.occluders, false)[0];
      if (obstruction) this.camera.position.copy(pivot).addScaledVector(offset.normalize(), Math.max(0.4, obstruction.distance - 0.55));
    }
    this.camera.lookAt(lookAt); this.renderer.render(this.scene, this.camera);
  }
  resize() { const width = Math.max(1, this.parent.clientWidth), height = Math.max(1, this.parent.clientHeight); this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height, false); }
  destroy() { this.observer.disconnect(); this.scene.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose(); } }); this.glowTexture.dispose(); this.smokeTexture.dispose(); this.renderer.dispose(); this.renderer.domElement.remove(); }
}

import * as THREE from 'three';
import type { CameraPose } from './camera-controls';
import { CasinoView } from './casino-view';
import type { Point } from './model';
import type { PokerState } from './poker-model';
import type { RouletteSnapshot } from './casino-games';
import type { OnlineMember } from './multiplayer-model';
import { RemotePlayersView } from './remote-players';
import { CityLife, getCityEnvironment } from './city-life';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD_BOUNDS, type GameState, type Vehicle } from './model';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SurfaceLibrary, createWaterMaterial } from './surface-materials';
import { AtmosphereView, atmosphereFogProfile } from './atmosphere';
import { PoliceView } from './police-view';
import { expansionLandmarks } from './expansion-landmarks';
import { AvatarView } from './avatar-view';
import type { AppearanceState } from './appearance';
import { MobilityView } from './mobility-view';
import { VehicleLodLibrary, type DistantCarVisual } from './vehicle-lod';
import { CityStreetsView } from './city-streets';
import { CityDistrictsView } from './city-districts';
import { createVehicleMotion, stepVehicleMotion, type VehicleMotion } from './vehicle-motion';
import { graphicsProfile, type GraphicsProfile, type GraphicsQuality } from './graphics';
import { VehicleLighting, type VehicleLightSource } from './vehicle-lighting';

type LitMaterial = THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;

interface CarVisual {
  group: THREE.Group;
  chassis:THREE.Group;
  motion:VehicleMotion;
  wheels: THREE.Group[];
  frontWheels: THREE.Group[];
  brake: LitMaterial;
  red?: LitMaterial;
  blue?: LitMaterial;
  smoke: THREE.Sprite[];
  kind: Vehicle['kind'];
  paint: LitMaterial;
  paintColor: number;
  head: LitMaterial;
  full?:THREE.Group;
  distant?:DistantCarVisual;
}

/** All art is generated here. The simulation, collisions and missions stay in game.ts. */
export class CityView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(58, 1, 0.15, 950);
  readonly renderer: THREE.WebGLRenderer;
  readonly softwareRendering: boolean;
  onGraphicsChange?:()=>void;
  private requestedQuality:GraphicsQuality;
  private qualityProfile!:GraphicsProfile;
  private readonly vehicleLighting:VehicleLighting;
  private lastPlayer: { x:number; z:number } | null = null;
  private readonly cars = new Map<string, CarVisual>();
  private readonly hero = new THREE.Group();
  private readonly heroLegs: THREE.Mesh[] = [];
  private readonly heroArms: THREE.Mesh[] = [];
  private readonly customAvatar:AvatarView;
  private readonly mobilityVisuals:MobilityView;
  private readonly surfaces:SurfaceLibrary;
  private readonly atmosphere:AtmosphereView;
  private readonly distantCars:VehicleLodLibrary|null;
  private streets!:CityStreetsView;
  private districts!:CityDistrictsView;
  private readonly marker = new THREE.Group();
  private readonly markerRing: THREE.Mesh;
  private readonly markerArrow: THREE.Group;
  private crewMarker=false;
  private readonly waterMaterial: THREE.ShaderMaterial;
  private readonly glowTexture: THREE.CanvasTexture;
  private readonly smokeTexture: THREE.CanvasTexture;
  private observer: ResizeObserver;
  private initialized = false;
  private lastMode = -1;
  private readonly parent: HTMLElement;
  private readonly casino: CasinoView;
  private readonly remote: RemotePlayersView;
  private readonly living: CityLife;
  private readonly policeVisuals: PoliceView;
  private readonly homeScene = new THREE.Scene();
  private homeGroup: THREE.Group | null = null;
  private homeId: string | null = null;
  private hemisphere!: THREE.HemisphereLight;
  private sunlight!: THREE.DirectionalLight;
  private solarOrb!: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private solarHalo!: THREE.Sprite;
  private readonly outsideSky=new THREE.Color();
  private lastPassengerOf:string|null=null;
  private onlineMembers: OnlineMember[] = [];
  private onlineSelf = '';
  private remoteCars = new Set<string>();
  private readonly cityObjects: THREE.Object3D[];
  private readonly cityBackground: THREE.Texture | THREE.Color | null;
  private readonly cityFog: THREE.Fog | THREE.FogExp2 | null;
  private indoors = false;
  private seated = false;
  private visualTime = 0;
  renderFrames = 0;
  private motion = 0;
  private readonly occluders: THREE.Mesh[] = [];
  private readonly raycaster = new THREE.Raycaster();

  constructor(parent: HTMLElement,quality:GraphicsQuality='auto') {
    this.parent = parent;
    this.requestedQuality=quality;
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch {
      throw new Error('Nie udało się uruchomić grafiki WebGL. Włącz akcelerację sprzętową lub użyj aktualnego Chrome / Firefox.');
    }
    const gl = this.renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const device = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : '';
    this.softwareRendering = /swiftshader|llvmpipe|software/i.test(device);
    if(this.softwareRendering){
      // Multisampling is fixed when WebGL creates the context. Recreate it before
      // attaching the canvas or uploading resources, retaining smooth edges on GPU.
      this.renderer.dispose();this.renderer.forceContextLoss();
      try{
        this.renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,powerPreference:'high-performance'});
      }catch{
        throw new Error('Nie udało się uruchomić grafiki WebGL. Włącz akcelerację sprzętową lub użyj aktualnego Chrome / Firefox.');
      }
    }
    if(this.softwareRendering){this.camera.far=170;this.camera.updateProjectionMatrix();}
    this.renderer.setPixelRatio(this.softwareRendering ? 0.55 : Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = !this.softwareRendering;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.distantCars=new VehicleLodLibrary();
    this.surfaces=new SurfaceLibrary(this.softwareRendering,Math.min(8,this.renderer.capabilities.getMaxAnisotropy()));
    this.atmosphere=new AtmosphereView(this.softwareRendering);
    // Keep the sky inside the shorter software-rendering view distance.
    if(this.softwareRendering)this.atmosphere.group.scale.setScalar(145/540);
    this.scene.add(this.atmosphere.group);
    this.renderer.domElement.setAttribute('aria-label', 'Trójwymiarowe miasto Neon Coast');
    parent.append(this.renderer.domElement);
    this.scene.background = this.sky();
    this.scene.fog = new THREE.Fog(0xc5c0b4,this.softwareRendering?70:145,this.softwareRendering?160:540);
    this.glowTexture = this.radial('#fff3cc');
    this.smokeTexture = this.radial('#bac6d0');
    this.lighting();
    this.ground();
    this.city();
    this.beach();
    this.skyline();
    this.batchStaticGeometry();
    this.avatar();
    for(const child of this.hero.children)child.visible=false;
    this.customAvatar=new AvatarView(this.softwareRendering);this.hero.add(this.customAvatar.group);
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
    this.casino = new CasinoView(this.softwareRendering);
    this.scene.add(this.casino.exterior, this.casino.interior);
    this.cityObjects = this.scene.children.filter(object => object !== this.hero && object !== this.marker && object !== this.casino.interior);
    this.cityBackground = this.scene.background;
    this.cityFog = this.scene.fog;
    this.remote = new RemotePlayersView(this.softwareRendering);
    this.scene.add(this.remote.group);
    this.living = new CityLife(this.softwareRendering);
    this.scene.add(this.living.group);
    this.policeVisuals = new PoliceView(this.softwareRendering);
    this.scene.add(this.policeVisuals.group);const landmarks=expansionLandmarks();this.scene.add(landmarks);this.cityObjects.push(landmarks);
    this.mobilityVisuals=new MobilityView();this.scene.add(this.mobilityVisuals.group);
    this.vehicleLighting=new VehicleLighting(this.scene,this.softwareRendering);
    this.homeScene.background = new THREE.Color(0x121c2b);
    this.homeScene.add(new THREE.HemisphereLight(0xcde9ff,0x41334b,2.3));
    this.configureGraphics();
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
      const position=new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);
      // Keep batches local, so looking north does not submit the entire expanded city.
      const sector=`${Math.floor(position.x/80)},${Math.floor(position.z/80)}`;
      const key = [sector, material.color.getHex(), material.emissive.getHex(), material.emissiveIntensity, material instanceof THREE.MeshStandardMaterial ? material.roughness : 0, material instanceof THREE.MeshStandardMaterial ? material.metalness : 0, material.side, material.map?.uuid, material.emissiveMap?.uuid, material.flatShading, Object.keys(object.geometry.attributes).sort().join(',')].join(':');
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
          combined.receiveShadow = true;combined.castShadow=true;combined.geometry.computeBoundingSphere();this.scene.add(combined);
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
      if(batch.meshes.length>1){const geometry=mergeGeometries(batch.geometries);if(geometry){batch.meshes.forEach(mesh=>{mesh.removeFromParent();mesh.geometry.dispose();});group.add(new THREE.Mesh(geometry,batch.material));}}
      batch.geometries.forEach(geometry=>geometry.dispose());
    }
  }
  private mesh(geo: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
    // Shared surface maps tile every eight metres, including on long roads.
    if((material instanceof THREE.MeshStandardMaterial||material instanceof THREE.MeshLambertMaterial)&&material.map?.wrapS===THREE.RepeatWrapping){
      const positions=geo.getAttribute('position'),normals=geo.getAttribute('normal'),uv=geo.getAttribute('uv');
      if(positions&&normals&&uv)for(let index=0;index<positions.count;index++){
        const nx=Math.abs(normals.getX(index)),ny=Math.abs(normals.getY(index)),nz=Math.abs(normals.getZ(index));
        uv.setXY(index,(nx>ny&&nx>nz?positions.getZ(index):positions.getX(index))/8,(ny>nx&&ny>nz?positions.getZ(index):positions.getY(index))/8);
      }
    }
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
    this.hemisphere=new THREE.HemisphereLight(0xc8dceb, 0x625447, 1.8);this.scene.add(this.hemisphere);
    const sunlight = this.sunlight=new THREE.DirectionalLight(0xffd1a1, 3.2); sunlight.position.set(-100, 100, -65); sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(2048, 2048); Object.assign(sunlight.shadow.camera, { left: -125, right: 125, top: 125, bottom: -125, near: 1, far: 360 });
    sunlight.shadow.normalBias = 0.035; sunlight.shadow.bias = -0.00012;sunlight.shadow.radius=2; this.scene.add(sunlight,sunlight.target);
    const sun = this.solarOrb=new THREE.Mesh(new THREE.SphereGeometry(20, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffd0a0, fog: false })); sun.position.set(-180, 70, -270); this.scene.add(sun);
    const halo = this.solarHalo=new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTexture, color: 0xffc995, transparent: true, opacity: 0.3, depthWrite: false, fog: false })); halo.position.copy(sun.position); halo.scale.set(140, 140, 1); this.scene.add(halo);
  }
  private ground() {
    this.streets=new CityStreetsView(this.softwareRendering,this.surfaces);
    this.scene.add(this.streets.group);
  }
  private city() {
    this.districts=new CityDistrictsView(this.softwareRendering,this.surfaces);
    this.scene.add(this.districts.group);
    this.occluders.push(...this.districts.occluders);
  }
  private sign(text: string, color: string, x: number, y: number, z: number, width: number, height: number) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
    const c = canvas.getContext('2d')!; c.fillStyle = '#263b49'; c.fillRect(0, 0, 512, 96); c.strokeStyle = color; c.lineWidth = 4; c.strokeRect(5, 5, 502, 86); c.font = 'bold 50px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = color; c.fillText(text, 256, 49);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    this.mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.7 }), this.scene, x, y, z);
  }
  private beach() {
    const length=WORLD_BOUNDS.maxZ-WORLD_BOUNDS.minZ+32;
    this.box(23,.22,length,this.surfaces.sand,this.scene,105,-.12,0);
    const sand=this.material(0xc9bb9c,{roughness:1});
    this.box(9,.025,length,sand,this.scene,111,-.005,0);
    const umbrellaColors=[0xc69b89,0x8ba89d,0xb8a57d];
    for(let z=-190,i=0;z<=190;z+=32,i++){
      const x=103+(i%2)*5;
      this.mesh(new THREE.CylinderGeometry(.045,.045,2.6,10),this.material(0x9b8c76),this.scene,x,1.3,z);
      this.mesh(new THREE.ConeGeometry(2.5,.7,16),this.material(umbrellaColors[i%3],{side:THREE.DoubleSide}),this.scene,x,2.6,z);
      this.box(1.1,.12,2.6,this.surfaces.concrete,this.scene,x+2.3,.17,z+2.2);
    }
    const wood=this.material(0x9c8971);this.box(40,.5,6,wood,this.scene,128,.6,20);
    for(let x=112;x<147;x+=5)for(const z of[17.5,22.5])this.box(.28,3,.28,this.material(0x746d61),this.scene,x,-.5,z);
    this.box(8,4,6,this.surfaces.stucco,this.scene,141,2.8,20);
    this.mesh(new THREE.ConeGeometry(6,2,4),this.surfaces.roof,this.scene,141,5.6,20).rotation.y=Math.PI/4;
    this.sign('PIER 09','#e1d6be',141,3.6,23.05,6,1.2);
    // Extended coast has quiet bathing areas and a second pier to explore.
    this.box(35,.36,5,wood,this.scene,128,.4,160);
    for(let x=114;x<145;x+=6)for(const z of[158,162])this.box(.24,2.4,.24,wood,this.scene,x,-.45,z);
    this.sign('SOUTH BEACH','#d7dfd1',142,2.4,163,8,1.3);
  }
  private water() {
    const material=createWaterMaterial();
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(1200,1800),material);plane.rotation.x=-Math.PI/2;plane.position.set(715,-.23,0);plane.receiveShadow=false;this.scene.add(plane);return material;
  }
  private skyline() {
    const mat=this.surfaces.office;
    for(let i=0;i<22;i++){
      const h=18+(i*17)%45;this.box(12+i%7,h,15,mat,this.scene,-250+i*17,h/2-.75,-260-(i%3)*11);
    }
    const mountains=new THREE.Group();this.scene.add(mountains);
    const hill=this.material(0x6f807a);
    for(let i=0;i<9;i++){
      const mountain=this.mesh(new THREE.SphereGeometry(65+i%3*8,12,8),hill,mountains,-285-(i%3)*25,-10,-260+i*68);mountain.scale.set(1,.5+(i%3)*.1,1.1);
    }
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
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 5.6), new THREE.MeshBasicMaterial({ map:this.smokeTexture,color:0x101722,transparent:true,opacity:.38,depthWrite:false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.046; group.add(shadow);
    const chassis=new THREE.Group();chassis.name='sprung-chassis';group.add(chassis);
    const sporty = vehicle.kind === 'sport'; const paint = this.material(vehicle.color, { metalness: 0.3, roughness: 0.36 });
    const black = this.material(0x25353e, { metalness: 0.25, roughness: 0.35 }); const tire = this.material(0x20252a); const chrome = this.material(0xc1c7c5, { metalness: 0.65, roughness: 0.3 });
    const bodyLength = sporty ? 4.5 : 4.7;
    this.mesh(new RoundedBoxGeometry(1.95,.64,bodyLength,this.softwareRendering?1:3,.16),paint,chassis,0,.7,0);
    this.box(1.93, 0.13, bodyLength + 0.08, black, chassis, 0, 0.39, 0);
    this.mesh(new RoundedBoxGeometry(1.7,.22,1.3,this.softwareRendering?1:2,.08),paint,chassis,0,1.06,-1.4);
    this.box(1.62, sporty ? 0.58 : 0.78, 1.9, black, chassis, 0, sporty ? 1.21 : 1.32, 0.1);
    this.mesh(new RoundedBoxGeometry(1.63,.12,1.55,this.softwareRendering?1:2,.055),paint,chassis,0,sporty?1.54:1.75,.18);
    const glass = this.material(0x78a4b1, { roughness: 0.15, metalness: 0.5 });
    const windscreen = this.box(1.49, sporty ? 0.45 : 0.58, 0.06, glass, chassis, 0, sporty ? 1.31 : 1.42, -0.86); windscreen.rotation.x = -0.28;
    const rear = this.box(1.46, 0.43, 0.06, glass, chassis, 0, sporty ? 1.29 : 1.43, 1.05); rear.rotation.x = 0.24;
    for (const side of [-1, 1]) {
      this.box(0.05, sporty ? 0.38 : 0.5, 1.45, glass, chassis, side * 0.83, sporty ? 1.28 : 1.42, 0.15);
      this.box(0.06, 0.55, 0.09, paint, chassis, side * 0.86, 1.25, 0.3);
      this.box(0.16, 0.14, 0.35, paint, chassis, side * 1.04, 1.14, -0.65);
      this.box(0.06, 0.07, 0.28, chrome, chassis, side * 1.002, 0.98, 0.52);
    }
    const head = this.material(0xfff1c7, { emissive: 0xffe1aa, emissiveIntensity: 0.8 });
    const brake = this.material(0xca5965, { emissive: 0xc63743, emissiveIntensity: 0.25 });
    for (const x of [-0.65, 0.65]) {
      this.box(0.48, 0.18, 0.08, head, chassis, x, 0.78, -bodyLength / 2 - 0.04);
      this.box(0.56, 0.15, 0.08, brake, chassis, x, 0.8, bodyLength / 2 + 0.04);
    }
    this.box(0.62, 0.17, 0.05, this.material(0xe9e4cc), chassis, 0, 0.6, bodyLength / 2 + 0.06);
    const wheels: THREE.Group[] = [], frontWheels: THREE.Group[] = [];
    for (const x of [-1.02, 1.02]) for (const z of [-1.4, 1.4]) {
      const steer = new THREE.Group(); steer.position.set(x, 0.45, z); group.add(steer);
      const spin = new THREE.Group(); steer.add(spin);
      const wheel = this.mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.26,this.softwareRendering?12:20), tire, spin); wheel.rotation.z = Math.PI / 2;
      const hub = this.mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.28, 12), black, spin); hub.rotation.z = Math.PI / 2;
      const spokes:THREE.BufferGeometry[]=[];
      for(let index=0;index<5;index++){
        const angle=index*Math.PI*2/5,spoke=new THREE.BoxGeometry(.025,.30,.045);
        spoke.rotateX(angle);spoke.translate(Math.sign(x)*.153,Math.cos(angle)*.10,Math.sin(angle)*.10);spokes.push(spoke);
      }
      const spokeGeometry=mergeGeometries(spokes)!;spokes.forEach(spoke=>spoke.dispose());this.mesh(spokeGeometry,chrome,spin);
      wheels.push(spin); if (z < 0) frontWheels.push(steer);
    }
    const visual: CarVisual = { group,chassis,motion:createVehicleMotion(), wheels, frontWheels, brake, head, paint, paintColor:vehicle.color, kind:vehicle.kind, smoke: [] };
    if (vehicle.kind === 'police') {
      this.box(1.98, 0.35, 1.4, this.material(0xe8e4d9), chassis, 0, 0.76, 0.05);
      this.box(1.35, 0.14, 0.4, black, chassis, 0, 1.89, 0.1);
      visual.red = this.material(0xef7180, { emissive: 0xed3d50, emissiveIntensity: 0.8 }); visual.blue = this.material(0x80c9ef, { emissive: 0x348be8, emissiveIntensity: 0.8 });
      this.box(0.6, 0.2, 0.36, visual.red, chassis, -0.34, 2.02, 0.1); this.box(0.6, 0.2, 0.36, visual.blue, chassis, 0.34, 2.02, 0.1);
    }
    if (sporty) {
      this.box(1.8, 0.11, 0.4, black, chassis, 0, 1.15, 1.95);
      for (const x of [-0.65, 0.65]) this.box(0.08, 0.3, 0.15, black, chassis, x, 1.03, 1.95);
    }
    for (let i = 0; i < 3; i++) {
      const smoke = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTexture, color: 0x9ea3a6, opacity: 0, transparent: true, depthWrite: false })); group.add(smoke); visual.smoke.push(smoke);
    }
    if (this.softwareRendering) this.batchCarBody(chassis);
    if(this.distantCars){
      const full=new THREE.Group();full.add(...group.children);group.add(full);visual.full=full;
      visual.distant=this.distantCars.create(vehicle.kind==='sport'?'sport':vehicle.kind==='police'?'police':'sedan',vehicle.color);
      visual.distant.group.visible=false;group.add(visual.distant.group);
    }
    return visual;
  }

  private disposeCar(visual:CarVisual) {
    // Distant geometry/materials belong to the shared library, not an individual car.
    visual.distant?.group.removeFromParent();
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
    visual.group.traverse(object=>{
      if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}
      if(object instanceof THREE.Sprite)materials.add(object.material);
    });
    visual.group.removeFromParent();geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());
  }

  get presentation(): 'city' | 'casino' | 'poker' | 'home' { return this.homeGroup ? 'home' : this.seated ? 'poker' : this.indoors ? 'casino' : 'city'; }
  setHome(homeId:string|null,group:THREE.Group|null) {
    if(this.homeId===homeId&&this.homeGroup===group)return;
    this.homeGroup?.removeFromParent();this.homeId=homeId;this.homeGroup=group;this.initialized=false;
    if(group){this.homeScene.add(group,this.hero,this.remote.group);}else this.scene.add(this.hero,this.remote.group);
  }
  addCityObject(group:THREE.Group){this.scene.add(group);}
  setAppearance(appearance:AppearanceState,crewColor?:number){this.customAvatar.setAppearance(appearance,crewColor);this.mobilityVisuals.setAppearance(appearance,crewColor);}
  get remotePlayers() { return this.remote.visibleCount; }
  get cityLifeSnapshot() { return this.living.snapshot; }
  setOnline(members: OnlineMember[], selfId: string) {
    this.onlineMembers = members;
    this.onlineSelf = selfId;
    this.remoteCars = new Set(members.filter(member => member.id !== selfId && member.pose.mode === 'drive' && member.pose.vehicle?.id !== 'stratus').map(member => member.pose.vehicle!.id));
  }
  setPoker(state: PokerState | null, seated: boolean) {
    if(this.seated !== seated)this.initialized = false;
    this.seated = seated;
    this.casino.updatePoker(state, seated);
  }
  setRoulette(state:RouletteSnapshot){this.casino.setRoulette(state);}
  update(state: GameState, dt: number, cameraMode: number, pose?: CameraPose, navigation?: Point, crewTarget=false, citySeconds=state.time) {
    if(this.homeGroup){this.updateHome(state,dt,cameraMode,pose);return;}
    const inside = state.interior === 'casino';
    if(inside !== this.indoors) {
      this.indoors = inside;this.initialized = false;
      for(const object of this.cityObjects)object.visible = !inside;
      this.casino.interior.visible = inside;
      this.scene.background = inside ? new THREE.Color(0x101420) : this.cityBackground;
      this.scene.fog = inside ? new THREE.Fog(0x101420,35,80) : this.cityFog;
    }
    const environment=getCityEnvironment(citySeconds);
    this.living.update(citySeconds,state.player,inside,dt,[...state.vehicles,...state.police]);
    this.streets.updateSignals(citySeconds);
    this.policeVisuals.update(state,dt);this.policeVisuals.group.visible=!inside;
    this.mobilityVisuals.update(state,dt,this.remoteCars,cameraMode===2?state.player.vehicleId??undefined:undefined);this.mobilityVisuals.group.visible=!inside;
    if(inside){
      this.hemisphere.intensity=2.25;this.hemisphere.color.setHex(0xd6ebf8);this.hemisphere.groundColor.setHex(0x8a666c);
      this.sunlight.intensity=3.2;this.sunlight.color.setHex(0xffd1a1);
      this.solarOrb.visible=false;this.solarHalo.visible=false;
    }else{
      this.scene.background=this.outsideSky.setHex(environment.sky);
      if(this.scene.fog instanceof THREE.Fog){const haze=atmosphereFogProfile(environment);this.scene.fog.color.setHex(haze.color);this.scene.fog.near=this.qualityProfile.fogNear*haze.nearScale;this.scene.fog.far=this.qualityProfile.fogFar*haze.farScale;}
      this.hemisphere.intensity=.72+environment.daylight*1.18;this.hemisphere.color.setHex(environment.daylight<.1?0xadc2e6:0xcbdfee);this.hemisphere.groundColor.setHex(environment.daylight<.1?0x293249:0x746655);
      this.sunlight.intensity=.12+environment.daylight*(1-environment.rain*.6)*3.4;this.sunlight.color.setHex(environment.sunColor);
      this.sunlight.position.set(state.player.x-100,100,state.player.z-65);this.sunlight.target.position.set(state.player.x,0,state.player.z);
      this.solarOrb.visible=environment.daylight>.03;this.solarHalo.visible=this.solarOrb.visible;this.solarHalo.material.opacity=.15+environment.daylight*.15;
      this.waterMaterial.uniforms.uDaylight.value=environment.daylight;this.waterMaterial.uniforms.uRain.value=environment.rain;this.surfaces.setNight(1-environment.daylight);this.surfaces.updateWeather(environment.rain,environment.daylight,this.qualityProfile.resolved);
    }
    this.visualTime += dt;
    this.casino.update(this.visualTime);
    const alive = new Set<string>();
    for (const vehicle of [...state.vehicles, ...state.police]) {
      if(vehicle.kind==='bike'||vehicle.kind==='boat')continue;
      alive.add(vehicle.id); let visual = this.cars.get(vehicle.id);
      if(visual&&visual.kind!==vehicle.kind){this.disposeCar(visual);this.cars.delete(vehicle.id);visual=undefined;}
      if (!visual) { visual = this.car(vehicle); this.cars.set(vehicle.id, visual); }
      if(visual.paintColor!==vehicle.color){visual.paint.color.setHex(vehicle.color);visual.paintColor=vehicle.color;if(visual.distant)this.distantCars?.setColor(visual.distant,vehicle.color);}
      visual.group.visible = !inside && !this.remoteCars.has(vehicle.id) && !(cameraMode === 2 && state.player.mode === 'drive' && state.player.vehicleId === vehicle.id);
      visual.group.position.set(vehicle.x, 0.05, vehicle.z); visual.group.rotation.y = -vehicle.heading;
      visual.motion=stepVehicleMotion(visual.motion,vehicle,dt);
      if(visual.full&&visual.distant){
        const distance=Math.min((vehicle.x-state.player.x)**2+(vehicle.z-state.player.z)**2,(vehicle.x-this.camera.position.x)**2+(vehicle.z-this.camera.position.z)**2);
        // Hysteresis prevents flicker around the boundary; owned/active cars stay detailed.
        const distant=!vehicle.owned&&vehicle.id!==state.player.vehicleId&&distance>(visual.distant.group.visible?50**2:60**2);
        visual.full.visible=!distant;visual.distant.group.visible=distant;
        if(distant)continue;
      }
      visual.wheels.forEach(wheel => { wheel.rotation.x = visual.motion.wheelRotation; }); visual.frontWheels.forEach(wheel => { wheel.rotation.y = visual.motion.steering; });
      visual.chassis.rotation.set(visual.motion.pitch,visual.motion.yaw,visual.motion.roll);visual.chassis.position.y=visual.motion.heave;
      visual.brake.emissiveIntensity = .18+(1-environment.daylight)*.45+visual.motion.braking*2.1;
      visual.head.emissiveIntensity=.6+(1-environment.daylight)*1.4;
      if (visual.red && visual.blue) { const flash = Math.sin(state.time * 12 + vehicle.x) > 0; visual.red.emissiveIntensity = flash ? 2 : 0.1; visual.blue.emissiveIntensity = flash ? 0.1 : 2; }
      visual.smoke.forEach((sprite, index) => { sprite.visible = vehicle.health < 35; const phase = ((state.time * 0.6 + index / 3) % 1); sprite.position.set(0, 1 + phase * 2, -1.3 + phase * 0.6); sprite.scale.setScalar(0.5 + phase * 1.8); (sprite.material as THREE.SpriteMaterial).opacity = vehicle.health < 35 ? (1 - phase) * 0.3 : 0; });
    }
    for (const [id, visual] of this.cars) if (!alive.has(id)){this.disposeCar(visual);this.cars.delete(id);}
    const lightSources:VehicleLightSource[]=[...state.vehicles,...state.police].filter(v=>v.kind!=='boat'&&v.kind!=='bike'&&!this.remoteCars.has(v.id)).map(vehicle=>({id:vehicle.id,x:vehicle.x,z:vehicle.z,heading:vehicle.heading,kind:vehicle.kind,braking:this.cars.get(vehicle.id)?.motion.braking??0}));
    for(const member of this.onlineMembers){if(member.id===this.onlineSelf||member.pose.mode!=='drive'||member.pose.interior||member.pose.homeId||member.pose.passengerOf)continue;lightSources.push({id:`remote-${member.id}`,x:member.pose.x,z:member.pose.z,heading:member.pose.heading,kind:member.pose.vehicle?.kind});}
    this.vehicleLighting.update(lightSources,state.player,environment.daylight,dt,!inside,environment.rain);
    const p = state.player,riding=Boolean(p.passengerOf),inCar=p.mode==='drive'||riding;
    if((p.passengerOf??null)!==this.lastPassengerOf){this.lastPassengerOf=p.passengerOf??null;this.initialized=false;}
    this.motion = this.lastPlayer ? Math.hypot(p.x - this.lastPlayer.x, p.z - this.lastPlayer.z) : 0; this.lastPlayer = {x:p.x,z:p.z}; this.hero.visible = !this.seated && !riding && p.mode === 'foot' && cameraMode !== 2; this.hero.position.set(p.x, 0.1, p.z); this.hero.rotation.y = -p.heading;
    const walking = this.motion > 0.003;this.customAvatar.update(walking,this.visualTime,{speed:dt>0?this.motion/dt:0,heading:p.heading,dt}); this.heroLegs.forEach((leg, index) => { leg.rotation.x = walking ? Math.sin(state.time * 10 + index * Math.PI) * 0.45 : 0; }); this.heroArms.forEach((arm, index) => { arm.rotation.x = walking ? Math.sin(state.time * 10 + index * Math.PI) * -0.3 : 0; });
    if(crewTarget!==this.crewMarker){
      this.crewMarker=crewTarget;
      this.marker.traverse(object=>{
        if(!(object instanceof THREE.Mesh))return;
        const material=object.material as LitMaterial|THREE.MeshBasicMaterial;
        material.color.setHex(crewTarget?0x8df0c3:0xffdc8b);
        if('emissive' in material)material.emissive.setHex(crewTarget?0x51dba4:0xffbc4b);
      });
    }
    const waypoint = inside ? null : navigation ?? (state.mission.active ? state.mission.waypoint : null); this.marker.visible = Boolean(waypoint); if (waypoint) { this.marker.position.set(waypoint.x, 0, waypoint.z); this.markerArrow.position.y = Math.sin(state.time * 2.5) * 0.4; this.markerArrow.rotation.y = state.time * 0.7; this.markerRing.rotation.z = state.time * 0.25; }
    this.waterMaterial.uniforms.uTime.value = citySeconds;
    const heading = pose?.yaw ?? p.heading;
    const forward = new THREE.Vector3(Math.sin(heading), 0, -Math.cos(heading));
    const zoom = pose?.zoom ?? 1;
    const pitch = pose?.pitch ?? (cameraMode === 1 ? 1 : cameraMode === 2 ? .02 : .38);
    const ridingVehicle=state.vehicles.find(vehicle=>vehicle.id===p.vehicleId),airHeight=ridingVehicle?.airHeight??0;
    let destination: THREE.Vector3; let lookAt: THREE.Vector3;
    if (inside && this.seated) {
      destination = new THREE.Vector3(0, 2.8, 3.2);
      const headYaw = THREE.MathUtils.clamp(heading, -1.25, 1.25);
      const headPitch = THREE.MathUtils.clamp(pitch - .1, -.15, 1.05);
      lookAt = destination.clone().add(new THREE.Vector3(Math.sin(headYaw) * Math.cos(headPitch), -Math.sin(headPitch), -Math.cos(headYaw) * Math.cos(headPitch)).multiplyScalar(10));
    } else if (cameraMode === 2) {
      const vehicleForward = new THREE.Vector3(Math.sin(p.heading), 0, -Math.cos(p.heading));
      destination = new THREE.Vector3(p.x, (inCar ? 1.45 : 1.75)+airHeight, p.z);
      if(inCar)destination.addScaledVector(vehicleForward, .6);
      if(riding)destination.add(new THREE.Vector3(Math.cos(p.heading),0,Math.sin(p.heading)).multiplyScalar(.48));
      lookAt = destination.clone().addScaledVector(forward, 25);lookAt.y -= Math.tan(pitch) * 25;
    } else {
      const distance = (cameraMode === 1 ? (inside ? 7 : 32) : inCar ? 12 : inside ? 4 : 7) * zoom;
      const pivot = new THREE.Vector3(p.x, 1.6+airHeight, p.z);
      destination = pivot.clone().addScaledVector(forward, -Math.cos(pitch) * distance);
      destination.y += Math.sin(pitch) * distance;
      lookAt = pivot.clone().addScaledVector(forward, cameraMode === 1 ? 0 : inCar ? 4 : 1.4);
    }
    if(inside) {
      destination.x = THREE.MathUtils.clamp(destination.x, -9.9, 9.9);
      destination.z = THREE.MathUtils.clamp(destination.z, -8.7, 9.2);
      destination.y = THREE.MathUtils.clamp(destination.y, .6, 5.8);
    }
    const fieldOfView = this.seated ? THREE.MathUtils.clamp((this.camera.aspect < 1 ? 78 : 62) / zoom, 42, 90) : cameraMode === 2 ? THREE.MathUtils.clamp(58 / zoom, 35, 85) : 58;
    if(this.camera.fov !== fieldOfView){this.camera.fov = fieldOfView;this.camera.updateProjectionMatrix();}
    if (!this.initialized || this.lastMode !== cameraMode) { this.camera.position.copy(destination); this.initialized = true; this.lastMode = cameraMode; }
    else this.camera.position.lerp(destination, 1 - Math.exp(-Math.min(dt, 0.2) * 5.8));
    if (cameraMode !== 2 && !inside) {
      const pivot = new THREE.Vector3(p.x, 1.8, p.z);
      const offset = this.camera.position.clone().sub(pivot);
      this.raycaster.set(pivot, offset.clone().normalize()); this.raycaster.far = offset.length();
      const obstruction = this.raycaster.intersectObjects(this.occluders, false)[0];
      if (obstruction) this.camera.position.copy(pivot).addScaledVector(offset.normalize(), Math.max(0.4, obstruction.distance - 0.55));
    }
    this.remote.update(this.onlineMembers, this.onlineSelf, state.interior, dt,cameraMode===2&&riding?p.passengerOf??undefined:undefined);
    this.camera.lookAt(lookAt);this.atmosphere.update(environment,this.camera.position,citySeconds);this.renderer.render(this.scene, this.camera);this.renderFrames++;
  }
  private updateHome(state:GameState,dt:number,cameraMode:number,pose?:CameraPose){
    this.visualTime+=dt;const p=state.player,yaw=pose?.yaw??p.heading,pitch=pose?.pitch??.35,zoom=pose?.zoom??1;
    this.hero.visible=cameraMode!==2;this.hero.position.set(p.x,.1,p.z);this.hero.rotation.y=-p.heading;
    const moved=this.lastPlayer?Math.hypot(p.x-this.lastPlayer.x,p.z-this.lastPlayer.z)>.001:false;this.lastPlayer={x:p.x,z:p.z};
    this.customAvatar.update(moved,this.visualTime,{speed:moved?2.8:0,heading:p.heading,dt});
    this.heroLegs.forEach((leg,i)=>leg.rotation.x=moved?Math.sin(this.visualTime*10+i*Math.PI)*.45:0);
    this.heroArms.forEach((arm,i)=>arm.rotation.x=moved?-Math.sin(this.visualTime*10+i*Math.PI)*.3:0);
    const forward=new THREE.Vector3(Math.sin(yaw),0,-Math.cos(yaw));const pivot=new THREE.Vector3(p.x,1.5,p.z);
    const destination=cameraMode===2?new THREE.Vector3(p.x,1.75,p.z):pivot.clone().addScaledVector(forward,-Math.cos(pitch)*4*zoom);
    if(cameraMode!==2)destination.y+=Math.sin(pitch)*4*zoom;
    destination.x=THREE.MathUtils.clamp(destination.x,-7.2,7.2);destination.z=THREE.MathUtils.clamp(destination.z,-5.7,7.2);destination.y=THREE.MathUtils.clamp(destination.y,.7,5.4);
    if(!this.initialized||cameraMode!==this.lastMode){this.camera.position.copy(destination);this.initialized=true;this.lastMode=cameraMode;}else this.camera.position.lerp(destination,1-Math.exp(-Math.min(dt,.2)*8));
    const lookAt=cameraMode===2?destination.clone().addScaledVector(forward,10):pivot.clone().addScaledVector(forward,1);
    if(cameraMode===2)lookAt.y-=Math.tan(pitch)*10;
    if(this.camera.fov!==58){this.camera.fov=58;this.camera.updateProjectionMatrix();}
    this.remote.update(this.onlineMembers,this.onlineSelf,null,dt,undefined,this.homeId);
    this.camera.lookAt(lookAt);this.renderer.render(this.homeScene,this.camera);this.renderFrames++;
  }
  get graphicsProfile(){return {...this.qualityProfile,lighting:this.vehicleLighting.snapshot};}
  setGraphicsQuality(quality:GraphicsQuality){this.requestedQuality=quality;this.configureGraphics();this.resize();}
  private configureGraphics(){
    const profile=graphicsProfile(this.requestedQuality,this.softwareRendering,this.parent.clientWidth,this.parent.clientHeight,window.devicePixelRatio||1);
    if(this.qualityProfile&&JSON.stringify(profile)===JSON.stringify(this.qualityProfile))return;
    this.qualityProfile=profile;this.renderer.setPixelRatio(profile.pixelRatio);
    const shadowChanged=this.renderer.shadowMap.enabled!==profile.shadows;
    this.renderer.shadowMap.enabled=profile.shadows;this.sunlight.castShadow=profile.shadows;
    if(this.sunlight.shadow.mapSize.x!==profile.shadowMapSize){this.sunlight.shadow.map?.dispose();this.sunlight.shadow.map=null;this.sunlight.shadow.mapSize.set(profile.shadowMapSize,profile.shadowMapSize);}
    const extent=profile.resolved==='high'?78:60;
    Object.assign(this.sunlight.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent});this.sunlight.shadow.camera.updateProjectionMatrix();
    this.camera.far=profile.viewDistance;this.camera.updateProjectionMatrix();
    this.atmosphere.group.scale.setScalar(Math.min(1,profile.viewDistance*.9/540));
    this.atmosphere.setQuality(profile.resolved);this.living.setQuality(profile.resolved);this.vehicleLighting.setQuality(profile.resolved);
    if(this.cityFog instanceof THREE.Fog){this.cityFog.near=profile.fogNear;this.cityFog.far=profile.fogFar;}
    if(shadowChanged)for(const scene of[this.scene,this.homeScene])scene.traverse(object=>{if(object instanceof THREE.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])material.needsUpdate=true;});
    this.onGraphicsChange?.();
  }
  resize() { this.configureGraphics();const width = Math.max(1, this.parent.clientWidth), height = Math.max(1, this.parent.clientHeight); this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height, false); }
  destroy() { this.observer.disconnect(); this.vehicleLighting.destroy();this.streets.destroy();this.districts.destroy();this.living.destroy(); this.remote.destroy(); this.casino.destroy();this.atmosphere.destroy(); this.scene.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose(); } });this.occluders.forEach(object=>object.geometry.dispose());this.surfaces.destroy();this.distantCars?.destroy(); if(this.cityBackground instanceof THREE.Texture)this.cityBackground.dispose();this.glowTexture.dispose(); this.smokeTexture.dispose(); this.renderer.dispose(); this.renderer.domElement.remove(); }
}

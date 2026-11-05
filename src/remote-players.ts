import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { OnlineMember } from './multiplayer-model';
import type { VehicleKind } from './model';
import { appearanceColors, type AppearanceState } from './appearance';
import { createMobilityVehicle } from './mobility-view';
import { AvatarMotion } from './avatar-motion';
import { createVehicleModel } from './vehicle-model';
import { createVehicleMotion, stepVehicleMotion, type VehicleMotion } from './vehicle-motion';
import { createCharacterFaceGeometry } from './character-geometry';

type LitMaterial = THREE.MeshLambertMaterial | THREE.MeshStandardMaterial;
interface BodyPart { size: [number, number, number]; at: [number, number, number]; color: number; rotation?: [number, number, number]; shape?:'sphere'|'capsule'|'torso'|'hair'; rounding?:number }
interface RemoteVisual {
  root: THREE.Group;
  avatar: THREE.Group;
  body: THREE.Mesh;
  legs: THREE.Group[];
  arms: THREE.Group[];
  car: THREE.Group;
  carModel?: ReturnType<typeof createVehicleModel>;
  carMotion: VehicleMotion;
  pants: LitMaterial;
  appearanceKey: string;
  mobility?: ReturnType<typeof createMobilityVehicle>;
  label: THREE.Sprite;
  labelTexture: THREE.CanvasTexture;
  name: string;
  slot: number;
  heading: number;
  wheelPhase: number;
  phase: number;
  motion: AvatarMotion;
  kind: VehicleKind;
  paintColor: number;
  location: 'casino' | null;
  mode: 'drive' | 'foot';
  passengerOf: string|null;
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
  private readonly avatarBodies = new Map<string, THREE.BufferGeometry>();
  private readonly armShapes = new Map<string, THREE.BufferGeometry>();
  private readonly colored: LitMaterial;
  private readonly legShape: THREE.BufferGeometry;
  private readonly shoeShape: THREE.BufferGeometry;
  private count = 0;
  private destroyed = false;
  private clock=0;

  constructor(private readonly software: boolean) {
    this.group.name = 'Other online players';
    this.colored = this.material(0xffffff, true);
    this.legShape = this.track(new THREE.CapsuleGeometry(.5,1,3,8));this.legShape.scale(.23,.37,.25);
    this.legShape.translate(0, -.35, 0);
    this.shoeShape=this.boxes([
      {shape:'capsule',size:[.24,.145,.39],at:[0,-.72,-.07],color:0x202a30},
      {shape:'capsule',size:[.244,.04,.385],at:[0,-.767,-.07],color:0x787d7d},
    ]);
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
      let shape:THREE.BufferGeometry;
      if(part.rounding!==undefined)shape=new RoundedBoxGeometry(...part.size,part.size[1]>.3?3:2,part.rounding);
      else if(part.shape==='sphere'){shape=new THREE.SphereGeometry(.5,8,6);shape.scale(...part.size);}
      else if(part.shape==='capsule'){shape=new THREE.CapsuleGeometry(.5,1,3,8);shape.scale(part.size[0],part.size[1]/2,part.size[2]);}
      else if(part.shape==='torso'){shape=new THREE.CylinderGeometry(.5,.4,1,8);shape.scale(...part.size);}
      else if(part.shape==='hair'){shape=new THREE.SphereGeometry(.5,8,5,0,Math.PI*2,0,Math.PI*.57);shape.scale(...part.size);}
      else shape=new THREE.BoxGeometry(...part.size);
      const geometry=shape.index?shape.toNonIndexed():shape;if(geometry!==shape)shape.dispose();
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

  private avatarColors(slot:number,appearance?:AppearanceState){return appearance?appearanceColors(appearance):{shirt:SLOT_COLORS[slot],pants:0x2c3b48,skin:SKIN_COLORS[slot],hair:0x2a2b2d,accessory:0x20313b,hairstyle:'short',accessoryStyle:'none',crewOutfit:false};}
  private avatarGeometry(slot: number,appearance?:AppearanceState) {
    const colors=this.avatarColors(slot,appearance),key=JSON.stringify(colors);
    let body = this.avatarBodies.get(key);
    if (!body) {
      const shirt = colors.shirt, skin = colors.skin;
      const parts:BodyPart[]=[
        { shape:'torso',size: [.58, .66, .371], at: [0, 1.18, 0], color: shirt },
        { shape:'capsule',size:[.49,.25,.31],at:[0,.85,0],color:colors.pants },
        { shape:'capsule',size: [.145, .17, .145], at: [0, 1.58, 0], color: skin },
        { shape:'sphere',size: [.38, .44, .35], at: [0, 1.79, -.015], color: skin },
        { size:[.016,.4,.015],at:[0,1.19,-.187],color:0x59616a },
        { size:[.47,.045,.31],at:[0,.91,0],color:0x59616a },
      ];
      for(const side of[-1,1])parts.push({size:[.12,.14,.025],at:[side*.068,1.47,-.134],color:shirt,rotation:[0,0,side*.45]});
      for(const y of[1.11,1.26,1.4])parts.push({shape:'sphere',size:[.024,.024,.016],at:[0,y,-.2],color:0x787d7d});
      parts.push({shape:'hair',size:[colors.hairstyle==='buzz'?.4:.42,colors.hairstyle==='buzz'?.416:colors.hairstyle==='long'?.456:.448,.4],at:[0,1.81,-.012],color:colors.hair});
      if(colors.hairstyle!=='buzz')parts.push({shape:colors.hairstyle==='long'?'sphere':'capsule',size:[.35,colors.hairstyle==='long'?.52:.2,colors.hairstyle==='long'?.16:.12],at:[0,colors.hairstyle==='long'?1.72:1.86,.14],color:colors.hair});
      if(colors.hairstyle==='long')for(const side of[-1,1])parts.push({shape:'capsule',size:[.075,.39,.22],at:[side*.185,1.76,.035],color:colors.hair});
      if(colors.accessoryStyle==='glasses'){for(const side of[-1,1])parts.push({shape:'sphere',size:[.155,.095,.028],at:[side*.095,1.83,-.19],color:colors.accessory});parts.push({size:[.06,.024,.025],at:[0,1.84,-.207],color:colors.accessory});}
      if(colors.accessoryStyle==='cap')parts.push({shape:'hair',size:[.472,.496,.4],at:[0,1.81,-.012],color:colors.accessory},{shape:'sphere',size:[.46,.035,.27],at:[0,1.965,-.22],color:colors.accessory});
      if(colors.crewOutfit)parts.push({size:[.09,.36,.018],at:[.14,1.18,-.176],color:0xdcece2,rotation:[0,0,.2]});
      const silhouette=this.boxes(parts),sourceFace=createCharacterFaceGeometry(skin,colors.hair),face=sourceFace.index?sourceFace.toNonIndexed():sourceFace;
      if(face!==sourceFace)sourceFace.dispose();face.translate(0,1.79,-.015);
      body=this.track(mergeGeometries([silhouette,face])!);silhouette.dispose();this.geometries.delete(silhouette);face.dispose();body.translate(0,-1,0);
      this.avatarBodies.set(key, body);
    }
    let arm = this.armShapes.get(key);
    if (!arm) {
      const parts:BodyPart[]=[
        { shape:'capsule',size: [.22, .32, .245], at: [0, -.1, 0], color: colors.shirt },
        { shape:'capsule',size: [.158, .285, .158], at: [0, -.39, 0], color: colors.skin },
        { shape:'capsule',size: [.107, .145, .095], at: [0, -.58, -.006], color: colors.skin },
        { shape:'capsule',size: [.038, .09, .045], at: [.048, -.584, -.01], color: colors.skin,rotation:[0,0,.5] },
      ];
      for(let finger=0;finger<4;finger++)parts.push({shape:'capsule',size:[.022,.072-(finger===3?.016:0),.03],at:[-.034+finger*.023,-.667+Math.abs(1.5-finger)*.006,-.012],color:colors.skin});
      arm = this.boxes(parts);
      this.armShapes.set(key, arm);
    }
    return { body, arm,key,colors };
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
    const slot = safeSlot(member.slot), shape = this.avatarGeometry(slot,member.appearance);
    const root = new THREE.Group(); root.name = `Online player ${member.id}`; this.group.add(root);
    const avatar = new THREE.Group(); root.add(avatar);
    const body = this.mesh(shape.body, this.colored, avatar);
    body.position.y=1;
    const pants=this.material(shape.colors.pants);
    const legs: THREE.Group[] = [], arms: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(side * .145, .85, 0); avatar.add(leg); this.mesh(this.legShape, pants, leg);this.mesh(this.shoeShape,this.colored,leg); legs.push(leg);
      const arm = new THREE.Group(); arm.position.set(side * .325, 1.45, 0); avatar.add(arm); this.mesh(shape.arm, this.colored, arm); arms.push(arm);
    }
    const car = new THREE.Group(); root.add(car);
    const carModel=createVehicleModel('sport',SLOT_COLORS[slot],{software:this.software});car.add(carModel.group);
    const labelTexture = this.nameTexture(member.name, slot);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthWrite: false }));
    label.scale.set(2.9, .635, 1); label.position.y = 2.65; root.add(label);
    return { root, avatar, body, legs, arms, car, carModel,carMotion:createVehicleMotion(),pants,appearanceKey:shape.key, label, labelTexture, name: member.name, slot, heading: 0, wheelPhase: 0, phase: 0,motion:new AvatarMotion(), kind: 'sport', paintColor: SLOT_COLORS[slot], location: member.pose.interior, mode: member.pose.mode, passengerOf:member.pose.passengerOf??null, initialized: false };
  }

  private remove(id: string, visual: RemoteVisual) {
    visual.root.removeFromParent(); visual.labelTexture.dispose(); visual.label.material.dispose();
    this.removeCarModel(visual);
    visual.pants.dispose();this.materials.delete(visual.pants);this.removeMobility(visual);
    this.visuals.delete(id);
  }

  update(members: OnlineMember[], selfId: string, interior: 'casino' | null, dt: number, hideVehicleOf?:string,homeId?:string|null) {
    if (this.destroyed) return;
    const step = Number.isFinite(dt) ? Math.min(.2, Math.max(0, dt)) : 0;
    this.clock+=step;
    const blend = 1 - Math.exp(-step * 14);
    const present = new Set<string>(); this.count = 0;
    for (const member of members) {
      if (member.id === selfId) continue;
      present.add(member.id);
      let visual = this.visuals.get(member.id);
      if (!visual) { visual = this.create(member); this.visuals.set(member.id, visual); }
      const pose = member.pose,riding=Boolean(pose.passengerOf),driver=riding?members.find(person=>person.id===pose.passengerOf):undefined;
      const rideVehicle=driver?.pose.mode==='drive'?driver.pose.vehicle:null;
      const driving = !riding&&pose.mode === 'drive' && pose.vehicle !== null;
      const visible = (pose.homeId??null)===(homeId??null) && pose.interior === interior && !(pose.interior === 'casino' && pose.seated);
      visual.root.visible = visible;
      if (!visible) { visual.initialized = false; continue; }
      this.count++;
      const slot = safeSlot(member.slot);
      const avatarShape=this.avatarGeometry(slot,member.appearance);
      if(avatarShape.key!==visual.appearanceKey){visual.body.geometry=avatarShape.body;visual.arms.forEach(arm=>{(arm.children[0]as THREE.Mesh).geometry=avatarShape.arm;});visual.pants.color.setHex(avatarShape.colors.pants);visual.appearanceKey=avatarShape.key;}
      if (member.name !== visual.name || slot !== visual.slot) {
        visual.labelTexture.dispose(); visual.labelTexture = this.nameTexture(member.name, slot);
        visual.label.material.map = visual.labelTexture; visual.label.material.needsUpdate = true;
        if (slot !== visual.slot) {
          const shape = this.avatarGeometry(slot,member.appearance); visual.body.geometry = shape.body;
          visual.arms.forEach(arm => { (arm.children[0] as THREE.Mesh).geometry = shape.arm; });
        }
        visual.name = member.name; visual.slot = slot;
      }
      const targetX = driving ? pose.vehicle!.x : rideVehicle?.x??pose.x, targetZ = driving ? pose.vehicle!.z : rideVehicle?.z??pose.z;
      const heading = driving ? pose.vehicle!.heading : rideVehicle?.heading??pose.heading;
      const jump = !visual.initialized || visual.location !== pose.interior || visual.mode !== pose.mode || visual.passengerOf!==(pose.passengerOf??null) || Math.hypot(targetX - visual.root.position.x, targetZ - visual.root.position.z) > 18;
      const previousX = visual.root.position.x, previousZ = visual.root.position.z, oldHeading = visual.heading;
      if (jump) { visual.root.position.set(targetX, driving||riding ? .05 : .1, targetZ); visual.heading = heading;visual.motion.reset();visual.carMotion=createVehicleMotion(); }
      else {
        visual.root.position.x += (targetX - visual.root.position.x) * blend;
        visual.root.position.z += (targetZ - visual.root.position.z) * blend;
        visual.heading = wrap(visual.heading + wrap(heading - visual.heading) * blend);
      }
      visual.root.position.y = driving||riding ? .05 : .1;
      visual.initialized = true; visual.location = pose.interior; visual.mode = pose.mode;visual.passengerOf=pose.passengerOf??null;
      visual.avatar.visible = !driving&&!riding; visual.car.visible = driving&&member.id!==hideVehicleOf;
      visual.avatar.rotation.y = visual.car.rotation.y = -visual.heading;
      const seatSide=riding?(slot%2?1:-1)*1.4:0;
      visual.label.position.set(Math.cos(heading)*seatSide,riding?3.65+Math.floor(slot/2)*.7:driving?2.8:2.65,Math.sin(heading)*seatSide);
      const travel = jump ? 0 : Math.hypot(visual.root.position.x - previousX, visual.root.position.z - previousZ);
      if (driving) {
        const vehicle = pose.vehicle!;
        if (vehicle.kind !== visual.kind) {
          this.removeMobility(visual);
          this.removeCarModel(visual);visual.carMotion=createVehicleMotion();
          if(vehicle.kind==='bike'||vehicle.kind==='boat'){visual.mobility=createMobilityVehicle(vehicle.kind,vehicle.color);visual.car.add(visual.mobility.group);}
          else {visual.carModel=createVehicleModel(vehicle.kind,vehicle.color,{software:this.software});visual.car.add(visual.carModel.group);}
          visual.kind = vehicle.kind;
        }
        const color = Number.isFinite(vehicle.color) ? (vehicle.color >>> 0) & 0xffffff : SLOT_COLORS[slot];
        if (color !== visual.paintColor) { visual.carModel?.paint.color.setHex(color); visual.paintColor = color; }
        if(visual.carModel){
          const model=visual.carModel,motion=stepVehicleMotion(visual.carMotion,{speed:vehicle.speed,heading:visual.heading,steer:0},step);
          visual.carMotion=motion;
          model.chassis.position.y=motion.heave;model.chassis.rotation.set(motion.pitch,motion.yaw,motion.roll);
          model.wheels.forEach(wheel=>wheel.rotation.x=motion.wheelRotation);
          model.frontWheels.forEach(steer=>steer.rotation.y=motion.steering);
          model.brake.emissiveIntensity=.25+motion.braking*1.7;
          if(model.red)model.red.emissiveIntensity=Math.sin(this.clock*14)>0?1.7:.15;
          if(model.blue)model.blue.emissiveIntensity=Math.sin(this.clock*14)<0?1.7:.15;
        }
        if(visual.mobility){
          visual.mobility.paint.color.setHex(color);
          visual.mobility.rider.traverse((object:THREE.Object3D)=>{if(!(object instanceof THREE.Mesh))return;const slot=object.userData.appearanceSlot as 'shirt'|'pants'|'skin'|'hair'|undefined;if(!slot)return;for(const material of Array.isArray(object.material)?object.material:[object.material])if('color'in material)(material as LitMaterial).color.setHex(avatarShape.colors[slot]);});
          visual.mobility.group.position.y=vehicle.kind==='bike'?Math.max(0,Math.min(6,(vehicle as {airHeight?:number}).airHeight??0)):0;
          visual.mobility.wheels.forEach(wheel=>wheel.rotation.x=visual.wheelPhase);
        }
        visual.wheelPhase += vehicle.speed * step / .42;
        const turn = step > 0 && !jump ? THREE.MathUtils.clamp(wrap(visual.heading - oldHeading) / step * .3, -.35, .35) : 0;
        if(visual.mobility){visual.mobility.frontWheels.forEach(steer=>steer.rotation.y=turn);visual.mobility.group.rotation.z=vehicle.kind==='bike'?-turn*.8:0;}
      } else if(!riding) {
        const moving = travel > .0003;
        const gait=visual.motion.update(moving,this.clock,{speed:step>0?Math.min(8,travel/step):0,heading:visual.heading,dt:step});
        visual.avatar.position.set(gait.sway,gait.bob,0);visual.avatar.rotation.y=-visual.heading+gait.yawOffset;
        visual.body.rotation.set(gait.lean,gait.torsoYaw,gait.roll);
        visual.legs.forEach((leg,index)=>leg.rotation.x=index===0?gait.leftLeg:gait.rightLeg);
        visual.arms.forEach((arm,index)=>{arm.rotation.x=index===0?gait.leftArm:gait.rightArm;arm.rotation.z=(index===0?1:-1)*(.035+gait.strideWeight*.045);});
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
  private removeMobility(visual:RemoteVisual){if(!visual.mobility)return;const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();visual.mobility.group.traverse((object:THREE.Object3D)=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}});geometries.forEach(item=>item.dispose());materials.forEach(item=>item.dispose());visual.mobility.group.removeFromParent();visual.mobility=undefined;}
  private removeCarModel(visual:RemoteVisual){visual.carModel?.group.removeFromParent();visual.carModel?.dispose();visual.carModel=undefined;}
}

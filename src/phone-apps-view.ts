import * as THREE from 'three';
import type { Courier } from './phone-apps';

const material = (color: number, roughness = .6, metalness = .1) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mesh.position.set(x, y, z); mesh.castShadow = true; return mesh; };
const wheel = (radius: number, width: number, m: THREE.Material, x: number, y: number, z: number) => { const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 14), m); mesh.rotation.z = Math.PI / 2; mesh.position.set(x, y, z); return mesh; };

/** Delivery scooter with a rider and an insulated food box. Faces +Z. */
function scooter() {
  const g = new THREE.Group(), tyre = material(0x1b1d1f, .9), body = material(0xe8542f, .35, .2), dark = material(0x2a2f33, .7);
  g.add(wheel(.27, .12, tyre, 0, .27, .62), wheel(.27, .12, tyre, 0, .27, -.58));
  g.add(box(.36, .22, 1.15, body, 0, .45, 0), box(.32, .5, .22, body, 0, .72, .48), box(.06, .62, .06, dark, 0, 1.05, .56), box(.62, .05, .05, dark, 0, 1.36, .56));
  g.add(box(.34, .12, .5, dark, 0, .66, -.22));
  const crate = box(.56, .46, .52, material(0xf6c343, .5), 0, 1.05, -.52); g.add(crate);
  const skin = material(0xc99a7a, .8), jacket = material(0xe8542f, .7);
  g.add(box(.36, .5, .24, jacket, 0, 1.05, -.08), box(.14, .44, .14, dark, -.12, .72, .12), box(.14, .44, .14, dark, .12, .72, .12));
  g.add(box(.1, .38, .1, jacket, -.22, 1.12, .16).rotateX(-.9), box(.1, .38, .1, jacket, .22, 1.12, .16).rotateX(-.9));
  const head = new THREE.Mesh(new THREE.SphereGeometry(.15, 14, 10), skin); head.position.set(0, 1.46, -.06); g.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(.17, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.8), material(0xf6c343, .3)); helmet.position.set(0, 1.49, -.06); g.add(helmet);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.07, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c0, emissiveIntensity: 2 })); lamp.position.set(0, .92, .62); g.add(lamp);
  return g;
}

/** Roadside-assistance flatbed with a beacon bar. Faces +Z. */
function towTruck() {
  const g = new THREE.Group(), tyre = material(0x1b1d1f, .9), paint = material(0xf2f2ec, .35, .3), stripe = material(0xf08a24, .5), dark = material(0x2b3135, .6, .3), glass = material(0x223844, .1, .5);
  for (const z of [1.55, -.7, -1.75]) for (const x of [-.95, .95]) g.add(wheel(.45, .34, tyre, x, .45, z));
  g.add(box(2.1, 1.25, 1.75, paint, 0, 1.25, 1.55), box(1.9, .55, .08, glass, 0, 1.55, 2.43), box(2.12, .16, 1.77, stripe, 0, .95, 1.55));
  g.add(box(2.2, .35, 4.3, dark, 0, .75, -1.05), box(2.25, .14, 3.6, material(0x8e969b, .5, .6), 0, 1.0, -1.45));
  g.add(box(.12, 1.1, .12, dark, -.6, 1.5, .55), box(.12, 1.1, .12, dark, .6, 1.5, .55), box(1.3, .1, .12, dark, 0, 2.05, .55));
  const beacons = new THREE.Group();
  for (const x of [-.45, .45]) { const lamp = new THREE.Mesh(new THREE.BoxGeometry(.4, .16, .22), new THREE.MeshStandardMaterial({ color: 0xffa21a, emissive: 0xff8a00, emissiveIntensity: 1.5 })); lamp.position.set(x, 1.98, 1.4); beacons.add(lamp); }
  beacons.name = 'beacons'; g.add(beacons);
  for (const x of [-.7, .7]) { const light = new THREE.Mesh(new THREE.BoxGeometry(.38, .2, .06), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1c8, emissiveIntensity: 1.6 })); light.position.set(x, .95, 2.45); g.add(light); }
  return g;
}

export class PhoneAppsView {
  readonly group = new THREE.Group();
  private readonly scooter = scooter();
  private readonly truck = towTruck();
  constructor() { this.group.name = 'phone-apps'; this.group.add(this.scooter, this.truck); this.scooter.visible = this.truck.visible = false; }
  update(food: Courier | null, tow: Courier | null, time: number) {
    for (const [mesh, courier, height] of [[this.scooter, food, 0], [this.truck, tow, 0]] as const) {
      mesh.visible = Boolean(courier);
      if (!courier) continue;
      mesh.position.set(courier.position.x, height, courier.position.z);
      const turn = courier.heading - mesh.rotation.y, wrapped = Math.atan2(Math.sin(turn), Math.cos(turn));
      mesh.rotation.y += wrapped * .2;
    }
    const beacons = this.truck.getObjectByName('beacons');
    beacons?.children.forEach((lamp, i) => { lamp.visible = Math.sin(time * 9 + i * Math.PI) > 0; });
  }
}

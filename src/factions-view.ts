import * as THREE from 'three';
import { DISTRICTS, FACTIONS, type DistrictId, type FactionsSnapshot } from './factions';

/** District flags reflect host-computed ownership; they do not award influence. */
export class FactionsView {
 readonly group=new THREE.Group();
 private readonly zones=new Map<DistrictId,{flag:THREE.Mesh;ring:THREE.Mesh;relay:THREE.Group;material:THREE.MeshBasicMaterial}>();
 private readonly objective=new THREE.Group();
 private elapsed=0;
 constructor(){
  this.group.name='faction-territories';
  for(const area of Object.values(DISTRICTS)){
   const zone=new THREE.Group();zone.position.set(area.center.x,0,area.center.z);
   const material=new THREE.MeshBasicMaterial({color:0xb0c0b8,transparent:true,opacity:.65});
   const ring=new THREE.Mesh(new THREE.TorusGeometry(4.6,.07,4,40),material);ring.position.y=.12;ring.rotation.x=-Math.PI/2;zone.add(ring);
   const pole=new THREE.Mesh(new THREE.CylinderGeometry(.055,.07,4.8,6),new THREE.MeshLambertMaterial({color:0x657c82}));pole.position.set(5.7,2.4,0);zone.add(pole);
   const flag=new THREE.Mesh(new THREE.PlaneGeometry(2.2,1.1),new THREE.MeshBasicMaterial({color:0xb0c0b8,side:THREE.DoubleSide}));flag.position.set(6.8,4,0);zone.add(flag);this.group.add(zone);
   const relay=new THREE.Group();relay.position.set(area.relay.x,0,area.relay.z);
   const box=new THREE.Mesh(new THREE.BoxGeometry(.7,1.5,.55),new THREE.MeshLambertMaterial({color:0x23414b}));box.position.y=.75;relay.add(box);
   const antenna=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,1.2,5),new THREE.MeshLambertMaterial({color:0x9fb5b5}));antenna.position.y=2;relay.add(antenna);
   const light=new THREE.Mesh(new THREE.BoxGeometry(.45,.13,.05),material);light.position.set(0,1.1,.29);relay.add(light);this.group.add(relay);
   this.zones.set(area.id,{flag,ring,relay,material});
  }
  const ring=new THREE.Mesh(new THREE.TorusGeometry(2.5,.1,5,32),new THREE.MeshBasicMaterial({color:0xf1d494}));ring.rotation.x=-Math.PI/2;ring.position.y=.15;this.objective.add(ring);
  const marker=new THREE.Mesh(new THREE.OctahedronGeometry(.45),new THREE.MeshBasicMaterial({color:0xf1d494}));marker.position.y=2.8;this.objective.add(marker);this.objective.visible=false;this.group.add(this.objective);
 }
 update(snapshot:FactionsSnapshot|null,indoors=false,dt=0){
  this.elapsed+=Number.isFinite(dt)?Math.max(0,dt):0;this.group.visible=!indoors;
  for(const area of snapshot?.districts??[]){const zone=this.zones.get(area.id);if(!zone)continue;const tint=area.controller?FACTIONS[area.controller].color:area.contested?0xe9ba7a:0x9aacb2;
   (zone.flag.material as THREE.MeshBasicMaterial).color.setHex(tint);zone.material.color.setHex(tint);zone.material.opacity=.4+(area.contested?Math.sin(this.elapsed*3)*.15:.15);zone.flag.rotation.y=Math.sin(this.elapsed*1.8)*.08;
  }
  const target=snapshot?.job.status==='active'?snapshot.job.target:null;this.objective.visible=Boolean(target);
  if(target){this.objective.position.set(target.x,0,target.z);this.objective.children[1].rotation.y=this.elapsed;}
 }
 destroy(){const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();this.group.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}});geometries.forEach(item=>item.dispose());materials.forEach(item=>item.dispose());this.group.removeFromParent();this.group.clear();}
}

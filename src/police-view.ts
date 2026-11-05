import * as THREE from 'three';
import type { GameState, Roadblock, Vehicle } from './model';
import { POLICE_SAFEHOUSE } from './game';
import { createVehicleModel, type VehicleModel } from './vehicle-model';
import { createVehicleMotion, stepVehicleMotion, type VehicleMotion } from './vehicle-motion';

/** Pursuit props follow the simulation; this view never decides detection or collisions. */
export class PoliceView {
  readonly group=new THREE.Group();
  private readonly patrols=new Map<string,{model:VehicleModel;motion:VehicleMotion}>();
  private readonly blocks=new Map<string,THREE.Group>();
  private readonly helicopter=new THREE.Group();
  private readonly rotor=new THREE.Group();
  private readonly cone:THREE.Mesh;
  private readonly safehouse=new THREE.Group();
  private readonly red=new THREE.MeshBasicMaterial({color:0xff4565});
  private readonly blue=new THREE.MeshBasicMaterial({color:0x4397ff});
  private readonly body:THREE.MeshLambertMaterial;
  private readonly dark=new THREE.MeshLambertMaterial({color:0x172635});
  private readonly glass=new THREE.MeshLambertMaterial({color:0x74b3c8});
  private readonly metal=new THREE.MeshLambertMaterial({color:0x829399});
  private readonly gold=new THREE.MeshBasicMaterial({color:0xefc76d});
  private seconds=0;

  constructor(private readonly software=false){
    this.body=new THREE.MeshLambertMaterial({color:0xe1e5de});
    this.box(this.helicopter,2.5,1.4,4.1,this.dark,0,0,0);
    this.box(this.helicopter,1.9,.8,1.9,this.glass,0,.15,-1.25);
    this.box(this.helicopter,.48,.55,4.7,this.dark,0,.2,3.9);
    this.box(this.helicopter,2.2,.14,1.15,this.metal,0,.3,5.5);
    for(const x of [-1.25,1.25]){
      this.box(this.helicopter,.12,.75,.12,this.metal,x,-1,0);
      this.box(this.helicopter,.12,.15,4.9,this.metal,x,-1.35,.1);
    }
    this.box(this.helicopter,.18,.8,.18,this.metal,0,1,0);
    this.box(this.rotor,11,.08,.24,this.dark,0,0,0);
    this.box(this.rotor,.24,.08,11,this.dark,0,0,0);
    this.rotor.position.y=1.5;this.helicopter.add(this.rotor);
    this.box(this.helicopter,.25,.18,.2,this.red,-1.25,.1,0);
    this.box(this.helicopter,.25,.18,.2,this.blue,1.25,.1,0);
    this.cone=new THREE.Mesh(new THREE.ConeGeometry(8,24,16,1,true),new THREE.MeshBasicMaterial({color:0xffe7b8,transparent:true,opacity:.08,side:THREE.DoubleSide,depthWrite:false}));
    this.cone.position.y=-12;this.helicopter.add(this.cone);this.helicopter.visible=false;
    this.group.add(this.helicopter);

    this.safehouse.position.set(POLICE_SAFEHOUSE.x,0,POLICE_SAFEHOUSE.z);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(3.5,.07,4,40),new THREE.MeshBasicMaterial({color:0x7cdcc7,transparent:true,opacity:.55}));
    ring.rotation.x=-Math.PI/2;ring.position.y=.08;this.safehouse.add(ring);
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
    const context=canvas.getContext('2d')!;
    context.fillStyle='#11252d';context.fillRect(0,0,512,128);
    context.strokeStyle='#7cdcc7';context.lineWidth=5;context.strokeRect(4,4,504,120);
    context.textAlign='center';context.fillStyle='#baf4de';context.font='bold 48px Arial';context.fillText('KRYJÓWKA',256,58);
    context.font='21px Arial';context.fillStyle='#e8d8b2';context.fillText('ZGUB KONTAKT · ZATRZYMAJ SIĘ',256,101);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(5.8,1.45),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
    sign.position.set(-6,2.4,0);sign.rotation.y=Math.PI/2;this.safehouse.add(sign);
    this.group.add(this.safehouse);
  }

  private box(parent:THREE.Group,w:number,h:number,d:number,material:THREE.Material,x:number,y:number,z:number){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
  }
  private patrol(car:Vehicle,dt:number,responding:boolean){
    let visual=this.patrols.get(car.id);
    if(!visual){
      const model=createVehicleModel('police',car.color,{software:this.software});
      visual={model,motion:createVehicleMotion()};this.patrols.set(car.id,visual);this.group.add(model.group);
    }
    const {model}=visual;model.group.visible=true;model.group.position.set(car.x,.05,car.z);model.group.rotation.y=-car.heading;
    visual.motion=stepVehicleMotion(visual.motion,car,dt);
    model.wheels.forEach(wheel=>{wheel.rotation.x=visual.motion.wheelRotation;});model.frontWheels.forEach(wheel=>{wheel.rotation.y=visual.motion.steering;});
    model.chassis.rotation.set(visual.motion.pitch,visual.motion.yaw,visual.motion.roll);model.chassis.position.y=visual.motion.heave;
    model.head.emissiveIntensity=1.1;model.brake.emissiveIntensity=.22+visual.motion.braking*2.1;
    const flash=Math.sin(this.seconds*12+car.x)>0;
    if(model.red&&model.blue){model.red.emissiveIntensity=responding?(flash?2:.08):.03;model.blue.emissiveIntensity=responding?(flash?.08:2):.03;}
  }
  private block(block:Roadblock){
    let group=this.blocks.get(block.id);
    if(!group){
      group=new THREE.Group();
      this.box(group,7.6,.85,1.3,this.dark,0,.5,0);
      for(let i=0;i<8;i++){
        const stripe=this.box(group,.42,.75,.04,i%2?this.body:this.gold,-3.25+i*.92,.5,.67);stripe.rotation.z=-.4;
      }
      this.box(group,.5,.2,.3,this.red,-3,1.05,0);this.box(group,.5,.2,.3,this.blue,3,1.05,0);
      this.blocks.set(block.id,group);this.group.add(group);
    }
    group.position.set(block.x,.04,block.z);group.rotation.y=block.heading;
  }
  update(state:GameState,dt:number){
    this.seconds+=Number.isFinite(dt)?Math.max(0,Math.min(dt,.2)):0;
    this.group.visible=!state.interior;
    const pursuit=state.pursuit;
    const activePatrols=new Set(pursuit?.patrols.map(car=>car.id)??[]),activeBlocks=new Set(pursuit?.roadblocks.map(block=>block.id)??[]);
    for(const [id,visual] of this.patrols)if(!activePatrols.has(id)){visual.model.dispose();this.patrols.delete(id);}
    for(const car of pursuit?.patrols??[])this.patrol(car,dt,state.wanted>0);
    for(const [id,group] of this.blocks)group.visible=activeBlocks.has(id);
    for(const block of pursuit?.roadblocks??[])this.block(block);
    // Reused props remain bounded even after many roadblock spawns.
    for(const [id,group] of this.blocks)if(!activeBlocks.has(id)){
      group.removeFromParent();group.traverse(object=>{if(object instanceof THREE.Mesh)object.geometry.dispose();});this.blocks.delete(id);
    }
    this.red.color.setHex(Math.sin(this.seconds*14)>0?0xff4565:0x5f1b29);this.blue.color.setHex(Math.sin(this.seconds*14)<0?0x4397ff:0x19345c);
    const helicopter=pursuit?.helicopter;this.helicopter.visible=Boolean(helicopter);
    if(helicopter){
      this.helicopter.position.set(helicopter.x,24+Math.sin(this.seconds*1.4)*.5,helicopter.z);this.helicopter.rotation.y=-helicopter.heading;
      this.rotor.rotation.y=this.seconds*32;
      this.cone.rotation.z=helicopter.searching?Math.sin(this.seconds)*.14:0;
      (this.cone.material as THREE.MeshBasicMaterial).opacity=helicopter.spotted?.15:.07;
    }
    this.safehouse.visible=true;
  }
  destroy(){
    for(const visual of this.patrols.values())visual.model.dispose();this.patrols.clear();
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
    this.group.traverse(object=>{if(object instanceof THREE.Mesh){
      geometries.add(object.geometry);
      for(const material of Array.isArray(object.material)?object.material:[object.material]){
        materials.add(material);const map=(material as THREE.MeshBasicMaterial).map;if(map)textures.add(map);
      }
    }});
    geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());textures.forEach(texture=>texture.dispose());
    this.group.removeFromParent();this.group.clear();this.patrols.clear();this.blocks.clear();
  }
}

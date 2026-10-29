import * as THREE from 'three';
import { CREW_BASE, HOMES } from './career';
import type { Point } from './model';

/** Doorways sit outside the existing building collision boxes. */
export function expansionLandmarks():THREE.Group {
  const group=new THREE.Group();
  const entrance=(point:Point,title:string,subtitle:string,color:number,north=false)=>{
    const facade=new THREE.Group();facade.position.set(point.x,0,point.z);if(north)facade.rotation.y=Math.PI;
    const metal=new THREE.MeshLambertMaterial({color:0x192a39}),light=new THREE.MeshBasicMaterial({color});
    const box=(w:number,h:number,d:number,material:THREE.Material,x:number,y:number,z:number)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);facade.add(mesh);};
    box(5,4,.35,metal,0,2,-.6);box(1.5,2.8,.15,light,0,1.4,-.37);box(6,.25,1.8,metal,0,4,.1);
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=192;const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='#122330';ctx.fillRect(0,0,768,192);ctx.strokeStyle=`#${color.toString(16).padStart(6,'0')}`;ctx.lineWidth=5;ctx.strokeRect(5,5,758,182);
    ctx.textAlign='center';ctx.fillStyle='#edf4ef';ctx.font='bold 58px Arial';ctx.fillText(title,384,91);ctx.font='25px Arial';ctx.fillStyle='#acd9d4';ctx.fillText(subtitle,384,145);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(7,1.75),new THREE.MeshBasicMaterial({map:texture}));sign.position.set(0,5,-.38);facade.add(sign);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1.2,.06,4,24),light);ring.rotation.x=-Math.PI/2;ring.position.set(0,.13,.35);facade.add(ring);group.add(facade);
  };
  entrance(HOMES.canal.door,'CANAL RESIDENCE','MIESZKANIE · GARAŻ',0x8de5c5);
  entrance(HOMES.loft.door,'OCEAN VIEW','APARTAMENTY',0x9ecbff,true);
  entrance(CREW_BASE.door,'DOCKHOUSE','BAZA EKIPY · PLANOWANIE',0xe6be78,true);
  entrance({x:-60,z:-46},'AETHER BANK','SEJF · STREFA CHRONIONA',0xabc2dd);
  return group;
}

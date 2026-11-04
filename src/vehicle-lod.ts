import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type DistantCarKind='sport'|'sedan'|'police';
export interface DistantCarVisual {
  readonly group:THREE.Group;
  readonly paint:THREE.Mesh<THREE.BufferGeometry,THREE.MeshLambertMaterial>;
  color:number;
}
interface CarGeometry {paint:THREE.BufferGeometry;details:THREE.BufferGeometry}

/** Two draws per distant car; geometry and paint materials are shared city-wide. */
export class VehicleLodLibrary {
  private readonly geometry=new Map<DistantCarKind,CarGeometry>();
  private readonly paints=new Map<number,THREE.MeshLambertMaterial>();
  private readonly details=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true});

  create(kind:DistantCarKind,color:number):DistantCarVisual {
    let geometry=this.geometry.get(kind);
    if(!geometry){geometry=this.build(kind);this.geometry.set(kind,geometry);}
    const group=new THREE.Group();group.name='distant-car';
    const paint=new THREE.Mesh(geometry.paint,this.paintMaterial(color));
    group.add(paint,new THREE.Mesh(geometry.details,this.details));
    return{group,paint,color};
  }

  setColor(visual:DistantCarVisual,color:number){
    if(visual.color===color)return;
    visual.color=color;visual.paint.material=this.paintMaterial(color);
  }

  private paintMaterial(color:number){
    let material=this.paints.get(color);
    if(!material){material=new THREE.MeshLambertMaterial({color});this.paints.set(color,material);}
    return material;
  }

  private build(kind:DistantCarKind):CarGeometry {
    const sporty=kind==='sport',length=sporty?4.5:4.7;
    const paint:THREE.BufferGeometry[]=[],details:THREE.BufferGeometry[]=[];
    const append=(target:THREE.BufferGeometry[],geometry:THREE.BufferGeometry,x:number,y:number,z:number,color?:number,rotationX=0)=>{
      geometry.rotateX(rotationX);geometry.translate(x,y,z);
      if(color!==undefined){
        const tint=new THREE.Color(color),values=new Float32Array(geometry.getAttribute('position').count*3);
        for(let index=0;index<values.length;index+=3){values[index]=tint.r;values[index+1]=tint.g;values[index+2]=tint.b;}
        geometry.setAttribute('color',new THREE.BufferAttribute(values,3));
      }
      target.push(geometry);
    };
    const body=(w:number,h:number,d:number,x:number,y:number,z:number)=>append(paint,new THREE.BoxGeometry(w,h,d),x,y,z);
    const detail=(w:number,h:number,d:number,color:number,x:number,y:number,z:number,rotationX=0)=>append(details,new THREE.BoxGeometry(w,h,d),x,y,z,color,rotationX);
    body(1.95,.64,length,0,.7,0);
    body(1.7,.22,1.3,0,1.06,-1.4);
    body(1.63,.12,1.55,0,sporty?1.54:1.75,.18);
    detail(1.93,.13,length+.08,0x25353e,0,.39,0);
    detail(1.62,sporty?.58:.78,1.9,0x25353e,0,sporty?1.21:1.32,.1);
    detail(1.49,sporty?.45:.58,.06,0x78a4b1,0,sporty?1.31:1.42,-.86,-.28);
    detail(1.46,.43,.06,0x78a4b1,0,sporty?1.29:1.43,1.05,.24);
    for(const side of[-1,1]){
      detail(.05,sporty?.38:.5,1.45,0x78a4b1,side*.83,sporty?1.28:1.42,.15);
      for(const z of[-1.4,1.4]){
        const wheel=new THREE.CylinderGeometry(.42,.42,.26,6,1,false,Math.PI/2);wheel.rotateZ(Math.PI/2);
        append(details,wheel,side*1.02,.45,z,0x20252a);
      }
      detail(.48,.18,.08,0xfff1c7,side*.65,.78,-length/2-.04);
      detail(.56,.15,.08,0xca5965,side*.65,.8,length/2+.04);
    }
    if(sporty)detail(1.8,.11,.4,0x25353e,0,1.15,1.95);
    if(kind==='police'){
      detail(1.98,.35,1.4,0xe8e4d9,0,.76,.05);
      detail(1.35,.14,.4,0x25353e,0,1.89,.1);
      detail(.6,.2,.36,0xef7180,-.34,2.02,.1);
      detail(.6,.2,.36,0x80c9ef,.34,2.02,.1);
    }
    const merge=(parts:THREE.BufferGeometry[])=>{
      const merged=mergeGeometries(parts,false)!;parts.forEach(part=>part.dispose());merged.computeBoundingSphere();return merged;
    };
    return{paint:merge(paint),details:merge(details)};
  }

  destroy(){
    for(const geometry of this.geometry.values()){geometry.paint.dispose();geometry.details.dispose();}
    this.geometry.clear();this.paints.forEach(material=>material.dispose());this.paints.clear();this.details.dispose();
  }
}

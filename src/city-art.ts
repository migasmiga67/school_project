import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Point } from './model';
import type { SurfaceLibrary, SurfaceMaterial } from './surface-materials';

type Primitive = 'box' | 'cylinder' | 'sphere' | 'plane';
interface InstanceBatch {geometry:THREE.BufferGeometry;material:THREE.Material;matrices:THREE.Matrix4[]}

/** A small shared palette and local instance batches keep street detail inexpensive. */
export class CityArt {
  readonly group=new THREE.Group();
  private readonly palette=new Map<string,SurfaceMaterial>();
  private readonly batches=new Map<string,InstanceBatch>();
  private readonly primitiveGeometries=new Map<Primitive,THREE.BufferGeometry>();
  private readonly dummy=new THREE.Object3D();
  private readonly atlas=document.createElement('canvas');
  private readonly atlasMap:THREE.CanvasTexture;
  private readonly atlasMaterial:THREE.MeshBasicMaterial;
  private readonly labels=new Map<string,number>();
  private readonly signs=new Map<string,THREE.BufferGeometry[]>();

  constructor(readonly software:boolean,readonly surfaces:SurfaceLibrary){
    this.atlas.width=1024;this.atlas.height=2048;
    this.atlasMap=new THREE.CanvasTexture(this.atlas);this.atlasMap.colorSpace=THREE.SRGBColorSpace;
    this.atlasMaterial=new THREE.MeshBasicMaterial({map:this.atlasMap,side:THREE.DoubleSide});
  }
  material(color:number,emissive=0):SurfaceMaterial {
    const key=`${color}:${emissive}`;let material=this.palette.get(key);
    if(!material){material=this.software?new THREE.MeshLambertMaterial({color,emissive,emissiveIntensity:.65}):new THREE.MeshStandardMaterial({color,roughness:.8,emissive,emissiveIntensity:.65});this.palette.set(key,material);}
    return material;
  }
  tinted(surface:SurfaceMaterial,color:number):SurfaceMaterial {
    const key=`${surface.uuid}:${color}`;let material=this.palette.get(key);
    if(!material){material=surface.clone();material.color.setHex(color);this.palette.set(key,material);}
    return material;
  }
  mesh(geometry:THREE.BufferGeometry,material:THREE.Material,x=0,y=0,z=0,parent:THREE.Object3D=this.group){
    // Tile surface grain in metres, including on differently sized building bodies.
    if((material instanceof THREE.MeshStandardMaterial||material instanceof THREE.MeshLambertMaterial)&&material.map?.wrapS===THREE.RepeatWrapping){
      const positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal'),uv=geometry.getAttribute('uv');
      if(positions&&normals&&uv)for(let i=0;i<positions.count;i++){
        const nx=Math.abs(normals.getX(i)),ny=Math.abs(normals.getY(i)),nz=Math.abs(normals.getZ(i));
        uv.setXY(i,(nx>ny&&nx>nz?positions.getZ(i):positions.getX(i))/8,(ny>nx&&ny>nz?positions.getZ(i):positions.getY(i))/8);
      }
    }
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  /** Split world-coordinate ground meshes before the world's material batching. */
  worldMesh(geometry:THREE.BufferGeometry,material:THREE.Material){
    const source=geometry.index?geometry.toNonIndexed():geometry,positions=source.getAttribute('position'),uv=source.getAttribute('uv');
    const sectors=new Map<string,{x:number;z:number;positions:number[];uv:number[]}>();
    for(let i=0;i<positions.count;i+=3){
      const x=Math.floor((positions.getX(i)+positions.getX(i+1)+positions.getX(i+2))/3/64)*64+32,z=Math.floor((positions.getZ(i)+positions.getZ(i+1)+positions.getZ(i+2))/3/64)*64+32,key=`${x},${z}`;
      let sector=sectors.get(key);if(!sector){sector={x,z,positions:[],uv:[]};sectors.set(key,sector);}
      for(let vertex=i;vertex<i+3;vertex++){sector.positions.push(positions.getX(vertex)-x,positions.getY(vertex),positions.getZ(vertex)-z);sector.uv.push(uv?.getX(vertex)??0,uv?.getY(vertex)??0);}
    }
    for(const sector of sectors.values()){
      const local=new THREE.BufferGeometry();local.setAttribute('position',new THREE.Float32BufferAttribute(sector.positions,3));local.setAttribute('uv',new THREE.Float32BufferAttribute(sector.uv,2));local.computeVertexNormals();this.mesh(local,material,sector.x,0,sector.z);
    }
    if(source!==geometry)source.dispose();geometry.dispose();
  }
  box(w:number,h:number,d:number,material:THREE.Material,x:number,y:number,z:number){return this.mesh(new THREE.BoxGeometry(w,h,d),material,x,y,z);}
  instance(kind:Primitive,material:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number,rotation=0){
    const sector=`${Math.floor(x/64)},${Math.floor(z/64)}`,key=`${sector}:${kind}:${material.uuid}`;
    let batch=this.batches.get(key);
    if(!batch){
      let geometry=this.primitiveGeometries.get(kind);
      if(!geometry){geometry=kind==='box'?new THREE.BoxGeometry(1,1,1):kind==='plane'?new THREE.PlaneGeometry(1,1):kind==='cylinder'?new THREE.CylinderGeometry(.5,.5,1,this.software?6:8):new THREE.SphereGeometry(.5,this.software?6:8,this.software?4:6);this.primitiveGeometries.set(kind,geometry);}
      batch={geometry,material,matrices:[]};this.batches.set(key,batch);
    }
    this.dummy.position.set(x,y,z);this.dummy.rotation.set(0,rotation,0);this.dummy.scale.set(w,h,d);this.dummy.updateMatrix();batch.matrices.push(this.dummy.matrix.clone());
  }
  sign(text:string,x:number,y:number,z:number,w:number,h:number,rotation=0,color='#dfebdd',background='#263e49'){
    const key=`${text}:${color}:${background}`;let cell=this.labels.get(key);
    if(cell===undefined){
      // Labels share one atlas instead of allocating a texture for every storefront.
      cell=this.labels.size%128;this.labels.set(key,cell);
      const context=this.atlas.getContext('2d')!,cx=(cell%4)*256,cy=Math.floor(cell/4)*64;
      context.fillStyle=background;context.fillRect(cx,cy,256,64);context.strokeStyle=color;context.lineWidth=2;context.strokeRect(cx+3,cy+3,250,58);
      context.fillStyle=color;context.textAlign='center';context.textBaseline='middle';context.font=`bold ${text.length>20?16:text.length>15?19:24}px Arial`;context.fillText(text,cx+128,cy+33,241);
    }
    const geometry=new THREE.PlaneGeometry(w,h),uv=geometry.getAttribute('uv'),column=cell%4,row=Math.floor(cell/4);
    for(let i=0;i<uv.count;i++)uv.setXY(i,(column+(uv.getX(i)*.98+.01))/4,1-(row+(1-uv.getY(i))*.98+.01)/32);
    this.dummy.position.set(x,y,z);this.dummy.rotation.set(0,rotation,0);this.dummy.scale.set(1,1,1);this.dummy.updateMatrix();geometry.applyMatrix4(this.dummy.matrix);
    const sector=`${Math.floor(x/64)},${Math.floor(z/64)}`;let signs=this.signs.get(sector);if(!signs){signs=[];this.signs.set(sector,signs);}signs.push(geometry);
  }
  finish(){
    for(const batch of this.batches.values()){
      const mesh=new THREE.InstancedMesh(batch.geometry,batch.material,batch.matrices.length);
      batch.matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.receiveShadow=true;mesh.castShadow=!this.software;mesh.computeBoundingSphere();this.group.add(mesh);
    }
    for(const geometries of this.signs.values()){
      const geometry=mergeGeometries(geometries);if(geometry){const mesh=new THREE.Mesh(geometry,this.atlasMaterial);this.group.add(mesh);}geometries.forEach(item=>item.dispose());
    }
    this.atlasMap.needsUpdate=true;this.batches.clear();this.signs.clear();
  }
  destroy(){this.atlasMap.dispose();this.group.traverse(object=>{if(object instanceof THREE.InstancedMesh)object.dispose();});}
}

export function polygon(points:readonly Point[],height:number):THREE.BufferGeometry {
  const shape=new THREE.Shape();points.forEach((point,index)=>index?shape.lineTo(point.x,-point.z):shape.moveTo(point.x,-point.z));shape.closePath();
  const geometry=new THREE.ShapeGeometry(shape);geometry.rotateX(-Math.PI/2);geometry.translate(0,height,0);return geometry;
}

/** Mitered ribbons use the exact sampled path shared with traffic and navigation. */
export function ribbon(points:readonly Point[],width:number,height:number,offset=0):THREE.BufferGeometry {
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[];let distance=0;
  for(let i=0;i<points.length;i++){
    const closed=Math.hypot(points[0].x-points[points.length-1].x,points[0].z-points[points.length-1].z)<.001;
    const before=points[i===0&&closed?points.length-2:Math.max(0,i-1)],point=points[i],after=points[i===points.length-1&&closed?1:Math.min(points.length-1,i+1)];
    const previous=new THREE.Vector2(point.x-before.x,point.z-before.z),next=new THREE.Vector2(after.x-point.x,after.z-point.z);
    if(previous.lengthSq()<.001)previous.copy(next);if(next.lengthSq()<.001)next.copy(previous);previous.normalize();next.normalize();
    const normal=new THREE.Vector2(-previous.y-next.y,previous.x+next.x).normalize(),side=new THREE.Vector2(-next.y,next.x),miter=Math.min(2,1/Math.max(.5,normal.dot(side)));
    if(i)distance+=Math.hypot(point.x-before.x,point.z-before.z);
    for(const edge of[-1,1]){const shift=(offset+edge*width/2)*miter;positions.push(point.x+normal.x*shift,height,point.z+normal.y*shift);uvs.push(distance/8,(offset+edge*width/2)/8);}
    if(i){const a=(i-1)*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

export interface StreetSample extends Point {dx:number;dz:number;distance:number}
export function samplePath(points:readonly Point[],distance:number):StreetSample {
  let remaining=Math.max(0,distance);
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.z-a.z);
    if(remaining<=length||i===points.length-1){const t=Math.min(1,remaining/Math.max(.001,length));return{x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,dx:(b.x-a.x)/Math.max(.001,length),dz:(b.z-a.z)/Math.max(.001,length),distance};}remaining-=length;
  }
  return{...points[0],dx:0,dz:1,distance};
}
export const pathLength=(points:readonly Point[])=>points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-points[i].x,p.z-points[i].z),0);

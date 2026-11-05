import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type RoadCarKind='sport'|'sedan'|'police';
export type VehicleMaterial=THREE.MeshStandardMaterial|THREE.MeshLambertMaterial;
export interface VehicleModelOptions {
  software?:boolean;
  material?:(color:number,props:THREE.MeshStandardMaterialParameters)=>VehicleMaterial;
}
export interface VehicleModel {
  group:THREE.Group;chassis:THREE.Group;
  wheels:THREE.Group[];frontWheels:THREE.Group[];
  paint:VehicleMaterial;head:VehicleMaterial;brake:VehicleMaterial;
  red?:VehicleMaterial;blue?:VehicleMaterial;
  readonly stats:{drawCalls:number;triangles:number};
  dispose():void;
}

/** Retained, batched road-car model shared by civilian traffic, patrols and players.
 * Front is local -Z; the wheel and collision dimensions match the driving model.
 * Static detail uses vertex colours, so a grille or door seam adds no draw call.
 */
export function createVehicleModel(kind:RoadCarKind,color:number,options:VehicleModelOptions={}):VehicleModel {
  const software=options.software??false,sport=kind==='sport',police=kind==='police';
  const group=new THREE.Group();group.name=`detailed-${kind}`;
  const chassis=new THREE.Group();chassis.name='sprung-chassis';group.add(chassis);
  const materials=new Set<THREE.Material>(),geometries=new Set<THREE.BufferGeometry>();
  const material=(tint:number,props:THREE.MeshStandardMaterialParameters={}):VehicleMaterial=>{
    const result=options.material?.(tint,props)??(software?new THREE.MeshLambertMaterial({color:tint,emissive:props.emissive??0,emissiveIntensity:props.emissiveIntensity??1,vertexColors:props.vertexColors??false,side:props.side??THREE.FrontSide}):new THREE.MeshStandardMaterial({color:tint,roughness:.7,...props}));
    // Custom factories may deliberately implement only lighting parameters.
    result.vertexColors=props.vertexColors??false;materials.add(result);return result;
  };
  const paint=material(color,{roughness:.31,metalness:.48});
  const details=material(0xffffff,{vertexColors:true,roughness:.62,metalness:.2});
  const glass=material(0x314c5c,{roughness:.16,metalness:.52});
  const head=material(0xffedca,{emissive:0xffdfac,emissiveIntensity:.8,roughness:.18});
  const brake=material(0xa11b2c,{emissive:0xf4323f,emissiveIntensity:.25,roughness:.2});
  const batches=new Map<THREE.Material,THREE.BufferGeometry[]>();
  const append=(geometry:THREE.BufferGeometry,mat:THREE.Material,position:[number,number,number]=[0,0,0],rotation:[number,number,number]=[0,0,0],tint?:number)=>{
    const shape=geometry.index?geometry.toNonIndexed():geometry;if(shape!==geometry)geometry.dispose();
    shape.deleteAttribute('uv'); // These batches use material/vertex colour; custom glazing has no texture UVs.
    shape.rotateX(rotation[0]);shape.rotateY(rotation[1]);shape.rotateZ(rotation[2]);shape.translate(...position);
    if(tint!==undefined){const c=new THREE.Color(tint),values=new Float32Array(shape.getAttribute('position').count*3);for(let i=0;i<values.length;i+=3){values[i]=c.r;values[i+1]=c.g;values[i+2]=c.b;}shape.setAttribute('color',new THREE.BufferAttribute(values,3));}
    const batch=batches.get(mat)??[];batch.push(shape);batches.set(mat,batch);
  };
  const box=(w:number,h:number,d:number,mat:THREE.Material,x=0,y=0,z=0,tint?:number,rx=0,ry=0,rz=0)=>append(new THREE.BoxGeometry(w,h,d),mat,[x,y,z],[rx,ry,rz],tint);
  const detail=(w:number,h:number,d:number,tint:number,x=0,y=0,z=0,rx=0,ry=0,rz=0)=>box(w,h,d,details,x,y,z,tint,rx,ry,rz);
  const round=(w:number,h:number,d:number,mat:THREE.Material,x:number,y:number,z:number,radius=.06,tint?:number)=>append(new RoundedBoxGeometry(w,h,d,software?1:2,radius),mat,[x,y,z],[0,0,0],tint);
  const length=sport?4.5:4.7,roof=sport?1.48:1.67,front=-length/2,rear=length/2;

  // Lower tub stays between the wheels. Separate contoured wings expose real arches.
  round(1.73,.51,length-.12,paint,0,.66,0,.12);
  round(1.84,.19,1.42,paint,0,.91,front+.79,.07);
  round(1.83,.21,1.05,paint,0,.91,rear-.57,.07);
  detail(1.8,.12,length-.08,0x18232a,0,.36,0);
  for(const side of[-1,1]){
    const panel=new THREE.Shape();panel.moveTo(front+.05,.38);panel.lineTo(front+.05,.78);panel.lineTo(front+.35,.96);panel.lineTo(-.85,1.02);panel.lineTo(1.2,1.01);panel.lineTo(rear-.12,.86);panel.lineTo(rear-.04,.63);panel.lineTo(rear-.04,.38);
    for(const center of[1.4,-1.4]){panel.lineTo(center+.49,.38);panel.lineTo(center+.49,.45);panel.absarc(center,.45,.49,0,Math.PI,false);panel.lineTo(center-.49,.38);}panel.closePath();
    const geometry=new THREE.ShapeGeometry(panel,software?6:10),positions=geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++){const z=positions.getX(i),y=positions.getY(i);positions.setXYZ(i,side*.975,y,z);}
    if(side>0){const index=geometry.index!;for(let i=0;i<index.count;i+=3){const first=index.getX(i);index.setX(i,index.getX(i+2));index.setX(i+2,first);}}
    geometry.computeVertexNormals();append(geometry,paint);
    detail(.048,.075,2.33,0x26343b,side*.99,.435,.02);
    // Trim, vertical door shut lines, handles and a folded mirror stem.
    detail(.012,.018,2.47,0x202c32,side*.982,1.015,.13);
    for(const z of[-.73,.36,1.16])detail(.014,.42,.012,0x39464a,side*.986,.76,z);
    for(const z of[-.28,.77])detail(.035,.035,.19,0xb0b7b8,side*1.005,.94,z);
    round(.19,.14,.31,paint,side*1.04,1.11,-.73,.045);
    detail(.021,.09,.2,0x57727a,side*1.137,1.12,-.71);
    // Dark side glass follows the sloping A/C pillars rather than a box cabin.
    const window=new THREE.Shape();window.moveTo(-.94,1.045);window.lineTo(-.38,roof-.07);window.lineTo(.68,roof-.07);window.lineTo(1.23,1.045);window.closePath();
    const wg=new THREE.ShapeGeometry(window),wp=wg.getAttribute('position');for(let i=0;i<wp.count;i++){const z=wp.getX(i),y=wp.getY(i),t=(y-1.045)/(roof-1.115);wp.setXYZ(i,side*(.87-t*.14),y,z);}
    if(side>0){const index=wg.index!;for(let i=0;i<index.count;i+=3){const first=index.getX(i);index.setX(i,index.getX(i+2));index.setX(i+2,first);}}wg.computeVertexNormals();append(wg,glass);
    detail(.038,roof-1.04,.055,0x182a32,side*.805,(roof+1.04)/2,.3);
    // A subtle weather seal and sill make the windows read as inset glazing.
    detail(.045,.038,2.19,0x17252b,side*.876,1.033,.12);
  }
  round(1.5,.095,1.17,paint,0,roof,.16,.045);
  // Tapered windscreen and rear window are flat quadrilaterals with correct normals.
  const quad=(vertices:number[],mat:THREE.Material)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex([0,2,1,0,3,2]);g.computeVertexNormals();append(g,mat);};
  quad([-.865,1.055,-.96,.865,1.055,-.96,.735,roof-.04,-.43,-.735,roof-.04,-.43],glass);
  quad([.865,1.055,1.25,-.865,1.055,1.25,-.735,roof-.04,.76,.735,roof-.04,.76],glass);
  // Sloping painted pillars and narrow rubber surrounds.
  for(const side of[-1,1]){
    const a=new THREE.Vector3(side*.875,1.04,-.98),b=new THREE.Vector3(side*.745,roof,-.43),delta=b.clone().sub(a);
    const pillar=new THREE.CylinderGeometry(.035,.045,delta.length(),6);pillar.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));append(pillar,paint,a.clone().add(b).multiplyScalar(.5).toArray() as [number,number,number]);
    const c=new THREE.Vector3(side*.875,1.04,1.27),d=new THREE.Vector3(side*.745,roof,.76),rearDelta=d.clone().sub(c);const rearPillar=new THREE.CylinderGeometry(.05,.065,rearDelta.length(),6);rearPillar.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),rearDelta.normalize()));append(rearPillar,paint,c.clone().add(d).multiplyScalar(.5).toArray() as [number,number,number]);
  }
  // Actual grille recess, bumper inserts and lamp housings.
  round(1.84,.16,.18,paint,0,.55,front+.02,.04);
  detail(1.13,.18,.045,0x15232b,0,.69,front-.025);
  for(const y of[.63,.69,.75])detail(1.03,.018,.049,0x819097,0,y,front-.051);
  detail(.28,.17,.053,0x26313a,0,.46,front-.035);
  for(const side of[-1,1]){
    detail(.52,.2,.065,0x26343c,side*.655,.85,front-.025);
    box(.445,.115,.073,head,side*.655,.85,front-.048);
    detail(.16,.035,.075,0xe1b36f,side*.83,.75,front-.045);
    detail(.35,.12,.053,0x17262d,side*.66,.49,front-.039);
    detail(.21,.035,.057,0xa6b8bf,side*.66,.49,front-.068);
    detail(.56,.18,.055,0x253239,side*.65,.84,rear+.018);
    box(.5,.105,.064,brake,side*.65,.86,rear+.05);
    detail(.14,.036,.066,0xd6c8b6,side*.52,.78,rear+.05);
    append(new THREE.CylinderGeometry(.055,.055,.22,8),details,[side*.67,.36,rear-.025],[Math.PI/2,0,0],0x85939a);
  }
  detail(1.8,.11,.18,0x202c32,0,.44,rear-.005);
  detail(.52,.13,.035,0xd8d8c9,0,.66,rear+.055);
  detail(.46,.018,.04,0x3a4b54,0,.68,rear+.074);
  detail(.45,.018,.026,0x223239,-.31,1.09,-.925,0,-.1,0); // windshield wipers
  detail(.45,.018,.026,0x223239,.3,1.09,-.925,0,-.1,0);

  let red:VehicleMaterial|undefined,blue:VehicleMaterial|undefined;
  if(police){
    round(1.75,.035,1.24,details,0,1.019,front+.79,.014,0x1a2933);
    round(1.44,.025,1.08,details,0,roof+.053,.16,.01,0x1a2933);
    round(1.71,.035,.86,details,0,1.025,rear-.57,.014,0x1a2933);
    // Livery is geometry: no browser canvas dependency or per-car text texture.
    for(const side of[-1,1]){
      detail(.012,.33,1.92,0xeeeae0,side*.994,.79,.16);
      detail(.014,.05,2.06,0x2a5174,side*1.003,.59,.12);
      const shield=new THREE.CylinderGeometry(.11,.075,.016,5);append(shield,details,[side*1.009,.8,-.55],[0,0,Math.PI/2],0xd8b75e);
      label('POLICE',side*1.009,.83,.36,side,details,append);
    }
    detail(1.35,.085,.38,0x1c2932,0,roof+.12,.15);
    red=material(0xe03c50,{emissive:0xf32945,emissiveIntensity:.8,roughness:.18});blue=material(0x489ee2,{emissive:0x2187ff,emissiveIntensity:.8,roughness:.18});
    for(const side of[-1,1]){round(.56,.145,.31,side<0?red:blue,side*.34,roof+.225,.15,.035);detail(.045,.15,.32,0x9cb7c1,side*.645,roof+.22,.15);}
    for(const x of[-.72,.72])box(.09,.07,.055,x<0?red:blue,x,.69,front-.09);
    detail(.025,.42,.025,0x1b2d36,.52,roof+.18,.66);
    detail(.35,.12,.06,0x222f38,-.91,1.08,-.82); // A-pillar spotlight
    detail(.29,.075,.045,0xe6e8d9,0,1.025,front+.65);
  }
  if(sport){
    round(1.78,.075,.33,paint,0,1.13,rear-.24,.025);
    for(const side of[-1,1])detail(.07,.22,.09,0x26343a,side*.63,1.025,rear-.24);
  }
  for(const [mat,parts] of batches){const geometry=mergeGeometries(parts,false)!;parts.forEach(p=>p.dispose());geometry.computeBoundingSphere();geometries.add(geometry);const mesh=new THREE.Mesh(geometry,mat);mesh.name=mat===paint?'painted-shell':mat===glass?'tapered-glazing':mat===details?'batched-trim-and-livery':'lamps';mesh.castShadow=true;mesh.receiveShadow=true;chassis.add(mesh);}
  const wheels:THREE.Group[]=[],frontWheels:THREE.Group[]=[];
  const wheelGeometry=makeWheel(software);geometries.add(wheelGeometry);
  for(const side of[-1,1])for(const z of[-1.4,1.4]){
    const steer=new THREE.Group();steer.name=z<0?'front-steering-pivot':'rear-axle';steer.position.set(side*1.02,.45,z);group.add(steer);
    const spin=new THREE.Group();spin.name='wheel-spin';steer.add(spin);
    const wheel=new THREE.Mesh(wheelGeometry,details);wheel.scale.x=side;wheel.castShadow=true;spin.add(wheel);wheels.push(spin);if(z<0)frontWheels.push(steer);
  }
  let triangles=0,drawCalls=0;group.traverse(object=>{if(object instanceof THREE.Mesh){drawCalls++;triangles+=(object.geometry.index?.count??object.geometry.getAttribute('position').count)/3;}});
  let disposed=false;
  return{group,chassis,wheels,frontWheels,paint,head,brake,red,blue,stats:{drawCalls,triangles},dispose(){if(disposed)return;disposed=true;group.removeFromParent();group.clear();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}};
}

const FONT:Record<string,string[]>={P:['110','101','110','100','100'],O:['010','101','101','101','010'],L:['100','100','100','100','111'],I:['111','010','010','010','111'],C:['011','100','100','100','011'],E:['111','100','110','100','111']};
function label(text:string,x:number,y:number,z:number,side:number,material:THREE.Material,append:(geometry:THREE.BufferGeometry,mat:THREE.Material,position:[number,number,number],rotation:[number,number,number],tint?:number)=>void){
  const pixel=.028,width=(text.length*4-1)*pixel;
  for(let letter=0;letter<text.length;letter++)for(let row=0;row<5;row++)for(let col=0;col<3;col++)if(FONT[text[letter]][row][col]==='1')append(new THREE.BoxGeometry(.006,pixel*.82,pixel*.82),material,[x,y+(2-row)*pixel,z-side*((letter*4+col)*pixel-width/2)],[0,0,0],0x18354c);
}
function makeWheel(software:boolean){
  const parts:THREE.BufferGeometry[]=[],segments=software?16:24;
  const add=(shape:THREE.BufferGeometry,color:number,x=0,y=0,z=0,rx=0,ry=0,rz=0)=>{const g=shape.index?shape.toNonIndexed():shape;if(g!==shape)shape.dispose();g.rotateX(rx);g.rotateY(ry);g.rotateZ(rz);g.translate(x,y,z);const c=new THREE.Color(color),colors=new Float32Array(g.getAttribute('position').count*3);for(let i=0;i<colors.length;i+=3){colors[i]=c.r;colors[i+1]=c.g;colors[i+2]=c.b;}g.setAttribute('color',new THREE.BufferAttribute(colors,3));parts.push(g);};
  add(new THREE.CylinderGeometry(.42,.42,.26,segments),0x1c2429,0,0,0,0,0,Math.PI/2);
  // Sidewall and inset brake disc; both remain in the same draw as the tyre.
  add(new THREE.TorusGeometry(.338,.042,4,segments),0x2b3439,.133,0,0,0,Math.PI/2);
  add(new THREE.CylinderGeometry(.275,.275,.014,segments),0x889399,.137,0,0,0,0,Math.PI/2);
  add(new THREE.CylinderGeometry(.224,.224,.019,segments),0x263138,.149,0,0,0,0,Math.PI/2);
  for(let i=0;i<5;i++){
    const angle=i*Math.PI*2/5;
    add(new THREE.BoxGeometry(.026,.34,.05),0xb9c1c3,.15,Math.cos(angle)*.07,Math.sin(angle)*.07,angle);
    add(new THREE.CylinderGeometry(.019,.019,.028,5),0xd3d7d4,.16,Math.cos(angle)*.065,Math.sin(angle)*.065,0,0,Math.PI/2);
  }
  add(new THREE.CylinderGeometry(.055,.055,.025,8),0x6b7d87,.165,0,0,0,0,Math.PI/2);
  const merged=mergeGeometries(parts,false)!;parts.forEach(p=>p.dispose());merged.computeBoundingSphere();return merged;
}

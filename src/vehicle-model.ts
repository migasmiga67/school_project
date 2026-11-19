import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RIM_COLORS, createVehicleStyle, vehicleStyleKey, type VehicleStyle } from './vehicle-style';

export type RoadCarKind='sport'|'sedan'|'police';
export type VehicleMaterial=THREE.MeshStandardMaterial|THREE.MeshLambertMaterial;
export type EnginePartId='hood'|'dipstick'|'cap'|'drainPlug'|'filter'|'bottle';
export interface VehicleModelOptions {
  software?:boolean;
  material?:(color:number,props:THREE.MeshStandardMaterialParameters)=>VehicleMaterial;
  /** Visual tuning; traffic uses stock parts. */
  style?:VehicleStyle;
  /** The player's own car: opening bonnet, serviceable engine bay and brake calipers. */
  hero?:boolean;
}
/** Visual state of a serviceable engine bay; produced by the engine simulation. */
export interface EngineBayPose {
  hood:number;dipstick:number;cap:number;plug:number;
  filter:'old'|'none'|'new';
  /** 0..1 oil stream from the sump into the drain pan. */
  draining:number;pouring:boolean;
  /** 0..1 waste oil collected in the drain pan. */
  pan:number;
  /** Oil colour and dipstick level (0 empty, 1 full mark). */
  oilColor:number;oilLevel:number;
  running:boolean;rpm:number;service:boolean;
  highlight:EnginePartId|null;
}
export interface EngineBay {
  readonly group:THREE.Group;
  readonly hood:THREE.Group;
  readonly targets:readonly {id:EnginePartId;object:THREE.Object3D}[];
  /** Body panels that hide parts, used to stop picking through the car. */
  readonly occluders:readonly THREE.Object3D[];
  update(pose:EngineBayPose,dt:number):void;
}
/** Hinged filler flap on the right rear quarter of the hero car. */
export interface FuelFlap {
  readonly target:THREE.Object3D;
  update(open:boolean,nozzle:boolean,highlight:boolean,dt:number):void;
}
export interface VehicleModel {
  group:THREE.Group;chassis:THREE.Group;
  wheels:THREE.Group[];frontWheels:THREE.Group[];
  paint:VehicleMaterial;head:VehicleMaterial;brake:VehicleMaterial;
  red?:VehicleMaterial;blue?:VehicleMaterial;
  engine?:EngineBay;
  fuelFlap?:FuelFlap;
  readonly styleKey:string;
  readonly stats:{drawCalls:number;triangles:number};
  dispose():void;
}

type V3=[number,number,number];
type Keys=readonly (readonly number[])[];
/** Smooth monotone-ish Hermite interpolation of [z, ...values] keyframes. */
function curve(keys:Keys,col:number){
  const n=keys.length,slope=(j:number)=>j<=0?(keys[1][col]-keys[0][col])/(keys[1][0]-keys[0][0]):j>=n-1?(keys[n-1][col]-keys[n-2][col])/(keys[n-1][0]-keys[n-2][0]):(keys[j+1][col]-keys[j-1][col])/(keys[j+1][0]-keys[j-1][0]);
  return(z:number)=>{
    if(z<=keys[0][0])return keys[0][col];if(z>=keys[n-1][0])return keys[n-1][col];
    let i=0;while(keys[i+1][0]<z)i++;
    const z0=keys[i][0],h=keys[i+1][0]-z0,t=(z-z0)/h,t2=t*t,t3=t2*t,y0=keys[i][col],y1=keys[i+1][col];
    return(2*t3-3*t2+1)*y0+(t3-2*t2+t)*slope(i)*h+(-2*t3+3*t2)*y1+(t3-t2)*slope(i+1)*h;
  };
}
// [z, half width, underside, top of the lower body]. Front is -Z.
const SPORT_BODY:Keys=[[-2.25,.66,.37,.56],[-2.2,.84,.33,.66],[-2.07,.93,.31,.75],[-1.85,.97,.3,.81],[-1.4,.99,.3,.86],[-1,.995,.3,.91],[-.5,.995,.3,.95],[.5,.995,.3,.97],[1.2,.995,.3,.99],[1.7,.985,.31,.99],[2.05,.95,.33,.96],[2.19,.87,.36,.91],[2.25,.74,.4,.85]];
const SEDAN_BODY:Keys=[[-2.35,.7,.38,.62],[-2.3,.86,.34,.73],[-2.17,.94,.32,.81],[-1.9,.975,.31,.87],[-1.4,.99,.31,.92],[-1.02,.995,.31,.97],[-.5,.995,.31,1],[.5,.995,.31,1.01],[1.3,.995,.31,1.04],[1.9,.985,.32,1.05],[2.2,.95,.34,1.02],[2.3,.87,.37,.97],[2.35,.76,.41,.9]];
interface Cabin{a0:number;a1:number;r0:number;r1:number;roof:number;topHalf:number;bPillar:number;cPillar:number}
const SPORT_CABIN:Cabin={a0:-1.02,a1:-.3,r0:.5,r1:1.85,roof:1.4,topHalf:.66,bPillar:.42,cPillar:1.02};
const SEDAN_CABIN:Cabin={a0:-1.06,a1:-.36,r0:.78,r1:1.34,roof:1.52,topHalf:.7,bPillar:.24,cPillar:1};
const AXLE=1.4,WHEEL_Y=.4,ARCH=.47;
const sgnpow=(v:number,p:number)=>Math.sign(v)*Math.abs(v)**p;

/** Retained, batched road-car model shared by civilian traffic, patrols and players.
 * The shell is lofted from smooth cross-sections with cut wheel arches; static
 * detail uses vertex colours so trim, lamps and the interior add no draw calls.
 */
export function createVehicleModel(kind:RoadCarKind,color:number,options:VehicleModelOptions={}):VehicleModel {
  const software=options.software??false,sport=kind==='sport',police=kind==='police',hero=Boolean(options.hero);
  const style={...createVehicleStyle(),...(options.style??{})};
  const group=new THREE.Group();group.name=`detailed-${kind}`;
  const chassis=new THREE.Group();chassis.name='sprung-chassis';group.add(chassis);
  const drop=[0,.045,.08][style.height]??0;
  const body=new THREE.Group();body.name='body-on-suspension';body.position.y=-drop;chassis.add(body);
  const materials=new Set<THREE.Material>(),geometries=new Set<THREE.BufferGeometry>();
  const material=(tint:number,props:THREE.MeshStandardMaterialParameters={}):VehicleMaterial=>{
    const result=options.material?.(tint,props)??(software?new THREE.MeshLambertMaterial({color:tint,emissive:props.emissive??0,emissiveIntensity:props.emissiveIntensity??1,vertexColors:props.vertexColors??false,side:props.side??THREE.FrontSide}):new THREE.MeshStandardMaterial({color:tint,roughness:.7,...props}));
    // Custom factories may deliberately implement only lighting parameters.
    result.vertexColors=props.vertexColors??false;
    if(props.transparent){result.transparent=true;result.opacity=props.opacity??1;result.depthWrite=props.depthWrite??true;}
    if(props.side!==undefined)result.side=props.side;
    materials.add(result);return result;
  };
  const finish=[{roughness:.26,metalness:.42},{roughness:.17,metalness:.82},{roughness:.72,metalness:.08}][style.finish]??{roughness:.26,metalness:.42};
  const paint=material(color,finish);
  const details=material(0xffffff,{vertexColors:true,roughness:.55,metalness:.25});
  const glass=material(0x1a2a33,{roughness:.06,metalness:.6,transparent:true,opacity:[.42,.7,.9][style.tint]??.7,depthWrite:false});
  const head=material(0xffedca,{emissive:0xffdfac,emissiveIntensity:.8,roughness:.12});
  const brake=material(0xa11b2c,{emissive:0xf4323f,emissiveIntensity:.25,roughness:.18});
  const batches=new Map<THREE.Material,THREE.BufferGeometry[]>();
  const colour=(shape:THREE.BufferGeometry,tint:number)=>{const c=new THREE.Color(tint),values=new Float32Array(shape.getAttribute('position').count*3);for(let i=0;i<values.length;i+=3){values[i]=c.r;values[i+1]=c.g;values[i+2]=c.b;}shape.setAttribute('color',new THREE.BufferAttribute(values,3));return shape;};
  const prepare=(geometry:THREE.BufferGeometry,position:V3=[0,0,0],rotation:V3=[0,0,0],tint?:number)=>{
    const shape=geometry.index?geometry.toNonIndexed():geometry;if(shape!==geometry)geometry.dispose();
    shape.deleteAttribute('uv');
    shape.rotateX(rotation[0]);shape.rotateY(rotation[1]);shape.rotateZ(rotation[2]);shape.translate(...position);
    if(tint!==undefined)colour(shape,tint);return shape;
  };
  const append=(geometry:THREE.BufferGeometry,mat:THREE.Material,position:V3=[0,0,0],rotation:V3=[0,0,0],tint?:number)=>{
    const shape=prepare(geometry,position,rotation,tint);const batch=batches.get(mat)??[];batch.push(shape);batches.set(mat,batch);
  };
  const box=(w:number,h:number,d:number,mat:THREE.Material,x=0,y=0,z=0,tint?:number,rx=0,ry=0,rz=0)=>append(new THREE.BoxGeometry(w,h,d),mat,[x,y,z],[rx,ry,rz],tint);
  const detail=(w:number,h:number,d:number,tint:number,x=0,y=0,z=0,rx=0,ry=0,rz=0)=>box(w,h,d,details,x,y,z,tint,rx,ry,rz);
  const cylinder=(r0:number,r1:number,h:number,mat:THREE.Material,position:V3,rotation:V3,tint?:number,segments=software?8:14)=>append(new THREE.CylinderGeometry(r0,r1,h,segments),mat,position,rotation,tint);
  const fromTriangles=(values:number[])=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(values,3));g.computeVertexNormals();return g;};

  // ---- Lofted lower body -------------------------------------------------
  const keys=sport?SPORT_BODY:SEDAN_BODY,cabin=sport?SPORT_CABIN:SEDAN_CABIN;
  const W=curve(keys,1),B=curve(keys,2),T=curve(keys,3);
  const front=keys[0][0],rear=keys[keys.length-1][0];
  const tuck=.075;
  const contour=(z:number,theta:number):[number,number]=>{
    const w=W(z),b=B(z),t=T(z),yc=(b+t)/2,h=(t-b)/2,s=Math.sin(theta);
    return[w*sgnpow(Math.cos(theta),1/3)*(1-tuck*Math.max(0,s)**2),yc+h*sgnpow(s,s<0?.25:.5)];
  };
  /** Half width of the outer skin at a height; used to seat trim on the curved panels. */
  const sideX=(z:number,y:number)=>{
    const b=B(z),t=T(z),yc=(b+t)/2,h=(t-b)/2,v=THREE.MathUtils.clamp((y-yc)/h,-1,1),s=v>=0?v*v:-(v**4);
    return W(z)*Math.sqrt(1-s*s)**(1/3)*(1-tuck*Math.max(0,s)**2);
  };
  const archLift=(x:number,y:number,z:number,w:number)=>{
    if(Math.abs(x)<w*.55)return y;
    for(const axle of[-AXLE,AXLE]){const dz=z-axle;if(Math.abs(dz)<ARCH){const top=WHEEL_Y+drop+Math.sqrt(ARCH*ARCH-dz*dz);if(y<top)return top;}}
    return y;
  };
  const stations:number[]=[];
  {
    const add=(z:number)=>{if(!stations.some(value=>Math.abs(value-z)<.012))stations.push(z);};
    const coarse=software?.24:.09,fine=software?.1:.035;
    for(let z=front;z<=rear+1e-6;z+=coarse)add(z);
    for(const axle of[-AXLE,AXLE])for(let dz=-ARCH-.04;dz<=ARCH+.04;dz+=fine)add(axle+dz);
    for(const z of[front+.012,front+.04,front+.1,rear-.1,rear-.04,rear-.012,rear,cabin.a0])add(z);
    stations.sort((a,b)=>a-b);
  }
  const K=software?7:16;
  const ringSize=2*K;
  const ring=(z:number)=>{
    const points:[number,number][]=[];
    for(let k=0;k<=K;k++)points.push(contour(z,-Math.PI/2+Math.PI*k/K));
    for(let k=K-1;k>=1;k--){const p=contour(z,-Math.PI/2+Math.PI*k/K);points.push([-p[0],p[1]]);}
    const w=W(z);return points.map(([x,y])=>[x,archLift(x,y,z,w),z] as V3);
  };
  const rings=stations.map(ring);
  const hoodFront=front+.17,hoodRear=cabin.a0-.015,hoodHalf=.86;
  const paintTris:number[]=[],hoodTris:number[]=[];
  const tri=(target:number[],a:V3,b:V3,c:V3)=>target.push(...a,...b,...c);
  /** Emits a triangle wound so that its normal points along `out`. */
  const outTri=(target:number[],a:V3,b:V3,c:V3,out:V3)=>{
    const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
    if(nx*out[0]+ny*out[1]+nz*out[2]>=0)tri(target,a,b,c);else tri(target,a,c,b);
  };
  const quad=(target:number[],a:V3,b:V3,c:V3,d:V3,out:V3)=>{outTri(target,a,b,c,out);outTri(target,b,d,c,out);};
  for(let i=0;i<rings.length-1;i++)for(let j=0;j<ringSize;j++){
    const a=rings[i][j],b=rings[i][(j+1)%ringSize],c=rings[i+1][j],d=rings[i+1][(j+1)%ringSize];
    const cz=(a[2]+d[2])/2,cy=(a[1]+b[1]+c[1]+d[1])/4,cx=Math.abs(a[0]+b[0]+c[0]+d[0])/4;
    const lid=cz>hoodFront&&cz<hoodRear&&cx<hoodHalf&&cy>T(cz)-.13;
    const target=lid?hoodTris:paintTris;tri(target,a,b,c);tri(target,b,d,c);
  }
  // Close the nose and tail.
  for(const[index,sign]of[[0,-1],[rings.length-1,1]]as const){
    const r=rings[index],center:V3=[0,r.reduce((sum,p)=>sum+p[1],0)/r.length,r[0][2]+sign*.012];
    for(let j=0;j<ringSize;j++){const a=r[j],b=r[(j+1)%ringSize];if(sign<0)tri(paintTris,a,center,b);else tri(paintTris,a,b,center);}
  }
  append(fromTriangles(paintTris),paint);
  // Bonnet: it shares the loft surface exactly. The hero car gets a hinged panel.
  const hoodTint=style.hood===2?0x1b1e21:undefined;
  const hoodGroup=new THREE.Group();hoodGroup.name='hinged-bonnet';
  const hoodPivot:V3=[0,T(hoodRear)+.005,hoodRear];
  let hoodShell:THREE.Mesh|undefined,hoodLining:THREE.Mesh|undefined;
  let carbon:VehicleMaterial|undefined;
  if(hero){
    const outer=fromTriangles(hoodTris);outer.translate(-hoodPivot[0],-hoodPivot[1],-hoodPivot[2]);
    // The lining is a slightly lowered copy with reversed winding, visible when open.
    const inside:number[]=[];for(let i=0;i<hoodTris.length;i+=9)inside.push(hoodTris[i],hoodTris[i+1]-.025,hoodTris[i+2],hoodTris[i+6],hoodTris[i+7]-.025,hoodTris[i+8],hoodTris[i+3],hoodTris[i+4]-.025,hoodTris[i+5]);
    const lining=colour(fromTriangles(inside),0x2a2f33);lining.translate(-hoodPivot[0],-hoodPivot[1],-hoodPivot[2]);
    carbon=style.hood===2?material(0x1d2023,{roughness:.35,metalness:.35}):undefined;
    geometries.add(outer);geometries.add(lining);
    hoodShell=new THREE.Mesh(outer,carbon??paint);hoodShell.name='bonnet-panel';hoodShell.castShadow=true;
    hoodLining=new THREE.Mesh(lining,details);hoodLining.name='bonnet-lining';
    hoodGroup.add(hoodShell,hoodLining);hoodGroup.position.set(...hoodPivot);body.add(hoodGroup);
  }else if(hoodTint!==undefined)append(colour(fromTriangles(hoodTris),hoodTint),details);
  else append(fromTriangles(hoodTris),paint);
  const hoodParts=(geometry:THREE.BufferGeometry,mat:THREE.Material,position:V3,rotation:V3=[0,0,0],tint?:number)=>{
    if(!hero){append(geometry,mat,position,rotation,tint);return;}
    const shape=prepare(geometry,[position[0]-hoodPivot[0],position[1]-hoodPivot[1],position[2]-hoodPivot[2]],rotation,tint);geometries.add(shape);
    const mesh=new THREE.Mesh(shape,mat);hoodGroup.add(mesh);
  };
  if(style.hood===1){
    // Power bulge with a forward-facing scoop and twin heat extractors.
    const zMid=(hoodFront+hoodRear)/2+.1,y=T(zMid)+.015;
    hoodParts(new THREE.BoxGeometry(.5,.06,.55),paint,[0,y+.02,zMid]);
    hoodParts(new THREE.BoxGeometry(.38,.045,.02),details,[0,y+.03,zMid-.28],[0,0,0],0x0c0f11);
    for(const side of[-1,1])for(let slat=0;slat<4;slat++)hoodParts(new THREE.BoxGeometry(.22,.012,.025),details,[side*.48,T(zMid-.25)+.02,zMid-.4+slat*.06],[0,0,0],0x111417);
  }

  // ---- Greenhouse --------------------------------------------------------
  {
    const glassTris:number[]=[],roofTris:number[]=[],trimTris:number[]=[];
    const S=software?2:4,U=software?2:6,baseTheta=Math.PI*.29;
    const Hmax=(z:number)=>cabin.roof-.025*((z-(cabin.a1+cabin.r0)/2)/((cabin.r0-cabin.a1)/2))**2;
    const height=(z:number)=>{
      const base=contour(z,baseTheta)[1];
      let f:number;
      if(z<=cabin.a1){const t=THREE.MathUtils.clamp((z-cabin.a0)/(cabin.a1-cabin.a0),0,1);f=1-(1-t)**1.55;}
      else if(z<=cabin.r0)f=1;
      else{const t=THREE.MathUtils.clamp((z-cabin.r0)/(cabin.r1-cabin.r0),0,1);f=sport?1-t**1.35:(1-t)**.85;}
      return{base,f,top:base+(Hmax(z)-base)*f};
    };
    const gz:number[]=[];const n=software?11:34;
    for(let i=0;i<=n;i++){const t=i/n;gz.push(cabin.a0+(cabin.r1-cabin.a0)*(t<.5?2*t*t:1-2*(1-t)**2)*.999+.0005);}
    for(const z of[cabin.a1,cabin.r0,cabin.bPillar-.06,cabin.bPillar+.06])if(z>cabin.a0&&z<cabin.r1)gz.push(z);
    gz.sort((a,b)=>a-b);
    const rows=gz.map(z=>{
      const[baseX]=contour(z,baseTheta),{base,f,top}=height(z),topX=THREE.MathUtils.lerp(baseX-.03,cabin.topHalf,Math.min(1,f*1.3));
      const pts:V3[]=[];
      for(let s=0;s<=S;s++){const t=s/S;pts.push([THREE.MathUtils.lerp(baseX,topX,t)+.035*Math.sin(Math.PI*t)*f,base+(top-base)*t,z]);}
      for(let u=1;u<=U;u++){const t=u/U;pts.push([topX*(1-t),top+.04*f*(1-(1-t)**2),z]);}
      return pts;
    });
    const half=S+U;
    const classify=(segment:number,z:number)=>{
      const top=segment>=S;
      if(top){const u=segment-S;if(z<cabin.a1)return u===0?'roof':'glass';if(z<=cabin.r0)return 'roof';return u===0?'roof':'glass';}
      if(segment===S-1&&!software)return 'roof';
      if(z<cabin.a1+.03)return 'roof';
      if(Math.abs(z-cabin.bPillar)<.06)return 'trim';
      if(z>cabin.cPillar)return 'roof';
      return 'glass';
    };
    for(let i=0;i<rows.length-1;i++)for(let k=0;k<half;k++)for(const side of[1,-1]){
      const p=(row:number,index:number):V3=>{const v=rows[row][index];return[v[0]*side,v[1],v[2]];};
      const a=p(i,k),b=p(i,k+1),c=p(i+1,k),d=p(i+1,k+1),cz=(a[2]+d[2])/2;
      const kind=classify(k,cz),target=kind==='glass'?glassTris:kind==='trim'?trimTris:roofTris;
      if(side>0){tri(target,a,b,c);tri(target,b,d,c);}else{tri(target,a,c,b);tri(target,b,c,d);}
    }
    const glassGeometry=fromTriangles(glassTris);append(glassGeometry,glass);
    append(fromTriangles(roofTris),paint);
    append(colour(fromTriangles(trimTris),0x0d1013),details);
    // Window seals and a bright beltline strip seat the glazing in the body.
    for(const side of[-1,1]){
      const pts:V3[]=[];for(let i=0;i<=24;i++){const z=cabin.a1+(Math.min(cabin.cPillar,cabin.r1)-cabin.a1)*i/24;const[x,y]=contour(z,baseTheta);pts.push([side*(x+.004),y+.006,z]);}
      const strip:number[]=[];for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1];quad(strip,a,b,[a[0],a[1]+.018,a[2]],[b[0],b[1]+.018,b[2]],[side,.6,0]);}
      append(colour(fromTriangles(strip),0x9aa4a8),details);
    }
  }

  // ---- Surface details -----------------------------------------------------
  /** A thin ribbon lying on the side skin, used for shut lines and livery. */
  const sideRibbon=(side:number,points:[number,number][],widthAxis:'y'|'z',width:number,tint:number,offset=.003)=>{
    const values:number[]=[];
    for(let i=0;i<points.length-1;i++){
      const[a,b,c,d]=[points[i],points[i+1]].flatMap(([z,y])=>{const p=widthAxis==='z'?[[z-width/2,y],[z+width/2,y]]:[[z,y-width/2],[z,y+width/2]];return p.map(([pz,py])=>[side*(sideX(pz,py)+offset),py,pz] as V3);});
      quad(values,a,b,c,d,[side,0,0]);
    }
    append(colour(fromTriangles(values),tint),details);
  };
  const patch=(side:number,z0:number,z1:number,y0:number,y1:number,tint:number,offset=.004)=>{
    const values:number[]=[],nz=8,ny=4;
    for(let i=0;i<nz;i++)for(let j=0;j<ny;j++){
      const corner=(a:number,b:number):V3=>{const z=z0+(z1-z0)*a/nz,y=y0+(y1-y0)*b/ny;return[side*(sideX(z,y)+offset),y,z];};
      quad(values,corner(i,j),corner(i+1,j),corner(i,j+1),corner(i+1,j+1),[side,0,0]);
    }
    append(colour(fromTriangles(values),tint),details);
  };
  const doors=sport?[cabin.a0+.05,cabin.bPillar+.14]:[cabin.a0+.05,cabin.bPillar,cabin.cPillar+.08];
  for(const side of[-1,1]){
    for(const z of doors){
      const yTop=contour(z,Math.PI*.29)[1]-.02,pts:[number,number][]=[];for(let i=0;i<=6;i++)pts.push([z,.4+(yTop-.4)*i/6]);
      sideRibbon(side,pts,'z',.007,0x15191c);
    }
    // Lower shut line and a subtle character crease.
    const sill:[number,number][]=[];for(let i=0;i<=10;i++)sill.push([doors[0]+(doors.at(-1)!-doors[0])*i/10,.42]);sideRibbon(side,sill,'y',.007,0x15191c);
    // Flush door handles.
    for(let i=0;i<doors.length-1;i++){const z=doors[i+1]-.2,y=contour(z,Math.PI*.22)[1];detail(.02,.028,.17,0xb7bec0,side*(sideX(z,y)+.008),y,z);detail(.01,.012,.13,0x2a3034,side*(sideX(z,y)+.019),y,z);}
    // Mirrors on stalks at the A-pillar base.
    const mz=cabin.a0+.2,my=contour(mz,Math.PI*.29)[1]+.08,mx=sideX(mz,my-.1)+.11;
    cylinder(.014,.018,.12,paint,[side*(mx-.07),my-.03,mz],[0,0,side*Math.PI/2]);
    append(new THREE.SphereGeometry(.5,software?8:12,software?6:8).scale(.11,.1,.16),paint,[side*mx,my,mz]);
    detail(.01,.075,.12,0x5a7480,side*(mx+.002),my,mz+.06);
    // Wheel-well liners hide the open arches from the inside.
    for(const axle of[-AXLE,AXLE]){
      // Upper half-cylinder, wound inwards so it is seen from the wheel side.
      const liner=new THREE.CylinderGeometry(ARCH-.01,ARCH-.01,.42,software?10:18,1,true,0,Math.PI);
      const index=liner.index!;for(let i=0;i<index.count;i+=3){const first=index.getX(i);index.setX(i,index.getX(i+2));index.setX(i+2,first);}
      liner.computeVertexNormals();
      append(liner,details,[side*.79,WHEEL_Y+drop,axle],[0,0,Math.PI/2],0x0d0f11);
    }
  }
  // Inner floor between the arches and dark underbody.
  detail(1.55,.03,AXLE*2+.3,0x111417,0,.31,0);

  // ---- Front ---------------------------------------------------------------
  /** First station whose outline reaches height y: the front face at that height. */
  const noseY=(y:number)=>{for(let z=front;z<front+.6;z+=.004)if(B(z)<=y&&T(z)>=y)return z;return front;};
  const lampY=T(front+.1)-.08,lampZ=noseY(lampY)+.05;
  /** Point on the lofted skin, pushed out along its normal. */
  const skinPoint=(side:number,z:number,theta:number,offset:number):V3=>{
    const[x,y]=contour(z,theta),e=.002,[x1,y1]=contour(z,theta+e),[x2,y2]=contour(z+e,theta);
    const ax=x1-x,ay=y1-y,bx=x2-x,by=y2-y,bz=e;
    let nx=ay*bz,ny=-ax*bz,nz=ax*by-ay*bx;const length=Math.hypot(nx,ny,nz)||1;nx/=length;ny/=length;nz/=length;
    return[side*(x+nx*offset),y+ny*offset,z+nz*offset];
  };
  /** Conformal decal on the body corners: lamp lenses and housings follow the curvature. */
  const skin=(side:number,z0:number,z1:number,t0:number,t1:number,mat:THREE.Material,tint:number|undefined,offset:number)=>{
    const values:number[]=[],nz=software?4:8,nt=software?3:6;
    for(let i=0;i<nz;i++)for(let j=0;j<nt;j++){
      const p=(a:number,b:number)=>skinPoint(side,z0+(z1-z0)*a/nz,(t0+(t1-t0)*b/nt)*Math.PI,offset);
      const a=p(i,j),b=p(i+1,j),c=p(i,j+1),d=p(i+1,j+1),mid=skinPoint(side,z0+(z1-z0)*(i+.5)/nz,(t0+(t1-t0)*(j+.5)/nt)*Math.PI,1);
      const base=skinPoint(side,z0+(z1-z0)*(i+.5)/nz,(t0+(t1-t0)*(j+.5)/nt)*Math.PI,0);
      quad(values,a,b,c,d,[mid[0]-base[0],mid[1]-base[1],mid[2]-base[2]]);
    }
    const geometry=fromTriangles(values);append(tint===undefined?geometry:colour(geometry,tint),mat);
  };
  for(const side of[-1,1]){
    // Swept headlamps wrap from the nose onto the wings: housing, lens, LED strip, indicator.
    skin(side,front+.015,front+.25,.04,.34,details,0x0e1215,.004);
    skin(side,front+.06,front+.2,.17,.27,head,undefined,.009);
    skin(side,front+.04,front+.235,.3,.322,head,undefined,.01);
    skin(side,front+.03,front+.2,.14,.165,details,0x6f7b82,.009);
    skin(side,front+.03,front+.16,.07,.13,details,0xe0a24a,.008);
    // Lower intakes and fog lamps.
    detail(.3,.11,.04,0x0f1214,side*.52,.46,noseY(.46)+.012);
    cylinder(.028,.028,.02,head,[side*.6,.46,noseY(.46)-.004],[Math.PI/2,0,0]);
    // Rear clusters wrap around the corners, with reversing and indicator segments.
    skin(side,rear-.26,rear-.012,.06,.34,details,0x2a0a0e,.004);
    skin(side,rear-.24,rear-.03,.18,.31,brake,undefined,.008);
    skin(side,rear-.2,rear-.03,.09,.15,details,0xe9e4dc,.008);
  }
  if(sport){const y=T(rear)-.07;box(.6,.02,.02,brake,0,y,noseY(y)>front?rear+.002:rear+.002);}
  // Grille with horizontal vanes, badge and number plates.
  const grilleY=sport?.53:.58,grilleZ=noseY(grilleY)+.02;
  detail(sport?.7:.9,sport?.13:.2,.04,0x0b0e10,0,grilleY,grilleZ);
  for(let i=0;i<(sport?3:5);i++)detail(sport?.66:.86,.012,.03,0x4c565c,0,grilleY-(sport?.05:.08)+i*.04,grilleZ-.012);
  detail(.08,.05,.02,0xc9ced0,0,grilleY+(sport?.085:.12),grilleZ-.005);
  detail(.52,.12,.012,0xf1f1ea,0,.4,noseY(.4)-.004);
  for(let i=0;i<6;i++)detail(.035,.06,.004,0x1c2a3a,-.17+i*.068,.4,noseY(.4)-.012);
  const plateY=sport?.62:.66;
  detail(.52,.12,.012,0xf1f1ea,0,plateY,rear+.006);
  for(let i=0;i<6;i++)detail(.035,.06,.004,0x1c2a3a,-.17+i*.068,plateY,rear+.014);
  detail(1.5,.05,.06,0x14181b,0,.35,rear-.05); // rear valance
  // Wipers, fuel flap and roof antenna.
  for(const x of[-.3,.32])detail(.46,.014,.02,0x15191c,x,T(cabin.a0)+.02,cabin.a0+.06,0,x<0?-.08:.08,0);
  detail(.012,.13,.13,0x232a2e,.995+.004,.82,1.55);
  append(new THREE.ConeGeometry(.03,.09,6),details,[0,cabin.roof+.06,cabin.r0-.05],[-.6,0,0],0x111417);

  // ---- Interior visible through the glass ---------------------------------
  {
    const seat=police?0x22262a:0x2b2522,trimTone=0x1a1d20;
    const belt=T(cabin.a0+.4);
    // Dashboard with instrument binnacle, steering wheel on the left and a centre console.
    detail(1.42,.12,.34,trimTone,0,belt-.02,cabin.a0+.34);
    detail(.34,.08,.16,0x101315,-.38,belt+.11,cabin.a0+.38);
    detail(.22,.1,.012,0x2b5d6a,-.38,belt+.11,cabin.a0+.465);
    append(new THREE.TorusGeometry(.165,.02,6,software?12:20),details,[-.38,belt+.1,cabin.a0+.6],[-.4,0,0],0x0f1214);
    detail(.05,.05,.16,0x0f1214,-.38,belt+.06,cabin.a0+.53,-.4,0,0);
    detail(.2,.16,.6,trimTone,0,belt-.04,(cabin.a0+cabin.bPillar)/2+.25);
    const seatRows=sport?[cabin.bPillar-.12]:[cabin.bPillar-.12,cabin.cPillar-.08];
    seatRows.forEach((z,row)=>{for(const x of row===0?[-.38,.38]:[-.38,0,.38]){
      const roofAt=Math.min(cabin.roof,cabin.roof-.025)-.12,top=Math.min(belt+.34,roofAt-.08);
      detail(.46,top-.45,.13,seat,x,(top+.45)/2,z+.14,-.1,0,0);
      detail(.42,.06,.13,0x3a322d,x,top-.02,z+.15,-.1,0,0);
      if(row===0)detail(.24,.13,.1,seat,x,top+.08,z+.17);
    }});
  }

  // ---- Body kit, exhausts and spoilers ----------------------------------------
  const kitTone=0x16191c;
  if(style.kit>0){
    const wide=style.kit===2;
    detail(1.7,.035,.32,kitTone,0,.3,front+.2);
    for(const side of[-1,1]){
      detail(.09,.08,AXLE*2-ARCH*2-.1,kitTone,side*(sideX(0,.36)+.025),.33,0);
      detail(.2,.03,.25,kitTone,side*.75,.3,front+.26,0,side*.2,0);
    }
    detail(1.3,.05,.3,kitTone,0,.33,rear-.1,-.25,0,0);
    for(let i=0;i<5;i++)detail(.012,.12,.28,kitTone,-.4+i*.2,.34,rear-.1,-.25,0,0);
    if(wide)for(const side of[-1,1])for(const axle of[-AXLE,AXLE]){
      const flare=new THREE.TorusGeometry(ARCH+.02,.045,software?4:6,software?10:18,Math.PI);
      append(flare,paint,[side*(sideX(axle,.75)-.01),WHEEL_Y+drop,axle],[0,side*Math.PI/2,0]);
    }
  }
  {
    const count=[1,2,4][style.exhaust]??1,positions=count===1?[.6]:count===2?[-.62,.62]:[-.7,-.54,.54,.7];
    for(const x of positions){
      cylinder(.045,.045,.14,details,[x,.36,rear-.02],[Math.PI/2,0,0],0xc6ccce);
      cylinder(.034,.034,.142,details,[x,.36,rear-.019],[Math.PI/2,0,0],0x0b0c0d);
    }
  }
  if(style.spoiler>0){
    const deck=T(rear-.25);
    if(style.spoiler===1){
      append(new THREE.BoxGeometry(1.5,.05,.18).translate(0,0,0),paint,[0,deck+.035,rear-.16],[-.25,0,0]);
    }else{
      const gt=style.spoiler===3,y=deck+(gt?.3:.2),span=gt?1.86:1.6,chord=gt?.34:.26,wingTone=gt?0x15181b:undefined;
      const aerofoil=new THREE.BoxGeometry(span,.04,chord);append(aerofoil,wingTone?details:paint,[0,y,rear-.24],[.08,0,0],wingTone);
      detail(span,.012,.05,0x0d0f11,0,y+.025,rear-.12,.08,0,0);
      for(const side of[-1,1]){
        detail(.035,y-deck,.06,0x15181b,side*.48,(y+deck)/2,rear-.24);
        if(gt)detail(.012,.2,.42,0x15181b,side*(span/2+.006),y,rear-.24);
      }
    }
  }

  // ---- Police equipment ----------------------------------------------------
  let red:VehicleMaterial|undefined,blue:VehicleMaterial|undefined;
  if(police){
    for(const side of[-1,1]){
      patch(side,-.86,.86,.52,.84,0xeeeae0);
      sideRibbon(side,[[-.86,.5],[.86,.5]],'y',.035,0x2a5174,.006);
      const shieldY=.7,shieldZ=-.62;append(new THREE.CylinderGeometry(.09,.06,.014,5),details,[side*(sideX(shieldZ,shieldY)+.008),shieldY,shieldZ],[0,0,Math.PI/2],0xd8b75e);
      label('POLICE',side,.74,.32,details,append,sideX);
    }
    const roof=cabin.roof+.04;
    detail(1.3,.06,.36,0x1c2932,0,roof+.03,.12);
    red=material(0xe03c50,{emissive:0xf32945,emissiveIntensity:.8,roughness:.18});blue=material(0x489ee2,{emissive:0x2187ff,emissiveIntensity:.8,roughness:.18});
    for(const side of[-1,1]){box(.56,.12,.3,side<0?red:blue,side*.34,roof+.12,.12);detail(.04,.13,.31,0x9cb7c1,side*.645,roof+.12,.12);}
    for(const x of[-.72,.72])box(.09,.06,.05,x<0?red:blue,x,grilleY+.02,grilleZ-.05);
    detail(.35,.12,.06,0x222f38,-.93,T(cabin.a0)+.12,cabin.a0+.15);
    detail(1.6,.18,.1,0x15191c,0,.48,noseY(.48)-.06); // push bar
  }

  // ---- Batches ---------------------------------------------------------------
  for(const [mat,parts] of batches){
    const geometry=mergeGeometries(parts,false)!;parts.forEach(p=>p.dispose());geometry.computeBoundingSphere();geometries.add(geometry);
    const mesh=new THREE.Mesh(geometry,mat);
    mesh.name=mat===paint?'painted-shell':mat===glass?'tapered-glazing':mat===details?'batched-trim-and-livery':'lamps';
    mesh.castShadow=mat!==glass;mesh.receiveShadow=true;body.add(mesh);
  }
  const shell=body.children.find(child=>child.name==='painted-shell');

  // ---- Wheels --------------------------------------------------------------
  const wheels:THREE.Group[]=[],frontWheels:THREE.Group[]=[];
  const wheelGeometry=makeWheel(software,style);geometries.add(wheelGeometry);
  let caliperGeometry:THREE.BufferGeometry|undefined;
  if(hero){
    const parts=[new THREE.BoxGeometry(.06,.15,.09).translate(.06,.13,.11),new THREE.BoxGeometry(.03,.05,.05).translate(.085,.17,.09)];
    caliperGeometry=colour(mergeGeometries(parts.map(p=>p.toNonIndexed()),false)!,0xc4282c);parts.forEach(p=>p.dispose());geometries.add(caliperGeometry);
  }
  for(const side of[-1,1])for(const z of[-AXLE,AXLE]){
    const steer=new THREE.Group();steer.name=z<0?'front-steering-pivot':'rear-axle';steer.position.set(side*1.02,WHEEL_Y,z);group.add(steer);
    const spin=new THREE.Group();spin.name='wheel-spin';steer.add(spin);
    const wheel=new THREE.Mesh(wheelGeometry,details);wheel.scale.x=side;wheel.castShadow=true;spin.add(wheel);wheels.push(spin);if(z<0)frontWheels.push(steer);
    if(caliperGeometry){const caliper=new THREE.Mesh(caliperGeometry,details);caliper.name='brake-caliper';caliper.scale.x=side;steer.add(caliper);}
  }

  const engine=hero?buildEngineBay({group,body,hood:hoodGroup,hoodMeshes:[hoodShell!,hoodLining!],shell:shell!,front,hoodRear,T,drop,software,material,colour,geometries,materials}):undefined;
  let fuelFlap:FuelFlap|undefined;
  if(hero){
    const z=sport?1.55:1.6,y=.82,x=sideX(z,y)+.004;
    const mount=new THREE.Group();mount.name='fuel-filler';mount.position.set(x,y,z);body.add(mount);
    const recess=new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,.02,software?10:18),details);
    colour(recess.geometry,0x121416);recess.geometry.rotateZ(Math.PI/2);recess.position.x=-.008;mount.add(recess);geometries.add(recess.geometry);
    const neck=new THREE.Group();mount.add(neck);
    const neckMesh=new THREE.Mesh(colour(new THREE.CylinderGeometry(.032,.032,.03,software?8:14).rotateZ(Math.PI/2),0x2a2d30),details);neckMesh.position.x=.004;neck.add(neckMesh);geometries.add(neckMesh.geometry);
    const cap=new THREE.Mesh(colour(new THREE.CylinderGeometry(.034,.034,.025,software?8:14).rotateZ(Math.PI/2),0x1c1e20),details);cap.position.x=.02;neck.add(cap);geometries.add(cap.geometry);
    // The flap hinges on its front edge (towards -Z).
    const hinge=new THREE.Group();hinge.position.set(.006,0,-.08);mount.add(hinge);
    const panel=new THREE.Mesh(new THREE.BoxGeometry(.012,.15,.16).translate(0,0,.08),paint);panel.name='fuel-flap-panel';hinge.add(panel);geometries.add(panel.geometry);
    // Pistol nozzle shown in the neck while refuelling.
    const nozzle=new THREE.Group();nozzle.name='inserted-nozzle';mount.add(nozzle);
    const nozzleParts=[
      colour(new THREE.CylinderGeometry(.012,.012,.16,8).rotateZ(Math.PI/2).translate(.07,.02,0),0x9aa1a5),
      colour(new THREE.BoxGeometry(.06,.18,.05).rotateZ(.5).translate(.17,-.03,0),0x2f8f4e),
      colour(new THREE.BoxGeometry(.03,.08,.035).translate(.19,-.12,0),0x111316),
      colour(new THREE.CylinderGeometry(.018,.018,.5,8).translate(.22,-.4,0),0x111316),
    ].map(part=>part.index?part.toNonIndexed():part);
    const nozzleMesh=new THREE.Mesh(mergeGeometries(nozzleParts,false)!,details);nozzleParts.forEach(part=>part.dispose());geometries.add(nozzleMesh.geometry);nozzle.add(nozzleMesh);nozzle.visible=false;
    const glow=new THREE.MeshBasicMaterial({color:0x8ff0d0,transparent:true,opacity:.45,depthWrite:false});materials.add(glow);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.11,.012,6,24).rotateY(Math.PI/2),glow);ring.position.x=.02;ring.visible=false;ring.name='part-highlight';mount.add(ring);geometries.add(ring.geometry);
    let angle=0;
    fuelFlap={target:mount,update(open,withNozzle,highlight,dt){
      angle+=((open||withNozzle?1.9:0)-angle)*(1-Math.exp(-dt*9));hinge.rotation.y=angle;
      cap.visible=!open&&!withNozzle;nozzle.visible=withNozzle;ring.visible=highlight;
    }};
  }
  let triangles=0,drawCalls=0;group.traverse(object=>{if(object instanceof THREE.Mesh&&object.visible){drawCalls++;triangles+=(object.geometry.index?.count??object.geometry.getAttribute('position').count)/3;}});
  let disposed=false;
  return{group,chassis,wheels,frontWheels,paint,head,brake,red,blue,engine,fuelFlap,styleKey:vehicleStyleKey(style),stats:{drawCalls,triangles},dispose(){if(disposed)return;disposed=true;group.removeFromParent();group.clear();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}};
}

interface BayContext{
  group:THREE.Group;body:THREE.Group;hood:THREE.Group;hoodMeshes:THREE.Mesh[];shell:THREE.Object3D;
  front:number;hoodRear:number;T:(z:number)=>number;drop:number;software:boolean;
  material:(tint:number,props?:THREE.MeshStandardMaterialParameters)=>VehicleMaterial;
  colour:(shape:THREE.BufferGeometry,tint:number)=>THREE.BufferGeometry;
  geometries:Set<THREE.BufferGeometry>;materials:Set<THREE.Material>;
}
/** Serviceable inline-four: real parts with their own pivots so they can be worked on. */
function buildEngineBay(c:BayContext):EngineBay{
  const {software,material,colour,geometries}=c;
  const metal=material(0xffffff,{vertexColors:true,roughness:.48,metalness:.55});
  // The whole bay sits low enough to clear the closed bonnet of the low sports body.
  const BAY_DROP=.15;
  const group=new THREE.Group();group.name='engine-bay';group.position.y=-BAY_DROP;c.body.add(group);
  const block=new THREE.Group();block.name='engine-block';group.add(block);
  const seg=software?8:16;
  const parts=new Map<THREE.Object3D,THREE.BufferGeometry[]>();
  const add=(parent:THREE.Object3D,geometry:THREE.BufferGeometry,tint:number,position:V3,rotation:V3=[0,0,0])=>{
    const shape=geometry.index?geometry.toNonIndexed():geometry;if(shape!==geometry)geometry.dispose();shape.deleteAttribute('uv');
    shape.rotateX(rotation[0]);shape.rotateY(rotation[1]);shape.rotateZ(rotation[2]);shape.translate(...position);colour(shape,tint);
    const list=parts.get(parent)??[];list.push(shape);parts.set(parent,list);
  };
  const bake=(parent:THREE.Object3D,mat:THREE.Material=metal,name='')=>{
    const list=parts.get(parent);if(!list?.length)return null;
    const geometry=mergeGeometries(list,false)!;list.forEach(item=>item.dispose());parts.delete(parent);geometries.add(geometry);
    const mesh=new THREE.Mesh(geometry,mat);mesh.name=name||`${parent.name}-mesh`;mesh.castShadow=!software;parent.add(mesh);return mesh;
  };
  const box=(parent:THREE.Object3D,w:number,h:number,d:number,tint:number,x:number,y:number,z:number,r:V3=[0,0,0])=>add(parent,new THREE.BoxGeometry(w,h,d),tint,[x,y,z],r);
  const cyl=(parent:THREE.Object3D,r:number,h:number,tint:number,position:V3,rotation:V3=[0,0,0],r1=r)=>add(parent,new THREE.CylinderGeometry(r,r1,h,seg),tint,position,rotation);
  const tube=(parent:THREE.Object3D,from:V3,to:V3,radius:number,tint:number)=>{
    const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to),dir=b.clone().sub(a),g=new THREE.CylinderGeometry(radius,radius,dir.length(),software?5:8);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize()));
    const mid=a.add(b).multiplyScalar(.5);add(parent,g,tint,[mid.x,mid.y,mid.z]);
  };
  const ez=-1.45;
  // Bay structure: fender liners, firewall, radiator support and strut towers.
  for(const side of[-1,1]){
    box(group,.04,.5,1.1,0x15181a,side*.83,.62,-1.5);
    cyl(group,.1,.24,0x2a2e31,[side*.67,.76,-1.4]);cyl(group,.045,.05,0x8b9296,[side*.67,.9,-1.4]);
  }
  box(group,1.62,.5,.04,0x15181a,0,.66,c.hoodRear+.03);
  box(group,1.5,.05,.08,0x2a2e31,0,.86,-2.02);
  // Radiator, fan shroud, coolant and battery stay with the body.
  box(group,1.25,.38,.05,0x1c2024,0,.6,-1.98);
  for(let i=0;i<10;i++)box(group,1.22,.006,.052,0x3a4246,0,.44+i*.035,-1.98);
  cyl(group,.2,.04,0x15181a,[0,.6,-1.93],[Math.PI/2,0,0],.2);
  box(group,.22,.18,.16,0x15181a,.56,.62,-1.13);
  for(const[x,t]of[[.5,0xc0392b],[.62,0x2c4f8a]]as const)cyl(group,.017,.03,t,[x,.725,-1.13]);
  box(group,.13,.15,.11,0xdcdccf,.58,.72,-1.72);cyl(group,.03,.03,0x2d6fb5,[.58,.81,-1.72]);
  box(group,.08,.08,.08,0xd8c690,-.58,.8,-1.12);cyl(group,.022,.025,0x222,[-.58,.85,-1.12]);
  box(group,.26,.16,.22,0x14171a,-.5,.73,-1.78);tube(group,[-.5,.73,-1.66],[-.3,.75,-1.5],.05,0x14171a);
  box(group,.16,.1,.12,0x15181a,-.56,.68,-1.42);
  bake(group,metal,'engine-bay-structure');

  // The engine itself: block, head, ribbed valve cover, intake runners and sump.
  box(block,.6,.34,.48,0x575d61,0,.57,ez);
  box(block,.56,.1,.44,0x6d7377,0,.79,ez);
  box(block,.52,.07,.38,0x8c1d22,0,.875,ez);
  for(let i=0;i<5;i++)box(block,.5,.012,.012,0xb02a2f,0,.915,ez-.15+i*.075);
  for(let i=0;i<4;i++){const x=-.18+i*.12;tube(block,[x,.86,ez+.2],[x,.78,ez+.38],.024,0x9ea6aa);}
  box(block,.56,.1,.12,0x9ea6aa,0,.74,ez+.4);
  tube(block,[-.32,.6,ez+.05],[-.48,.5,ez+.25],.035,0x7b8387);
  box(block,.5,.12,.42,0x3c4246,0,.3,ez);
  // Alternator and coil packs.
  cyl(block,.06,.12,0x9aa1a5,[.33,.72,ez-.17],[0,0,Math.PI/2]);
  for(let i=0;i<4;i++)box(block,.035,.05,.035,0x111316,-.18+i*.12,.925,ez+.06);
  // Oil filter housing on the head (the canister is a separate part).
  cyl(block,.058,.03,0x111316,[-.2,.8,ez-.29]);
  // Dipstick guide tube.
  tube(block,[.2,.42,ez+.2],[.22,.86,ez+.24],.009,0x9ea6aa);
  bake(block,metal,'engine-block-mesh');

  // Pulleys and belt spin with the crankshaft (crank axis along X).
  const pulleys=new THREE.Group();pulleys.name='crank-pulleys';pulleys.position.set(.33,.48,ez+.05);block.add(pulleys);
  cyl(pulleys,.075,.03,0x2a2e31,[0,0,0],[0,0,Math.PI/2]);for(let i=0;i<6;i++)box(pulleys,.034,.11,.012,0x8b9296,.0,0,0,[i*Math.PI/6,0,0]);
  bake(pulleys);
  const belt=new THREE.Group();block.add(belt);tube(belt,[.335,.555,ez+.05],[.335,.78,ez-.17],.012,0x111316);tube(belt,[.335,.405,ez+.05],[.335,.66,ez-.17],.012,0x111316);bake(belt);
  // Radiator fan (axis along Z).
  const fan=new THREE.Group();fan.name='radiator-fan';fan.position.set(0,.6,-1.9);group.add(fan);
  cyl(fan,.04,.05,0x111316,[0,0,0],[Math.PI/2,0,0]);
  for(let i=0;i<7;i++){const a=i*Math.PI*2/7;box(fan,.06,.17,.012,0x1d2124,Math.sin(a)*.1,Math.cos(a)*.1,0,[0,.35,-a]);}
  bake(fan);

  // Interactive parts each own a material so they can be highlighted.
  const targets:{id:EnginePartId;object:THREE.Object3D}[]=[];
  const cap=new THREE.Group();cap.name='oil-filler-cap';cap.position.set(.12,.915,ez+.02);block.add(cap);
  cyl(cap,.042,.035,0xe7b52c,[0,.018,0]);for(let i=0;i<8;i++){const a=i*Math.PI/4;box(cap,.012,.035,.01,0xc4921b,Math.cos(a)*.042,.018,Math.sin(a)*.042,[0,-a,0]);}
  cyl(cap,.02,.004,0x1b1b1b,[0,.037,0]);
  bake(cap,material(0xffffff,{vertexColors:true,roughness:.5}),'oil-filler-cap');
  const neck=new THREE.Group();block.add(neck);cyl(neck,.035,.02,0x16181a,[.12,.91,ez+.02]);bake(neck);
  const dipstick=new THREE.Group();dipstick.name='dipstick';dipstick.position.set(.22,.87,ez+.24);block.add(dipstick);
  add(dipstick,new THREE.TorusGeometry(.028,.008,6,software?10:16),0xf0a21e,[0,.03,0],[0,Math.PI/2,0]);
  cyl(dipstick,.005,.46,0xc0c6c8,[0,-.22,0]);
  bake(dipstick,material(0xffffff,{vertexColors:true,roughness:.4,metalness:.4}),'dipstick');
  const tipMaterial=material(0x2a1a08,{roughness:.2,metalness:.1});
  const tip=new THREE.Mesh(new THREE.CylinderGeometry(.0065,.0065,1,6),tipMaterial);tip.name='dipstick-oil-film';geometries.add(tip.geometry);tip.position.y=-.41;dipstick.add(tip);
  for(const mark of[-.39,-.43]){const m=new THREE.Mesh(new THREE.BoxGeometry(.02,.003,.004),metal);geometries.add(m.geometry);m.position.y=mark;dipstick.add(m);}
  const filter=new THREE.Group();filter.name='oil-filter';filter.position.set(-.2,.815,ez-.29);block.add(filter);
  const filterMat=material(0xffffff,{vertexColors:true,roughness:.45,metalness:.2});
  const oldFilter=new THREE.Group(),newFilter=new THREE.Group();filter.add(oldFilter,newFilter);
  cyl(oldFilter,.05,.11,0x5a3a1c,[0,.055,0]);cyl(oldFilter,.03,.012,0x2b2118,[0,.115,0]);
  cyl(newFilter,.05,.11,0x1f63c4,[0,.055,0]);cyl(newFilter,.03,.012,0xe9eef2,[0,.115,0]);box(newFilter,.03,.05,.004,0xf2f2f2,0,.06,-.05);
  bake(oldFilter,filterMat,'old-oil-filter');bake(newFilter,filterMat,'new-oil-filter');newFilter.visible=false;
  const plug=new THREE.Group();plug.name='sump-drain-plug';plug.position.set(.06,.24,ez-.12);block.add(plug);
  cyl(plug,.022,.02,0xa8b0b3,[0,-.01,0]);add(plug,new THREE.CylinderGeometry(.018,.018,.022,6),0x8f979a,[0,-.03,0]);
  bake(plug,material(0xffffff,{vertexColors:true,roughness:.35,metalness:.7}),'sump-drain-plug');

  // Workshop props belong to the car's ground frame, not the sprung body.
  const floor=-.045;
  const pan=new THREE.Group();pan.name='drain-pan';pan.position.set(.06,floor,ez-.12);c.group.add(pan);
  add(pan,new THREE.CylinderGeometry(.28,.24,.08,seg,1,true),0x1b1e20,[0,.04,0]);add(pan,new THREE.CylinderGeometry(.24,.24,.01,seg),0x1b1e20,[0,.005,0]);
  bake(pan);
  const oilMaterial=material(0x1b1206,{roughness:.08,metalness:.1});
  const panOil=new THREE.Mesh(new THREE.CylinderGeometry(.25,.25,.06,seg),oilMaterial);panOil.name='drained-oil';geometries.add(panOil.geometry);pan.add(panOil);
  const stream=new THREE.Mesh(new THREE.CylinderGeometry(.007,.01,1,6),oilMaterial);stream.name='oil-stream';geometries.add(stream.geometry);c.group.add(stream);
  const streamTop=.24-.04-c.drop-BAY_DROP,streamBottom=floor+.05;stream.position.set(.06,(streamTop+streamBottom)/2,ez-.12);stream.scale.y=streamTop-streamBottom;
  const bottle=new THREE.Group();bottle.name='oil-bottle';c.group.add(bottle);
  const jug=new THREE.Group();bottle.add(jug);
  box(jug,.18,.28,.1,0xd8a62a,0,.14,0);cyl(jug,.025,.05,0x1b1b1b,[.06,.3,0]);box(jug,.05,.08,.05,0xd8a62a,-.06,.25,0);
  box(jug,.12,.1,.003,0x1d3b72,0,.15,-.0515);
  bake(jug,material(0xffffff,{vertexColors:true,roughness:.5}),'oil-bottle');
  const pour=new THREE.Mesh(new THREE.CylinderGeometry(.006,.008,1,6),material(0xb98a24,{roughness:.1,metalness:.1,transparent:true,opacity:.85}));pour.name='pouring-oil';geometries.add(pour.geometry);c.group.add(pour);
  const bottleHome=new THREE.Vector3(1.32,floor,-2.05);

  targets.push({id:'hood',object:c.hood},{id:'cap',object:cap},{id:'dipstick',object:dipstick},{id:'filter',object:filter},{id:'drainPlug',object:plug},{id:'bottle',object:bottle});
  // Outline shells: back-faced, slightly inflated copies shown on hover.
  const outlineMaterial=new THREE.MeshBasicMaterial({color:0x8ff0d0,side:THREE.BackSide,transparent:true,opacity:.65,depthWrite:false});
  // The thin bonnet instead receives a lifted translucent overlay.
  const overlayMaterial=new THREE.MeshBasicMaterial({color:0x8ff0d0,transparent:true,opacity:.28,depthWrite:false});
  const outlines=new Map<EnginePartId,THREE.Mesh[]>();
  for(const target of targets){
    const meshes:THREE.Mesh[]=[];target.object.traverse(object=>{if(object instanceof THREE.Mesh&&object.name!=='bonnet-lining')meshes.push(object);});
    const list=meshes.map(object=>{
      const geometry=object.geometry.clone();
      if(target.id==='hood')geometry.translate(0,.012,0);
      else{geometry.computeBoundingBox();const center=geometry.boundingBox!.getCenter(new THREE.Vector3());geometry.translate(-center.x,-center.y,-center.z).scale(1.18,1.18,1.18).translate(center.x,center.y,center.z);}
      geometries.add(geometry);const outline=new THREE.Mesh(geometry,target.id==='hood'?overlayMaterial:outlineMaterial);outline.name='part-highlight';outline.visible=false;outline.renderOrder=2;object.add(outline);return outline;
    });
    outlines.set(target.id,list);
  }
  c.materials.add(outlineMaterial);c.materials.add(overlayMaterial);
  let time=0,current={hood:0,dipstick:0,cap:0,plug:0};
  const ease=(a:number,b:number,rate:number,dt:number)=>a+(b-a)*(1-Math.exp(-rate*dt));
  const update=(pose:EngineBayPose,dt:number)=>{
    time+=dt;
    current={hood:ease(current.hood,pose.hood,6,dt),dipstick:ease(current.dipstick,pose.dipstick,8,dt),cap:ease(current.cap,pose.cap,9,dt),plug:ease(current.plug,pose.plug,9,dt)};
    c.hood.rotation.x=current.hood*1.12;
    const rpm=pose.running?Math.max(650,pose.rpm):0,hz=rpm/60;
    block.position.set(0,pose.running?Math.sin(time*hz*Math.PI*2)*.0012+Math.sin(time*13)*.0006:0,0);
    block.rotation.z=pose.running?Math.sin(time*hz*Math.PI)*.0025:0;
    pulleys.rotation.x-=dt*hz*Math.PI*2;
    if(pose.running)fan.rotation.z+=dt*Math.min(40,8+hz*.6);
    dipstick.position.y=.87+current.dipstick*.43;dipstick.rotation.z=current.dipstick*.25;
    const level=THREE.MathUtils.clamp(pose.oilLevel,0,1.3);tip.visible=level>.02;tip.scale.y=.02+level*.04;tip.position.y=-.44+tip.scale.y/2;tipMaterial.color.setHex(pose.oilColor);
    cap.position.set(.12+(current.cap>.8?(current.cap-.8)*.5:0),.915+current.cap*.05,ez+.02);cap.rotation.y=current.cap*Math.PI*3;
    plug.position.y=.24-current.plug*.05;plug.visible=pose.plug<.97;
    oldFilter.visible=pose.filter==='old';newFilter.visible=pose.filter==='new';
    stream.visible=pose.service&&pose.draining>.01;stream.scale.x=stream.scale.z=.4+pose.draining*.8;
    pan.visible=pose.service;panOil.visible=pose.pan>.01;panOil.scale.y=Math.max(.02,pose.pan);panOil.position.y=.012+.03*pose.pan;oilMaterial.color.setHex(pose.oilColor);
    bottle.visible=pose.service;
    // Tilted so the spout sits just above the open filler neck.
    if(pose.pouring){bottle.position.set(-.12,1.23-c.drop-BAY_DROP,ez+.02);bottle.rotation.set(0,0,-2.0);pour.visible=true;pour.position.set(.13,1.0-c.drop-BAY_DROP,ez+.02);pour.scale.y=.1;}
    else{bottle.position.copy(bottleHome);bottle.rotation.set(0,.4,0);pour.visible=false;}
    for(const[id,list]of outlines)for(const outline of list)outline.visible=pose.highlight===id;
  };
  update({hood:0,dipstick:0,cap:0,plug:0,filter:'old',draining:0,pouring:false,pan:0,oilColor:0x2a1a08,oilLevel:.8,running:false,rpm:0,service:false,highlight:null},0);
  return{group,hood:c.hood,targets,occluders:[c.shell,...c.hoodMeshes],update};
}

const FONT:Record<string,string[]>={P:['110','101','110','100','100'],O:['010','101','101','101','010'],L:['100','100','100','100','111'],I:['111','010','010','010','111'],C:['011','100','100','100','011'],E:['111','100','110','100','111']};
function label(text:string,side:number,y:number,z:number,material:THREE.Material,append:(geometry:THREE.BufferGeometry,mat:THREE.Material,position:V3,rotation:V3,tint?:number)=>void,sideX:(z:number,y:number)=>number){
  const pixel=.028,width=(text.length*4-1)*pixel;
  for(let letter=0;letter<text.length;letter++)for(let row=0;row<5;row++)for(let col=0;col<3;col++)if(FONT[text[letter]][row][col]==='1'){
    const py=y+(2-row)*pixel,pz=z-side*((letter*4+col)*pixel-width/2);
    append(new THREE.BoxGeometry(.006,pixel*.82,pixel*.82),material,[side*(sideX(pz,py)+.007),py,pz],[0,0,0],0x18354c);
  }
}

/** Tyre with a rounded sidewall and tread grooves, one of four rim designs and a brake disc. Face is +X. */
function makeWheel(software:boolean,style:VehicleStyle){
  const parts:THREE.BufferGeometry[]=[],segments=software?12:28;
  const rimTone=RIM_COLORS[style.rimColor]?.color??0xc3cacc;
  const add=(shape:THREE.BufferGeometry,color:number,x=0,y=0,z=0,rx=0,ry=0,rz=0)=>{const g=shape.index?shape.toNonIndexed():shape;if(g!==shape)shape.dispose();g.deleteAttribute('uv');g.rotateX(rx);g.rotateY(ry);g.rotateZ(rz);g.translate(x,y,z);const c=new THREE.Color(color),colors=new Float32Array(g.getAttribute('position').count*3);for(let i=0;i<colors.length;i+=3){colors[i]=c.r;colors[i+1]=c.g;colors[i+2]=c.b;}g.setAttribute('color',new THREE.BufferAttribute(colors,3));parts.push(g);};
  // Lathe profile (radius, axial offset) from the inner bead around the tread to the outer bead.
  const profile:[number,number][]=[[.255,-.116],[.32,-.128],[.356,-.12],[.37,-.098],[.37,-.06],[.363,-.055],[.363,-.045],[.37,-.04],[.37,0],[.363,.005],[.363,.015],[.37,.02],[.37,.06],[.363,.065],[.363,.075],[.37,.08],[.37,.098],[.356,.12],[.32,.128],[.255,.116]];
  // Software rendering keeps the rounded sidewall but drops the tread grooves.
  const simple:[number,number][]=[[.255,-.116],[.34,-.128],[.37,-.09],[.37,.09],[.34,.128],[.255,.116]];
  const tyre=new THREE.LatheGeometry((software?simple:profile).map(([r,a])=>new THREE.Vector2(r,a)),segments);
  add(tyre,0x1a1d1f,0,0,0,0,0,-Math.PI/2);
  // Sidewall lettering band.
  if(!software)add(new THREE.TorusGeometry(.31,.005,3,segments),0x3a3f42,.129,0,0,0,Math.PI/2);
  // Rim barrel and lip.
  add(new THREE.CylinderGeometry(.254,.254,.22,segments,1,true),0x3b4144,0,0,0,0,0,Math.PI/2);
  add(new THREE.TorusGeometry(.249,.011,software?3:4,segments),rimTone,.114,0,0,0,Math.PI/2);
  // Ventilated brake disc and hub.
  add(new THREE.CylinderGeometry(.205,.205,.024,segments),0x7d868a,.02,0,0,0,0,Math.PI/2);
  add(new THREE.CylinderGeometry(.11,.11,.03,segments),0x4b5256,.035,0,0,0,0,Math.PI/2);
  const spoke=(angle:number,inner:number,outer:number,width:number,depthIn:number,depthOut:number,thickness=.03)=>{
    const length=outer-inner,g=new THREE.BoxGeometry(thickness,length,width);
    g.translate(0,inner+length/2,0);
    // Concave face: the hub sits deeper than the rim.
    const p=g.getAttribute('position');for(let i=0;i<p.count;i++){const t=(p.getY(i)-inner)/length;p.setX(i,p.getX(i)+depthIn+(depthOut-depthIn)*t);}
    g.computeVertexNormals();add(g,rimTone,0,0,0,angle);
  };
  const rim=style.rims;
  if(rim===0)for(let i=0;i<5;i++)spoke(i*Math.PI*2/5,.05,.25,.07,.095,.112);
  else if(rim===1)for(let i=0;i<10;i++)spoke(i*Math.PI/5,.05,.25,.026,.09,.112,.024);
  else if(rim===2)for(let i=0;i<5;i++){const a=i*Math.PI*2/5;spoke(a,.05,.16,.06,.09,.104);spoke(a+.2,.15,.25,.034,.104,.112);spoke(a-.2,.15,.25,.034,.104,.112);}
  else{
    add(new THREE.RingGeometry(.19,.25,segments),rimTone,.118,0,0,0,Math.PI/2);
    add(new THREE.CylinderGeometry(.19,.19,.06,segments,1,true),0x6b7377,.088,0,0,0,0,Math.PI/2);
    for(let i=0;i<6;i++)spoke(i*Math.PI/3,.05,.195,.05,.05,.06);
  }
  // Centre cap and lug nuts.
  add(new THREE.CylinderGeometry(.052,.056,.03,software?8:14),rimTone,.11,0,0,0,0,Math.PI/2);
  add(new THREE.CylinderGeometry(.03,.03,.034,software?8:14),0x20262a,.112,0,0,0,0,Math.PI/2);
  if(!software)for(let i=0;i<5;i++){const a=i*Math.PI*2/5+.3;add(new THREE.CylinderGeometry(.011,.011,.03,6),0xd3d7d4,.104,Math.cos(a)*.075,Math.sin(a)*.075,0,0,Math.PI/2);}
  const merged=mergeGeometries(parts,false)!;parts.forEach(p=>p.dispose());merged.computeBoundingSphere();return merged;
}

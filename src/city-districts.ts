import * as THREE from 'three';
import { CITY_BUILDINGS, CITY_SPACES, CITY_STREETS, nearestStreet, type CityBuilding } from './city-map';
import { CityArt, pathLength, samplePath } from './city-art';
import type { SurfaceLibrary, SurfaceMaterial } from './surface-materials';
import { WORLD_LANDMARKS } from './world-layout';
import { CITY_ACCESS_CLEARANCES,CITY_BENCH_PLACEMENTS,CITY_PLACEMENT_CONTEXT,CITY_STREET_SIGN_PLACEMENTS,canPlaceDecoration,findStreetDecoration,type DecorationFootprint } from './city-placement';

const HOME_COLORS=[0xe4c8a4,0xb8cbb5,0xd4ada1,0xb7c9ce,0xd3c692];
const SHOP_NAMES=['PALM MARKET','CAFE AZUL','COAST RECORDS','SUNDOWN HOTEL','LA FLOR','NOVA STUDIO'];

/** Districts differ in silhouette and street detail while sharing materials and batches. */
export class CityDistrictsView {
  readonly art:CityArt;
  readonly occluders:THREE.Mesh[]=[];
  private readonly placed:DecorationFootprint[]=[...CITY_BENCH_PLACEMENTS,...CITY_STREET_SIGN_PLACEMENTS];
  get group(){return this.art.group;}
  constructor(software:boolean,surfaces:SurfaceLibrary){
    this.art=new CityArt(software,surfaces);this.group.name='city-districts';
    CITY_BUILDINGS.forEach((building,index)=>this.building(building,index));
    this.landscaping();this.publicFurniture();
    this.landmarkSigns();
    this.art.finish();
  }
  private body(w:number,h:number,d:number,material:SurfaceMaterial,x:number,z:number,y=h/2+.18){
    const mesh=this.art.box(w,h,d,material,x,y,z);this.occluders.push(mesh);return mesh;
  }
  private building(b:CityBuilding,index:number){
    const art=this.art,{surfaces}=art,w=b.halfX*2-.75,d=b.halfZ*2-.75,h=b.height,roof=surfaces.roof,trim=surfaces.concrete;
    art.box(w+.2,.25,d+.2,trim,b.x,.055,b.z);
    const brick=art.tinted(surfaces.brick,index%2?0xcfc1ad:0xe2c9b1),pastel=art.tinted(surfaces.stucco,HOME_COLORS[index%HOME_COLORS.length]);
    const facade=b.district==='port'?art.tinted(surfaces.stucco,0xb9c2b8):b.district==='financial'?surfaces.office:b.district==='westwood'?pastel:art.tinted(surfaces.stucco,HOME_COLORS[index%HOME_COLORS.length]);
    if(b.style==='tower'||b.style==='office'){
      const podium=b.style==='tower'?5.3:Math.min(4,h*.25),towerW=b.style==='tower'?w*.76:w,towerD=b.style==='tower'?d*.78:d;
      this.body(w,podium,d,trim,b.x,b.z);this.body(towerW,h-podium,towerD,surfaces.office,b.x,b.z,podium+(h-podium)/2+.18);
      if(b.style==='tower'){
        this.body(towerW*.78,Math.max(2,h*.13),towerD*.8,surfaces.office,b.x,b.z,h+h*.065+.18);
        art.box(towerW+.22,.28,towerD+.22,trim,b.x,h+.3,b.z);
        art.instance('cylinder',art.material(0x9aaba7),b.x,h+h*.13+3,b.z,.12,5,.12);
      }
      for(let x=-towerW/2+2;x<towerW/2;x+=3.7)for(const side of[-1,1])art.instance('box',art.material(0x94a9aa),b.x+x,podium+(h-podium)/2,b.z+side*(towerD/2+.025),.08,h-podium,.08);
      art.box(w+.12,.32,d+.12,trim,b.x,podium+.2,b.z);
      this.storefront(b,w,d,'AETHER  /  FINANCIAL',index);
    }else if(b.style==='townhouse'){
      const count=w>17?3:2,unit=w/count;
      for(let home=0;home<count;home++){
        const x=b.x-w/2+unit*(home+.5),height=h+(home%2)*.6,color=art.tinted(surfaces.stucco,HOME_COLORS[(index+home)%HOME_COLORS.length]);
        this.body(unit-.12,height,d,color,x,b.z);
        this.gable(x,height+.2,b.z,unit-.06,d+.1,2.2,art.tinted(roof,home%2?0x8b8b80:0xad8c77));
        this.door(x,b.z+d/2,height,unit,index+home);
        if(unit>4.2)for(const side of[-1,1])this.window(x+side*unit*.27,Math.min(4.7,height-1.3),b.z+d/2+.03,1.1,1.65,0,index+home);
      }
      this.windows(b,w,d,h,index,4.5);
    }else if(b.style==='villa'){
      this.body(w,h,d,pastel,b.x,b.z);
      this.gable(b.x,h+.25,b.z,w+.1,d+.1,2.8,art.tinted(roof,0xb7977b));
      const front=b.z+d/2;
      art.box(w*.7,.22,.8,trim,b.x,3.3,front+.12);
      for(const side of[-1,1])art.instance('cylinder',trim,b.x+side*w*.3,1.65,front+.3,.22,3.1,.22);
      this.door(b.x,front+.025,h,w,index);this.windows(b,w,d,h,index,4.2);

    }else if(b.style==='warehouse'||b.style==='workshop'){
      const industrial=art.tinted(surfaces.stucco,[0xb8c4bd,0xcbbca3,0xa4b8bb][index%3]);this.body(w,h,d,industrial,b.x,b.z);
      if(b.style==='warehouse'){
        // Repeating asymmetric roof lights make the port recognisable at street level.
        const teeth=Math.max(2,Math.floor(w/6)),span=w/teeth;
        for(let i=0;i<teeth;i++){const x=b.x-w/2+span*(i+.5);this.gable(x,h+.17,b.z,span-.06,d+.1,1.7,roof);art.instance('box',surfaces.windowGlass,x+span*.28,h+.85,b.z, .08,1.1,d*.78);}
      }else this.gable(b.x,h+.18,b.z,w+.1,d+.1,1.7,roof);
      const doors=Math.max(1,Math.floor(w/7));
      for(let i=0;i<doors;i++){
        const x=b.x+(i-(doors-1)/2)*6.5,z=b.z+d/2+.035;
        art.instance('box',art.material(0x5c7073),x,2.1,z,5.2,3.8,.08);
        for(let rib=0;rib<7;rib++)art.instance('box',art.material(0x91a19d),x,.55+rib*.48,z+.06,5,.045,.045);
        for(const side of[-1,1])art.instance('cylinder',art.material(0xcbad59),x+side*2.8,.68,z+.6,.19,1.1,.19);
      }
      art.sign(b.style==='warehouse'?'NELSON  /  FREIGHT':'HARBOR WORKS',b.x,h-1,b.z+d/2+.09,Math.min(13,w*.8),1.05,0,'#ebd7ad','#344b52');
      this.roofServices(b,w,d,h,index);
    }else if(b.style==='hotel'){
      this.body(w,h,d,facade,b.x,b.z);
      // Long balconies, stepped parapets and a vertical sign give seaside blocks a distinct profile.
      for(let y=4.4;y<h-1;y+=3.2){
        art.box(w+.15,.16,.85,trim,b.x,y,b.z+d/2-.25);
        art.instance('box',art.material(0x83a8a7),b.x,y+.5,b.z+d/2+.12,w-.5,.65,.07);
      }
      art.box(w*.7,1.6,d*.75,facade,b.x,h+.8,b.z);art.box(w*.42,.9,d*.5,trim,b.x,h+2.05,b.z);
      art.sign(index%2?'SEABREEZE':'PALM HOTEL',b.x-w*.31,h*.66,b.z+d/2+.2,2.4,5.6,0,'#ffddae','#426b70');
      this.windows(b,w,d,h,index,3.7);this.storefront(b,w,d,'OCEAN  /  LOUNGE',index);
    }else if(b.style==='courtyard'){
      this.body(w,3.3,d,brick,b.x,b.z);
      for(const side of[-1,1])this.body(w*.26,h-3.3,d,brick,b.x+side*w*.37,b.z,3.48+(h-3.3)/2);
      this.body(w*.49,h-3.3,d*.3,brick,b.x,b.z-d*.35,3.48+(h-3.3)/2);
      art.box(w+.12,.28,d+.12,trim,b.x,3.65,b.z);for(const side of[-1,1])this.windows({...b,x:b.x+side*w*.37},w*.26,d,h,index,3.8);this.windows({...b,z:b.z-d*.35},w*.49,d*.3,h,index,3.8);this.storefront(b,w,d,SHOP_NAMES[index%SHOP_NAMES.length],index);
      this.roofServices(b,w,d,3.6,index);
    }else{
      this.body(w,h,d,facade,b.x,b.z);art.box(w+.18,.32,d+.18,trim,b.x,h+.28,b.z);
      this.windows(b,w,d,h,index,b.district==='westwood'?4.5:3.9);
      this.storefront(b,w,d,SHOP_NAMES[index%SHOP_NAMES.length],index);
      if(b.style==='shop')this.awning(b.x,b.z+d/2+.2,w*.8,3.4,index);
      this.roofServices(b,w,d,h,index);
    }
    this.facadeDetails(b,w,d,index);
  }
  private gable(x:number,y:number,z:number,w:number,d:number,rise:number,material:SurfaceMaterial){
    const positions=[-w/2,0,-d/2,w/2,0,-d/2,0,rise,-d/2,-w/2,0,d/2,0,rise,d/2,w/2,0,d/2,-w/2,0,-d/2,0,rise,-d/2,0,rise,d/2,-w/2,0,-d/2,0,rise,d/2,-w/2,0,d/2,w/2,0,-d/2,w/2,0,d/2,0,rise,d/2,w/2,0,-d/2,0,rise,d/2,0,rise,-d/2];
    for(let i=0;i<positions.length;i+=9)for(let axis=0;axis<3;axis++){const swap=positions[i+3+axis];positions[i+3+axis]=positions[i+6+axis];positions[i+6+axis]=swap;}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(positions.flatMap((_,i)=>i%3===0?[positions[i]/8,positions[i+2]/8]:[]),2));geometry.computeVertexNormals();this.art.mesh(geometry,material,x,y,z);
  }
  private door(x:number,z:number,_height:number,width:number,index:number){
    const art=this.art;art.instance('box',art.material(index%2?0x49646a:0x685c50),x,1.45,z,Math.min(1.5,width*.25),2.6,.1);art.instance('box',art.surfaces.concrete,x,.21,z+.3,Math.min(2.2,width*.4),.2,.6);
  }
  private storefront(b:CityBuilding,w:number,d:number,name:string,index:number){
    const art=this.art,z=b.z+d/2+.045;this.door(b.x,z,b.height,w,index);
    for(const side of[-1,1])art.instance('box',art.surfaces.windowGlass,b.x+side*w*.29,1.75,z,Math.max(1,w*.24),2.35,.08);
    art.box(w*.85,.2,.8,art.surfaces.roof,b.x,3.3,z+.15);art.sign(name,b.x,4.12,z+.1,Math.min(12,w*.82),.85,0,b.district==='port'?'#e7d0a3':'#e7e6cf');
  }
  private facadeDetails(b:CityBuilding,w:number,d:number,index:number){
    const art=this.art,metal=art.material(0x667a77),dark=art.material(0x31474b),trim=art.surfaces.concrete,z=b.z+d/2+.12;
    const protectedFront=CITY_ACCESS_CLEARANCES.some(access=>Math.abs(access.x-b.x)<b.halfX+1&&Math.abs(access.z-z)<4);
    if(!protectedFront){
      // Flush entrance fittings add depth while preserving every doorway's clear floor area.
      const doorWidth=Math.min(1.5,w*.25);
      for(const side of[-1,1])art.instance('box',metal,b.x+side*(doorWidth/2+.09),1.46,z,.12,2.75,.12);
      art.instance('box',metal,b.x,2.86,z,doorWidth+.3,.13,.12);
      art.instance('box',art.surfaces.windowGlass,b.x,2.53,z+.025,doorWidth-.12,.42,.08);
      art.instance('box',art.material(0xb8bca5),b.x+doorWidth*.3,1.35,z+.08,.055,.54,.08);
      art.instance('box',dark,b.x,.4,z+.055,doorWidth-.1,.32,.08);
      art.instance('box',art.material(0xe7d4ac,0x7b5627),b.x,3.02,z+.12,.66,.07,.2);
      if(b.style==='villa'||b.style==='townhouse'){
        art.instance('box',metal,b.x+doorWidth/2+.34,1.3,z+.07,.23,.34,.11);
        art.instance('box',art.material(0xbaad88),b.x-doorWidth/2-.43,1.22,z+.09,.5,.37,.13);
      }else{
        const glassSpan=Math.max(1,w*.24);
        for(const side of[-1,1]){
          const x=b.x+side*w*.29;
          for(const edge of[-1,1])art.instance('box',metal,x+edge*glassSpan/2,1.77,z,.075,2.38,.12);
          art.instance('box',metal,x,1.74,z+.02,.065,2.3,.13);
          art.instance('box',metal,x,.62,z,glassSpan,.12,.14);
          art.instance('box',art.material(b.district==='financial'?0x809a9a:0xa39173),x,.35,z-.04,glassSpan,.42,.12);
        }
        if(b.district!=='port')art.sign(b.district==='financial'?'RECEPTION':index%2?'OPEN  /  WELCOME':'CAFE  /  LOCAL',b.x+w*.29,1.8,z+.07,Math.min(2.5,glassSpan*.8),.44,0,'#eee0b7','#354f56');
      }
    }
    // District services are mounted above head height, never on a walking route.
    const unitX=b.x+w/2+.22,unitZ=b.z-d*.18;
    if(b.district==='westwood'||b.district==='port'||b.style==='hotel'){
      art.instance('box',art.material(0xb2bab0),unitX,3.9,unitZ,.48,.82,1.2);
      art.instance('sphere',dark,unitX+.25,3.9,unitZ,.035,.55,.55);
      if(!art.software)for(let slat=0;slat<5;slat++)art.instance('box',metal,unitX+.26,3.64+slat*.13,unitZ+.36,.025,.035,.35);
      art.instance('box',metal,unitX-.1,3.4,unitZ,.52,.075,1.32);
    }
    const pipeX=b.x-w/2+.23;
    art.instance('cylinder',metal,pipeX,Math.min(b.height,9)/2+.4,b.z-d/2-.07,.09,Math.min(b.height,9),.09);
    if(b.district==='port'){
      for(const side of[-1,1])for(let stripe=0;stripe<6;stripe++)art.instance('box',art.material(stripe%2?0xd4b55f:0x36474a),b.x+side*Math.min(w*.4,5.5),.5+stripe*.38,z+.04,.22,.3,.09);
      art.sign(index%2?'BAY 02':'BAY 01',b.x-w*.32,3.25,z+.02,2,.55,0,'#e5d5a4','#4b5d5b');
    }else if(b.district==='financial'){
      for(const side of[-1,1])art.instance('box',metal,b.x+side*(w/2-.4),1.9,z-.05,.22,3.4,.16);
      art.instance('box',art.material(0xb2c6c1),b.x,3.2,z+.11,Math.min(w*.72,12),.09,.45);
    }else if(b.district==='south-bay'){
      for(const side of[-1,1]){
        art.instance('box',art.material(0x9cae8b),b.x+side*w*.38,2.9,z+.04,.42,.32,.19);
        art.instance('sphere',art.material(0x668866),b.x+side*w*.38,3.16,z+.04,.58,.4,.29);
      }
    }
  }
  private window(x:number,y:number,z:number,w:number,h:number,rotation:number,index:number){
    const art=this.art,material=index%6===0?art.surfaces.litWindow:art.surfaces.windowGlass;
    if(!art.software)art.instance('box',art.material(0x687674),x,y,z,w+.19,h+.19,.07,rotation);
    art.instance(art.software?'plane':'box',material,x+Math.sin(rotation)*.055,y,z+Math.cos(rotation)*.055,w,h,.07,rotation);
  }
  private windows(b:CityBuilding,w:number,d:number,h:number,index:number,spacing:number,zOffset=0){
    for(let y=5.2;y<h-1;y+=3.4)for(const side of[0,1,2,3]){
      const span=side%2?d:w;
      for(let offset=-span/2+2.2;offset<span/2-1.2;offset+=spacing){
        const x=side===1?b.x+w/2+.03:side===3?b.x-w/2-.03:b.x+offset,z=(side===0?b.z+d/2+.03:side===2?b.z-d/2-.03:b.z+offset)+zOffset;
        this.window(x,y,z,Math.min(1.45,spacing*.48),1.85,side*Math.PI/2,index+side+Math.round(offset+y));
      }
    }
  }
  private awning(x:number,z:number,w:number,y:number,index:number){
    const art=this.art,cloth=art.material(index%2?0x689c91:0xb88670);art.box(w,.17,1.6,cloth,x,y,z+.6);
    for(let offset=-w/2;offset<w/2;offset+=.9)art.instance('box',art.material(0xe6dbc1),x+offset+.25,y+.025,z+.6,.37,.19,1.58);
    art.instance('box',cloth,x,y-.22,z+1.35,w,.45,.1);
  }
  private roofServices(b:CityBuilding,w:number,d:number,h:number,index:number){
    const art=this.art,metal=art.material(0x87938e);
    art.box(Math.min(3.6,w*.25),1,Math.min(2.8,d*.23),art.surfaces.roof,b.x+w*.2,h+.7,b.z-d*.18);
    art.instance('cylinder',metal,b.x-w*.22,h+.58,b.z+d*.14,.8,.7,.8);
    if(index%5===0&&h>11){art.instance('box',metal,b.x,h+1.8,b.z,.12,3,.12);art.instance('box',metal,b.x,h+2.4,b.z,3,.07,.07);}
  }
  private fence(x:number,z:number,width:number,hedge:boolean){
    const art=this.art,material=art.material(hedge?0x5b7351:0xc7c8b1);
    for(const side of[-1,1]){
      const center=x+side*(width/4+1),span=Math.max(1,width/2-2.3);
      if(!this.reserve({x:center,z,width:span+.1,depth:.14}))continue;
      for(const height of[.55,1.08])art.instance('box',material,center,height,z,span,.1,.1);
      for(let offset=-span/2;offset<=span/2;offset+=1.1)art.instance('box',material,center+offset,.7,z,.09,1.4,.1);
    }
  }
  private tree(x:number,z:number,seed:number,palm=false){
    const art=this.art,height=palm?7.8+seed%3:4.7+seed%3;
    art.instance('cylinder',art.surfaces.bark,x,height*.47,z,palm?.38:.46,height*.94,palm?.38:.46);
    if(palm){
      const positions:number[]=[];
      for(let leaf=0;leaf<7;leaf++){const angle=leaf/7*Math.PI*2,dx=Math.cos(angle),dz=Math.sin(angle),px=-dz,pz=dx;positions.push(0,height,0,dx*1.8+px*.55,height+.35,dz*1.8+pz*.55,dx*3.7,height-1.1,dz*3.7,0,height,0,dx*3.7,height-1.1,dz*3.7,dx*1.8-px*.55,height+.35,dz*1.8-pz*.55);}
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();const material=art.material(0x527e63);material.side=THREE.DoubleSide;art.mesh(geometry,material,x,0,z);
    }else{
      const leaves=art.material(seed%2?0x657d54:0x587353);
      art.instance('sphere',leaves,x,height*.86,z,3.8+(seed%3)*.4,3.1,3.8);art.instance('sphere',leaves,x+.8,height*.9,z+.4,2.7,3,2.8);
    }
  }
  private landscaping(){
    let seed=0;
    for(const street of CITY_STREETS){
      if(street.kind==='alley'||street.kind==='service'||street.sidewalkWidth<1.5)continue;
      const length=pathLength(street.points),step=street.district==='port'?42:24;
      for(let distance=12;distance<length-8;distance+=step){const point=samplePath(street.points,distance),side=seed++%2?1:-1,offset=street.width/2+Math.max(street.sidewalkWidth*.92,street.sidewalkWidth*.52+.82),x=point.x-point.dz*offset*side,z=point.z+point.dx*offset*side;
        if(this.reserve({x,z,width:.7,depth:.7}))this.tree(x,z,seed,street.district==='south-bay'||street.district==='downtown');
      }
    }
    for(const space of CITY_SPACES){
      if(space.kind!=='park'&&space.kind!=='plaza')continue;
      if(space.kind==='park'&&space.district==='westwood'){const minX=Math.min(...space.points.map(p=>p.x)),maxX=Math.max(...space.points.map(p=>p.x)),maxZ=Math.max(...space.points.map(p=>p.z));this.fence((minX+maxX)/2,maxZ-.25,maxX-minX-1,false);}
      for(let index=0;index<space.points.length;index++){
        const point=space.points[index],center=space.points.reduce((sum,p)=>({x:sum.x+p.x/space.points.length,z:sum.z+p.z/space.points.length}),{x:0,z:0}),x=point.x*.82+center.x*.18,z=point.z*.82+center.z*.18;
        if(this.reserve({x,z,width:.7,depth:.7}))this.tree(x,z,seed++,space.district==='south-bay');
      }
    }
    // The original square retains its fountain and open cross paths.
    const art=this.art,x=-20,z=-20;
    art.box(25,.035,2.3,art.surfaces.pavers,x,.095,z);art.box(2.3,.035,25,art.surfaces.pavers,x,.096,z);
    art.mesh(new THREE.CylinderGeometry(3.8,4.1,.65,20),art.surfaces.concrete,x,.5,z);
    art.mesh(new THREE.CylinderGeometry(3.4,3.4,.1,20),art.material(0x86bbb8),x,.87,z);
    art.mesh(new THREE.CylinderGeometry(.2,.6,1.7,8),art.material(0xc7d5c7),x,1.55,z);
  }
  private publicFurniture(){
    const art=this.art,metal=art.material(0x4e6465),wood=art.material(0xa48b69);let seed=0;
    for(const bench of CITY_BENCH_PLACEMENTS){
      const {x,z,rotation=0}=bench,tx=Math.cos(rotation),tz=-Math.sin(rotation),nx=Math.sin(rotation),nz=Math.cos(rotation);
      // Narrow timber slats and separate steel supports remain inside the tested OBB.
      for(const offset of[-.27,-.09,.09,.27])art.instance('box',wood,x+nx*offset,.77,z+nz*offset,2.8,.12,.12,rotation);
      for(const y of[1,1.21])art.instance('box',wood,x+nx*.32,y,z+nz*.32,2.8,.14,.1,rotation);
      for(const side of[-1,1]){
        art.instance('box',metal,x+tx*side*1.05,.42,z+tz*side*1.05,.12,.72,.65,rotation);
        art.instance('box',metal,x+tx*side*1.05,.98,z+tz*side*1.05,.1,.12,.6,rotation);
      }
      const bin={x:x+tx*2.45,z:z+tz*2.45,width:.65,depth:.65};
      if(this.reserve(bin)){
        art.instance('cylinder',metal,bin.x,.55,bin.z,.57,.95,.57);
        art.instance('cylinder',art.material(0x2c4144),bin.x,1.04,bin.z,.62,.09,.62);
        for(let rib=0;rib<6;rib++){const angle=rib/6*Math.PI*2;art.instance('box',art.material(0x82928b),bin.x+Math.cos(angle)*.27,.55,bin.z+Math.sin(angle)*.27,.035,.8,.035);}
      }
      seed++;
    }
    // Containers occupy the loading yard edges, leaving a broad approach through its centre.
    for(const space of CITY_SPACES.filter(space=>space.kind==='loading')){
      const minX=Math.min(...space.points.map(p=>p.x)),maxX=Math.max(...space.points.map(p=>p.x)),maxZ=Math.max(...space.points.map(p=>p.z));
      for(let x=minX+3;x<maxX-2;x+=5.5){
        const z=maxZ-3;if(!this.reserve({x,z,width:4.4,depth:5.3}))continue;art.box(4.4,2.35,5.3,art.material(seed++%2?0x8c9f99:0xac8266),x,1.4,z);
        for(let rib=0;rib<7;rib++)art.instance('box',metal,x-1.9+rib*.62,1.4,z+2.68,.065,2.2,.08);
        if(this.reserve({x,z:z-4,width:1.5,depth:1.3}))art.instance('box',wood,x,.19,z-4,1.5,.28,1.3);
      }
    }
    for(const district of['financial','port','south-bay'] as const){const b=CITY_BUILDINGS.find(building=>building.district===district);if(!b)continue;const y=b.height+4;for(const side of[-1,1])art.instance('box',metal,b.x+side*3.7,y-2,b.z,.18,4,.18);art.box(10,3,.3,metal,b.x,y,b.z);art.sign(district==='port'?'NELSON FREIGHT':district==='financial'?'AETHER / TOMORROW':'WELCOME TO SOUTH BAY',b.x,y,b.z+.17,9.6,2.6,0,'#efe2bd',district==='port'?'#724f41':'#315866');}
  }
  private reserve(footprint:DecorationFootprint){
    if(!canPlaceDecoration(footprint,{...CITY_PLACEMENT_CONTEXT,occupied:this.placed},{walkingPadding:.45}))return false;
    this.placed.push(footprint);return true;
  }
  private landmarkSigns(){
    for(const landmark of WORLD_LANDMARKS){
      const road=nearestStreet(landmark.point);if(!road)continue;
      let distance=0;for(let index=1;index<=road.segment;index++)distance+=Math.hypot(road.street.points[index].x-road.street.points[index-1].x,road.street.points[index].z-road.street.points[index-1].z);
      const a=road.street.points[road.segment],b=road.street.points[road.segment+1];distance+=Math.hypot(b.x-a.x,b.z-a.z)*road.t;
      const placement=findStreetDecoration(road.street,distance,8,.2,{occupied:this.placed});if(!placement)continue;
      this.placed.push(placement);const {x,z,rotation=0}=placement;
      for(const side of[-1,1])this.art.instance('cylinder',this.art.material(0x506a66),x+Math.cos(rotation)*side*2.8,1.55,z-Math.sin(rotation)*side*2.8,.12,3.1,.12);
      this.art.sign(landmark.name.toUpperCase(),x,3.25,z,8,1,rotation,'#e8e5cf');
    }
  }
  destroy(){this.art.destroy();}
}

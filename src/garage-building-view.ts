import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CityArt } from './city-art';
import { CITY_BUILDINGS } from './city-map';
import { GARAGE_BUILDING } from './garage-building';
import type { GameState, Point } from './model';
import type { SurfaceLibrary, SurfaceMaterial } from './surface-materials';

const SECTIONS=7;
const unit=(value:number)=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));

/** Sections follow a vertical rail, a rounded corner, then the ceiling rail. */
export function garageDoorPanelPose(index:number,openness:number){
  const height=GARAGE_BUILDING.doorHeight/SECTIONS;
  const travel=height*(Math.max(0,Math.min(SECTIONS-1,index))+.5)+unit(openness)*GARAGE_BUILDING.doorHeight;
  const turnAt=GARAGE_BUILDING.doorHeight,radius=.4,corner=Math.PI*radius/2;
  if(travel<=turnAt)return{y:travel,z:GARAGE_BUILDING.frontZ,rotation:0};
  const after=travel-turnAt;
  if(after<corner){const angle=after/radius;return{y:turnAt+radius*Math.sin(angle),z:GARAGE_BUILDING.frontZ-radius*(1-Math.cos(angle)),rotation:-angle};}
  return{y:turnAt+radius,z:GARAGE_BUILDING.frontZ-radius-(after-corner),rotation:-Math.PI/2};
}

/** The workshop occupies its real city parcel; only its overhead cover is cut away. */
export class GarageBuildingView {
  readonly group=new THREE.Group();
  readonly occluders:THREE.Mesh[]=[];
  private readonly art:CityArt;
  private readonly upper=new THREE.Group();
  private readonly upperOccluders:THREE.Mesh[]=[];
  private readonly sections:THREE.Mesh[]=[];
  private readonly sharedMaterials:Set<THREE.Material>;
  private readonly textures=new Set<THREE.Texture>();
  private readonly gateMaterial:THREE.MeshLambertMaterial|THREE.MeshStandardMaterial;
  private readonly light:THREE.PointLight|null;
  private current={openness:0,inside:false,cutaway:false};

  constructor(private readonly software:boolean,surfaces:SurfaceLibrary){
    this.group.name='MOD SHOP · enterable workshop';
    this.sharedMaterials=new Set([...surfaces.facades,surfaces.asphalt,surfaces.concrete,surfaces.pavers,surfaces.roof,surfaces.grass,surfaces.sand,surfaces.bark,surfaces.windowGlass,surfaces.litWindow]);
    this.art=new CityArt(software,surfaces);this.group.add(this.art.group,this.upper);
    const b=GARAGE_BUILDING,lot=CITY_BUILDINGS.find(building=>building.x===b.x&&building.z===b.z)!;
    const height=lot.height,trim=surfaces.concrete,wall=this.art.tinted(surfaces.brick,0xc6b3a0),dark=this.art.material(0x263b43),metal=this.art.material(0x7d8d8c),mint=this.art.material(0x8fe6d6,0x427c70);
    for(const collider of b.wallColliders)this.wall(collider.halfX*2,height,collider.halfZ*2,wall,collider.x,height/2+.08,collider.z);
    const upperBody=this.wall(b.bayHalfX*2,height-b.ceilingHeight,b.frontZ-b.backZ,wall,b.x,b.ceilingHeight+(height-b.ceilingHeight)/2,(b.frontZ+b.backZ)/2,this.upper);
    upperBody.name='Workshop upper floors · cutaway';
    this.wall(24.2,.28,24.6,trim,b.x,height+.25,b.z,this.upper);
    this.wall(b.bayHalfX*2,.18,b.frontZ-b.backZ,trim,b.x,b.ceilingHeight,(b.frontZ+b.backZ)/2,this.upper);
    // A flush apron and floor preserve the road-to-door vehicle clearance.
    this.art.box(9,.045,17.5,trim,b.x,.083,64.25);
    this.art.box(9,.025,3.1,surfaces.asphalt,b.x,.092,b.frontZ+1.45);
    for(const side of[-1,1]){
      this.art.box(.18,b.ceilingHeight,.24,metal,b.x+side*(b.bayHalfX-.03),b.ceilingHeight/2,b.frontZ+.05);
      this.art.instance('box',dark,b.x+side*4.24,1.2,64.5,.13,2.35,15.3);
      for(let stripe=0;stripe<6;stripe++)this.art.instance('box',this.art.material(stripe%2?0xe4bd5e:0x293d43),b.x+side*4.39,.28+stripe*.38,b.frontZ+.2,.16,.26,.09);
      // Parallel steel rails make the retracting sectional door's path visible.
      this.art.instance('box',metal,b.x+side*4.29,4.16,70.65,.075,.075,3.9);
      this.art.instance('box',metal,b.x+side*4.29,2.05,b.frontZ+.13,.075,4.1,.075);
      this.art.instance('box',mint,b.x+side*5.25,2.1,b.frontZ+.09,.12,4.1,.12);
    }
    this.wall(11,.6,.45,dark,b.x,4.1,b.frontZ+.36,this.upper);
    this.frontSign();
    for(const side of[-1,1])for(let y=8.8;y<height-1;y+=3.6){
      for(let offset=0;offset<2;offset++)this.art.instance('plane',surfaces.windowGlass,b.x+side*(6.7+offset*2.5),y,b.frontZ+.025,1.5,1.9,1);
      this.art.instance('box',trim,b.x+side*8.2,y-1.1,b.frontZ+.045,7.1,.16,.2);
    }
    for(let y=8.8;y<height-1;y+=3.6)for(const x of[-2.8,0,2.8]){
      const window=new THREE.Mesh(new THREE.PlaneGeometry(1.5,1.9),surfaces.windowGlass);window.position.set(b.x+x,y,b.frontZ+.03);this.upper.add(window);
    }
    this.interior(surfaces);
    this.art.finish();
    this.gateMaterial=software?new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true}):new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.52,metalness:.32});
    const panelGeometry=this.panelGeometry();
    for(let index=0;index<SECTIONS;index++){
      const panel=new THREE.Mesh(panelGeometry,this.gateMaterial);panel.name=`Workshop door section ${index+1}`;panel.castShadow=!software;panel.receiveShadow=true;panel.userData.garageDoor=true;this.group.add(panel);this.sections.push(panel);this.occluders.push(panel);
    }
    this.light=software?null:new THREE.PointLight(0xdcece5,0,17,2);
    if(this.light){this.light.position.set(b.x,3.85,63);this.light.castShadow=false;this.group.add(this.light);}
    this.updateGate(0);this.group.updateMatrixWorld(true);
  }

  get snapshot(){return{...this.current};}
  private wall(w:number,h:number,d:number,material:SurfaceMaterial,x:number,y:number,z:number,parent:THREE.Group=this.group){
    const mesh=this.art.mesh(new THREE.BoxGeometry(w,h,d),material,x,y,z,parent);mesh.castShadow=!this.software;this.occluders.push(mesh);if(parent===this.upper)this.upperOccluders.push(mesh);return mesh;
  }
  private frontSign(){
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
    const context=canvas.getContext('2d')!;context.fillStyle='#142c36';context.fillRect(0,0,1024,256);context.strokeStyle='#8cd8c8';context.lineWidth=5;context.strokeRect(10,10,1004,236);
    context.fillStyle='#c8f4e6';context.textAlign='center';context.textBaseline='middle';context.font='bold 126px Arial';context.fillText('MOD SHOP',512,104);
    context.fillStyle='#ead6ac';context.font='26px Arial';context.fillText('TUNING  /  LAKIER  /  NOWE AUTA',512,208);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;this.textures.add(texture);
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(13,3.25),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));sign.name='Workshop entrance sign · cutaway';sign.position.set(GARAGE_BUILDING.x,6.05,GARAGE_BUILDING.frontZ+.19);this.upper.add(sign);
  }
  private interior(surfaces:SurfaceLibrary){
    const art=this.art,b=GARAGE_BUILDING,metal=art.material(0x6e8386),dark=art.material(0x20363f),yellow=art.material(0xd5b764),white=art.material(0xd9e4d6,0x62766c),rubber=art.material(0x263138);
    // The empty centre is the drive-in service bay; furniture stays against its back and sides.
    art.box(7.5,.17,.85,metal,b.x,1.04,57);for(const side of[-1,1])art.instance('box',dark,b.x+side*3.25,.5,57,.14,1,.7);
    art.box(7.4,1.45,.09,dark,b.x,2.02,56.55);art.sign('SAPPHIRE MOTOR WORKS',b.x,3.18,56.64,6.6,.65,0,'#dbe7ce','#25454d');
    for(let index=0;index<7;index++){
      const x=b.x-2.8+index*.9;art.instance('box',index%2?yellow:metal,x,2.1,56.66,.085,.65,.07);art.instance('box',metal,x+.13,2.35,56.7,.3,.12,.1);
    }
    art.instance('box',art.material(0xa35949),b.x+2.45,1.38,57,.9,.5,.5);
    for(let level=0;level<4;level++){
      art.instance('cylinder',rubber,-23.4,.28+level*.28,58.7,.75,.25,.75);
      art.instance('cylinder',metal,-23.4,.415+level*.28,58.7,.3,.015,.3);
    }
    for(const side of[-1,1]){
      art.instance('box',yellow,b.x+side*2.05,.125,62,.12,.025,8.3);
      art.instance('box',yellow,b.x+side*1.57,.145,62,.2,.04,6.5);
      for(let at=0;at<3;at++)art.instance('box',white,b.x+side*2.65,4.04,59.6+at*4.1,.12,.06,2.15);
      for(let index=0;index<4;index++)art.instance('box',metal,b.x+side*4.3,2.1,59+index*3.4,.09,.025,1.8);
    }
    art.instance('box',yellow,b.x,.125,58.1,4.2,.025,.12);
    art.instance('box',yellow,b.x,.125,66.1,4.2,.025,.12);
    art.sign('G: TUNING  /  E: WYSIADZ',b.x,3.1,56.72,6.8,.5,0,'#ebdcb6','#263d45');
    art.box(.6,1.35,.45,art.material(0x9b554c),b.bayMinX+.38,.75,65.5);
    art.instance('cylinder',metal,b.bayMinX+.38,1.51,65.5,.32,.16,.32);
    // Soft local pools light the floor on software WebGL without adding light sources.
    const glow=new THREE.MeshBasicMaterial({color:0xbdded2,transparent:true,opacity:.075,depthWrite:false});
    const pool=new THREE.Mesh(new THREE.PlaneGeometry(8.1,14.9),glow);pool.rotation.x=-Math.PI/2;pool.position.set(b.x,.113,64.2);this.group.add(pool);
    const backPanel=new THREE.Mesh(new THREE.PlaneGeometry(8.8,3.8),new THREE.MeshBasicMaterial({color:0x5e7a76,transparent:true,opacity:.09,depthWrite:false}));backPanel.position.set(b.x,1.95,56.02);this.group.add(backPanel);
  }
  private panelGeometry(){
    const height=GARAGE_BUILDING.doorHeight/SECTIONS,parts:THREE.BufferGeometry[]=[];
    const add=(w:number,h:number,d:number,x:number,y:number,z:number,color:number)=>{
      const geometry=new THREE.BoxGeometry(w,h,d);geometry.translate(x,y,z);const tint=new THREE.Color(color),count=geometry.getAttribute('position').count,colors=new Float32Array(count*3);
      for(let index=0;index<count;index++){colors[index*3]=tint.r;colors[index*3+1]=tint.g;colors[index*3+2]=tint.b;}
      geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));parts.push(geometry);
    };
    add(GARAGE_BUILDING.bayHalfX*2-.16,height-.015,.14,0,0,0,0x788d90);
    for(const side of[-1,1]){add(8.5,.025,.035,0,side*height*.31,.085,0xa6b4ae);add(.09,.12,.035,side*4.2,0,.095,0x354c54);}
    const geometry=mergeGeometries(parts)!;parts.forEach(part=>part.dispose());return geometry;
  }
  private updateGate(openness:number){
    this.sections.forEach((panel,index)=>{const pose=garageDoorPanelPose(index,openness);panel.position.set(GARAGE_BUILDING.x,pose.y,pose.z);panel.rotation.x=pose.rotation;});
  }
  update(state:GameState,camera?:Point&{y?:number}){
    const b=GARAGE_BUILDING,openness=unit(state.garageGate?.openness??0),p=state.player;
    const inside=p.x>b.bayMinX&&p.x<b.bayMaxX&&p.z>b.backZ&&p.z<b.frontZ+1;
    const cameraNear=Boolean(camera&&camera.x>b.bayMinX-1&&camera.x<b.bayMaxX+1&&camera.z>b.backZ-1&&camera.z<b.frontZ+1);
    const cutaway=inside||cameraNear;
    this.upper.visible=!cutaway;
    for(const mesh of this.upperOccluders){if(cutaway)mesh.layers.disable(0);else mesh.layers.enable(0);}
    this.updateGate(openness);
    if(this.light)this.light.intensity=Math.hypot(p.x-b.x,p.z-64)<35?37:0;
    this.current={openness,inside,cutaway};this.group.updateMatrixWorld(true);
  }
  destroy(){
    this.art.destroy();const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
    this.group.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}});
    geometries.forEach(geometry=>geometry.dispose());
    // SurfaceLibrary owns the shared textured palette; dispose only local materials.
    for(const material of materials)if(!this.sharedMaterials.has(material))material.dispose();
    this.textures.forEach(texture=>texture.dispose());
    this.group.removeFromParent();this.group.clear();
  }
}

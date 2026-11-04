import * as THREE from 'three';
import { surfaceWeatherProfile, type SurfaceQuality, type SurfaceWeatherProfile } from './surface-weather';
export type { SurfaceQuality } from './surface-weather';

export type SurfaceMaterial=THREE.MeshStandardMaterial|THREE.MeshLambertMaterial;
type SurfaceKind='asphalt'|'concrete'|'pavers'|'roof'|'brick'|'stucco'|'office'|'sandstone'|'grass'|'sand'|'bark';
interface SurfaceMaps {color:THREE.CanvasTexture;normal?:THREE.CanvasTexture;roughness?:THREE.CanvasTexture;emission?:THREE.CanvasTexture}
type WeatherKind=SurfaceKind|'glass'|'lit';
interface WeatherMaterial {material:SurfaceMaterial;kind:WeatherKind;color:THREE.Color;normal:THREE.Texture|null;roughness:THREE.Texture|null;normalScale:number;dryRoughness:number}
const SIZE=512;
const clamp=(n:number)=>Math.max(0,Math.min(255,Math.round(n)));

/** Stable surface grain: city reloads never change the underlying building material. */
export function surfaceRandom(seed:number):()=>number {
  let state=seed>>>0;
  return()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
}

function canvas(){const result=document.createElement('canvas');result.width=result.height=SIZE;return result;}
function texture(source:HTMLCanvasElement,color=false,anisotropy=4){
  const map=new THREE.CanvasTexture(source);map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=Math.max(1,Math.min(8,anisotropy));
  map.minFilter=THREE.LinearMipmapLinearFilter;map.magFilter=THREE.LinearFilter;
  if(color)map.colorSpace=THREE.SRGBColorSpace;
  return map;
}

function grain(context:CanvasRenderingContext2D,base:readonly number[],variation:number,random:()=>number){
  const image=context.createImageData(SIZE,SIZE);
  for(let at=0;at<image.data.length;at+=4){const shift=(random()-.5)*variation,aggregate=random()<.018?(random()-.5)*variation*2:0;image.data[at]=clamp(base[0]+shift+aggregate);image.data[at+1]=clamp(base[1]+shift+aggregate);image.data[at+2]=clamp(base[2]+shift+aggregate);image.data[at+3]=255;}
  context.putImageData(image,0,0);
}

function joints(context:CanvasRenderingContext2D,size:number,background:string,highlight:string){
  for(let at=0;at<SIZE;at+=size){context.fillStyle=background;context.fillRect(at,0,2,SIZE);context.fillRect(0,at,SIZE,2);context.fillStyle=highlight;context.fillRect(at+2,0,1,SIZE);context.fillRect(0,at+2,SIZE,1);}
}

function runoff(context:CanvasRenderingContext2D,random:()=>number,count:number,opacity=.12){
  for(let index=0;index<count;index++){
    const x=random()*SIZE,y=random()*SIZE,width=2+random()*13,height=20+random()*100;
    const fade=context.createLinearGradient(0,y,0,y+height);fade.addColorStop(0,`rgba(48,47,38,${opacity})`);fade.addColorStop(1,'rgba(48,47,38,0)');
    context.fillStyle=fade;context.fillRect(x,y,width,height);
  }
}

function asphaltWear(context:CanvasRenderingContext2D,random:()=>number){
  // Irregular repairs retain the grain below; their sealed edges catch wet light.
  for(let patch=0;patch<7;patch++){
    const x=30+random()*380,y=30+random()*390,w=25+random()*100,h=17+random()*65;
    context.beginPath();context.moveTo(x,y);context.lineTo(x+w*.85,y-3-random()*5);context.lineTo(x+w,y+h*.78);context.lineTo(x+w*.3,y+h);context.lineTo(x-3,y+h*.65);context.closePath();
    context.fillStyle=patch%3?'rgba(26,33,38,.22)':'rgba(129,131,122,.15)';context.fill();context.strokeStyle='rgba(23,29,32,.42)';context.lineWidth=1.7;context.stroke();
  }
  for(let crack=0;crack<16;crack++){
    let x=random()*SIZE,y=random()*SIZE;const points:[number,number][]=[[x,y]];
    for(let step=0;step<7;step++){x+=(random()-.44)*25;y+=(random()-.3)*30;points.push([x,y]);}
    // Wrapped strokes prevent a straight texture seam through the broken tarmac.
    for(const ox of[-SIZE,0,SIZE])for(const oy of[-SIZE,0,SIZE]){
      context.beginPath();points.forEach(([px,py],index)=>index?context.lineTo(px+ox,py+oy):context.moveTo(px+ox,py+oy));
      context.strokeStyle=crack%4?'rgba(21,27,30,.6)':'rgba(28,31,31,.65)';context.lineWidth=crack%4?.7+random()*.6:2.4;context.stroke();
      const branch=points[3];context.beginPath();context.moveTo(branch[0]+ox,branch[1]+oy);context.lineTo(branch[0]+ox+13,branch[1]+oy-10);context.lineTo(branch[0]+ox+18,branch[1]+oy-29);context.lineWidth=.6;context.stroke();
    }
  }
  for(const y of[SIZE*.26,SIZE*.72]){
    const polish=context.createLinearGradient(0,y-24,0,y+24);polish.addColorStop(0,'rgba(155,153,139,0)');polish.addColorStop(.5,'rgba(155,153,139,.06)');polish.addColorStop(1,'rgba(155,153,139,0)');context.fillStyle=polish;context.fillRect(0,y-24,SIZE,48);
  }
  for(let chip=0;chip<1900;chip++){context.fillStyle=chip%3?'rgba(181,177,157,.13)':'rgba(18,24,26,.2)';context.fillRect(random()*SIZE,random()*SIZE,.5+random()*1.5,.5+random()*1.3);}
}

/** One small shared sky/streets reflection, with no live cube-camera render pass. */
function reflectionEnvironment():THREE.CubeTexture {
  const faces=Array.from({length:6},(_,index)=>{
    const source=document.createElement('canvas');source.width=source.height=64;
    const context=source.getContext('2d')!,gradient=context.createLinearGradient(0,0,0,64);
    if(index===2){gradient.addColorStop(0,'#90abc0');gradient.addColorStop(1,'#a6bac5');}
    else if(index===3){gradient.addColorStop(0,'#444b4d');gradient.addColorStop(1,'#596164');}
    else{gradient.addColorStop(0,'#779bb7');gradient.addColorStop(.45,'#b7c6ca');gradient.addColorStop(.58,'#dac9aa');gradient.addColorStop(.65,'#6c797e');gradient.addColorStop(1,'#3f4e55');}
    context.fillStyle=gradient;context.fillRect(0,0,64,64);
    if(index!==2&&index!==3){for(let building=0;building<7;building++){const x=building*11-5,height=9+(building*13+index*7)%20;context.fillStyle=building%2?'#596c79':'#647782';context.fillRect(x,43-height,7,height);context.fillStyle='#a7b4b7';context.fillRect(x+2,45-height,1,Math.max(1,height-5));}}
    return source;
  });
  const map=new THREE.CubeTexture(faces);map.colorSpace=THREE.SRGBColorSpace;map.needsUpdate=true;return map;
}

function makeMaps(kind:SurfaceKind,seed:number,detailed:boolean,anisotropy:number):SurfaceMaps {
  const source=canvas(),context=source.getContext('2d')!,random=surfaceRandom(seed);
  const bases:Record<SurfaceKind,readonly number[]>={asphalt:[70,75,78],concrete:[155,154,145],pavers:[163,157,145],roof:[112,113,108],brick:[140,106,86],stucco:[192,185,167],office:[93,112,121],sandstone:[183,172,145],grass:[83,106,68],sand:[204,190,158],bark:[108,89,66]};
  grain(context,bases[kind],kind==='asphalt'?24:kind==='grass'?30:18,random);
  if(kind==='asphalt'){
    asphaltWear(context,random);
  }else if(kind==='brick'){
    const row=8,col=16;
    for(let y=0,index=0;y<SIZE;y+=row,index++)for(let x=-col;x<SIZE;x+=col){const offset=index%2?col/2:0;context.strokeStyle='rgba(203,191,164,.57)';context.lineWidth=.85;context.strokeRect(x+offset,y,col,row);context.fillStyle=`rgba(${random()>.5?'70,50,37':'206,160,121'},.12)`;context.fillRect(x+offset+1,y+1,col-2,row-2);context.fillStyle='rgba(44,35,29,.2)';context.fillRect(x+offset+1,y+row-2,col-2,1);if(random()<.025){context.fillStyle='rgba(201,186,152,.38)';context.fillRect(x+offset+1,y+1,3,2);}}
    runoff(context,random,20,.12);
  }else if(kind==='concrete'||kind==='sandstone'){
    joints(context,kind==='sandstone'?128:256,'rgba(54,55,49,.25)','rgba(241,236,216,.3)');
    for(let stain=0;stain<30;stain++){const x=random()*SIZE,y=random()*SIZE,r=8+random()*35;const gradient=context.createRadialGradient(x,y,0,x,y,r);gradient.addColorStop(0,'rgba(59,65,58,.05)');gradient.addColorStop(1,'rgba(59,65,58,0)');context.fillStyle=gradient;context.fillRect(x-r,y-r,r*2,r*2);}
    runoff(context,random,kind==='sandstone'?20:8,.1);
  }else if(kind==='pavers'){
    for(let y=0,index=0;y<SIZE;y+=32,index++)for(let x=-32;x<SIZE;x+=32){const offset=index%2?16:0;context.strokeStyle='rgba(66,68,62,.34)';context.lineWidth=1;context.strokeRect(x+offset,y,32,32);context.strokeStyle='rgba(240,233,213,.2)';context.lineWidth=.7;context.strokeRect(x+offset+1.5,y+1.5,29,29);}
  }else if(kind==='stucco'){
    joints(context,256,'rgba(124,119,102,.17)','rgba(245,238,219,.26)');
    for(let y=0;y<SIZE;y+=4){context.fillStyle=`rgba(238,233,211,${random()*.025})`;context.fillRect(0,y,SIZE,1);}
    for(let repair=0;repair<13;repair++){context.fillStyle=repair%2?'rgba(243,232,202,.07)':'rgba(119,115,96,.06)';context.fillRect(random()*SIZE,random()*SIZE,8+random()*65,10+random()*47);}
    runoff(context,random,24,.09);
  }else if(kind==='office'){
    for(let y=0;y<SIZE;y+=64)for(let x=0;x<SIZE;x+=64){
      const blue=Math.floor(91+random()*24),lit=random()<.17;context.fillStyle=lit?`rgb(${130+Math.floor(random()*18)},132,115)`:`rgb(${blue-18},${blue+1},${blue+12})`;context.fillRect(x+3,y+3,58,58);
      const reflection=context.createLinearGradient(x,y,x+64,y+64);reflection.addColorStop(0,'rgba(202,221,225,.34)');reflection.addColorStop(.4,'rgba(111,147,162,.04)');reflection.addColorStop(1,'rgba(24,45,57,.19)');context.fillStyle=reflection;context.fillRect(x+4,y+4,56,56);
      context.fillStyle='rgba(35,49,55,.9)';context.fillRect(x,y,3,64);context.fillRect(x,y,64,3);context.fillStyle='rgba(189,199,196,.35)';context.fillRect(x+3,y,1,64);
      context.fillStyle='rgba(14,27,34,.38)';context.fillRect(x+3,y+59,58,3);context.fillStyle='rgba(215,216,197,.3)';context.fillRect(x+3,y+62,58,1);
    }
  }else if(kind==='roof'){
    for(let pebble=0;pebble<8000;pebble++){context.fillStyle=random()<.5?'rgba(45,47,43,.23)':'rgba(194,191,172,.27)';context.fillRect(random()*SIZE,random()*SIZE,.6+random()*1.3,.6+random()*1.1);}
  }else if(kind==='grass'){
    for(let blade=0;blade<13000;blade++){context.strokeStyle=random()<.5?'rgba(170,176,109,.18)':'rgba(36,63,35,.22)';const x=random()*SIZE,y=random()*SIZE;context.beginPath();context.moveTo(x,y);context.lineTo(x+(random()-.5)*3,y-1-random()*4);context.stroke();}
  }else if(kind==='bark'){
    for(let streak=0;streak<120;streak++){const x=random()*SIZE;context.strokeStyle=random()<.5?'rgba(31,30,24,.23)':'rgba(203,176,134,.17)';context.lineWidth=.5+random()*3;context.beginPath();context.moveTo(x,0);for(let y=32;y<=SIZE;y+=32)context.lineTo(x+Math.sin(y*.024+streak)*3,y);context.stroke();}
  }
  const maps:SurfaceMaps={color:texture(source,true,anisotropy)};
  if(kind==='office'){
    const emission=canvas(),emissionContext=emission.getContext('2d')!,emissionRandom=surfaceRandom(seed+87);emissionContext.fillStyle='#000';emissionContext.fillRect(0,0,SIZE,SIZE);
    for(let y=0;y<SIZE;y+=64)for(let x=0;x<SIZE;x+=64)if(emissionRandom()<.21){emissionContext.fillStyle=emissionRandom()<.7?'#b9a988':'#7e9b9d';emissionContext.fillRect(x+5,y+5,54,54);if(emissionRandom()>.5){emissionContext.fillStyle='#3c3831';emissionContext.fillRect(x+5,y+25,54,3);}}
    maps.emission=texture(emission,true,anisotropy);
  }
  if(detailed){
    const pixels=context.getImageData(0,0,SIZE,SIZE),normal=canvas(),roughness=canvas(),normalContext=normal.getContext('2d')!,roughContext=roughness.getContext('2d')!,normalImage=normalContext.createImageData(SIZE,SIZE),roughImage=roughContext.createImageData(SIZE,SIZE);
    const height=(x:number,y:number)=>{const at=(((y+SIZE)%SIZE)*SIZE+(x+SIZE)%SIZE)*4;return(pixels.data[at]+pixels.data[at+1]+pixels.data[at+2])/3;};
    const strength=kind==='asphalt'?.38:kind==='office'?.2:.65;
    for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){const at=(y*SIZE+x)*4,rough=kind==='office'?114+height(x,y)*.38:kind==='asphalt'?144+height(x,y)*1.06:180+height(x,y)*.25;normalImage.data[at]=clamp(128+(height(x-1,y)-height(x+1,y))*strength);normalImage.data[at+1]=clamp(128+(height(x,y-1)-height(x,y+1))*strength);normalImage.data[at+2]=255;normalImage.data[at+3]=255;roughImage.data[at]=roughImage.data[at+1]=roughImage.data[at+2]=clamp(rough);roughImage.data[at+3]=255;}
    normalContext.putImageData(normalImage,0,0);roughContext.putImageData(roughImage,0,0);maps.normal=texture(normal,false,anisotropy);maps.roughness=texture(roughness,false,anisotropy);
  }
  return maps;
}

/** Shared tiled materials keep the extended city batched, including software WebGL. */
export class SurfaceLibrary {
  readonly asphalt:SurfaceMaterial;readonly concrete:SurfaceMaterial;readonly pavers:SurfaceMaterial;readonly roof:SurfaceMaterial;
  readonly brick:SurfaceMaterial;readonly stucco:SurfaceMaterial;readonly office:SurfaceMaterial;readonly sandstone:SurfaceMaterial;
  readonly grass:SurfaceMaterial;readonly sand:SurfaceMaterial;readonly bark:SurfaceMaterial;
  readonly windowGlass:SurfaceMaterial;readonly litWindow:SurfaceMaterial;
  readonly facades:readonly SurfaceMaterial[];
  private readonly maps:SurfaceMaps[]=[];
  private readonly materials:SurfaceMaterial[]=[];
  private readonly weatherMaterials:WeatherMaterial[]=[];
  private readonly environment:THREE.CubeTexture|null;
  private weather=surfaceWeatherProfile(0,1);
  private weatherRain=-1;
  private weatherDaylight=-1;
  private quality:SurfaceQuality='high';
  private night=-1;
  constructor(private readonly software=false,anisotropy=4){
    this.environment=software?null:reflectionEnvironment();
    const make=(kind:SurfaceKind,seed:number,roughness=.9,metalness=.01)=>{
      const maps=makeMaps(kind,seed,!software,anisotropy);this.maps.push(maps);
      const material:SurfaceMaterial=software?new THREE.MeshLambertMaterial({color:0xffffff,map:maps.color,emissiveMap:maps.emission??null,emissive:maps.emission?0xffddae:0x000000,emissiveIntensity:.02}):new THREE.MeshStandardMaterial({color:0xffffff,map:maps.color,normalMap:maps.normal??null,normalScale:new THREE.Vector2(.65,.65),roughnessMap:maps.roughness??null,roughness,metalness,emissiveMap:maps.emission??null,emissive:maps.emission?0xffddae:0x000000,emissiveIntensity:.02});
      this.materials.push(material);this.weatherMaterials.push({material,kind,color:material.color.clone(),normal:maps.normal??null,roughness:maps.roughness??null,normalScale:kind==='office'?.2:.65,dryRoughness:roughness});return material;
    };
    this.asphalt=make('asphalt',4731,.96);this.concrete=make('concrete',1139,.93);this.pavers=make('pavers',269,.94);this.roof=make('roof',617,.97);
    this.brick=make('brick',713,.94);this.stucco=make('stucco',415,.93);this.office=make('office',289,.31,.28);this.sandstone=make('sandstone',172,.9);
    this.grass=make('grass',3117,1);this.sand=make('sand',1661,1);this.bark=make('bark',2971,.98);
    this.windowGlass=software?new THREE.MeshLambertMaterial({color:0x647e8d,emissive:0x1b3342,emissiveIntensity:.12}):new THREE.MeshStandardMaterial({color:0x819ba5,roughness:.19,metalness:.06,envMap:this.environment,envMapIntensity:1.15});
    this.litWindow=software?new THREE.MeshLambertMaterial({color:0xbbb19a,emissive:0xffdb9f,emissiveIntensity:.05}):new THREE.MeshStandardMaterial({color:0xb8b8a8,roughness:.26,metalness:.03,envMap:this.environment,emissive:0xffdb9f,emissiveIntensity:.05});
    this.materials.push(this.windowGlass,this.litWindow);
    for(const [kind,material]of[['glass',this.windowGlass],['lit',this.litWindow]]as const)this.weatherMaterials.push({material,kind,color:material.color.clone(),normal:null,roughness:null,normalScale:.1,dryRoughness:kind==='glass'?.19:.26});
    this.facades=[this.stucco,this.brick,this.office,this.sandstone];this.updateWeather(0,1,software?'low':'high');
  }
  /** Tinted clones share maps while retaining their own dry paint colour. */
  registerVariant(material:SurfaceMaterial,source:SurfaceMaterial){
    if(this.weatherMaterials.some(record=>record.material===material))return;
    const original=this.weatherMaterials.find(record=>record.material===source);if(!original)return;
    const record={...original,material,color:material.color.clone()};this.weatherMaterials.push(record);this.applyWeather(record,this.weather,this.quality);
    if(record.kind==='office')material.emissiveIntensity=.015+Math.max(0,this.night)*.63;
    else if(record.kind==='lit')material.emissiveIntensity=.04+Math.max(0,this.night)*.9;
  }
  updateWeather(rain:number,daylight:number,quality:SurfaceQuality='high'){
    const selected=this.software?'low':quality,profile=surfaceWeatherProfile(rain,daylight,selected);
    this.setNight(1-profile.daylight);
    if(selected===this.quality&&Math.abs(profile.rain-this.weatherRain)<.006&&Math.abs(profile.daylight-this.weatherDaylight)<.006)return;
    this.quality=selected;this.weather=profile;this.weatherRain=profile.rain;this.weatherDaylight=profile.daylight;
    for(const record of this.weatherMaterials)this.applyWeather(record,profile,selected);
  }
  private applyWeather(record:WeatherMaterial,profile:SurfaceWeatherProfile,quality:SurfaceQuality){
    const {material,kind}=record,wet=profile.wetness;
    const road=kind==='asphalt'||kind==='pavers'||kind==='concrete',masonry=kind==='brick'||kind==='stucco'||kind==='sandstone'||kind==='roof',glass=kind==='glass'||kind==='office'||kind==='lit';
    const tint=road?profile.roadTint:masonry?profile.masonryTint:kind==='sand'?1-wet*.19:kind==='grass'||kind==='bark'?1-wet*.08:1-wet*.035;
    material.color.copy(record.color).multiplyScalar(tint);
    if(!(material instanceof THREE.MeshStandardMaterial))return;
    material.roughness=road?kind==='asphalt'?profile.roadRoughness:profile.roadRoughness*.82+.16:masonry?profile.masonryRoughness:glass?kind==='office'?.32-wet*.095:kind==='lit'?.26-wet*.06:profile.glassRoughness:Math.max(.75,record.dryRoughness-wet*.08);
    const normal=profile.detail?record.normal:null,roughness=profile.detail?record.roughness:null;
    const reflective=glass||road||kind==='roof',environment=quality==='low'||!reflective?null:this.environment;
    if(material.normalMap!==normal||material.roughnessMap!==roughness||material.envMap!==environment){material.normalMap=normal;material.roughnessMap=roughness;material.envMap=environment;material.needsUpdate=true;}
    const normalScale=road?profile.roadNormalScale:record.normalScale*(1-wet*.17);material.normalScale.setScalar(normalScale);
    material.envMapIntensity=profile.reflectionIntensity*(glass?kind==='office'?.86:kind==='lit'?.43:1.3:kind==='asphalt'?.52:.31);
  }
  setNight(amount:number){const night=Number.isFinite(amount)?Math.max(0,Math.min(1,amount)):0;if(Math.abs(night-this.night)<.01)return;this.night=night;for(const record of this.weatherMaterials){if(record.kind==='office')record.material.emissiveIntensity=.015+night*.63;else if(record.kind==='lit')record.material.emissiveIntensity=.04+night*.9;}}
  destroy(){const textures=new Set<THREE.Texture>();for(const maps of this.maps)for(const value of Object.values(maps))if(value instanceof THREE.Texture)textures.add(value);textures.forEach(map=>map.dispose());this.environment?.dispose();this.materials.forEach(material=>material.dispose());this.maps.length=0;this.materials.length=0;this.weatherMaterials.length=0;}
}

/** Analytic normals, Fresnel reflection and shore foam require no reflection pass. */
export function createWaterMaterial():THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0},uDaylight:{value:1},uRain:{value:0}},
    vertexShader:`varying vec3 vWorldPosition;void main(){vec4 world=modelMatrix*vec4(position,1.0);vWorldPosition=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader:`
      varying vec3 vWorldPosition;uniform float uTime;uniform float uDaylight;uniform float uRain;
      void main(){
        vec2 p=vWorldPosition.xz;float t=uTime;
        float a=sin(p.x*.18+p.y*.29+t*1.12),b=sin(p.x*.37-p.y*.21-t*1.49),c=sin(p.x*.84+p.y*.62+t*2.2);
        vec3 normal=normalize(vec3(a*.11+b*.055+c*.025,1.0,b*.1-a*.055+c*.02));
        vec3 viewDirection=normalize(cameraPosition-vWorldPosition);float facing=clamp(dot(normal,viewDirection),0.0,1.0);
        float fresnel=.055+.945*pow(1.0-facing,4.0);float coastal=exp(-max(0.0,p.x-115.0)*.043);
        vec3 deep=vec3(.055,.19,.23),shallow=vec3(.16,.40,.37);vec3 water=mix(deep,shallow,coastal*.85);
        vec3 reflected=reflect(-viewDirection,normal);float horizon=pow(1.0-clamp(reflected.y,0.0,1.0),2.0);
        vec3 sky=mix(vec3(.29,.46,.59),vec3(.64,.65,.59),horizon);sky=mix(vec3(.065,.105,.17),sky,uDaylight);
        vec3 halfDirection=normalize(normalize(vec3(-.55,.46,-.7))+viewDirection);float shine=pow(max(0.0,dot(normal,halfDirection)),150.0)*uDaylight;
        float shoreBand=1.0-smoothstep(115.2,119.8,p.x);float foam=shoreBand*smoothstep(.55,.95,sin(p.y*.47+t*1.18+a*.4)*.5+.5);
        vec3 color=mix(water*(.36+uDaylight*.64),sky,clamp(fresnel*.82,0.0,.9));color+=vec3(1.0,.86,.62)*shine*.72;
        color=mix(color,vec3(.65,.77,.73),foam*.6);color=mix(color,vec3(.15,.25,.29),uRain*.15);
        float distanceFog=1.0-exp(-length(cameraPosition.xz-p)*.0017);color=mix(color,sky,distanceFog*.42);
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

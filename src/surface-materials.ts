import * as THREE from 'three';

export type SurfaceMaterial=THREE.MeshStandardMaterial|THREE.MeshLambertMaterial;
type SurfaceKind='asphalt'|'concrete'|'pavers'|'roof'|'brick'|'stucco'|'office'|'sandstone'|'grass'|'sand'|'bark';
interface SurfaceMaps {color:THREE.CanvasTexture;normal?:THREE.CanvasTexture;roughness?:THREE.CanvasTexture;emission?:THREE.CanvasTexture}
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

function makeMaps(kind:SurfaceKind,seed:number,detailed:boolean,anisotropy:number):SurfaceMaps {
  const source=canvas(),context=source.getContext('2d')!,random=surfaceRandom(seed);
  const bases:Record<SurfaceKind,readonly number[]>={asphalt:[70,75,78],concrete:[155,154,145],pavers:[163,157,145],roof:[112,113,108],brick:[140,106,86],stucco:[192,185,167],office:[93,112,121],sandstone:[183,172,145],grass:[83,106,68],sand:[204,190,158],bark:[108,89,66]};
  grain(context,bases[kind],kind==='asphalt'?24:kind==='grass'?30:18,random);
  if(kind==='asphalt'){
    for(let crack=0;crack<14;crack++){
      let x=random()*SIZE,y=random()*SIZE;context.strokeStyle='rgba(22,27,29,.35)';context.lineWidth=.7+random();context.beginPath();context.moveTo(x,y);
      for(let step=0;step<6;step++){x+=(random()-.45)*22;y+=(random()-.3)*27;context.lineTo(x,y);}context.stroke();
    }
    for(let patch=0;patch<16;patch++){context.fillStyle=patch%2?'rgba(130,133,129,.05)':'rgba(19,25,29,.045)';context.fillRect(random()*SIZE,random()*SIZE,8+random()*60,2+random()*24);}
  }else if(kind==='brick'){
    const row=8,col=16;
    for(let y=0,index=0;y<SIZE;y+=row,index++)for(let x=-col;x<SIZE;x+=col){const offset=index%2?col/2:0;context.strokeStyle='rgba(203,191,164,.57)';context.lineWidth=.85;context.strokeRect(x+offset,y,col,row);context.fillStyle=`rgba(${random()>.5?'70,50,37':'206,160,121'},.09)`;context.fillRect(x+offset+1,y+1,col-2,row-2);context.fillStyle='rgba(44,35,29,.16)';context.fillRect(x+offset+1,y+row-2,col-2,1);}
  }else if(kind==='concrete'||kind==='sandstone'){
    joints(context,kind==='sandstone'?128:256,'rgba(54,55,49,.25)','rgba(241,236,216,.3)');
    for(let stain=0;stain<30;stain++){const x=random()*SIZE,y=random()*SIZE,r=8+random()*35;const gradient=context.createRadialGradient(x,y,0,x,y,r);gradient.addColorStop(0,'rgba(59,65,58,.05)');gradient.addColorStop(1,'rgba(59,65,58,0)');context.fillStyle=gradient;context.fillRect(x-r,y-r,r*2,r*2);}
  }else if(kind==='pavers'){
    for(let y=0,index=0;y<SIZE;y+=32,index++)for(let x=-32;x<SIZE;x+=32){const offset=index%2?16:0;context.strokeStyle='rgba(66,68,62,.34)';context.lineWidth=1;context.strokeRect(x+offset,y,32,32);context.strokeStyle='rgba(240,233,213,.2)';context.lineWidth=.7;context.strokeRect(x+offset+1.5,y+1.5,29,29);}
  }else if(kind==='stucco'){
    joints(context,256,'rgba(124,119,102,.17)','rgba(245,238,219,.26)');
    for(let y=0;y<SIZE;y+=4){context.fillStyle=`rgba(238,233,211,${random()*.025})`;context.fillRect(0,y,SIZE,1);}
  }else if(kind==='office'){
    for(let y=0;y<SIZE;y+=64)for(let x=0;x<SIZE;x+=64){
      const blue=Math.floor(91+random()*24),lit=random()<.17;context.fillStyle=lit?`rgb(${130+Math.floor(random()*18)},132,115)`:`rgb(${blue-18},${blue+1},${blue+12})`;context.fillRect(x+3,y+3,58,58);
      const reflection=context.createLinearGradient(x,y,x+64,y+64);reflection.addColorStop(0,'rgba(202,221,225,.34)');reflection.addColorStop(.4,'rgba(111,147,162,.04)');reflection.addColorStop(1,'rgba(24,45,57,.19)');context.fillStyle=reflection;context.fillRect(x+4,y+4,56,56);
      context.fillStyle='rgba(35,49,55,.9)';context.fillRect(x,y,3,64);context.fillRect(x,y,64,3);context.fillStyle='rgba(189,199,196,.35)';context.fillRect(x+3,y,1,64);
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
    for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){const at=(y*SIZE+x)*4,rough=kind==='office'?105+height(x,y)*.35:180+height(x,y)*.25;normalImage.data[at]=clamp(128+(height(x-1,y)-height(x+1,y))*strength);normalImage.data[at+1]=clamp(128+(height(x,y-1)-height(x,y+1))*strength);normalImage.data[at+2]=255;normalImage.data[at+3]=255;roughImage.data[at]=roughImage.data[at+1]=roughImage.data[at+2]=clamp(rough);roughImage.data[at+3]=255;}
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
  private night=-1;
  constructor(software=false,anisotropy=4){
    const make=(kind:SurfaceKind,seed:number,roughness=.9,metalness=.01)=>{
      const maps=makeMaps(kind,seed,!software,anisotropy);this.maps.push(maps);
      const material:SurfaceMaterial=software?new THREE.MeshLambertMaterial({color:0xffffff,map:maps.color,emissiveMap:maps.emission??null,emissive:maps.emission?0xffddae:0x000000,emissiveIntensity:.02}):new THREE.MeshStandardMaterial({color:0xffffff,map:maps.color,normalMap:maps.normal??null,normalScale:new THREE.Vector2(.65,.65),roughnessMap:maps.roughness??null,roughness,metalness,emissiveMap:maps.emission??null,emissive:maps.emission?0xffddae:0x000000,emissiveIntensity:.02});
      this.materials.push(material);return material;
    };
    this.asphalt=make('asphalt',4731,.96);this.concrete=make('concrete',1139,.93);this.pavers=make('pavers',269,.94);this.roof=make('roof',617,.97);
    this.brick=make('brick',713,.94);this.stucco=make('stucco',415,.93);this.office=make('office',289,.31,.28);this.sandstone=make('sandstone',172,.9);
    this.grass=make('grass',3117,1);this.sand=make('sand',1661,1);this.bark=make('bark',2971,.98);
    this.windowGlass=software?new THREE.MeshLambertMaterial({color:0x647e8d,emissive:0x1b3342,emissiveIntensity:.12}):new THREE.MeshStandardMaterial({color:0x819ba5,roughness:.18,metalness:.46,envMapIntensity:1.15});
    this.litWindow=software?new THREE.MeshLambertMaterial({color:0xbbb19a,emissive:0xffdb9f,emissiveIntensity:.05}):new THREE.MeshStandardMaterial({color:0xb8b8a8,roughness:.26,metalness:.18,emissive:0xffdb9f,emissiveIntensity:.05});
    this.materials.push(this.windowGlass,this.litWindow);this.facades=[this.stucco,this.brick,this.office,this.sandstone];this.setNight(0);
  }
  setNight(amount:number){const night=Number.isFinite(amount)?Math.max(0,Math.min(1,amount)):0;if(Math.abs(night-this.night)<.01)return;this.night=night;this.office.emissiveIntensity=.015+night*.63;this.litWindow.emissiveIntensity=.04+night*.9;}
  destroy(){const textures=new Set<THREE.Texture>();for(const maps of this.maps)for(const value of Object.values(maps))if(value instanceof THREE.Texture)textures.add(value);textures.forEach(map=>map.dispose());this.materials.forEach(material=>material.dispose());this.maps.length=0;this.materials.length=0;}
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

import * as THREE from 'three';
import type {Point,VehicleKind} from './model';

export type VehicleLightQuality='low'|'medium'|'high';
export interface VehicleLightSource extends Point {
  id:string;heading:number;kind?:VehicleKind;visible?:boolean;braking?:number;
}
const MAX_CARS=64;
const clamp=(value:number)=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));
const vertexShader=`
 varying vec2 vUv;varying vec3 vTint;
 void main(){vUv=uv;vTint=vec3(1.0);
 #ifdef USE_INSTANCING_COLOR
 vTint=instanceColor;
 #endif
 gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}`;
const poolShader=`
 uniform float strength;varying vec2 vUv;varying vec3 vTint;
 void main(){float t=vUv.y;float spread=mix(.09,.49,t);
 float edge=1.0-smoothstep(spread*.55,spread,abs(vUv.x-.5));
 float alpha=edge*pow(1.0-t,1.7)*smoothstep(0.0,.07,t)*strength;
 gl_FragColor=vec4(vTint,alpha);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`;
const coneShader=`
 uniform float strength;varying vec2 vUv;varying vec3 vTint;
 void main(){float alpha=pow(vUv.y,1.3)*(1.0-smoothstep(.8,1.0,vUv.y))*strength;
 gl_FragColor=vec4(vTint,alpha);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`;
const beamMaterial=(fragmentShader:string)=>new THREE.ShaderMaterial({
  uniforms:{strength:{value:0}},vertexShader,fragmentShader,transparent:true,
  blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,
});

/** A small GPU light pool stays stable while inexpensive beams cover all cars. */
export class VehicleLighting {
  readonly group=new THREE.Group();
  private quality:VehicleLightQuality='medium';
  private readonly spots:THREE.SpotLight[]=[];
  private readonly headMaterial=beamMaterial(poolShader);
  private readonly rearMaterial=beamMaterial(poolShader);
  private readonly coneMaterial=beamMaterial(coneShader);
  private readonly plane=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2);
  private readonly coneGeometry=new THREE.ConeGeometry(1,1,8,1,true).rotateX(Math.PI/2).translate(0,0,-.5);
  private readonly headPools=new THREE.InstancedMesh(this.plane,this.headMaterial,MAX_CARS*2);
  private readonly rearPools=new THREE.InstancedMesh(this.plane,this.rearMaterial,MAX_CARS*2);
  private readonly cones=new THREE.InstancedMesh(this.coneGeometry,this.coneMaterial,MAX_CARS*2);
  private readonly dummy=new THREE.Object3D();
  private readonly tint=new THREE.Color();
  private activeIds:string[]=[];

  constructor(scene:THREE.Scene,private readonly software:boolean){
    this.group.name='vehicle-lighting';
    for(const mesh of[this.headPools,this.rearPools,this.cones]){
      mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.renderOrder=2;
      this.group.add(mesh);
    }
    if(!software)for(let index=0;index<4;index++){
      const light=new THREE.SpotLight(0xffedce,0,38,.32,.72,1.4);
      light.castShadow=false;light.position.set(0,.85,0);light.target.position.set(0,.08,-18);
      this.spots.push(light);this.group.add(light,light.target);
    }
    this.setQuality(this.quality);
    scene.add(this.group);
  }
  setQuality(profile:VehicleLightQuality){
    this.quality=profile;
    const budget=profile==='low'?0:profile==='high'?4:2;
    // Shader light counts change only when the user changes the quality profile.
    this.spots.forEach((light,index)=>light.visible=index<budget);
  }
  get snapshot(){return{quality:this.quality,spots:this.spots.filter(light=>light.intensity>0).length,litVehicles:[...this.activeIds],pools:this.headPools.count,cones:this.cones.count};}

  update(sources:readonly VehicleLightSource[],focus:Point,daylight:number,_dt:number,enabled=true,haze=0){
    const night=clamp((.65-clamp(daylight))/.65),range=this.quality==='high'?120:this.quality==='medium'?90:65;
    const candidates=enabled?sources.filter(source=>source.visible!==false&&source.kind!=='boat'&&source.kind!=='bike'&&Number.isFinite(source.x+source.z+source.heading)&&Math.hypot(source.x-focus.x,source.z-focus.z)<range).sort((a,b)=>(a.x-focus.x)**2+(a.z-focus.z)**2-((b.x-focus.x)**2+(b.z-focus.z)**2)).slice(0,MAX_CARS):[];
    const selected=night>.01?candidates.slice(0,this.software||this.quality==='low'?0:this.quality==='high'?2:1):[];
    this.activeIds=selected.map(source=>source.id);
    this.headMaterial.uniforms.strength.value=night*(this.software?.48:.23);
    this.coneMaterial.uniforms.strength.value=night*(this.software?.018:.012)*(.2+clamp(haze)*.8);
    this.rearMaterial.uniforms.strength.value=.3;
    let heads=0,rears=0,cones=0;
    for(const source of candidates){
      const halfLength=source.kind==='sport'?2.25:2.35,c=Math.cos(source.heading),s=Math.sin(source.heading),brake=clamp(source.braking??0);
      const point=(side:number,z:number,y:number)=>{this.dummy.position.set(source.x+c*side-s*z,y,source.z+s*side+c*z);this.dummy.rotation.set(0,-source.heading,0);};
      for(const side of[-.65,.65]){
        if(night>.01){
          point(side,-halfLength-7,.155);this.dummy.scale.set(4.3,1,13.5);this.dummy.updateMatrix();this.headPools.setMatrixAt(heads,this.dummy.matrix);
          this.tint.setHex(0xffe8bb).multiplyScalar(selected.includes(source)?.65:1);this.headPools.setColorAt(heads++,this.tint);
          if(Math.hypot(source.x-focus.x,source.z-focus.z)<(this.software?42:65)){
            point(side,-halfLength-.04,.85);this.dummy.scale.set(2.2,.72,13);this.dummy.updateMatrix();this.cones.setMatrixAt(cones,this.dummy.matrix);this.cones.setColorAt(cones++,this.tint);
          }
        }
        if(night>.01||brake>.03){
          point(side,halfLength+2.1,.15);this.dummy.rotation.y+=Math.PI;this.dummy.scale.set(1.7,1,4);this.dummy.updateMatrix();this.rearPools.setMatrixAt(rears,this.dummy.matrix);
          this.tint.setHex(0xff2834).multiplyScalar(night*.12+brake*.8);this.rearPools.setColorAt(rears++,this.tint);
        }
      }
    }
    for(const [mesh,count]of[[this.headPools,heads],[this.rearPools,rears],[this.cones,cones]]as const){
      mesh.count=count;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    }
    for(let index=0;index<this.spots.length;index++){
      const light=this.spots[index],source=selected[Math.floor(index/2)];light.intensity=source?night*165:0;
      if(!source)continue;
      const side=index%2?.65:-.65,c=Math.cos(source.heading),s=Math.sin(source.heading),front=-(source.kind==='sport'?2.25:2.35)-.06;
      light.position.set(source.x+c*side-s*front,.85,source.z+s*side+c*front);
      light.target.position.set(light.position.x+s*18,.08,light.position.z-c*18);
    }
  }
  destroy(){
    this.group.removeFromParent();this.headPools.dispose();this.rearPools.dispose();this.cones.dispose();
    this.plane.dispose();this.coneGeometry.dispose();this.headMaterial.dispose();this.rearMaterial.dispose();this.coneMaterial.dispose();
  }
}

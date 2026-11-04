import * as THREE from 'three';
import type { CityEnvironment } from './city-life';
import type { SurfaceQuality } from './surface-weather';

const unit=(value:number,fallback:number)=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):fallback;
const blend=(a:number,b:number,t:number)=>{
  const r=Math.round((a>>16&255)*(1-t)+(b>>16&255)*t),g=Math.round((a>>8&255)*(1-t)+(b>>8&255)*t),blue=Math.round((a&255)*(1-t)+(b&255)*t);
  return r<<16|g<<8|blue;
};

/** Multiply the active quality profile's fog distances; camera limits stay owned by WorldView. */
export function atmosphereFogProfile(environment:Pick<CityEnvironment,'rain'|'daylight'|'fog'>){
  const rain=unit(environment.rain,0),daylight=unit(environment.daylight,1);
  return {nearScale:(.88+daylight*.12)*(1-rain*.27),farScale:(.82+daylight*.18)*(1-rain*.22),color:blend(environment.fog,0x79838c,rain*.09)};
}

/** A camera-centred sky prevents the enlarged world from ending in a flat clear colour. */
export class AtmosphereView {
  readonly group=new THREE.Group();
  readonly material:THREE.ShaderMaterial;
  private readonly sphere:THREE.Mesh;
  constructor(private readonly software=false){
    this.material=new THREE.ShaderMaterial({
      side:THREE.BackSide,depthWrite:false,fog:false,
      uniforms:{uDaylight:{value:1},uSunset:{value:1},uRain:{value:0},uTime:{value:0},uSky:{value:new THREE.Color(0x678fa8)},uHorizon:{value:new THREE.Color(0xd9b4a3)},uCloudDetail:{value:software?0:1},uSunDirection:{value:new THREE.Vector3(-180,70,-270).normalize()}},
      vertexShader:`varying vec3 vDirection;void main(){vDirection=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`
        varying vec3 vDirection;uniform float uDaylight,uSunset,uRain,uTime,uCloudDetail;uniform vec3 uSky,uHorizon,uSunDirection;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 cell=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(cell),hash(cell+vec2(1.0,0.0)),f.x),mix(hash(cell+vec2(0.0,1.0)),hash(cell+vec2(1.0,1.0)),f.x),f.y);}
        void main(){
          vec3 d=normalize(vDirection);float height=clamp(d.y,0.0,1.0),horizon=pow(1.0-height,3.5),sunward=max(0.0,dot(d,uSunDirection));
          vec3 zenith=mix(vec3(.013,.025,.064),uSky*vec3(.73,.84,.98),.14+uDaylight*.86);
          vec3 color=mix(zenith,uHorizon,horizon*(.66+uDaylight*.23));
          float dusk=uSunset*(.3+uDaylight*.7)*(1.0-uRain*.7);
          color+=vec3(.21,.065,.024)*dusk*pow(1.0-height,8.0)*(.32+sunward*.68);
          float duskBand=(height-.22)*5.0;color+=vec3(.065,.018,.065)*dusk*exp(-duskBand*duskBand);
          color+=vec3(.27,.20,.12)*(pow(sunward,24.0)*.22+pow(sunward,160.0)*.16)*uDaylight*(1.0-uRain*.85);
          vec2 cloudUv=d.xz/max(.17,d.y+.23);float t=uTime*.003;
          float clouds=.5+sin(cloudUv.x*1.7+t)*sin(cloudUv.y*1.1-t*.7)*.23;
          if(uCloudDetail>0.0){clouds=noise(cloudUv*2.05+vec2(t,-t*.4));if(uCloudDetail>.7)clouds=clouds*.72+noise(cloudUv*5.3-vec2(t*.7,t*.23))*.28;}
          float cloudEdge=.56-uRain*.26,cloudCover=smoothstep(cloudEdge,cloudEdge+.22,clouds)*(1.0-smoothstep(.08,.83,height))*(.44+uRain*.43);
          vec3 cloudColor=mix(vec3(.045,.067,.11),vec3(.64,.69,.72),uDaylight);cloudColor+=vec3(.17,.095,.045)*dusk*pow(sunward,5.0);
          cloudColor*=.82+smoothstep(cloudEdge,cloudEdge+.3,clouds)*.22;color=mix(color,cloudColor,cloudCover);
          float haze=exp(-height*15.0)*(.12+uRain*.23);color=mix(color,uHorizon,haze);
          if(uDaylight<.24){vec2 stars=floor(d.xz/max(.15,d.y)*260.0);float star=step(.9987,hash(stars))*smoothstep(.1,.6,d.y)*(1.0-uRain);color+=vec3(.43,.50,.64)*star*.65*(1.0-smoothstep(.03,.24,uDaylight));}
          color=mix(color,mix(vec3(.035,.055,.09),vec3(.26,.33,.39),uDaylight),uRain*.19);
          gl_FragColor=vec4(color,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sphere=new THREE.Mesh(new THREE.SphereGeometry(540,software?16:32,software?10:20),this.material);this.sphere.frustumCulled=false;this.sphere.renderOrder=-100;this.group.add(this.sphere);this.group.name='atmospheric-sky';
  }
  setQuality(quality:SurfaceQuality){this.material.uniforms.uCloudDetail.value=this.software||quality==='low'?0:quality==='medium'?.45:1;}
  update(environment:CityEnvironment,position?:{x:number;y?:number;z:number},seconds=0,quality?:SurfaceQuality){
    if(position)this.group.position.set(position.x,position.y??0,position.z);
    if(quality)this.setQuality(quality);
    this.material.uniforms.uDaylight.value=unit(environment.daylight,1);this.material.uniforms.uRain.value=unit(environment.rain,0);this.material.uniforms.uSunset.value=environment.period==='ZACHÓD SŁOŃCA'||environment.period==='ŚWIT'?1:0;this.material.uniforms.uTime.value=Number.isFinite(seconds)?seconds%20000:0;
    (this.material.uniforms.uSky.value as THREE.Color).setHex(environment.sky);(this.material.uniforms.uHorizon.value as THREE.Color).setHex(environment.fog);
  }
  destroy(){this.sphere.geometry.dispose();this.material.dispose();this.group.removeFromParent();this.group.clear();}
}

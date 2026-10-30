import * as THREE from 'three';
import type { CityEnvironment } from './city-life';

/** A camera-centred sky prevents the enlarged world from ending in a flat clear colour. */
export class AtmosphereView {
  readonly group=new THREE.Group();
  readonly material:THREE.ShaderMaterial;
  private readonly sphere:THREE.Mesh;
  constructor(software=false){
    this.material=new THREE.ShaderMaterial({
      side:THREE.BackSide,depthWrite:false,fog:false,
      uniforms:{uDaylight:{value:1},uSunset:{value:1},uRain:{value:0},uTime:{value:0},uSky:{value:new THREE.Color(0x678fa8)},uHorizon:{value:new THREE.Color(0xd9b4a3)},uCloudDetail:{value:software?0:1}},
      vertexShader:`varying vec3 vDirection;void main(){vDirection=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`
        varying vec3 vDirection;uniform float uDaylight,uSunset,uRain,uTime,uCloudDetail;uniform vec3 uSky,uHorizon;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        void main(){
          vec3 d=normalize(vDirection);float height=clamp(d.y,0.0,1.0);float horizon=pow(1.0-height,4.0);
          vec3 zenith=mix(vec3(.022,.043,.092),uSky,.2+uDaylight*.8);vec3 color=mix(zenith,uHorizon,horizon*(.56+uDaylight*.3));
          color+=vec3(.18,.065,.025)*uSunset*pow(1.0-height,9.0);
          vec2 cloudUv=d.xz/max(.13,d.y+.2);float t=uTime*.002;
          float clouds=sin(cloudUv.x*1.7+t)*sin(cloudUv.y*1.1-t*.7);
          clouds+=sin(cloudUv.x*3.2+cloudUv.y*1.6-t)*.27;
          clouds+=uCloudDetail*sin(cloudUv.y*6.2-cloudUv.x*3.8+t)*.11;
          float cloudCover=smoothstep(.38-uRain*.4,.92,clouds)*(1.0-smoothstep(.12,.75,height))*.42;
          color=mix(color,mix(vec3(.19,.23,.29),vec3(.77,.78,.76),uDaylight),cloudCover);
          vec2 stars=floor(d.xz/max(.15,d.y)*260.0);float star=step(.9985,hash(stars))*smoothstep(.1,.6,d.y)*(1.0-uDaylight)*(1.0-uRain);
          color+=vec3(.47,.56,.66)*star*.7*(1.0-smoothstep(.03,.24,uDaylight));color=mix(color,vec3(.19,.25,.31),uRain*.3);
          gl_FragColor=vec4(color,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sphere=new THREE.Mesh(new THREE.SphereGeometry(540,software?16:32,software?10:20),this.material);this.sphere.frustumCulled=false;this.sphere.renderOrder=-100;this.group.add(this.sphere);this.group.name='atmospheric-sky';
  }
  update(environment:CityEnvironment,position?:{x:number;y?:number;z:number},seconds=0){
    if(position)this.group.position.set(position.x,position.y??0,position.z);
    this.material.uniforms.uDaylight.value=environment.daylight;this.material.uniforms.uRain.value=environment.rain;this.material.uniforms.uSunset.value=environment.period==='ZACHÓD SŁOŃCA'||environment.period==='ŚWIT'?1:0;this.material.uniforms.uTime.value=Number.isFinite(seconds)?seconds:0;
    (this.material.uniforms.uSky.value as THREE.Color).setHex(environment.sky);(this.material.uniforms.uHorizon.value as THREE.Color).setHex(environment.fog);
  }
  destroy(){this.sphere.geometry.dispose();this.material.dispose();this.group.removeFromParent();this.group.clear();}
}

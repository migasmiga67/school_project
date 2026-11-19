import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Keep the frontal hairline above the eyebrows; rear hair is modelled separately. */
export const CHARACTER_HAIR_THETA=Math.PI*.39;
/** The shared head dimensions are scaled against the adult shoulder/torso silhouette. */
export const CHARACTER_HEAD_SCALE=.8;

const oval=(w:number,h:number,d:number,x:number,y:number,z:number,segments=10)=>new THREE.SphereGeometry(.5,segments,Math.max(6,Math.round(segments*.7))).scale(w,h,d).translate(x,y,z);
/** Human head: a cranium wider at the back, temples, cheekbones and a jaw tapering to the chin. Faces -Z. */
export function createHeadGeometry(segments=22){
 const geometry=new THREE.SphereGeometry(.5,segments,Math.max(8,Math.round(segments*.8))),p=geometry.getAttribute('position');
 for(let i=0;i<p.count;i++){
  const v=p.getY(i)/.5;let x=p.getX(i)*.38,y=p.getY(i)*.44,z=p.getZ(i)*.35;
  if(v<-.08){const t=Math.min(1,(-v-.08)/.92);x*=1-.36*t*t;z*=z<0?1-.06*t:1-.38*t;y-=t*t*.012;}
  if(v>.15&&z>0)z*=1.06;
  // Slightly flatter face plane and gentle eye sockets under the brow ridge.
  if(z<-.1&&v>-.35&&v<.55)z*=.975;
  for(const side of[-1,1]){const d=Math.hypot(x-side*.075,y-.045);if(z<0&&d<.065)z*=1-.07*(1-d/.065);}
  p.setXYZ(i,x,y,z);
 }
 geometry.computeVertexNormals();return geometry;
}
function combine(parts:THREE.BufferGeometry[]){const geometry=mergeGeometries(parts);parts.forEach(part=>part.dispose());return geometry;}
function tint(geometry:THREE.BufferGeometry,color:number){
 const value=new THREE.Color(color),colors=new Float32Array(geometry.getAttribute('position').count*3);
 for(let index=0;index<colors.length;index+=3){colors[index]=value.r;colors[index+1]=value.g;colors[index+2]=value.b;}
 geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));return geometry;
}

/** Head-local details, facing -Z. Ownership of each geometry passes to the caller. */
export function createCharacterFaceParts(){
 const skin=combine([
  // Ears with a rim and lobe.
  ...[-1,1].flatMap(side=>[oval(.045,.1,.07,side*.186,-.008,.012),oval(.02,.07,.03,side*.198,0,-.002)]),
  // Nose: bridge, tip and nostril wings.
  oval(.032,.095,.048,0,-.002,-.168),oval(.042,.034,.044,0,-.042,-.192),
  oval(.02,.02,.026,-.02,-.05,-.183),oval(.02,.02,.026,.02,-.05,-.183),
  // Upper eyelids.
  ...[-.075,.075].map(x=>oval(.064,.014,.026,x,.056,-.165)),
 ]);
 const brows=combine([oval(.074,.017,.02,-.075,.078,-.17),oval(.074,.017,.02,.075,.078,-.17)]);
 const features=combine([
  ...[-.075,.075].flatMap(x=>[
   tint(oval(.058,.027,.022,x,.043,-.166),0xe9e3d7),
   tint(oval(.024,.025,.012,x,.043,-.177),0x4c5a45),
   tint(oval(.011,.014,.008,x,.043,-.183),0x101619),
   tint(oval(.005,.005,.003,x-.005,.048,-.186),0xffffff),
  ]),
  tint(oval(.072,.018,.024,0,-.092,-.166),0x9a5a52),
  tint(oval(.066,.004,.01,0,-.1,-.176),0x4a2a28),
  tint(oval(.064,.02,.024,0,-.108,-.162),0xa8665c),
 ]);
 return{skin,features,brows};
}

/** Compact vertex-coloured face for cached remote avatar bodies. Excludes the cranium and hairstyle. */
export function createCharacterFaceGeometry(skin:number,hair:number){
 const parts=createCharacterFaceParts();return combine([tint(parts.skin,skin),parts.features,tint(parts.brows,hair)]);
}

/** Shared adult proportions for instanced ambient pedestrians. */
export function createPedestrianHeadGeometry(){
 const parts=createCharacterFaceParts();parts.features.dispose();parts.brows.dispose();
 // The neck overlaps the shirt after the adult head scale, avoiding a floating head during gait.
 return combine([createHeadGeometry(10),oval(.14,.24,.14,0,-.255,.015),parts.skin]);
}
export function createPedestrianHairGeometry(){
 const cap=new THREE.SphereGeometry(.2,10,6,0,Math.PI*2,0,CHARACTER_HAIR_THETA);cap.scale(1.03,1.13,.94);cap.translate(0,.018,.006);
 const brows=createCharacterFaceParts();brows.skin.dispose();brows.features.dispose();return combine([cap,brows.brows]);
}

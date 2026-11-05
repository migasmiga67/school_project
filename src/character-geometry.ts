import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Keep the frontal hairline above the eyebrows; rear hair is modelled separately. */
export const CHARACTER_HAIR_THETA=Math.PI*.39;
/** The shared head dimensions are scaled against the adult shoulder/torso silhouette. */
export const CHARACTER_HEAD_SCALE=.8;

const oval=(w:number,h:number,d:number,x:number,y:number,z:number)=>new THREE.SphereGeometry(.5,10,7).scale(w,h,d).translate(x,y,z);
function combine(parts:THREE.BufferGeometry[]){const geometry=mergeGeometries(parts);parts.forEach(part=>part.dispose());return geometry;}
function tint(geometry:THREE.BufferGeometry,color:number){
 const value=new THREE.Color(color),colors=new Float32Array(geometry.getAttribute('position').count*3);
 for(let index=0;index<colors.length;index+=3){colors[index]=value.r;colors[index+1]=value.g;colors[index+2]=value.b;}
 geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));return geometry;
}

/** Head-local details, facing -Z. Ownership of each geometry passes to the caller. */
export function createCharacterFaceParts(){
 const skin=combine([
  oval(.052,.103,.075,-.186,-.012,.006),oval(.052,.103,.075,.186,-.012,.006),
  oval(.052,.082,.076,0,-.005,-.171),oval(.057,.032,.041,0,-.038,-.201),
 ]);
 const brows=combine([oval(.074,.018,.018,-.075,.076,-.166),oval(.074,.018,.018,.075,.076,-.166)]);
 const features=combine([
  ...[-.075,.075].flatMap(x=>[
   tint(oval(.064,.031,.025,x,.043,-.169),0xe9e3d7),
   tint(oval(.024,.027,.012,x,.043,-.182),0x39443e),
   tint(oval(.011,.019,.008,x,.043,-.188),0x142127),
  ]),
  tint(oval(.078,.014,.016,0,-.096,-.158),0x805650),
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
 return combine([oval(.38,.44,.35,0,0,0),oval(.14,.24,.14,0,-.255,.015),parts.skin]);
}
export function createPedestrianHairGeometry(){
 const cap=new THREE.SphereGeometry(.2,10,6,0,Math.PI*2,0,CHARACTER_HAIR_THETA);cap.scale(1.03,1.13,.94);cap.translate(0,.018,.006);
 const brows=createCharacterFaceParts();brows.skin.dispose();brows.features.dispose();return combine([cap,brows.brows]);
}

import { WORLD_BOUNDS, type Point } from './model';

export interface WorldLandmark {id:string;name:string;description:string;point:Point}
/** Street-center destinations stay usable by GPS, cars and pedestrians alike. */
export const WORLD_LANDMARKS:readonly WorldLandmark[]=[
 {id:'westwood',name:'Westwood Park',description:'Zachodnia dzielnica i zielone bulwary.',point:{x:-160,z:40}},
 {id:'north-financial',name:'North Financial',description:'Nowa północna dzielnica biurowa.',point:{x:-40,z:-160}},
 {id:'port-nelson',name:'Port Nelson',description:'Magazyny i przemysłowe nabrzeże na południu.',point:{x:-120,z:160}},
 {id:'south-bay',name:'South Bay',description:'Długa promenada i południowe wybrzeże.',point:{x:80,z:160}},
];
const originalArea=(98+96)*(98+98);
export const MAP_AREA_RATIO=(WORLD_BOUNDS.maxX-WORLD_BOUNDS.minX)*(WORLD_BOUNDS.maxZ-WORLD_BOUNDS.minZ)/originalArea;
export function districtAt(point:Point):string {
 if(!Number.isFinite(point.x)||!Number.isFinite(point.z))return'Neon Coast';
 if(point.x>115)return'Ocean Drive · zatoka';
 if(point.z>100)return point.x>20?'South Bay':'Port Nelson';
 if(point.z< -100)return'North Financial';
 if(point.x< -100)return'Westwood';
 if(point.x>60)return'Ocean Drive';
 if(point.z< -40)return'North Heights';
 if(point.x< -40)return'Little Havana';
 if(point.z>40)return'Southside';
 return'Downtown';
}

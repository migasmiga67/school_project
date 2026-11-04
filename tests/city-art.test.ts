import { describe,expect,it } from 'vitest';
import * as THREE from 'three';
import { polygon,ribbon } from '../src/city-art';
import type { Point } from '../src/model';

/** FrontSide ground must face the camera above it, including each indexed face. */
function expectUpwardFaces(geometry:THREE.BufferGeometry){
  const positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal'),index=geometry.index;
  const count=index?.count??positions.count,a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  expect(count).toBeGreaterThan(0);
  for(let face=0;face<count;face+=3){
    const ids=[0,1,2].map(offset=>index?index.getX(face+offset):face+offset);
    a.fromBufferAttribute(positions,ids[0]);b.fromBufferAttribute(positions,ids[1]);c.fromBufferAttribute(positions,ids[2]);
    const faceNormal=new THREE.Vector3().crossVectors(b.sub(a),c.sub(a));
    expect(faceNormal.y,`triangle ${face/3} must face above the street`).toBeGreaterThan(0);
    for(const vertex of ids){expect(normals.getY(vertex)).toBeCloseTo(1,6);expect(Number.isFinite(positions.getX(vertex)+positions.getY(vertex)+positions.getZ(vertex))).toBe(true);}
  }
}

const closedCurve:Point[]=Array.from({length:17},(_,index)=>({x:Math.cos(index/16*Math.PI*2)*18,z:Math.sin(index/16*Math.PI*2)*13}));
const paths:{name:string;points:Point[]}[]=[
  {name:'north-south',points:[{x:0,z:-25},{x:0,z:25}]},
  {name:'east-west',points:[{x:-25,z:0},{x:25,z:0}]},
  {name:'diagonal',points:[{x:-19,z:28},{x:13,z:-21}]},
  {name:'closed curved',points:closedCurve},
];

describe('street surface visibility without a renderer',()=>{
  for(const {name,points} of paths)for(const offset of[-2,0,2])it(`faces upward on a ${name} path at lateral offset ${offset}`,()=>{
    const geometry=ribbon(points,3,.078,offset);
    try{expectUpwardFaces(geometry);}finally{geometry.dispose();}
  });
  for(const reversed of[false,true])it(`faces upward on a concave public-space polygon with ${reversed?'reversed':'original'} perimeter order`,()=>{
    const points=[{x:-9,z:-7},{x:8,z:-7},{x:8,z:2},{x:1,z:2},{x:1,z:8},{x:-9,z:8}];
    const geometry=polygon(reversed?points.reverse():points,.045);
    try{expectUpwardFaces(geometry);}finally{geometry.dispose();}
  });
});

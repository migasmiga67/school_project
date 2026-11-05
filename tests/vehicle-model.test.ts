import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {createVehicleModel,type RoadCarKind} from '../src/vehicle-model';

describe('shared detailed road vehicle',()=>{
  it.each<RoadCarKind>(['sport','sedan','police'])('%s has tapered glazing, exposed arches and bounded batched geometry',kind=>{
    for(const software of[false,true]){
      const model=createVehicleModel(kind,0x42759a,{software});
      try{
        expect(model.stats.drawCalls).toBe(kind==='police'?11:9);
        expect(model.stats.triangles).toBeLessThan(18000);
        const bounds=new THREE.Box3().setFromObject(model.group),size=bounds.getSize(new THREE.Vector3());
        expect(bounds.min.y).toBeCloseTo(.03,5);expect(bounds.max.y).toBeLessThan(2.2);
        expect(size.x).toBeLessThan(2.4);expect(size.z).toBeLessThan(5);
        expect(model.chassis.getObjectByName('tapered-glazing')).toBeInstanceOf(THREE.Mesh);
        const glass=model.chassis.getObjectByName('tapered-glazing') as THREE.Mesh;
        const positions=glass.geometry.getAttribute('position');
        let upper=0,lower=0;for(let i=0;i<positions.count;i++){if(positions.getY(i)>1.35)upper=Math.max(upper,Math.abs(positions.getX(i)));else lower=Math.max(lower,Math.abs(positions.getX(i)));}
        expect(upper).toBeLessThan(lower);
        model.group.traverse(object=>{if(object instanceof THREE.Mesh){expect(Array.isArray(object.material)).toBe(false);expect(object.geometry.groups).toHaveLength(0);const p=object.geometry.getAttribute('position');expect(Array.from(p.array).every(Number.isFinite)).toBe(true);}});
      }finally{model.dispose();}
    }
  });

  it('keeps exterior glazing normals facing out and police lettering readable from either side',()=>{
    const model=createVehicleModel('police',0xe3e9ed);
    try{
      const glazing=model.chassis.getObjectByName('tapered-glazing')as THREE.Mesh;
      const glassPosition=glazing.geometry.getAttribute('position'),normals=glazing.geometry.getAttribute('normal');
      for(let i=0;i<glassPosition.count;i++)if(Math.abs(glassPosition.getZ(i)+.96)<.0001){expect(normals.getZ(i)).toBeLessThan(-.5);expect(normals.getY(i)).toBeGreaterThan(0);}
      const trim=model.chassis.getObjectByName('batched-trim-and-livery')as THREE.Mesh;
      const p=trim.geometry.getAttribute('position'),c=trim.geometry.getAttribute('color'),ink=new THREE.Color(0x18354c);
      const pixel=(side:number,col:number,row:number)=>{
        const x=(col*.028-(6*4-1)*.028/2),y=.83+(2-row)*.028;
        for(let i=0;i<p.count;i++)if(Math.abs(c.getX(i)-ink.r)<1e-6&&Math.abs(c.getY(i)-ink.g)<1e-6&&Math.abs(c.getZ(i)-ink.b)<1e-6&&Math.abs(p.getX(i)-side*1.009)<.004&&Math.abs(-side*(p.getZ(i)-.36)-x)<.014&&Math.abs(p.getY(i)-y)<.014)return true;
        return false;
      };
      // On both doors the first P has its lower stem on the reader's left.
      for(const side of[-1,1]){expect(pixel(side,0,3)).toBe(true);expect(pixel(side,2,3)).toBe(false);}
    }finally{model.dispose();}
  });

  it('keeps wheel spin separate from steering and suspension',()=>{
    const model=createVehicleModel('sedan',0x736b61);
    try{
      expect(model.wheels).toHaveLength(4);expect(model.frontWheels).toHaveLength(2);
      for(const pivot of model.frontWheels){expect(pivot.position.z).toBeLessThan(0);expect(pivot.parent).toBe(model.group);expect(model.wheels).toContain(pivot.children[0]);}
      for(const spin of model.wheels){expect(spin.parent?.parent).toBe(model.group);expect(spin.children).toHaveLength(1);expect((spin.children[0]as THREE.Mesh).geometry).toBe((model.wheels[0].children[0]as THREE.Mesh).geometry);}
      model.chassis.rotation.z=.1;expect(model.frontWheels[0].rotation.z).toBe(0);
      model.frontWheels[0].rotation.y=.3;model.wheels[0].rotation.x=2;expect(model.frontWheels[0].rotation.y).toBe(.3);
    }finally{model.dispose();}
  });

  it('headlamps face local -Z and brake lamps face local +Z',()=>{
    const model=createVehicleModel('police',0x20313d);
    try{
      for(const [material,front] of[[model.head,true],[model.brake,false]]as const){
        const mesh=model.chassis.children.find(child=>child instanceof THREE.Mesh&&child.material===material)as THREE.Mesh;
        const box=new THREE.Box3().setFromBufferAttribute(mesh.geometry.getAttribute('position')as THREE.BufferAttribute);
        expect(front?box.max.z< -2:box.min.z>2).toBe(true);
      }
      expect(model.red).toBeDefined();expect(model.blue).toBeDefined();expect(model.red).not.toBe(model.blue);
    }finally{model.dispose();}
  });

  it('each car owns mutable paint and releases shared wheel resources exactly once',()=>{
    const one=createVehicleModel('sedan',0x223344),two=createVehicleModel('sedan',0x223344);
    try{
      one.paint.color.setHex(0xaabbcc);expect(two.paint.color.getHex()).toBe(0x223344);
      const wheel=(one.wheels[0].children[0]as THREE.Mesh).geometry,dispose=vi.spyOn(wheel,'dispose'),material=vi.spyOn(one.paint,'dispose');
      one.dispose();one.dispose();expect(dispose).toHaveBeenCalledOnce();expect(material).toHaveBeenCalledOnce();expect(one.group.children).toHaveLength(0);
    }finally{one.dispose();two.dispose();}
  });
});

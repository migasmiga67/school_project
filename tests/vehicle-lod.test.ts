import { describe,expect,it,vi } from 'vitest';
import * as THREE from 'three';
import { VehicleLodLibrary, type DistantCarKind } from '../src/vehicle-lod';

describe('distant vehicle visual resources',()=>{
  it.each<DistantCarKind>(['sport','sedan','police'])('%s is a grounded car silhouette with exactly two single-material draws',kind=>{
    const library=new VehicleLodLibrary();
    try{
      const visual=library.create(kind,0xb95b48);
      const meshes=visual.group.children as THREE.Mesh<THREE.BufferGeometry,THREE.MeshLambertMaterial>[];
      expect(meshes).toHaveLength(2);
      let triangles=0;
      for(const mesh of meshes){
        expect(mesh).toBeInstanceOf(THREE.Mesh);expect(Array.isArray(mesh.material)).toBe(false);expect(mesh.geometry.groups).toHaveLength(0);
        const position=mesh.geometry.getAttribute('position');
        expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
        triangles+=(mesh.geometry.index?.count??position.count)/3;
      }
      expect(triangles).toBeLessThan(400);
      const bounds=new THREE.Box3().setFromObject(visual.group),size=bounds.getSize(new THREE.Vector3());
      expect(bounds.min.y).toBeCloseTo(.03,5);expect(size.x).toBeGreaterThan(1.9);expect(size.x).toBeLessThan(2.4);
      expect(size.z).toBeGreaterThan(4.4);expect(size.z).toBeLessThan(5);expect(bounds.max.y).toBeLessThan(2.2);
      const details=meshes[1].geometry.getAttribute('color');
      expect(details.count).toBe(meshes[1].geometry.getAttribute('position').count);
      // Front lamps lie at local -Z, matching full cars and the simulation heading.
      const positions=meshes[1].geometry.getAttribute('position'),head=new THREE.Color(0xfff1c7);
      let lamps=0;
      for(let i=0;i<details.count;i++)if(Math.abs(details.getX(i)-head.r)<1e-6&&Math.abs(details.getY(i)-head.g)<1e-6&&Math.abs(details.getZ(i)-head.b)<1e-6){expect(positions.getZ(i)).toBeLessThan(-2);lamps++;}
      expect(lamps).toBeGreaterThan(0);
    }finally{library.destroy();}
  });

  it('shares kind geometry and paint materials while repainting leaves other cars unchanged',()=>{
    const library=new VehicleLodLibrary();
    try{
      const first=library.create('sedan',0x336699),second=library.create('sedan',0x336699),police=library.create('police',0x336699);
      expect(first.paint.geometry).toBe(second.paint.geometry);expect(first.paint.geometry).not.toBe(police.paint.geometry);
      expect(first.paint.material).toBe(second.paint.material);expect(first.paint.material).toBe(police.paint.material);
      expect((first.group.children[1]as THREE.Mesh).material).toBe((police.group.children[1]as THREE.Mesh).material);
      library.setColor(first,0xc89040);
      expect(first.paint.material.color.getHex()).toBe(0xc89040);expect(second.paint.material.color.getHex()).toBe(0x336699);
      library.setColor(second,0xc89040);expect(first.paint.material).toBe(second.paint.material);
      const disposed=vi.spyOn(first.paint.geometry,'dispose');
      first.group.removeFromParent();first.group.clear();expect(disposed).not.toHaveBeenCalled();
      library.destroy();expect(disposed).toHaveBeenCalledOnce();
    }finally{library.destroy();}
  });
});

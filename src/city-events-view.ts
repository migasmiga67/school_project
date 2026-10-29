import * as THREE from 'three';
import type { CityEventsSnapshot } from './city-events';

/** The convoy is a real moving target; the marker follows the host's current objective. */
export class CityEventsView {
  readonly group=new THREE.Group();
  private readonly convoy=new THREE.Group();
  private readonly target=new THREE.Group();
  private readonly ring:THREE.Mesh;
  private readonly beacon:THREE.Mesh;
  private clock=0;
  constructor(){
    this.group.name='city-activities';this.convoy.name='armored-convoy';
    const box=(parent:THREE.Object3D,w:number,h:number,d:number,color:number,x=0,y=0,z=0,unlit=false)=>{
      const material=unlit?new THREE.MeshBasicMaterial({color}):new THREE.MeshLambertMaterial({color});
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
    };
    box(this.convoy,2.7,1.5,5.2,0x45616c,0,1.3,0);
    box(this.convoy,2.5,1.2,2,0x65777a,0,2.2,.65);
    box(this.convoy,2.3,.6,.08,0x172d3a,0,2.26,-.4);
    box(this.convoy,.1,.6,1.4,0x172d3a,-1.27,2.26,.65);box(this.convoy,.1,.6,1.4,0x172d3a,1.27,2.26,.65);
    box(this.convoy,2.75,.25,.2,0x1b2b35,0,.7,-2.7);box(this.convoy,2.75,.25,.2,0x1b2b35,0,.7,2.7);
    for(const x of [-.9,.9]){box(this.convoy,.45,.25,.1,0xf4e1ac,x,1,-2.65,true);box(this.convoy,.3,.4,.1,0xf25e58,x,1,2.65,true);}
    for(const x of [-1.4,1.4])for(const z of [-1.7,1.7]){
      const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.58,.58,.3,8),new THREE.MeshLambertMaterial({color:0x151c25}));wheel.rotation.z=Math.PI/2;wheel.position.set(x,.6,z);this.convoy.add(wheel);
    }
    box(this.convoy,.16,1.2,1.6,0xa6c2c1,0,1.55,2.62);box(this.convoy,1.3,.08,.04,0xe7c577,0,2.1,2.73,true);
    this.ring=new THREE.Mesh(new THREE.TorusGeometry(3.4,.12,5,40),new THREE.MeshBasicMaterial({color:0xf0c985,transparent:true,opacity:.8}));this.ring.rotation.x=-Math.PI/2;this.ring.position.y=.16;this.target.add(this.ring);
    this.beacon=new THREE.Mesh(new THREE.OctahedronGeometry(.55),new THREE.MeshBasicMaterial({color:0x8ce9dd}));this.beacon.position.y=3.5;this.target.add(this.beacon);
    this.group.add(this.convoy,this.target);this.group.visible=false;
  }
  update(snapshot:CityEventsSnapshot|null,indoors=false,dt=0){
    this.clock+=Number.isFinite(dt)?Math.max(0,dt):0;
    const active=Boolean(snapshot&&(snapshot.status==='available'||snapshot.status==='active'));
    this.group.visible=active&&!indoors;
    if(!snapshot||!active)return;
    this.convoy.visible=Boolean(snapshot.convoy);
    if(snapshot.convoy){this.convoy.position.set(snapshot.convoy.x,0,snapshot.convoy.z);this.convoy.rotation.y=-snapshot.convoy.heading;}
    this.target.visible=Boolean(snapshot.target);
    if(snapshot.target)this.target.position.set(snapshot.target.x,0,snapshot.target.z);
    this.ring.scale.setScalar(1+Math.sin(this.clock*3)*.045);this.beacon.position.y=3.5+Math.sin(this.clock*2)*.25;this.beacon.rotation.y=this.clock;
  }
  destroy(){
    this.group.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();}});
    this.group.removeFromParent();this.group.clear();
  }
}

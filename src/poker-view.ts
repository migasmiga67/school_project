import * as THREE from 'three';
import type { Card, PokerState } from './poker-model';

/** The same dealt hand as the HUD, laid on the physical casino table. */
export class PokerTableView {
  readonly group = new THREE.Group();
  private readonly textures = new Set<THREE.Texture>();
  private readonly materials = new Map<string, THREE.MeshBasicMaterial>();
  private readonly geometry = new THREE.PlaneGeometry(.47, .66);
  private readonly cards: THREE.Mesh[] = [];
  private readonly chips: THREE.InstancedMesh;
  private readonly dealer: THREE.Mesh;
  private readonly turn: THREE.Mesh;
  private signature = '';
  private readonly seats = [{x:0,z:1.13,angle:0},{x:-2.48,z:0,angle:-Math.PI/2},{x:0,z:-1.13,angle:Math.PI},{x:2.48,z:0,angle:Math.PI/2}];

  constructor() {
    this.group.name = 'Live Texas Holdem cards and chips';
    for (let i = 0; i < 13; i++) {
      const card = new THREE.Mesh(this.geometry, this.cardMaterial('back'));
      card.rotation.x = -Math.PI / 2; card.position.y = 1.315;
      card.visible = false; this.group.add(card); this.cards.push(card);
    }
    const chipGeometry = new THREE.CylinderGeometry(.105,.105,.045,12);
    this.chips = new THREE.InstancedMesh(chipGeometry, new THREE.MeshLambertMaterial({color:0xffffff}),80);
    this.chips.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.chips.count=0; this.group.add(this.chips);
    this.dealer = new THREE.Mesh(new THREE.CylinderGeometry(.14,.14,.045,18),new THREE.MeshBasicMaterial({map:this.discTexture('D','#f0dfb6','#293e39')}));
    this.dealer.position.y=1.35;this.dealer.visible=false;this.group.add(this.dealer);
    this.turn = new THREE.Mesh(new THREE.TorusGeometry(.22,.025,5,24),new THREE.MeshBasicMaterial({color:0xf5d891}));
    this.turn.rotation.x=-Math.PI/2;this.turn.position.y=1.34;this.turn.visible=false;this.group.add(this.turn);
  }

  private discTexture(text:string,background:string,foreground:string) {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle=background;ctx.fillRect(0,0,128,128);
    ctx.fillStyle=foreground;ctx.font='bold 85px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,64,69);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;this.textures.add(texture);return texture;
  }

  private cardMaterial(key:string,card?:Card) {
    const existing=this.materials.get(key);if(existing)return existing;
    const canvas=document.createElement('canvas');canvas.width=192;canvas.height=272;
    const ctx=canvas.getContext('2d')!;
    if(!card) {
      ctx.fillStyle='#d5c999';ctx.fillRect(0,0,192,272);ctx.fillStyle='#164e49';ctx.fillRect(10,10,172,252);
      ctx.strokeStyle='#83a791';ctx.lineWidth=2;
      for(let p=-260;p<500;p+=20){ctx.beginPath();ctx.moveTo(p,10);ctx.lineTo(p+250,262);ctx.stroke();}
      ctx.fillStyle='#d6c28c';ctx.font='80px Georgia';ctx.textAlign='center';ctx.fillText('♠',96,166);
    } else {
      ctx.fillStyle='#fff7e5';ctx.fillRect(0,0,192,272);ctx.strokeStyle='#c9bc9f';ctx.lineWidth=5;ctx.strokeRect(3,3,186,266);
      ctx.fillStyle=card.suit==='♥'||card.suit==='♦'?'#b63145':'#1e3039';
      const rank=({11:'J',12:'Q',13:'K',14:'A'} as Record<number,string>)[card.rank]??String(card.rank);
      ctx.font='bold 48px Georgia';ctx.textAlign='left';ctx.fillText(rank,14,50);ctx.font='36px Georgia';ctx.fillText(card.suit,17,88);
      ctx.textAlign='center';ctx.font='90px Georgia';ctx.fillText(card.suit,96,174);
      ctx.save();ctx.translate(192,272);ctx.rotate(Math.PI);ctx.textAlign='left';ctx.font='bold 48px Georgia';ctx.fillText(rank,14,50);ctx.font='36px Georgia';ctx.fillText(card.suit,17,88);ctx.restore();
    }
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;this.textures.add(texture);
    const material=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide});this.materials.set(key,material);return material;
  }

  update(state:PokerState|null,seated:boolean) {
    const signature=seated+':'+(state?JSON.stringify([state.handNumber,state.phase,state.actor,state.dealer,state.pot,state.board,state.players.map(p=>[p.stack,p.bet,p.folded,p.hole])]):'lobby');
    if(signature===this.signature)return;this.signature=signature;
    this.cards.forEach(card=>card.visible=false);this.chips.count=0;this.dealer.visible=false;this.turn.visible=false;
    if(!state)return;
    state.board.forEach((card,index)=>{
      const mesh=this.cards[index];mesh.visible=true;mesh.position.set((index-2)*.56,1.316,.04);
      mesh.rotation.set(-Math.PI/2,0,0);mesh.material=this.cardMaterial(`${card.rank}${card.suit}`,card);
    });
    state.players.forEach((player,index)=>{
      const position=this.seats[index],faceUp=index===0||(state.phase==='showdown'&&!player.folded);
      player.hole.forEach((card,slot)=>{
        const mesh=this.cards[5+index*2+slot];mesh.visible=true;
        const offset=(slot-.5)*.51;
        mesh.position.set(position.x+Math.cos(position.angle)*offset,1.318,position.z-Math.sin(position.angle)*offset);
        mesh.rotation.set(-Math.PI/2,0,-position.angle);
        mesh.material=faceUp?this.cardMaterial(`${card.rank}${card.suit}`,card):this.cardMaterial('back');
      });
    });
    const matrix=new THREE.Object3D();let count=0;
    const stack=(amount:number,x:number,z:number,color:number)=>{
      const visible=Math.min(12,Math.ceil(amount/20));
      for(let i=0;i<visible&&count<80;i++){
        matrix.position.set(x+(Math.floor(i/6))*.24,1.35+(i%6)*.045,z);matrix.updateMatrix();
        this.chips.setMatrixAt(count,matrix.matrix);this.chips.setColorAt(count,new THREE.Color(color));count++;
      }
    };
    stack(state.pot,0,-.67,0xc8aa61);
    state.players.forEach((player,index)=>{
      const p=this.seats[index];stack(player.stack,p.x*.91+(index===0?.87:index===2?-.82:0),p.z*.91+(index===1?-.65:index===3?.65:0),[0xc8a75f,0x8a5270,0x6c9fb8,0x75a78d][index]);
      if(player.bet>0)stack(player.bet,p.x*.65,p.z*.65,0xd7d4b7);
    });
    this.chips.count=count;this.chips.instanceMatrix.needsUpdate=true;if(this.chips.instanceColor)this.chips.instanceColor.needsUpdate=true;
    this.chips.computeBoundingSphere();
    const dealer=this.seats[state.dealer];this.dealer.position.set(dealer.x*.77-.26,1.35,dealer.z*.77);this.dealer.visible=true;
    if(state.actor!==null){const p=this.seats[state.actor];this.turn.position.set(p.x*.75,1.35,p.z*.75);this.turn.visible=true;}
  }

  destroy() {
    this.geometry.dispose();this.chips.geometry.dispose();(this.chips.material as THREE.Material).dispose();
    this.dealer.geometry.dispose();(this.dealer.material as THREE.Material).dispose();this.turn.geometry.dispose();(this.turn.material as THREE.Material).dispose();
    this.materials.forEach(material=>material.dispose());this.textures.forEach(texture=>texture.dispose());this.group.removeFromParent();
  }
}

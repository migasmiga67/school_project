import type { GameState } from './model';

export interface CameraPose { yaw: number; pitch: number; zoom: number }
const clamp = (value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const wrap = (angle:number)=>Math.atan2(Math.sin(angle),Math.cos(angle));

/** Camera orientation is independent of the character's movement direction. */
export class OrbitCamera implements CameraPose {
  yaw=0;
  pitch=0.38;
  zoom=1;
  private mode=0;
  private time=0;
  private lastMouse=-Infinity;
  private actor: string|null=null;

  rotate(dx:number,dy:number) {
    if(!Number.isFinite(dx)||!Number.isFinite(dy))return;
    this.yaw=wrap(this.yaw+clamp(dx,-500,500)*0.003);
    const [min,max]=this.mode===2?[-1.1,1.1]:this.mode===1?[0.5,1.35]:[0.08,1.2];
    this.pitch=clamp(this.pitch+clamp(dy,-500,500)*0.0025,min,max);
    this.lastMouse=this.time;
  }
  zoomBy(delta:number) {
    if(!Number.isFinite(delta))return;
    this.zoom=clamp(this.zoom*Math.exp(clamp(delta,-500,500)*0.001),0.55,2.1);
  }
  setMode(mode:number,heading:number) {
    this.mode=mode;
    this.yaw=Number.isFinite(heading)?wrap(heading):0;
    this.pitch=mode===1?1.0:mode===2?0.02:0.38;
    this.zoom=1;
    this.lastMouse=this.time;
  }
  update(player:GameState['player'],dt:number,speed:number,dragging=false) {
    if(!Number.isFinite(dt)||dt<=0)return;
    this.time+=Math.min(dt,0.2);
    // Walking never recentres on the movement vector: A/D remain strafing.
    if(player.mode==='drive'&&player.vehicleId!==this.actor) {
      this.yaw=wrap(player.heading);this.lastMouse=this.time;
    }
    this.actor=player.vehicleId;
    if(player.mode==='drive'&&this.mode!==1&&!dragging&&Math.abs(speed)>2&&this.time-this.lastMouse>3) {
      this.yaw=wrap(this.yaw+wrap(player.heading-this.yaw)*(1-Math.exp(-dt*2.5)));
    }
  }
}

interface MouseLookOptions {
  active:()=>boolean;
  onChange:()=>void;
  onUnlock:()=>void;
  onUnavailable:()=>void;
}

/** Click-to-lock and right-button drag share the same camera, with touch fallback. */
export class MouseLook {
  private dragId:number|null=null;
  private lastX=0;
  private lastY=0;
  private wasLocked=false;
  private ignoreUnlock=false;
  private unavailableNotified=false;
  private readonly abort=new AbortController();
  constructor(private canvas:HTMLCanvasElement,private orbit:OrbitCamera,private options:MouseLookOptions) {
    const signal=this.abort.signal;
    canvas.addEventListener('contextmenu',event=>{if(options.active())event.preventDefault();},{signal});
    canvas.addEventListener('pointerdown',event=>this.pointerDown(event),{signal});
    canvas.addEventListener('pointermove',event=>{
      if(this.locked||this.dragId!==event.pointerId||!options.active())return;
      this.orbit.rotate(event.clientX-this.lastX,event.clientY-this.lastY);
      this.lastX=event.clientX;this.lastY=event.clientY;options.onChange();
    },{signal});
    canvas.addEventListener('pointerup',event=>{if(this.dragId===event.pointerId)this.stopDrag();},{signal});
    canvas.addEventListener('pointercancel',()=>this.stopDrag(),{signal});
    canvas.addEventListener('wheel',event=>{
      if(!options.active())return;
      event.preventDefault();this.orbit.zoomBy(event.deltaY);options.onChange();
    },{signal,passive:false});
    document.addEventListener('mousemove',event=>{
      if(!this.locked||!options.active())return;
      this.orbit.rotate(event.movementX,event.movementY);options.onChange();
    },{signal});
    document.addEventListener('pointerlockchange',()=>{
      const locked=this.locked;
      if(locked)this.stopDrag();
      const shouldPause=this.wasLocked&&!locked&&!this.ignoreUnlock;
      this.wasLocked=locked;this.ignoreUnlock=false;options.onChange();
      if(shouldPause)options.onUnlock();
    },{signal});
    document.addEventListener('pointerlockerror',()=>this.unavailable(),{signal});
    window.addEventListener('blur',()=>this.stopDrag(),{signal});
  }
  get locked(){return document.pointerLockElement===this.canvas;}
  get dragging(){return this.dragId!==null;}
  private pointerDown(event:PointerEvent) {
    if(!this.options.active()||this.locked||![0,2].includes(event.button))return;
    event.preventDefault();
    this.dragId=event.pointerId;this.lastX=event.clientX;this.lastY=event.clientY;
    this.canvas.setPointerCapture(event.pointerId);
    // Right-button drag and touch work even when pointer lock is unavailable.
    if(event.button===0&&event.pointerType==='mouse') {
      try {
        if(!this.canvas.requestPointerLock){this.unavailable();return;}
        const request=this.canvas.requestPointerLock();
        if(request&&typeof request.catch==='function')void request.catch(()=>this.unavailable());
      } catch {this.unavailable();}
    }
  }
  private unavailable() {
    if(!this.unavailableNotified){this.unavailableNotified=true;this.options.onUnavailable();}
  }
  private stopDrag() {
    if(this.dragId!==null&&this.canvas.hasPointerCapture(this.dragId))this.canvas.releasePointerCapture(this.dragId);
    this.dragId=null;
  }
  release() {
    this.stopDrag();
    if(this.locked){this.ignoreUnlock=true;document.exitPointerLock();}
  }
  destroy(){this.release();this.abort.abort();}
}

export interface AvatarMotionInput {speed?:number;heading?:number;dt?:number}
export interface AvatarMotionPose {
 leftLeg:number;rightLeg:number;leftArm:number;rightArm:number;
 bob:number;sway:number;lean:number;roll:number;torsoYaw:number;headYaw:number;yawOffset:number;
 strideWeight:number;speed:number;cadence:number;phase:number;
}
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const angle=(value:number)=>Math.atan2(Math.sin(value),Math.cos(value));
const ease=(from:number,to:number,rate:number,dt:number)=>from+(to-from)*(1-Math.exp(-rate*dt));
const fresh=():AvatarMotionPose=>({leftLeg:0,rightLeg:0,leftArm:0,rightArm:0,bob:0,sway:0,lean:0,roll:0,torsoYaw:0,headYaw:0,yawOffset:0,strideWeight:0,speed:0,cadence:1.55,phase:0});

/** Visual motion only: it cannot move a player, alter speed or consume input. */
export class AvatarMotion {
 private pose=fresh();
 private lastTime:number|null=null;
 private heading:number|null=null;
 private lastHeading:number|null=null;
 private turn=0;
 private clock=0;
 get snapshot():AvatarMotionPose{return{...this.pose};}
 reset(){this.pose=fresh();this.lastTime=null;this.heading=null;this.lastHeading=null;this.turn=0;this.clock=0;}
 update(walking:boolean,seconds:number,input:AvatarMotionInput={}):AvatarMotionPose {
  const now=Number.isFinite(seconds)?Math.max(0,seconds):this.lastTime??0;
  const derivedDt=this.lastTime===null?1/60:Math.max(0,now-this.lastTime);
  const dt=clamp(Number.isFinite(input.dt)?input.dt!:derivedDt,0,.2);this.lastTime=now;this.clock+=dt;
  const target=walking?clamp(Number.isFinite(input.speed)?input.speed!:3.2,0,8):0;
  const speed=ease(this.pose.speed,target,walking?9:12,dt),weight=ease(this.pose.strideWeight,target>.08?1:0,walking?10:12,dt);
  const running=clamp((speed-3.1)/2.9,0,1),cadence=1.55+running*1.05;
  const phase=(this.pose.phase+dt*cadence*Math.PI*2*weight)%(Math.PI*2);
  let lag=0;
  if(Number.isFinite(input.heading)){
   const heading=angle(input.heading!);
   if(this.heading===null)this.heading=heading;
   this.heading=angle(this.heading+angle(heading-this.heading)*(1-Math.exp(-10*dt)));
   lag=angle(heading-this.heading);
   const turnRate=this.lastHeading===null||dt<=0?0:clamp(angle(heading-this.lastHeading)/dt,-8,8);
   this.turn=ease(this.turn,turnRate,9,dt);this.lastHeading=heading;
  }else this.turn=ease(this.turn,0,9,dt);
  const swing=(.37+running*.29)*weight,armSwing=(.3+running*.27)*weight;
  const idle=(1-weight)*Math.sin(this.clock*1.8)*.014;
  this.pose={
   leftLeg:Math.sin(phase)*swing,rightLeg:Math.sin(phase+Math.PI)*swing,
   leftArm:-Math.sin(phase)*armSwing+idle,rightArm:-Math.sin(phase+Math.PI)*armSwing-idle,
   bob:Math.abs(Math.sin(phase))*(.022+running*.028)*weight+(Math.sin(this.clock*1.8)+1)*.0025*(1-weight),
   sway:Math.sin(phase)*.014*weight,lean:(.025+running*.1)*weight,
   roll:clamp(-this.turn*.018,-.12,.12)*weight+Math.sin(phase)*.018*weight,
   torsoYaw:clamp(-lag*.18,-.26,.26),headYaw:clamp(-lag*.28,-.4,.4),yawOffset:lag,
   strideWeight:weight,speed,cadence,phase,
  };
  return this.snapshot;
 }
}

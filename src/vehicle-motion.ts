/** Presentation-only suspension; these values never change driving or collisions. */
export interface VehicleMotionInput {
  speed:number;
  /** Positive means a right turn, matching the driving input. */
  steer:number;
  heading:number;
}
export interface VehicleMotion {
  steering:number; wheelRotation:number;
  pitch:number; pitchVelocity:number; roll:number; rollVelocity:number;
  heave:number; heaveVelocity:number; yaw:number;
  /** Deceleration strength, independent of the direction of travel. */
  braking:number;
  previousSpeed:number; previousHeading:number; initialized:boolean;
}
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const finite=(value:number,fallback=0)=>Number.isFinite(value)?value:fallback;
const approach=(current:number,target:number,rate:number,dt:number)=>target+(current-target)*Math.exp(-rate*dt);
/** Exact critically damped spring, stable across different rendering frame rates. */
function spring(position:number,velocity:number,target:number,frequency:number,dt:number){
  const offset=position-target,impulse=velocity+frequency*offset,decay=Math.exp(-frequency*dt);
  return{position:target+(offset+impulse*dt)*decay,velocity:(velocity-frequency*impulse*dt)*decay};
}
export function createVehicleMotion():VehicleMotion {
  return{steering:0,wheelRotation:0,pitch:0,pitchVelocity:0,roll:0,rollVelocity:0,heave:0,heaveVelocity:0,yaw:0,braking:0,previousSpeed:0,previousHeading:0,initialized:false};
}

/** Wheels use signed travel / tyre radius; parked steering still moves the front axle. */
export function stepVehicleMotion(previous:Readonly<VehicleMotion>,input:Readonly<VehicleMotionInput>,seconds:number):VehicleMotion {
  const dt=clamp(finite(seconds),0,.1);
  if(dt===0)return{...previous};
  const speed=clamp(finite(input.speed),-60,100),heading=finite(input.heading),steer=clamp(finite(input.steer),-1,1);
  const acceleration=previous.initialized?clamp((speed-previous.previousSpeed)/dt,-32,24):0;
  const turn=previous.initialized?Math.atan2(Math.sin(heading-previous.previousHeading),Math.cos(heading-previous.previousHeading))/dt:0;
  const yawRate=clamp(turn,-2.6,2.6),moving=Math.min(1,Math.abs(speed)/2);
  // Traffic and patrols have no steering input, so their actual heading supplies it.
  const turnSteer=Math.abs(speed)>1?Math.atan(2.8*yawRate/speed)/.48:0;
  const steering=approach(previous.steering,-clamp(Math.abs(steer)>.015?steer:turnSteer,-1,1)*.48,13,dt);
  const pitch=spring(previous.pitch,previous.pitchVelocity,clamp(acceleration*.0038,-.095,.08),11,dt);
  const roll=spring(previous.roll,previous.rollVelocity,clamp(Math.abs(speed)*yawRate*.0045,-.11,.11)*moving,10,dt);
  const heave=spring(previous.heave,previous.heaveVelocity,-Math.min(.018,Math.abs(acceleration)*.0007),15,dt);
  const deceleration=-acceleration*Math.sign(previous.previousSpeed||speed);
  // Ordinary rolling/engine resistance does not switch on the brake lamps.
  const brakingThreshold=5.6+Math.abs(previous.previousSpeed)*.12;
  const braking=approach(previous.braking,clamp((deceleration-brakingThreshold)/12,0,1),deceleration>brakingThreshold?20:8,dt);
  return{
    steering,wheelRotation:previous.wheelRotation+speed*dt/.42,
    pitch:pitch.position,pitchVelocity:pitch.velocity,roll:roll.position,rollVelocity:roll.velocity,
    heave:heave.position,heaveVelocity:heave.velocity,
    yaw:approach(previous.yaw,clamp(yawRate*.018,-.045,.045)*moving,9,dt),braking,
    previousSpeed:speed,previousHeading:heading,initialized:true,
  };
}

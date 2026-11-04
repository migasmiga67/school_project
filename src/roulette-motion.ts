/** European single-zero pockets, clockwise from the centre of the green zero. */
export const ROULETTE_POCKETS = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26] as const;
export const ROULETTE_STEP = Math.PI * 2 / ROULETTE_POCKETS.length;
export const ROULETTE_SPIN_MS = 7200;
const TAU = Math.PI * 2;
const CAPTURE = .84;
const DROP = .70;
const clamp = (value:number) => Math.max(0,Math.min(1,value));
const wrap = (angle:number) => ((angle % TAU) + TAU) % TAU;
const smooth = (value:number) => value * value * (3 - 2 * value);

/** Angles increase clockwise from the top. Travel is unwrapped, in radians. */
export interface RouletteSpin {
  id:number; durationMs:number;
  wheelStart:number; wheelTravel:number; ballStart:number; ballTravel:number;
}
export type RoulettePhase = 'accelerating' | 'spinning' | 'slowing' | 'dropping' | 'settling' | 'settled';
export interface RouletteMotion {
  phase:RoulettePhase; wheelAngle:number; ballAngle:number;
  /** The pocket centres have radius 1; the outer ball track has radius 1.45. */
  ballRadius:number; ballHeight:number; captured:boolean;
}

/** Integral of an accelerating, cruising, then braking angular velocity. */
function travelProgress(t:number,accelerate:number,brake:number):number {
  t=clamp(t);
  const area=accelerate/2+(brake-accelerate)+(1-brake)/3;
  if(t<accelerate)return t*t/(2*accelerate*area);
  if(t<brake)return (accelerate/2+t-accelerate)/area;
  return (accelerate/2+brake-accelerate+(1-brake)/3*(1-((1-t)/(1-brake))**3))/area;
}
const wheelProgress = (t:number) => travelProgress(t,.12,.50);

export function roulettePocketIndexAtAngle(relativeAngle:number):number {
  return Math.round(wrap(relativeAngle)/ROULETTE_STEP)%ROULETTE_POCKETS.length;
}
export function rouletteNumberAtAngle(relativeAngle:number):number {
  return ROULETTE_POCKETS[roulettePocketIndexAtAngle(relativeAngle)];
}

/** The host and both renderers evaluate this same timeline; no frame changes it. */
export function rouletteMotion(spin:RouletteSpin,elapsedMs:number):RouletteMotion {
  const t=clamp(elapsedMs/spin.durationMs);
  const wheelAngle=spin.wheelStart+spin.wheelTravel*wheelProgress(t);
  const wheelAtCapture=spin.wheelStart+spin.wheelTravel*wheelProgress(CAPTURE);
  const captured=t>=CAPTURE;
  let ballAngle=spin.ballStart+spin.ballTravel*travelProgress(t/CAPTURE,.08,.34);
  let ballRadius=1.45,ballHeight=.13;
  if(t>=DROP&&t<CAPTURE){
    const fall=(t-DROP)/(CAPTURE-DROP);
    ballRadius=1.45-.45*smooth(fall);
    ballHeight=.13*(1-smooth(fall))+.045*Math.sin(fall*Math.PI);
  }
  if(captured){
    const settle=(t-CAPTURE)/(1-CAPTURE),bounce=(1-settle)**2;
    ballAngle=spin.ballStart+spin.ballTravel+wheelAngle-wheelAtCapture+Math.sin(settle*Math.PI*6)*ROULETTE_STEP*.16*bounce;
    ballRadius=1+Math.sin(settle*Math.PI*4)*.025*bounce;
    ballHeight=Math.abs(Math.sin(settle*Math.PI*5))*.055*bounce;
  }
  const phase:RoulettePhase=t>=1?'settled':t>=CAPTURE?'settling':t>=DROP?'dropping':t>=.43?'slowing':t>=.12?'spinning':'accelerating';
  return {phase,wheelAngle,ballAngle,ballRadius,ballHeight,captured};
}

/** Only the host supplies randomness. The result is encoded by the final pose. */
export function createRouletteSpin(id:number,random:()=>number,previous:RouletteSpin|null=null):RouletteSpin {
  const prior=previous?rouletteMotion(previous,previous.durationMs):null;
  const wheelStart=prior?wrap(prior.wheelAngle):0,ballStart=prior?wrap(prior.ballAngle):TAU*.2;
  const wheelTravel=(3.5+random()*1.75)*TAU;
  const pocketIndex=Math.floor(random()*ROULETTE_POCKETS.length);
  const target=wheelStart+wheelTravel*wheelProgress(CAPTURE)+pocketIndex*ROULETTE_STEP;
  const ballTravel=-(7+Math.floor(random()*3))*TAU-wrap(ballStart-target);
  return {id,durationMs:ROULETTE_SPIN_MS,wheelStart,wheelTravel,ballStart,ballTravel};
}

/** Reject malformed timelines before a peer can feed them to an animation. */
export function isRouletteSpin(value:unknown):value is RouletteSpin {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const spin=value as Record<string,unknown>;
  const bounded=Number.isSafeInteger(spin.id)&&Number(spin.id)>0&&spin.durationMs===ROULETTE_SPIN_MS
    &&['wheelStart','wheelTravel','ballStart','ballTravel'].every(key=>typeof spin[key]==='number'&&Number.isFinite(spin[key]))
    &&Number(spin.wheelStart)>=0&&Number(spin.wheelStart)<TAU&&Number(spin.ballStart)>=0&&Number(spin.ballStart)<TAU
    &&Number(spin.wheelTravel)>=3.5*TAU&&Number(spin.wheelTravel)<=5.25*TAU
    &&Number(spin.ballTravel)<=-7*TAU&&Number(spin.ballTravel)>=-10*TAU;
  if(!bounded)return false;
  const final=rouletteMotion(value as RouletteSpin,ROULETTE_SPIN_MS),relative=wrap(final.ballAngle-final.wheelAngle);
  return Math.abs(relative-Math.round(relative/ROULETTE_STEP)*ROULETTE_STEP)<1e-8;
}

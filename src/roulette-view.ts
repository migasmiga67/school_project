import type { RouletteSnapshot } from './casino-games';
import { ROULETTE_RED } from './casino-games';
import { ROULETTE_POCKETS, ROULETTE_STEP, rouletteMotion, rouletteNumberAtAngle } from './roulette-motion';

const degrees = (angle:number) => angle * 180 / Math.PI;
const point = (angle:number,radius:number) => `${Math.sin(angle)*radius},${-Math.cos(angle)*radius}`;
const phases = {accelerating:'Rozpędzanie koła',spinning:'Kulka biegnie po obręczy',slowing:'Koło i kulka zwalniają',dropping:'Kulka wpada do kieszeni',settling:'Kulka układa się w kieszeni',settled:'Koło zatrzymane'} as const;
export const rouletteColor = (number:number) => number===0?'green':ROULETTE_RED.has(number)?'red':'black';
export const rouletteColorName = (number:number) => number===0?'zielone zero':ROULETTE_RED.has(number)?'czerwone':'czarne';

/** A local presentation clock. Only the host snapshot can settle a wager. */
export class RoulettePlayback {
 private key='';
 private elapsed=0;
 private sampledAt=0;
 private active=false;
 private duration=0;
 private presented=0;
 update(state:RouletteSnapshot,now=performance.now()) {
  const key=state.spin?JSON.stringify(state.spin):'';
  const same=key!==''&&key===this.key;
  this.elapsed=state.status==='settled'&&state.spin?state.spin.durationMs:Math.max(state.elapsedMs,same?this.time(now):0);
  this.sampledAt=now;this.active=state.status==='spinning';this.key=key;
  this.duration=state.spin?.durationMs??0;this.presented=this.elapsed;
 }
 time(now=performance.now()) {
  // A RAF timestamp can precede a synchronous paint in the same frame. Never
  // move the visible wheel backwards when those two clocks are interleaved.
  this.presented=Math.max(this.presented,Math.min(this.duration,this.elapsed+(this.active?Math.max(0,now-this.sampledAt):0)));
  return this.presented;
 }
}

/** One retained SVG: panel refreshes move this element without rebuilding it. */
export class RouletteView {
 readonly element=document.createElement('div');
 private readonly clock=new RoulettePlayback();
 private readonly wheel:SVGGElement;
 private readonly ball:SVGCircleElement;
 private readonly shadow:SVGEllipseElement;
 private readonly phase:HTMLSpanElement;
 private readonly pockets:SVGPathElement[];
 private readonly reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 private state:RouletteSnapshot|null=null;
 private frame=0;
 private mounted=false;
 private lastPaint=-1;
 private lastPhase='';

 constructor() {
  this.element.id='roulette-wheel';this.element.className='roulette-wheel-view';
  const sectors=ROULETTE_POCKETS.map((number,index)=>{
   const angle=index*ROULETTE_STEP,start=angle-ROULETTE_STEP/2,end=angle+ROULETTE_STEP/2;
   const path=`M${point(start,84)} L${point(start,145)} A145,145 0 0 1 ${point(end,145)} L${point(end,84)} A84,84 0 0 0 ${point(start,84)}Z`;
   return `<g><path class="roulette-pocket ${rouletteColor(number)}" data-pocket-number="${number}" d="${path}"/><path class="roulette-pocket-divider" d="M${point(start,84)}L${point(start,145)}"/><text transform="rotate(${degrees(angle)})" x="0" y="-130" text-anchor="middle" dominant-baseline="middle">${number}</text></g>`;
  }).join('');
  this.element.innerHTML=`<svg viewBox="-180 -180 360 360" role="img" aria-label="Koło ruletki europejskiej: 37 kieszeni, liczby od 0 do 36"><circle class="roulette-wood" r="174"/><circle class="roulette-outer-trim" r="166"/><circle class="roulette-track" r="155"/><g class="roulette-rotor">${sectors}<circle class="roulette-inner-trim" r="83"/><circle class="roulette-hub" r="71"/><path class="roulette-spindle" d="M-48 0H48M0-48V48"/><circle class="roulette-spindle-cap" r="20"/><circle class="roulette-spindle-center" r="8"/></g><ellipse class="roulette-ball-shadow" rx="6.7" ry="5"/><circle class="roulette-ball" r="5.8"/></svg><div class="roulette-motion-caption"><span class="roulette-motion-dot" aria-hidden="true"></span><span class="roulette-motion-phase" role="status" aria-live="polite">Koło gotowe</span></div>`;
  this.wheel=this.element.querySelector<SVGGElement>('.roulette-rotor')!;
  this.ball=this.element.querySelector<SVGCircleElement>('.roulette-ball')!;
  this.shadow=this.element.querySelector<SVGEllipseElement>('.roulette-ball-shadow')!;
  this.phase=this.element.querySelector<HTMLSpanElement>('.roulette-motion-phase')!;
  this.pockets=[...this.element.querySelectorAll<SVGPathElement>('.roulette-pocket')];
 }
 attach(parent:HTMLElement) {parent.append(this.element);this.mounted=true;this.paint();this.schedule();}
 update(state:RouletteSnapshot) {
  this.clock.update(state);this.state=state;
  this.element.dataset.status=state.status;
  this.element.dataset.spinId=String(state.spin?.id??0);
  this.paint();this.schedule();
 }
 detach() {this.mounted=false;cancelAnimationFrame(this.frame);this.frame=0;this.element.remove();}
 destroy() {this.detach();this.state=null;}
 private schedule() {
  if(this.frame||!this.mounted||this.state?.status!=='spinning')return;
  this.frame=requestAnimationFrame(now=>{this.frame=0;this.paint(now);if(this.state?.spin&&this.clock.time(now)<this.state.spin.durationMs)this.schedule();});
 }
 private paint(now=performance.now()) {
  const state=this.state;
  if(!state)return;
  const elapsed=state.spin?Math.min(state.spin.durationMs,this.clock.time(now)):0;
  // Sparse poses respect reduced motion while the real 7.2 s wager continues.
  const sampled=this.reduced.matches&&state.status==='spinning'&&state.spin?Math.min(state.spin.durationMs,Math.floor(elapsed/360)*360):elapsed;
  const motion=state.spin?rouletteMotion(state.spin,sampled):null;
  const phase=state.status==='idle'?'idle':motion?.phase??'settled';
  if(sampled===this.lastPaint&&phase===this.lastPhase&&this.element.dataset.result===String(state.number??''))return;
  this.lastPaint=sampled;this.lastPhase=phase;
  const wheelAngle=motion?.wheelAngle??0,ballAngle=motion?.ballAngle??0,radius=(motion?.ballRadius??1.45)*105;
  const x=Math.sin(ballAngle)*radius,y=-Math.cos(ballAngle)*radius;
  this.wheel.setAttribute('transform',`rotate(${degrees(wheelAngle)})`);
  this.shadow.setAttribute('cx',String(x+1));this.shadow.setAttribute('cy',String(y+2));
  this.ball.setAttribute('cx',String(x));this.ball.setAttribute('cy',String(y-(motion?.ballHeight??0)*28));
  const pocket=motion?.captured?rouletteNumberAtAngle(ballAngle-wheelAngle):null;
  this.element.dataset.phase=phase;this.element.dataset.elapsedMs=String(Math.round(elapsed));
  this.element.dataset.wheelAngle=String(wheelAngle);this.element.dataset.ballAngle=String(ballAngle);
  this.element.dataset.ballRadius=String(motion?.ballRadius??1.45);
  this.element.dataset.ballPocket=pocket===null?'':String(pocket);
  this.element.dataset.result=String(state.number??'');
  const final=state.status==='settled'?state.number:null;
  this.pockets.forEach(path=>path.classList.toggle('roulette-pocket-winner',final!==null&&Number(path.dataset.pocketNumber)===final));
  const description=state.status==='idle'?'Koło gotowe':state.status==='settled'&&final!==null?`Kulka w kieszeni ${final} · ${rouletteColorName(final)}`:phase==='settled'?'Koło zatrzymane · oczekiwanie na rozliczenie':phases[phase as keyof typeof phases];
  if(this.phase.textContent!==description)this.phase.textContent=description;
  this.element.querySelector('svg')!.setAttribute('aria-label',`Ruletka europejska, 37 kieszeni. ${description}.`);
 }
}

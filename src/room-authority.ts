import { CASINO } from './casino-location';
import { WORLD_BOUNDS } from './model';
import { act, createPokerTable, dealHand, foldPokerSeat, legalActions } from './poker';
import { CREW_CHECKPOINTS, CREW_COOLDOWN_MS, CREW_DURATION_MS, CREW_REWARD, MAX_ROOM_PLAYERS, ONLINE_BUY_IN, ONLINE_TURN_MS } from './multiplayer-model';
import type { CrewChallenge, OnlineMember, OnlinePose, OnlineVehicle, RoomCommand, RoomResult, RoomSnapshot } from './multiplayer-model';
import type { PokerAction, PokerSeat, PokerState } from './poker-model';

interface Member { view: OnlineMember; wallet: number; lastSpend: number }
const yes: RoomResult = {ok:true};
const no=(reason:string):RoomResult=>({ok:false,reason});
const handActive=(s:PokerState)=>s.phase!=='waiting'&&s.phase!=='showdown';
const nickname=(value:unknown)=>typeof value==='string'&&!/[\u0000-\u001f\u007f]/.test(value)?value.trim().replace(/\s+/g,' '):'';
const validName=(value:string)=>value.length>=2&&value.length<=18&&/^[\p{L}\p{N} _.-]+$/u.test(value);
const validId=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=128&&/^[A-Za-z0-9_-]+$/.test(value);
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const emptySeat=(index:number):PokerSeat=>({id:`empty-${index}`,name:'Wolne miejsce',stack:0,hole:[],folded:true,allIn:false,bet:0,contributed:0,acted:true});

/** The browser hosting a friends' room owns its table, wallets and turn clock. */
export class RoomAuthority {
  readonly code: string;
  readonly hostId: string;
  private readonly people=new Map<string,Member>();
  private seats:(string|null)[]=[null,null,null,null];
  private table:PokerState;
  private version=0;
  private deadline:number|null=null;
  private now=0;
  private epoch:number|null=null;
  private readonly vehicles=new Map<string,OnlineVehicle>();
  private challengeStatus:CrewChallenge['status']='idle';
  private challengeRun=0;
  private checkpoint=0;
  private challengeDeadline=0;
  private challengeReadyAt=0;
  private readonly challengeEligible=new Set<string>();
  private readonly contributors=new Set<string>();

  constructor(code:string,hostId:string,name:string,seed?:number) {
    if(typeof code!=='string'||!/^[A-Z2-9]{8}$/i.test(code)||!validId(hostId)||!validName(nickname(name)))throw new Error('Niepoprawny kod pokoju lub pseudonim.');
    this.code=code.toUpperCase();this.hostId=hostId;
    this.table=createPokerTable(seed,ONLINE_BUY_IN);this.table.players=this.table.players.map((_,i)=>emptySeat(i));
    this.join(hostId,name);
  }

  join(id:string,name:string):RoomResult {
    const clean=nickname(name);
    if(!validId(id)||!validName(clean))return no('Wpisz pseudonim: 2–18 liter, cyfr, spacji, kropek lub myślników.');
    if(this.people.has(id))return no('Ten gracz jest już w pokoju.');
    if(this.people.size>=MAX_ROOM_PLAYERS)return no('Pokój jest pełny. Mogą grać najwyżej 4 osoby.');
    const occupied=new Set([...this.people.values()].map(p=>p.view.slot));
    const slot=[0,1,2,3].find(index=>!occupied.has(index))!;
    const z=68-slot*7,color=[0xded8cb,0x8f78bf,0x63a9a2,0xe1a86b][slot];
    const pose:OnlinePose={x:0,z,heading:0,mode:'drive',interior:null,seated:false,vehicle:{id:'stratus',kind:'sport',x:0,z,heading:0,color,speed:0,health:100}};
    this.people.set(id,{view:{id,name:clean,slot,pose},wallet:1250,lastSpend:-Infinity});
    return yes;
  }

  leave(id:string):void {
    if(!this.people.has(id))return;
    this.stand(id);
    const car=this.people.get(id)?.view.pose.vehicle;
    if(car&&car.id!=='stratus')this.vehicles.set(car.id,{...car,speed:0});
    this.challengeEligible.delete(id);
    this.people.delete(id);
  }

  command(id:string,command:RoomCommand,now=Date.now()):RoomResult {
    this.tick(now);
    const member=this.people.get(id);
    if(!member)return no('Nie należysz do tego pokoju.');
    if(!command||typeof command!=='object'||typeof command.type!=='string')return no('Niepoprawne polecenie pokoju.');
    switch(command.type) {
      case 'ping': return yes;
      case 'challengeStart': return this.startChallenge(id,member);
      case 'pose': return this.move(member,command.pose);
      case 'sit': return this.sit(id,member);
      case 'stand': return this.stand(id);
      case 'deal': return this.deal(id);
      case 'action': {
        const seat=this.seats.indexOf(id);
        if(seat<0)return no('Najpierw zajmij miejsce przy stole.');
        if(!Number.isSafeInteger(command.version)||command.version!==this.version)return no('Stan stołu się zmienił. Wybierz akcję ponownie.');
        if(!this.validAction(command.action))return no('Niepoprawna akcja pokerowa.');
        const result=act(this.table,seat,command.action);
        if(!result.ok)return no(result.reason);
        this.table=result.state;this.changed();return yes;
      }
      case 'spend': {
        if(!Number.isSafeInteger(command.amount)||command.amount<1||command.amount>200)return no('Niepoprawna opłata.');
        if(this.now-member.lastSpend<1500)return no('Poczekaj przed kolejną opłatą.');
        member.wallet=Math.max(0,member.wallet-command.amount);member.lastSpend=this.now;return yes;
      }
      default: return no('Nieznane polecenie pokoju.');
    }
  }

  tick(now=Date.now()):boolean {
    if(!finite(now)||now<0)return false;
    this.now=Math.max(this.now,now);
    if(this.epoch===null)this.epoch=this.now;
    let changed=false;
    if(this.challengeStatus==='active'&&this.now>=this.challengeDeadline) {
      this.challengeStatus='failed';this.challengeReadyAt=this.challengeDeadline+CREW_COOLDOWN_MS;changed=true;
    }
    if(this.deadline===null||this.now<this.deadline||!handActive(this.table)||this.table.actor===null)return changed;
    const seat=this.table.actor,legal=legalActions(this.table,seat);
    const result=act(this.table,seat,legal.canCheck?{type:'check'}:{type:'fold'});
    if(!result.ok)return changed;
    this.table=result.state;this.changed();return true;
  }

  snapshot(id:string):RoomSnapshot {
    const member=this.people.get(id);
    if(!member)throw new Error('Nie należysz do tego pokoju.');
    const seat=this.seats.indexOf(id);
    const poker=seat>=0?this.publicTable(seat):null;
    return {code:this.code,hostId:this.hostId,youId:id,members:[...this.people.values()].map(person=>structuredClone(person.view)).sort((a,b)=>a.slot-b.slot),wallet:member.wallet,seated:seat>=0,poker,tableVersion:this.version,turnDeadline:this.deadline,vehicles:[...this.vehicles.values()].map(car=>({...car})),worldTime:this.epoch===null?0:(this.now-this.epoch)/1000,challenge:this.publicChallenge(id)};
  }

  private startChallenge(id:string,member:Member):RoomResult {
    if(id!==this.hostId)return no('Tylko gospodarz może rozpocząć Nocny przerzut.');
    if(this.people.size<2)return no('Zaproś co najmniej jednego znajomego do wspólnego zlecenia.');
    if(member.view.pose.interior!==null||member.view.pose.seated)return no('Wyjdź z kasyna, aby rozpocząć zlecenie ekipy.');
    if(this.challengeStatus==='active')return no('Nocny przerzut już trwa. Jedźcie do wspólnego celu.');
    if(this.now<this.challengeReadyAt)return no('Ekipa potrzebuje chwili przed następnym przerzutem.');
    this.challengeStatus='active';this.challengeRun++;this.checkpoint=0;this.challengeDeadline=this.now+CREW_DURATION_MS;
    this.challengeEligible.clear();for(const memberId of this.people.keys())this.challengeEligible.add(memberId);
    this.contributors.clear();return yes;
  }

  private publicChallenge(id:string):CrewChallenge {
    const active=this.challengeStatus==='active';
    return {status:this.challengeStatus,run:this.challengeRun,eligible:this.challengeEligible.has(id),checkpoint:this.checkpoint,total:3,target:active?{...CREW_CHECKPOINTS[this.checkpoint]}:null,remainingMs:active?Math.max(0,Math.ceil(this.challengeDeadline-this.now)):0,cooldownMs:active?0:Math.max(0,Math.ceil(this.challengeReadyAt-this.now)),reward:CREW_REWARD,contributors:[...this.contributors]};
  }

  private reachCheckpoint(member:Member) {
    if(this.challengeStatus!=='active'||member.view.pose.interior!==null||member.view.pose.seated)return;
    const target=CREW_CHECKPOINTS[this.checkpoint],pose=member.view.pose;
    if(Math.hypot(pose.x-target.x,pose.z-target.z)>5)return;
    this.contributors.add(member.view.id);this.checkpoint++;
    if(this.checkpoint<CREW_CHECKPOINTS.length)return;
    this.challengeStatus='completed';this.challengeReadyAt=this.now+CREW_COOLDOWN_MS;
    for(const id of this.challengeEligible) {
      const participant=this.people.get(id);
      if(participant)participant.wallet+=CREW_REWARD;
    }
  }

  private validAction(value:unknown):value is PokerAction {
    if(!value||typeof value!=='object')return false;
    const action=value as Record<string,unknown>;
    return action.type==='fold'||action.type==='check'||action.type==='call'||action.type==='allIn'||(action.type==='raise'&&Number.isSafeInteger(action.to));
  }

  private move(member:Member,value:OnlinePose):RoomResult {
    if(!value||typeof value!=='object'||!finite(value.x)||!finite(value.z)||!finite(value.heading)||Math.abs(value.heading)>1e6||!['drive','foot'].includes(value.mode)||(value.interior!==null&&value.interior!=='casino'))return no('Niepoprawna pozycja gracza.');
    const bounds=value.interior==='casino'?CASINO.bounds:WORLD_BOUNDS;
    if(value.x<bounds.minX||value.x>bounds.maxX||value.z<bounds.minZ||value.z>bounds.maxZ)return no('Pozycja znajduje się poza mapą.');
    const seated=this.seats.includes(member.view.id);
    if(seated&&(value.interior!=='casino'||value.mode!=='foot'||Math.hypot(value.x-member.view.pose.x,value.z-member.view.pose.z)>.5))return no('Wstań od stołu, zanim ruszysz dalej.');
    let vehicle:OnlinePose['vehicle']=null;
    if(value.mode==='drive') {
      const car=value.vehicle;
      if(value.interior!==null||!car||typeof car!=='object'||typeof car.id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(car.id)||!['sport','sedan'].includes(car.kind)||![car.x,car.z,car.heading,car.color,car.speed,car.health].every(finite)||Math.hypot(car.x-value.x,car.z-value.z)>2||Math.abs(car.speed)>40||car.health<0||car.health>100||!Number.isSafeInteger(car.color)||car.color<0||car.color>0xffffff||Math.abs(car.heading)>1e6)return no('Niepoprawny pojazd gracza.');
      if(car.id!=='stratus'&&!/^(parked-[1-4]|traffic-[0-7])$/.test(car.id))return no('Nieznany pojazd miasta.');
      if(car.x<WORLD_BOUNDS.minX||car.x>WORLD_BOUNDS.maxX||car.z<WORLD_BOUNDS.minZ||car.z>WORLD_BOUNDS.maxZ)return no('Pojazd znajduje się poza mapą.');
      if(car.id!=='stratus'&&[...this.people.values()].some(person=>person!==member&&person.view.pose.mode==='drive'&&person.view.pose.vehicle?.id===car.id))return no('Ten samochód prowadzi już inny gracz.');
      vehicle={id:car.id,kind:car.kind,x:car.x,z:car.z,heading:Math.atan2(Math.sin(car.heading),Math.cos(car.heading)),color:car.color,speed:car.speed,health:car.health};
    } else if(value.vehicle!==null)return no('Pieszy nie może jednocześnie prowadzić pojazdu.');
    const previousCar=member.view.pose.vehicle;
    if(previousCar&&previousCar.id!=='stratus'&&previousCar.id!==vehicle?.id)this.vehicles.set(previousCar.id,{...previousCar,speed:0});
    if(vehicle&&vehicle.id!=='stratus')this.vehicles.set(vehicle.id,{...vehicle});
    member.view.pose={x:value.x,z:value.z,heading:Math.atan2(Math.sin(value.heading),Math.cos(value.heading)),mode:value.mode,interior:value.interior,seated,vehicle};
    this.reachCheckpoint(member);
    return yes;
  }

  private sit(id:string,member:Member):RoomResult {
    if(this.seats.includes(id))return no('Masz już miejsce przy stole.');
    const pose=member.view.pose;
    if(pose.mode!=='foot'||pose.interior!=='casino'||Math.hypot(pose.x-CASINO.table.x,pose.z-CASINO.table.z)>5.5)return no('Podejdź pieszo do stołu w kasynie.');
    if(member.wallet<ONLINE_BUY_IN)return no('Potrzebujesz $200, aby zająć miejsce.');
    const seat=this.seats.findIndex((owner,index)=>owner===null&&(!handActive(this.table)||this.table.players[index].contributed===0));
    if(seat<0)return no('Wszystkie miejsca są zajęte. Poczekaj na kolejne rozdanie.');
    member.wallet-=ONLINE_BUY_IN;member.view.pose.seated=true;this.seats[seat]=id;
    this.table.players[seat]={...emptySeat(seat),id,name:member.view.name,stack:ONLINE_BUY_IN};
    this.table.message=handActive(this.table)?`${member.view.name} czeka na kolejne rozdanie.`:'Zaproś drugiego gracza i rozdaj karty.';
    this.changed(false);return yes;
  }

  private stand(id:string):RoomResult {
    const member=this.people.get(id),seat=this.seats.indexOf(id);
    if(!member)return no('Nie należysz do tego pokoju.');
    if(seat<0)return yes;
    if(handActive(this.table)&&!this.table.players[seat].folded) {
      const result=foldPokerSeat(this.table,seat);
      if(!result.ok)return no(result.reason);
      this.table=result.state;
    }
    member.wallet+=this.table.players[seat].stack;
    this.table.players[seat].stack=0;this.table.players[seat].folded=true;
    this.seats[seat]=null;member.view.pose.seated=false;
    if(!handActive(this.table))this.table.players[seat]=emptySeat(seat);
    if(this.seats.every(owner=>owner===null)) {
      const seed=this.table.seed,handNumber=this.table.handNumber;
      this.table=createPokerTable(seed,ONLINE_BUY_IN);this.table.handNumber=handNumber;
      this.table.players=this.table.players.map((_,i)=>emptySeat(i));
    }
    this.changed();return yes;
  }

  private deal(id:string):RoomResult {
    const seat=this.seats.indexOf(id);
    if(seat<0)return no('Najpierw zajmij miejsce przy stole.');
    if(handActive(this.table))return no('Najpierw dokończ bieżące rozdanie.');
    if(this.table.players[seat].stack<=0)return no('Skończyły ci się żetony. Wstań i opłać nowe wpisowe.');
    if(this.seats.filter((owner,index)=>owner!==null&&this.table.players[index].stack>0).length<2)return no('Do rozdania potrzeba co najmniej dwóch graczy z żetonami.');
    if(this.table.players[0].stack<=0) {
      const start=this.table.players.findIndex((player,index)=>this.seats[index]!==null&&player.stack>0);
      const order=[0,1,2,3].map(index=>(index+start)%4);
      this.table.players=order.map(index=>this.table.players[index]);this.seats=order.map(index=>this.seats[index]);
      this.table.dealer=(this.table.dealer-start+4)%4;
      this.table.payouts=order.map(index=>this.table.payouts[index]);this.table.raiseRights=order.map(index=>this.table.raiseRights[index]);
      this.table.winners=this.table.winners.map(index=>(index-start+4)%4);
    }
    const result=dealHand(this.table);
    if(!result.ok)return no(result.reason);
    this.table=result.state;this.changed();return yes;
  }

  private changed(resetDeadline=true) {
    this.version++;
    if(!handActive(this.table)||this.table.actor===null)this.deadline=null;
    else if(resetDeadline||this.deadline===null)this.deadline=this.now+ONLINE_TURN_MS;
  }

  private publicTable(viewer:number):PokerState {
    const state=structuredClone(this.table),order=[0,1,2,3].map(index=>(index+viewer)%4);
    state.players=order.map((canonical,index)=>{
      const player=structuredClone(this.table.players[canonical]);
      if(index!==0&&!(state.phase==='showdown'&&!player.folded))player.hole=player.hole.map(()=>({rank:0,suit:'♠'}));
      return player;
    });
    state.dealer=(state.dealer-viewer+4)%4;state.actor=state.actor===null?null:(state.actor-viewer+4)%4;
    state.winners=state.winners.map(index=>(index-viewer+4)%4);state.payouts=order.map(index=>this.table.payouts[index]);state.raiseRights=order.map(index=>this.table.raiseRights[index]);
    state.deck=[];state.seed=0;
    return state;
  }
}

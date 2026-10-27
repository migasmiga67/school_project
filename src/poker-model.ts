export type Suit='♠'|'♥'|'♦'|'♣';
export interface Card {rank:number;suit:Suit}
export interface PokerSeat {id:string;name:string;stack:number;hole:Card[];folded:boolean;allIn:boolean;bet:number;contributed:number;acted:boolean}
export type PokerPhase='waiting'|'preflop'|'flop'|'turn'|'river'|'showdown';
export interface PokerState {players:PokerSeat[];dealer:number;smallBlind:number;bigBlind:number;currentBet:number;minRaise:number;pot:number;board:Card[];deck:Card[];phase:PokerPhase;actor:number|null;message:string;log:string[];handNumber:number;winners:number[];payouts:number[];seed:number;raiseRights:boolean[]}
export type PokerAction={type:'fold'}|{type:'check'}|{type:'call'}|{type:'raise';to:number}|{type:'allIn'};
export interface LegalPokerActions {canFold:boolean;canCheck:boolean;canCall:boolean;callAmount:number;canRaise:boolean;minRaiseTo:number;maxRaiseTo:number;canAllIn:boolean}
export type PokerResult={ok:true;state:PokerState}|{ok:false;reason:string};
export interface HandValue {category:number;kickers:number[];name:string}

export type AppearanceSlot='shirt'|'pants'|'hair'|'accessory'|'skin';
export interface AppearanceItem {id:string;slot:AppearanceSlot;name:string;price:number;color:number;style?:'short'|'buzz'|'long'|'none'|'glasses'|'cap'}
export const CREW_OUTFIT_COLOR=0x63b8b0;
export const APPEARANCE_ITEMS:readonly AppearanceItem[]=[
 {id:'shirt-sand',slot:'shirt',name:'Koszulka piaskowa',price:0,color:0xd1c6ae},
 {id:'shirt-coral',slot:'shirt',name:'Koszulka koralowa',price:90,color:0xdf8e76},
 {id:'shirt-ocean',slot:'shirt',name:'Bluza Ocean Drive',price:120,color:0x3e8fa2},
 {id:'shirt-night',slot:'shirt',name:'Kurtka Midnight',price:180,color:0x373f58},
 {id:'pants-slate',slot:'pants',name:'Spodnie grafitowe',price:0,color:0x324654},
 {id:'pants-denim',slot:'pants',name:'Dżinsy wybrzeża',price:80,color:0x476d96},
 {id:'pants-cream',slot:'pants',name:'Spodnie kremowe',price:100,color:0xd1c3a4},
 {id:'hair-short',slot:'hair',name:'Krótka fryzura',price:0,color:0x303333,style:'short'},
 {id:'hair-buzz',slot:'hair',name:'Krótko przycięte',price:0,color:0x594331,style:'buzz'},
 {id:'hair-long',slot:'hair',name:'Długie włosy',price:110,color:0x4a3028,style:'long'},
 {id:'hair-silver',slot:'hair',name:'Srebrna fryzura',price:140,color:0xb4b9bd,style:'short'},
 {id:'accessory-none',slot:'accessory',name:'Bez dodatku',price:0,color:0x273541,style:'none'},
 {id:'accessory-glasses',slot:'accessory',name:'Okulary Sapphire',price:60,color:0x162b37,style:'glasses'},
 {id:'accessory-cap',slot:'accessory',name:'Czapka Coast',price:100,color:0x435c72,style:'cap'},
 {id:'skin-warm',slot:'skin',name:'Odcień ciepły',price:0,color:0xc19074},
 {id:'skin-light',slot:'skin',name:'Odcień jasny',price:0,color:0xe2bda0},
 {id:'skin-deep',slot:'skin',name:'Odcień głęboki',price:0,color:0x885c46},
];
export interface AppearanceState {owned:string[];selected:Record<AppearanceSlot,string>;crewOutfit:boolean}
export type AppearanceAction={type:'buy';item:string}|{type:'equip';slot:AppearanceSlot;item:string}|{type:'crew';enabled:boolean};
export type AppearanceResult={ok:true;appearance:AppearanceState;wallet:number;message:string}|{ok:false;reason:string};
export const APPEARANCE_SLOTS:readonly AppearanceSlot[]=['shirt','pants','hair','accessory','skin'];
const DEFAULTS:Record<AppearanceSlot,string>={shirt:'shirt-sand',pants:'pants-slate',hair:'hair-short',accessory:'accessory-none',skin:'skin-warm'};
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
const item=(id:unknown)=>typeof id==='string'?APPEARANCE_ITEMS.find(value=>value.id===id):undefined;
export function createAppearance():AppearanceState{return{owned:APPEARANCE_ITEMS.filter(value=>value.price===0).map(value=>value.id),selected:{...DEFAULTS},crewOutfit:false};}
/** Stored selections can only refer to known, owned cosmetics. */
export function parseAppearance(value:unknown):AppearanceState {
 const appearance=createAppearance();if(!record(value))return appearance;
 if(Array.isArray(value.owned))for(const id of value.owned){if(item(id)&&!appearance.owned.includes(id as string))appearance.owned.push(id as string);}
 if(record(value.selected))for(const slot of APPEARANCE_SLOTS){const selected=item(value.selected[slot]);if(selected?.slot===slot&&appearance.owned.includes(selected.id))appearance.selected[slot]=selected.id;}
 appearance.crewOutfit=value.crewOutfit===true;return appearance;
}
/** Wallet and inventory change together; a repeated purchase cannot charge twice. */
export function appearanceAction(value:AppearanceState,wallet:number,action:AppearanceAction):AppearanceResult {
 const no=(reason:string):AppearanceResult=>({ok:false,reason});
 if(!Number.isSafeInteger(wallet)||wallet<0||wallet>100000000)return no('Niepoprawny portfel garderoby.');
 if(!record(action))return no('Nieznana akcja garderoby.');
 const appearance=parseAppearance(value);let cost=0,message='';
 if(action.type==='buy'){
  const selected=item(action.item);if(!selected)return no('Nieznany element garderoby.');
  if(appearance.owned.includes(selected.id))return no('Ten element jest już w twojej garderobie.');
  if(wallet<selected.price)return no(`Potrzebujesz $${selected.price} na ten element.`);
  cost=selected.price;appearance.owned.push(selected.id);appearance.selected[selected.slot]=selected.id;
  message=`Kupiono i założono: ${selected.name}.`;
 }else if(action.type==='equip'){
  const selected=item(action.item);if(!APPEARANCE_SLOTS.includes(action.slot as AppearanceSlot)||!selected||selected.slot!==action.slot)return no('Wybierz element właściwej kategorii.');
  if(!appearance.owned.includes(selected.id))return no('Najpierw kup ten element garderoby.');
  if(appearance.selected[action.slot]===selected.id)return no('Ten element jest już wybrany.');
  appearance.selected[action.slot]=selected.id;message=`Założono: ${selected.name}.`;
 }else if(action.type==='crew'){
  if(typeof action.enabled!=='boolean')return no('Niepoprawny wybór stroju ekipy.');
  if(appearance.crewOutfit===action.enabled)return no('Ten strój ekipy jest już wybrany.');
  appearance.crewOutfit=action.enabled;message=action.enabled?'Założono wspólne barwy ekipy.':'Przywrócono własne kolory ubrania.';
 }else return no('Nieznana akcja garderoby.');
 return{ok:true,appearance,wallet:wallet-cost,message};
}
export function appearanceColors(value:AppearanceState,crewColor=CREW_OUTFIT_COLOR){
 const appearance=parseAppearance(value),get=(slot:AppearanceSlot)=>item(appearance.selected[slot])!;
 return{shirt:appearance.crewOutfit&&Number.isInteger(crewColor)&&crewColor>=0&&crewColor<=0xffffff?crewColor:get('shirt').color,pants:get('pants').color,hair:get('hair').color,skin:get('skin').color,accessory:get('accessory').color,hairstyle:get('hair').style??'short',accessoryStyle:get('accessory').style??'none',crewOutfit:appearance.crewOutfit};
}

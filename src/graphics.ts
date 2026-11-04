export type GraphicsQuality='auto'|'low'|'medium'|'high';
export type ResolvedGraphicsQuality=Exclude<GraphicsQuality,'auto'>;
export const GRAPHICS_STORAGE_KEY='neon-coast-graphics-v1';
export interface GraphicsProfile {
 requested:GraphicsQuality; resolved:ResolvedGraphicsQuality;
 pixelRatio:number; viewDistance:number; fogNear:number; fogFar:number;
 shadows:boolean; shadowMapSize:number; headlightBudget:number;
}
export function parseGraphicsQuality(value:unknown):GraphicsQuality {
 return value==='low'||value==='medium'||value==='high'?value:'auto';
}
/** Fixed budgets keep a preset safe on software WebGL and high density displays. */
export function graphicsProfile(requested:GraphicsQuality,software:boolean,width:number,height:number,dpr=1):GraphicsProfile {
 const resolved=requested==='auto'?(software?'low':width<700?'medium':'high'):requested;
 const level=resolved==='low'?0:resolved==='medium'?1:2;
 const validWidth=Math.max(1,Number.isFinite(width)?width:1),validHeight=Math.max(1,Number.isFinite(height)?height:1);
 const pixelBudget=software?[450000,650000,900000][level]:[1000000,1900000,2800000][level];
 const cap=software?[.55,.7,.85][level]:[.85,1.25,1.5][level];
 const pixelRatio=Math.min(cap,Math.max(.5,Number.isFinite(dpr)?dpr:1),Math.sqrt(pixelBudget/(validWidth*validHeight)));
 const viewDistance=software?[170,205,245][level]:[280,440,650][level];
 return {requested,resolved,pixelRatio,viewDistance,fogNear:viewDistance*.41,fogFar:viewDistance*.94,
  shadows:!software&&level>0,shadowMapSize:level===2?2048:1024,headlightBudget:software||level===0?0:level===1?2:4};
}
export function loadGraphicsQuality():GraphicsQuality {
 try{return parseGraphicsQuality(localStorage.getItem(GRAPHICS_STORAGE_KEY));}catch{return'auto';}
}
export function saveGraphicsQuality(quality:GraphicsQuality):boolean {
 try{localStorage.setItem(GRAPHICS_STORAGE_KEY,quality);return true;}catch{return false;}
}

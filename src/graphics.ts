export type GraphicsQuality='auto'|'low'|'medium'|'high'|'ultra';
/** Subsystems scale by three levels; Ultra is High plus the `ultra` extras below. */
export type ResolvedGraphicsQuality='low'|'medium'|'high';
export const GRAPHICS_STORAGE_KEY='neon-coast-graphics-v1';
export interface GraphicsProfile {
 requested:GraphicsQuality; resolved:ResolvedGraphicsQuality;
 pixelRatio:number; viewDistance:number; fogNear:number; fogFar:number;
 shadows:boolean; shadowMapSize:number; headlightBudget:number;
 /** 4K-class rendering: supersampled pixels, soft 4096 shadows and the longest view. */
 ultra:boolean; softShadows:boolean;
}
export function parseGraphicsQuality(value:unknown):GraphicsQuality {
 return value==='low'||value==='medium'||value==='high'||value==='ultra'?value:'auto';
}
/** Fixed budgets keep a preset safe on software WebGL and high density displays. */
export function graphicsProfile(requested:GraphicsQuality,software:boolean,width:number,height:number,dpr=1):GraphicsProfile {
 const resolved:ResolvedGraphicsQuality=requested==='auto'?(software?'low':width<700?'medium':'high'):requested==='ultra'?'high':requested;
 const level=resolved==='low'?0:resolved==='medium'?1:2;
 // Software WebGL cannot afford Ultra; it falls back to the High budgets.
 const ultra=requested==='ultra'&&!software;
 const validWidth=Math.max(1,Number.isFinite(width)?width:1),validHeight=Math.max(1,Number.isFinite(height)?height:1);
 const pixelBudget=ultra?3840*2160:software?[450000,650000,900000][level]:[1000000,1900000,2800000][level];
 const cap=software?[.55,.7,.85][level]:[.85,1.25,1.5][level];
 const density=Math.max(.5,Number.isFinite(dpr)?dpr:1);
 // Ultra renders up to 3840×2160: native on 4K screens, supersampled on smaller ones.
 const pixelRatio=ultra?Math.min(Math.max(2,density),3,Math.sqrt(pixelBudget/(validWidth*validHeight))):Math.min(cap,density,Math.sqrt(pixelBudget/(validWidth*validHeight)));
 const viewDistance=ultra?900:software?[170,205,245][level]:[280,440,650][level];
 return {requested,resolved,pixelRatio,viewDistance,fogNear:viewDistance*.41,fogFar:viewDistance*.94,
  shadows:!software&&level>0,shadowMapSize:ultra?4096:level===2?2048:1024,headlightBudget:ultra?6:software||level===0?0:level===1?2:4,ultra,softShadows:ultra};
}
export function loadGraphicsQuality():GraphicsQuality {
 try{return parseGraphicsQuality(localStorage.getItem(GRAPHICS_STORAGE_KEY));}catch{return'auto';}
}
export function saveGraphicsQuality(quality:GraphicsQuality):boolean {
 try{localStorage.setItem(GRAPHICS_STORAGE_KEY,quality);return true;}catch{return false;}
}

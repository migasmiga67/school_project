export type SurfaceQuality = 'low' | 'medium' | 'high';
export interface SurfaceWeatherProfile {
 rain:number; daylight:number; wetness:number; detail:boolean;
 roadTint:number; roadRoughness:number; roadNormalScale:number;
 masonryTint:number; masonryRoughness:number;
 glassRoughness:number; reflectionIntensity:number;
}
const unit=(value:number,fallback:number)=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):fallback;

/** Rain fills aggregate gaps first, then forms a smoother reflective water film. */
export function surfaceWeatherProfile(rain:number,daylight:number,quality:SurfaceQuality='high'):SurfaceWeatherProfile {
 const wet=unit(rain,0),light=unit(daylight,1),wetness=wet*wet*(3-2*wet);
 return {
  rain:wet,daylight:light,wetness,detail:quality!=='low',
  roadTint:1-wetness*.29,roadRoughness:.94-wetness*.68,roadNormalScale:.62-wetness*.29,
  masonryTint:1-wetness*.115,masonryRoughness:.93-wetness*.18,
  glassRoughness:.19-wetness*.065,
  reflectionIntensity:(.18+light*.82)*(.64+wetness*.54),
 };
}

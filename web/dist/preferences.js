export const PREFERENCES_KEY='qixi.preferences.v2';
export const DEFAULT_PREFERENCES={version:2,roomCapacity:4,waitMinutes:15,onboardingDone:false};
export function validSettings(value){return !!value&&[4,6].includes(value.roomCapacity)&&Number.isInteger(value.waitMinutes)&&value.waitMinutes>=1&&value.waitMinutes<=60;}
export function readPreferences(storage){
  try{const p=JSON.parse(storage.getItem(PREFERENCES_KEY));if(p?.version===2&&validSettings(p))return {...DEFAULT_PREFERENCES,roomCapacity:p.roomCapacity,waitMinutes:p.waitMinutes,onboardingDone:p.onboardingDone===true};}catch{}
  return {...DEFAULT_PREFERENCES};
}
export function writePreferences(storage,p){
  if(!validSettings(p))return false;
  try{storage.setItem(PREFERENCES_KEY,JSON.stringify({version:2,roomCapacity:p.roomCapacity,waitMinutes:p.waitMinutes,onboardingDone:p.onboardingDone===true}));return true;}catch{return false;}
}

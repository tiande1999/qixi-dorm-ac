export const PREFERENCES_KEY='habitat.demo.preferences.v2';
const LEGACY_KEY='qixi.preferences.v2';
export const DEFAULT_PREFERENCES={version:2,roomCapacity:4,waitMinutes:15,onboardingDone:false};
export const WAIT_SECONDS=900;
export function validSettings(value){return !!value&&[4,6].includes(value.roomCapacity);}
export function readPreferences(storage){
  try{const p=JSON.parse((storage.getItem(PREFERENCES_KEY) ?? storage.getItem(LEGACY_KEY)));if(p?.version===2&&validSettings(p))return {...DEFAULT_PREFERENCES,roomCapacity:p.roomCapacity,onboardingDone:p.onboardingDone===true};}catch{}
  return {...DEFAULT_PREFERENCES};
}
export function writePreferences(storage,p){
  if(!validSettings(p))return false;
  try{storage.setItem(PREFERENCES_KEY,JSON.stringify({version:2,roomCapacity:p.roomCapacity,onboardingDone:p.onboardingDone===true}));return true;}catch{return false;}
}

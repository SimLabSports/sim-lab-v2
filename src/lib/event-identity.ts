import type {MarketEvent} from './markets';
// Exact normalized names, never substring/fuzzy matching or guessed team IDs.
export const participantKey=(name:string)=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]/g,'');
export function eventIdentity(event:MarketEvent){return {eventId:event.id,sport:event.sport_key,startTime:event.commence_time,participants:[event.home_team,event.away_team].filter((s):s is string=>!!s).map(name=>({name,key:participantKey(name)})),identityVersion:1};}
export function sameStart(source:string,target:string,toleranceMinutes=15){const a=Date.parse(source),b=Date.parse(target);return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=toleranceMinutes*60000;}

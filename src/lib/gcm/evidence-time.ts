import type {Evidence} from '../research-types';
import officialPriors from '../../../data/nba-official-priors.json';

// Historical observations keep their original capture date. Only this deployed,
// immutable archive is eligible; a narrative label cannot exempt arbitrary stale data.
export function archivedNbaEvidence(e:Evidence){
 if(!e.id.startsWith('nba')||!e.period.includes('2025-26'))return false;
 const source=officialPriors.entries.find(s=>s.season==='2025-26'&&s.sourceUrl===e.sourceUrl&&s.observedAt===e.observedAt);
 if(!source)return false;
 if(e.metric.startsWith('official NBA 2025-26 ')){const metric=e.metric.slice('official NBA 2025-26 '.length);return source.endpoint==='leaguedashteamstats'&&source.rows.some(row=>{const r=row as Record<string,unknown>;return r.TEAM_NAME===e.entity&&r[metric]===e.value;});}
 if(source.endpoint==='leaguegamelog'){
  const rows=source.rows as Record<string,unknown>[];const team=rows.filter(r=>r.TEAM_NAME===e.entity&&['W','L'].includes(String(r.WL)));
  if(e.metric==='NBA 2025-26 verified completed games')return e.value===team.length;
  return team.some(r=>e.metric===`NBA historical completed result ${r.GAME_ID}`&&e.value===`${r.GAME_DATE}: ${r.MATCHUP}, ${r.PTS}–${Number(r.PTS)-Number(r.PLUS_MINUS)}, ${r.WL}`);
 }
 if(source.endpoint==='leaguedashplayerstats'&&['prior-team player historical minutes/usage','current-roster player historical minutes/usage'].includes(e.metric))return (source.rows as Record<string,unknown>[]).some(r=>{
  const original=`${r.PLAYER_NAME}: ${r.MIN} minutes/game; ${(Number(r.USG_PCT)*100).toFixed(1)}% usage; ${r.GP} games`;
  return Number(r.GP)>=10&&(e.value===original||e.value===`${original}; prior team ${r.TEAM_ABBREVIATION}`);
 });
 return false;
}
export function evidenceUsable(e:Evidence,now:number,age=900000,allowHistorical=true){const time=Date.parse(e.observedAt);return e.sourceUrl.startsWith('https://')&&Number.isFinite(time)&&time<=now&&(now-time<=age||allowHistorical&&archivedNbaEvidence(e));}
export function evidenceExpiry(e:Evidence,age:number){return archivedNbaEvidence(e)?Infinity:Date.parse(e.observedAt)+age;}

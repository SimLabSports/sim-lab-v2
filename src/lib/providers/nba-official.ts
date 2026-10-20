import 'server-only';
import {z} from 'zod';
import {providerJson} from '../server/provider-http';
import {participantKey} from '../event-identity';
import type {MarketEvent} from '../markets';
import type {ResearchInput} from '../research-types';
import priorArchive from '../../../data/nba-prior-history.json';
import officialPriors from '../../../data/nba-official-priors.json';
import {nbaFeatures,nbaForm,type NbaGame} from '../gcm/nba-features';
const scalar=z.union([z.string(),z.number().finite(),z.null()]);
const tableSchema=z.object({parameters:z.record(z.string(),z.unknown()),resultSets:z.array(z.object({headers:z.array(z.string()),rowSet:z.array(z.array(scalar))}))});
export function nbaSeason(date:string){const d=new Date(date),year=d.getUTCFullYear()-(d.getUTCMonth()<8?1:0);return `${year}-${String(year+1).slice(-2)}`;}
export const priorNbaSeason=(season:string)=>`${Number(season.slice(0,4))-1}-${season.slice(2,4)}`;
export async function nbaTable(endpoint:'leaguedashteamstats'|'leaguedashplayerstats'|'leaguegamelog'|'commonteamroster',season:string,extra:Record<string,string>={}){
 // Completed historical responses remain explicitly dated. Never reuse for a current season or roster.
 const archived=officialPriors.entries.find(e=>e.endpoint===endpoint&&e.season===season);
 if(archived&&season<nbaSeason(new Date().toISOString()))return {sourceUrl:archived.sourceUrl,observedAt:archived.observedAt,rows:archived.rows as Record<string,string|number|null>[]};
 const common={LeagueID:'00',Season:season,SeasonType:'Regular Season'};
 const advanced={PerMode:'PerGame',MeasureType:'Advanced',LastNGames:'0',Month:'0',OpponentTeamID:'0',PaceAdjust:'N',PlusMinus:'N',Rank:'N',Period:'0',DateFrom:'',DateTo:'',Location:'',Outcome:'',SeasonSegment:'',VsConference:'',VsDivision:'',GameSegment:'',PlayerExperience:'',PlayerPosition:'',StarterBench:'',ShotClockRange:'',PORound:'0',Conference:'',Division:'',TeamID:'0',GameScope:''};
 const params=new URLSearchParams(endpoint==='commonteamroster'?{LeagueID:'00',Season:season,...extra}:endpoint==='leaguegamelog'?{...common,Counter:'0',Direction:'DESC',PlayerOrTeam:'T',Sorter:'DATE',DateFrom:'',DateTo:'',...extra}:{...common,...advanced,...(endpoint==='leaguedashplayerstats'?{College:'',Country:'',DraftPick:'',DraftYear:'',Height:'',Weight:''}:{}),...extra});
 const url=`https://stats.nba.com/stats/${endpoint}?${params}`;
 const result=await providerJson({provider:`NBA official ${endpoint}`,cacheKey:`nba-official-v1:${url}`,url,headers:{Referer:'https://www.nba.com/'},ttl:900000,timeoutMs:3000,validate:data=>{const parsed=tableSchema.parse(data);if(parsed.parameters.Season!==season)throw Error('NBA season mismatch');return {data:parsed,observedAt:new Date().toISOString()};}});
 const t=result.data.resultSets[0];if(!t||new Set(t.headers).size!==t.headers.length||t.rowSet.some(row=>row.length!==t.headers.length))throw Error('NBA table schema mismatch');
 return {sourceUrl:url,observedAt:result.observedAt,rows:t.rowSet.map(row=>Object.fromEntries(t.headers.map((name,i)=>[name,row[i]])))};
}
export async function enrichNba(event:MarketEvent,input:ResearchInput):Promise<ResearchInput>{
 if(event.sport_key!=='basketball_nba'||!input.providerEventId||!input.pregame)return input;
 const result:ResearchInput={...input,evidence:[...input.evidence],gaps:[...input.gaps],risks:[...input.risks]};const season=nbaSeason(event.commence_time),prior=priorNbaSeason(season);const bindings=new Map<string,number>();const logSources=new Map<string,Awaited<ReturnType<typeof nbaTable>>>();
 const add=(entity:string,metric:string,value:string|number,source:{sourceUrl:string;observedAt:string},period:string)=>result.evidence.push({id:`nba${result.evidence.length+1}`,entity,metric,value,...source,period});
 const cutoff=new Date(Math.min(Date.now(),Date.parse(event.commence_time))-86400000).toISOString().slice(0,10);const dateTo=`${cutoff.slice(5,7)}/${cutoff.slice(8,10)}/${cutoff.slice(0,4)}`;
 let available=false;
 for(const targetSeason of [season,prior])try{
  const [advanced,logs]=await Promise.all([nbaTable('leaguedashteamstats',targetSeason,{DateTo:dateTo}),nbaTable('leaguegamelog',targetSeason,{DateTo:dateTo})]);
  logSources.set(targetSeason,logs);
  for(const name of [input.home,input.away]){
   const matches=advanced.rows.filter(r=>typeof r.TEAM_NAME==='string'&&participantKey(r.TEAM_NAME)===participantKey(name));if(matches.length!==1){result.gaps.push(`NBA official ${targetSeason} advanced row not available for ${name}.`);continue;}const r=matches[0];if(typeof r.TEAM_ID!=='number'||typeof r.GP!=='number'||r.GP<=0)continue;
   bindings.set(name,r.TEAM_ID);const completed=logs.rows.filter(g=>g.TEAM_ID===r.TEAM_ID&&['W','L'].includes(String(g.WL))&&typeof g.GAME_DATE==='string'&&Date.parse(g.GAME_DATE)<Math.min(Date.now(),Date.parse(event.commence_time)));
   if(completed.length!==r.GP){result.gaps.push(`NBA official ${targetSeason} game count and advanced-stat sample disagree for ${name}; ratings withheld.`);continue;}
   const dates=completed.map(g=>String(g.GAME_DATE)).sort();const period=`${targetSeason} regular season, ${r.GP} settled games, ${dates[0]} to ${dates.at(-1)}; ${targetSeason===season?'current season':'historical prior season, 0.35 relative per-game prior weight; roster changes unmodeled'}`;
   for(const metric of ['GP','OFF_RATING','DEF_RATING','NET_RATING','PACE','POSS','EFG_PCT','TS_PCT','TM_TOV_PCT','OREB_PCT','DREB_PCT'])if(typeof r[metric]==='number')add(name,`official NBA ${targetSeason} ${metric}`,r[metric] as number,advanced,period);
   add(name,`NBA ${targetSeason} verified completed games`,completed.length,logs,period);
   const last=completed.sort((a,b)=>String(b.GAME_DATE).localeCompare(String(a.GAME_DATE))).slice(0,5);for(const g of last)if(typeof g.PTS==='number'&&typeof g.PLUS_MINUS==='number')add(name,`NBA historical completed result ${g.GAME_ID}`,`${g.GAME_DATE}: ${g.MATCHUP}, ${g.PTS}–${g.PTS-g.PLUS_MINUS}, ${g.WL}`,logs,period);
   available=true;
  }
 }catch{result.gaps.push(`Official NBA ${targetSeason} performance endpoint unavailable or returned an unverified season/sample. No replacement rating used.`);}
 try{const priorPlayers=await nbaTable('leaguedashplayerstats',prior,{DateTo:dateTo});await Promise.all([...bindings].map(async([name,id])=>{try{const roster=await nbaTable('commonteamroster',season,{TeamID:String(id)});const current=new Set(roster.rows.filter(r=>r.TeamID===id||r.TEAM_ID===id).map(r=>r.PLAYER_ID));if(!current.size){result.gaps.push(`Official current roster could not be verified for ${name}.`);return;}
   add(name,'official current roster sample',current.size,roster,`${season} roster listing; not a confirmed starting five or injury clearance`);
   const players=priorPlayers.rows.filter(r=>current.has(r.PLAYER_ID)&&typeof r.MIN==='number'&&typeof r.USG_PCT==='number'&&typeof r.GP==='number'&&r.GP>=10).sort((a,b)=>Number(b.MIN)-Number(a.MIN)).slice(0,8);
   for(const player of players)add(name,'current-roster player historical minutes/usage',`${player.PLAYER_NAME}: ${player.MIN} minutes/game; ${(Number(player.USG_PCT)*100).toFixed(1)}% usage; ${player.GP} games; prior team ${player.TEAM_ABBREVIATION}`,priorPlayers,`${prior} historical role; not projected ${season} minutes, current usage or confirmed rotation`);
  }catch{result.gaps.push(`Current NBA roster unavailable for ${name}; player roles below belong to the historical team only, not a confirmed current rotation.`);for(const player of priorPlayers.rows.filter(r=>r.TEAM_ID===id&&typeof r.MIN==='number'&&typeof r.USG_PCT==='number'&&typeof r.GP==='number'&&r.GP>=10).sort((a,b)=>Number(b.MIN)-Number(a.MIN)).slice(0,8))add(name,'prior-team player historical minutes/usage',`${player.PLAYER_NAME}: ${player.MIN} minutes/game; ${(Number(player.USG_PCT)*100).toFixed(1)}% usage; ${player.GP} games`,priorPlayers,`${prior} original team role, not verified current roster, projected minutes or starting status`);}}));}catch{result.gaps.push('Official historical NBA player minutes/usage endpoint unavailable.');}
 if(available){
  const games:NbaGame[]=(priorArchive.games as NbaGame[]).filter(g=>g.season===prior||g.season===season);
  const current=logSources.get(season);if(current){const pairs=new Map<string,typeof current.rows>();for(const r of current.rows){const id=String(r.GAME_ID),list=pairs.get(id)??[];list.push(r);pairs.set(id,list);}const jobs=[...pairs].filter(([,pair])=>pair.some(r=>[...bindings.values()].includes(Number(r.TEAM_ID)))).slice(0,40);
   for(let offset=0;offset<jobs.length;offset+=4)await Promise.all(jobs.slice(offset,offset+4).map(async([id,pair])=>{try{
    const h=pair.find(r=>String(r.MATCHUP).includes(' vs. ')),a=pair.find(r=>String(r.MATCHUP).includes(' @ '));if(pair.length!==2||!h||!a||!['W','L'].includes(String(h.WL))||h.WL===a.WL)throw Error('Unsettled pair');
    const sourceUrl=`https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_${id}.json`;const schema=z.object({game:z.object({gameId:z.string(),actions:z.array(z.object({period:z.number(),actionType:z.string(),subType:z.string().optional(),timeActual:z.string().optional(),scoreHome:z.string().optional(),scoreAway:z.string().optional()}))})});
    const timed=await providerJson({provider:'NBA official completed play-by-play',cacheKey:`nba-completed:${id}`,url:sourceUrl,headers:{Referer:'https://www.nba.com/'},ttl:86400000,validate:data=>schema.parse(data)});const start=timed.game.actions.find(p=>p.period===1&&p.actionType==='period'&&p.subType==='start'),end=timed.game.actions.findLast(p=>p.actionType==='game'&&p.subType==='end');
    if(timed.game.gameId!==id||!start?.timeActual||!end?.timeActual||Number(end.scoreHome)!==h.PTS||Number(end.scoreAway)!==a.PTS)throw Error('Unverified final');
    const possessions=((Number(h.FGA)+.44*Number(h.FTA)-Number(h.OREB)+Number(h.TOV))+(Number(a.FGA)+.44*Number(a.FTA)-Number(a.OREB)+Number(a.TOV)))/2;if(!Number.isFinite(possessions)||possessions<65||possessions>170)throw Error('Invalid possessions');
    games.push({id,season,startTime:new Date(start.timeActual).toISOString(),availableAt:new Date(Date.parse(end.timeActual)+3600000).toISOString(),homeId:Number(h.TEAM_ID),awayId:Number(a.TEAM_ID),home:String(h.TEAM_NAME),away:String(a.TEAM_NAME),homePoints:Number(h.PTS),awayPoints:Number(a.PTS),possessions,sourceUrl});
   }catch{result.gaps.push(`Current NBA game ${id} lacks verified final-score/completion timing; it was excluded from modeled features.`);}}));
  }
  for(const [name,id]of bindings){const form=nbaForm([...new Map(games.map(g=>[g.id,g])).values()],id,season,Math.min(Date.now(),Date.parse(event.commence_time)));const source=logSources.get(prior)??current;if(!form||!source){result.gaps.push(`Ten verified completed games with supported timing were unavailable for NBA modeling: ${name}.`);continue;}
   for(const [i,feature]of nbaFeatures.entries())add(name,feature.metric,form.values[i],{sourceUrl:source.sourceUrl,observedAt:new Date().toISOString()},`${form.period}; ${form.priorSeasonGames} prior-season games; derived now from timestamp-audited official history`);
  }
  result.provider+=' + NBA Stats';result.status='AVAILABLE';result.gaps=result.gaps.filter(g=>!g.startsWith('Current-season efficiency statistics/sample could not be verified')&&!g.startsWith('No completed current-season recent results')&&!g.startsWith('possession-based offensive/defensive ratings'));
  result.gaps.unshift(`Official NBA historical ratings/pace are available; current roster and player-role coverage is reported separately. Prior-season inputs retain ${prior} dates and receive 0.35 relative per-game weight; they are not ${season} current form.`);
  result.risks.push("NBA rolling-efficiency baseline does not adjust for offseason roster changes, tonight's confirmed lineup or injury impact; those require separate verified clearance.");
 }
 result.gaps.push('Historical ratings and player roles are explicitly dated priors. Current starting five, minutes restrictions, final availability and effects of offseason roster changes remain unverified.');return result;
}

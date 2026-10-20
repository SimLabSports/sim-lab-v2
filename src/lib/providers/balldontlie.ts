import 'server-only';
import {z} from 'zod';
import {bdlAccess,bdlRequest,BdlError} from './balldontlie-http';
import {bdlSport,bdlEventDataSports} from './balldontlie-sports';
import type {MarketEvent} from '../markets';
import type {ResearchInput} from '../research-types';

type Row=Record<string,unknown>;
const row=z.record(z.string(),z.unknown());
const list=z.object({data:z.array(row),meta:z.object({next_cursor:z.number().nullish()}).passthrough().optional()});
const nameKey=(name:string)=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'').replace(/^laclippers$/,'losangelesclippers');
const number=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:null;
function participant(value:unknown){
 const parsed=row.safeParse(value);if(!parsed.success)return null;const p=parsed.data;const id=number(p.id);
 const name=typeof p.full_name==='string'?p.full_name:typeof p.display_name==='string'?p.display_name:typeof p.city==='string'&&typeof p.name==='string'?`${p.city} ${p.name}`:null;
 return id!==null&&Number.isInteger(id)&&name?{id,name}:null;
}
function game(value:Row,sport:string){
 const id=number(value.id),season=number(value.season);const home=participant(value.home_team);const away=participant(value[sport==='mlb'||sport==='nhl'||sport==='epl'?'away_team':'visitor_team']);
 const rawDate=sport==='nba'?value.datetime:sport==='nhl'?value.start_time_utc:value.date;
 const start=typeof rawDate==='string'&&/T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(rawDate)?Date.parse(rawDate):NaN;
 const state=typeof value.status_state==='string'?value.status_state:null;
 const data=(v:unknown,key:string)=>row.safeParse(v).success?(v as Row)[key]:undefined;
 const homeScore=number(sport==='mlb'?data(value.home_team_data,'runs'):value[sport==='nba'||sport==='nfl'?'home_team_score':'home_score']);
 const awayScore=number(sport==='mlb'?data(value.away_team_data,'runs'):value[sport==='nba'||sport==='nfl'?'visitor_team_score':'away_score']);
 return id!==null&&season!==null&&home&&away&&home.id!==away.id&&Number.isFinite(start)&&state?{id,season,home,away,start,state,homeScore,awayScore,raw:value}:null;
}
type Game=NonNullable<ReturnType<typeof game>>;
const basketball=['fg_pct','fg3_pct','ft_pct','oreb','dreb','reb','ast','stl','blk','turnovers'];
const statMetrics:Record<string,string[]>={nfl:['first_downs','total_yards','yards_per_play','net_passing_yards','rushing_yards','turnovers','third_down_conversions','third_down_attempts'],ncaaf:['first_downs','passing_yards','rushing_yards','total_yards','turnovers','penalty_yards'],wnba:basketball,ncaab:basketball,ncaaw:basketball};
export async function ballDontLieResearch(event:MarketEvent):Promise<ResearchInput>{
 const sport=bdlSport(event.sport_key);
 const input:ResearchInput={eventId:event.id,sport:event.sport_key,startTime:event.commence_time,home:event.home_team??'',away:event.away_team??'',provider:'BALLDONTLIE',providerEventId:null,retrievedAt:new Date().toISOString(),status:'INCOMPLETE',evidence:[],gaps:[],risks:[],lineupConfirmed:false,injuriesVerified:false,pregame:false};
 if(!sport||!bdlEventDataSports.has(sport)){input.gaps.push(`A verified BALLDONTLIE participant and performance adapter is not yet mapped for ${event.sport_key}. Other sports' statistics are never substituted.`);return input;}
 const add=(entity:string,metric:string,value:string|number,source:{sourceUrl:string;observedAt:string},period:string)=>input.evidence.push({id:`bdl${input.evidence.length+1}`,entity,metric,value,...source,period});
 try{
  const access=await bdlAccess();
  if(access.status==='VERIFIED'&&!access.subscriptions.some(s=>s.sport===sport||s.sport==='all_access_v3')){input.gaps.push(`The verified BALLDONTLIE account does not list ${sport.toUpperCase()} access. A subscription for another sport does not enable this feed.`);return input;}
  const path=sport==='epl'?'/epl/v2/matches':`/${sport}/v1/games`;const params=new URLSearchParams({per_page:'100'});
  const clubs=new Map<number,{id:number;full_name:string}>();
  if(sport==='epl'){const teams=await bdlRequest('/epl/v2/teams',new URLSearchParams({per_page:'100'}),data=>list.parse(data));for(const r of teams.data.data){const id=number(r.id);if(id!==null&&typeof r.name==='string')clubs.set(id,{id,full_name:r.name});}if(teams.data.meta?.next_cursor)throw new BdlError(503,'The soccer team catalog is incomplete.');}
  const parseGames=(data:unknown)=>{const parsed=list.parse(data);return sport==='epl'?{...parsed,data:parsed.data.map(r=>({...r,home_team:clubs.get(Number(r.home_team_id)),away_team:clubs.get(Number(r.away_team_id))}))}:parsed;};
  const day=Date.parse(event.commence_time);
  for(const offset of [-1,0,1])params.append(sport==='nhl'||sport==='epl'?'dates':'dates[]',new Date(day+offset*86400000).toISOString().slice(0,10));
  const schedule=await bdlRequest(path,params,parseGames);
  const matches=schedule.data.data.map(r=>game(r,sport)).filter((g):g is Game=>!!g&&nameKey(g.home.name)===nameKey(input.home)&&nameKey(g.away.name)===nameKey(input.away)&&Math.abs(g.start-day)<=15*60000);
  if(matches.length!==1||schedule.data.meta?.next_cursor){input.gaps.push('BALLDONTLIE could not uniquely verify both participants and the exact start time in a complete event response.');return input;}
  const matched=matches[0];input.providerEventId=String(matched.id);input.pregame=matched.state==='scheduled'&&Date.now()<Math.min(day,matched.start);input.phase=input.pregame?'PREGAME':matched.state==='final'?'FINAL':matched.state==='in_progress'?'LIVE':'SUSPENDED';
  add('event','verified provider game state',matched.state,schedule,'current');
  if(!input.pregame){input.risks.push(`BALLDONTLIE game state is ${matched.state}; a new pregame evaluation is unavailable.`);return input;}
  const recentParams=new URLSearchParams({per_page:'100'});for(const p of [matched.home,matched.away])recentParams.append(sport==='epl'?'team_ids':'team_ids[]',String(p.id));recentParams.append(sport==='nhl'?'seasons':sport==='epl'?'season':'seasons[]',String(matched.season));
  const windowDays=['mlb','nhl','epl'].includes(sport)?30:90;
  if(['mlb','nhl','epl'].includes(sport)){for(let offset=0;offset<windowDays;offset++)recentParams.append(sport==='mlb'?'dates[]':'dates',new Date(Math.min(Date.now(),day)-offset*86400000).toISOString().slice(0,10));}
  else if(sport!=='nfl'){recentParams.set('start_date',new Date(Math.min(Date.now(),day)-windowDays*86400000).toISOString().slice(0,10));recentParams.set('end_date',new Date(Math.min(Date.now(),day)).toISOString().slice(0,10));}
  const rows:Row[]=[];let lastSource=schedule;let complete=false;
  // At most one history page per explicit scan. Incomplete pagination never masquerades as full recent form.
  for(let page=0;page<1;page++){
   const response=await bdlRequest(path,recentParams,parseGames);rows.push(...response.data.data);lastSource=response;
   if(response.data.meta?.next_cursor==null){complete=true;break;}recentParams.set('cursor',String(response.data.meta.next_cursor));
  }
  if(!complete)input.gaps.push('The returned game history is a bounded sample; pagination remains. No complete season or last-five claim is made.');
  const cutoff=Math.min(Date.now(),day);const unique=new Map(rows.map(r=>game(r,sport)).filter((g):g is Game=>!!g).map(g=>[g.id,g]));
  const finals=[...unique.values()].filter(g=>g.id!==matched.id&&g.season===matched.season&&g.state==='final'&&g.start<cutoff&&g.start>=cutoff-windowDays*86400000&&g.homeScore!==null&&g.awayScore!==null).sort((a,b)=>b.start-a.start);
  const selectedGames=new Map<number,Game>();
  for(const [target,name] of [[matched.home,input.home],[matched.away,input.away]] as const){
   const games=finals.filter(g=>g.home.id===target.id||g.away.id===target.id).slice(0,5);
   if(!games.length){input.gaps.push(`No verified recent completed results for ${name} in the returned season sample.`);continue;}
   const label=complete?'last five completed games':'returned completed-game sample';const period=`season ${matched.season}, ${games.length} games within ${windowDays} days; ${complete?'complete response':'partial history'}`;
   const scores=games.map(g=>g.home.id===target.id?{for:g.homeScore!,against:g.awayScore!}:{for:g.awayScore!,against:g.homeScore!});
   add(name,`${label} sample`,games.length,lastSource,period);
   add(name,`${label} wins-losses-ties`,`${scores.filter(s=>s.for>s.against).length}-${scores.filter(s=>s.for<s.against).length}-${scores.filter(s=>s.for===s.against).length}`,lastSource,period);
   add(name,`${label} ${sport==='mlb'?'runs':sport==='nhl'||sport==='epl'?'goals':'points'} per game`,Number((scores.reduce((sum,s)=>sum+s.for,0)/games.length).toFixed(2)),lastSource,period);
   add(name,`${label} opponent ${sport==='mlb'?'runs':sport==='nhl'||sport==='epl'?'goals':'points'} per game`,Number((scores.reduce((sum,s)=>sum+s.against,0)/games.length).toFixed(2)),lastSource,period);
   if(complete)add(name,'full rest days since last completed game',Math.max(0,Math.floor((day-games[0].start)/86400000)-1),lastSource,'schedule');
   for(const g of games)selectedGames.set(g.id,g);
  }
  const subscription=access.subscriptions.find(s=>s.sport===sport||s.sport==='all_access_v3');
  const paid=subscription&&subscription.tier!=='free'&&(!subscription.status||['active','trialing'].includes(subscription.status));
  if(paid&&statMetrics[sport]&&selectedGames.size){
   try{
    const params=new URLSearchParams({per_page:'100'});for(const id of selectedGames.keys())params.append(sport==='nfl'?'game_ids':'game_ids[]',String(id));
    const stats=await bdlRequest(`/${sport}/v1/team_stats`,params,data=>list.parse(data));
    for(const [target,name] of [[matched.home,input.home],[matched.away,input.away]] as const){
     const seen=new Set<number>();const values=stats.data.data.filter(r=>{const p=participant(r.team);const g=row.safeParse(r.game);const id=g.success?number(g.data.id):null;if(p?.id!==target.id||id===null||!selectedGames.has(id)||seen.has(id))return false;const actual=selectedGames.get(id)!;if(actual.home.id!==target.id&&actual.away.id!==target.id)return false;seen.add(id);return true;});
     for(const metric of statMetrics[sport]){const sample=values.map(r=>number(r[metric])).filter((v):v is number=>v!==null);if(sample.length>=2)add(name,`recent team ${metric} mean`,Number((sample.reduce((s,v)=>s+v,0)/sample.length).toFixed(3)),stats,`${sample.length} verified completed games`);}
    }
   }catch(error){input.gaps.push(error instanceof BdlError?error.message:'Team performance statistics could not be validated.');}
  }else input.gaps.push(paid?'Advanced efficiency statistics are not yet mapped for this sport; returned results support qualitative form research only.':`Detailed ${sport.toUpperCase()} statistics require verified endpoint access beyond basic schedule/results data.`);
  if(paid&&['nba','nfl','mlb','nhl','wnba'].includes(sport)){
   try{
    const params=new URLSearchParams({per_page:'100'});for(const p of [matched.home,matched.away])params.append('team_ids[]',String(p.id));
    const reports=await bdlRequest(`/${sport}/v1/player_injuries`,params,data=>list.parse(data));
    for(const report of reports.data.data){
     const player=row.safeParse(report.player);if(!player.success)continue;const team=participant(player.data.team);const target=team?.id===matched.home.id?input.home:team?.id===matched.away.id?input.away:null;
     const name=typeof player.data.full_name==='string'?player.data.full_name:typeof player.data.first_name==='string'&&typeof player.data.last_name==='string'?`${player.data.first_name} ${player.data.last_name}`:null;
     if(!target||!name||typeof report.status!=='string')continue;
     add(target,'reported player availability',`${name}: ${report.status}; final game availability unconfirmed`,reports,'current provider injury snapshot; not confirmed lineup clearance');
     if(/out|question|doubt|injur|suspend|day.to.day|gtd|^ir$|dtd/i.test(report.status))input.risks.push(`${target}: ${name} reported ${report.status}; final availability and impact require verification.`);
    }
    if(reports.data.meta?.next_cursor)input.gaps.push('The injury response is paginated and does not establish comprehensive injury coverage.');
   }catch(error){input.gaps.push(error instanceof BdlError?error.message:'Current injury reporting could not be validated.');}
  }
  if(sport==='epl')input.gaps.push('Soccer three-way markets require draw-aware research and calibration; binary team approval is not applied.');
  input.gaps.push('Final starters/lineups, comprehensive availability and workload clearance, sport-specific advanced matchup factors and a reviewed calibrated probability model remain required for green approval. Basic endpoint access is not full statistical coverage.');
  input.status=[input.home,input.away].every(name=>input.evidence.filter(e=>e.entity===name).length>=3)?'AVAILABLE':'INCOMPLETE';
 }catch(error){input.status=error instanceof BdlError&&error.status===403?'INCOMPLETE':'ERROR';input.gaps.push(error instanceof BdlError?error.message:'BALLDONTLIE research could not be validated.');}
 return input;
}

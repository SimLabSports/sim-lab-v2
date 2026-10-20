import 'server-only';
import { z } from 'zod';
import { providerJson } from '../server/provider-http';
import {completedMlbGame} from './mlb-history';
import {formFeatures,rollingForm} from '../gcm/form-features';
import type { MarketEvent } from '../markets';
import type { ResearchInput, Evidence } from '../research-types';
const base='https://statsapi.mlb.com/api/v1/';
const team=z.object({id:z.number(),name:z.string()});
const side=z.object({team,score:z.number().optional(),isWinner:z.boolean().optional(),probablePitcher:z.object({id:z.number(),fullName:z.string()}).optional()});
const game=z.object({gamePk:z.number(),gameDate:z.string(),season:z.string().optional(),status:z.object({abstractGameState:z.string(),detailedState:z.string()}),teams:z.object({home:side,away:side}),probablePitchers:z.object({home:z.object({id:z.number(),fullName:z.string()}).optional(),away:z.object({id:z.number(),fullName:z.string()}).optional()}).optional()});
const scheduleSchema=z.object({dates:z.array(z.object({games:z.array(game)}))});
const nameKey=(name:string)=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'').replace(/^oaklandathletics$/,'athletics');
function dateET(date:number|string){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date));}
const observedByResource=new Map<string,string>();
async function request<T>(resource:string,validate:(data:unknown)=>T,ttl=300000){const response=await providerJson({provider:'MLB Stats API',cacheKey:'mlb-v2:'+resource,url:base+resource,ttl,validate:data=>({value:validate(data),observedAt:new Date().toISOString()})});if(observedByResource.size>500)observedByResource.clear();observedByResource.set(resource,response.observedAt);return response.value;}
export async function mlbSchedule(date:string){
 const resource=`schedule?sportId=1&date=${date}&hydrate=probablePitcher,team`;
 const result=await request(resource,data=>scheduleSchema.parse(data));
 return {provider:'MLB Stats API',sourceUrl:base+resource,retrievedAt:new Date().toISOString(),games:result.dates.flatMap(day=>day.games)};
}
export async function mlbResearch(event:MarketEvent):Promise<ResearchInput>{
 const input:ResearchInput={eventId:event.id,sport:event.sport_key,startTime:event.commence_time,home:event.home_team||'',away:event.away_team||'',provider:'MLB Stats API',providerEventId:null,retrievedAt:new Date().toISOString(),status:'INCOMPLETE',evidence:[],gaps:[],risks:[],lineupConfirmed:false,injuriesVerified:false,pregame:false};
 try{
  const day=dateET(event.commence_time);const resource=`schedule?sportId=1&date=${day}&hydrate=probablePitcher,team`;
  const schedule=await request(resource,data=>scheduleSchema.parse(data));
  const matches=schedule.dates.flatMap(day=>day.games).filter(g=>nameKey(g.teams.home.team.name)===nameKey(input.home)&&nameKey(g.teams.away.team.name)===nameKey(input.away)&&Math.abs(Date.parse(g.gameDate)-Date.parse(event.commence_time))<=90*60000);
  if(matches.length!==1){input.gaps.push('The event could not be uniquely matched to the official MLB schedule and start time.');return input;}
  const matched=matches[0];input.providerEventId=String(matched.gamePk);
  input.pregame=matched.status.abstractGameState==='Preview'&&Date.now()<Date.parse(matched.gameDate)&&!/(postpon|delay|cancel|suspend)/i.test(matched.status.detailedState);
  if(!input.pregame)input.risks.push(`Pregame evaluation unavailable: official game state is ${matched.status.detailedState}.`);
  const add=(entity:string,metric:string,value:string|number,url:string,period:string)=>input.evidence.push({id:`e${input.evidence.length+1}`,entity,metric,value,sourceUrl:base+url,observedAt:observedByResource.get(url)??input.retrievedAt,period});
  add('event','official game state',matched.status.detailedState,resource,'current');
  const season=matched.season||String(new Date(matched.gameDate).getUTCFullYear());
  const statsSchema=z.object({stats:z.array(z.object({group:z.object({displayName:z.string()}).optional(),splits:z.array(z.object({stat:z.record(z.string(),z.unknown())})).optional()}))});
  const metrics=['gamesPlayed','runs','hits','homeRuns','baseOnBalls','strikeOuts','avg','obp','slg','ops','era','whip','inningsPitched'];
  await Promise.all(['away','home'].map(async(which)=>{
   const target=matched.teams[which as 'away'|'home'].team;const statsUrl=`teams/${target.id}/stats?stats=season&group=hitting,pitching&season=${season}`;
   try{const stats=await request(statsUrl,data=>statsSchema.parse(data),900000);
    for(const group of stats.stats)for(const split of group.splits??[])for(const metric of metrics){const value=split.stat[metric];if(typeof value==='number'||typeof value==='string')add(target.name,`${group.group?.displayName??'team'} ${metric}`,value,statsUrl,`season ${season}`);}
   }catch{input.gaps.push(`Current season statistics unavailable for ${target.name}.`);}
   const pitcher=matched.probablePitchers?.[which as 'away'|'home']||matched.teams[which as 'away'|'home'].probablePitcher;
   if(pitcher)add(target.name,'probable starting pitcher',pitcher.fullName,resource,'upcoming game');
   else input.gaps.push(`Probable pitcher not verified for ${target.name}.`);
  }));
  const until=Math.min(Date.now(),Date.parse(event.commence_time));const start=dateET(until-30*86400000);const recentUrl=`schedule?sportId=1&startDate=${start}&endDate=${dateET(until)}`;
  try{const recent=await request(recentUrl,data=>scheduleSchema.parse(data));
   for(const target of [matched.teams.away.team,matched.teams.home.team]){
    const finals=recent.dates.flatMap(d=>d.games).filter(g=>g.status.abstractGameState==='Final'&&Date.parse(g.gameDate)<until&&(g.teams.home.team.id===target.id||g.teams.away.team.id===target.id)).sort((a,b)=>Date.parse(b.gameDate)-Date.parse(a.gameDate));
    const last=finals.slice(0,5);if(last.length){let wins=0;let losses=0;for(const g of last){const side=g.teams.home.team.id===target.id?g.teams.home:g.teams.away;if(side.isWinner===true)wins++;else if(side.isWinner===false)losses++;}
      add(target.name,'last five completed games record',`${wins}-${losses} (${last.length} games)`,recentUrl,'last 30 days');
      add(target.name,'full rest days since last game',Math.max(0,Math.floor((Date.parse(matched.gameDate)-Date.parse(last[0].gameDate))/86400000)-1),recentUrl,'schedule');
      for(const venue of ['home','away'] as const){const subset=finals.filter(g=>g.teams[venue].team.id===target.id);add(target.name,`recent ${venue} wins / games`,`${subset.filter(g=>g.teams[venue].isWinner).length}/${subset.length}`,recentUrl,'last 30 days');}
    }else input.gaps.push(`No recent completed games found for ${target.name}.`);
   }
  }catch{input.gaps.push('Recent results and rest schedule could not be verified.');}
  const formUrl=`schedule?sportId=1&teamId=${matched.teams.home.team.id},${matched.teams.away.team.id}&startDate=${dateET(Date.parse(matched.gameDate)-90*86400000)}&endDate=${dateET(Math.min(Date.now(),Date.parse(matched.gameDate)))}&hydrate=gameInfo`;
  try{
   const history=await request(formUrl,data=>z.object({dates:z.array(z.object({games:z.array(z.unknown())}))}).parse(data));
   const games=history.dates.flatMap(d=>d.games).map(g=>completedMlbGame(g,base+formUrl)).filter((g):g is NonNullable<typeof g>=>!!g);
   for(const target of [matched.teams.home.team,matched.teams.away.team]){
    const form=rollingForm(games,String(target.id),Number(season),Date.parse(matched.gameDate));
    if(!form){input.gaps.push(`Fewer than ten verified completed games with completion bounds are available for ${target.name}.`);continue;}
    formFeatures.forEach((feature,index)=>add(target.name,feature.metric,form.values[index],formUrl,`${form.gameIds.length} completed games; season ${season}; completion bounds precede matchup`));
   }
  }catch{input.gaps.push('The live feature packet for the calibrated scoring-form model could not be verified.');}
  input.gaps.push('Confirmed batting lineups, comprehensive injury availability, bullpen workloads, and park/weather adjustments are not verified by this adapter.');
  input.status=input.evidence.length>4?'AVAILABLE':'INCOMPLETE';
 }catch{input.status='ERROR';input.gaps.push('The official MLB statistics provider could not return valid current data.');}
 return input;
}

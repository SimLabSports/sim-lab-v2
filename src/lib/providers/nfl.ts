import 'server-only';
import {z} from 'zod';
import {providerJson} from '../server/provider-http';
import type {MarketEvent} from '../markets';
import type {ResearchInput} from '../research-types';

const base='https://site.api.espn.com/apis/site/v2/sports/football/nfl/';
const team=z.object({id:z.string().regex(/^\d+$/),displayName:z.string()});
const timestamp=z.string().transform(value=>value.replace(/T(\d{2}:\d{2})(Z|[+-]\d{2}:\d{2})$/,'T$1:00$2')).pipe(z.string().datetime({offset:true}));
const state=z.object({type:z.object({name:z.string(),state:z.string(),completed:z.boolean()})});
const competitor=z.object({homeAway:z.enum(['home','away']),team,score:z.union([z.string(),z.object({value:z.number().finite()})]).optional()});
const competition=z.object({date:timestamp,competitors:z.array(competitor),status:state});
const game=z.object({id:z.string().regex(/^\d+$/),date:timestamp,competitions:z.array(competition)});
const scoreboardSchema=z.object({leagues:z.array(z.object({season:z.object({year:z.number(),type:z.object({type:z.number()})})})),events:z.array(game)});
const scheduleSchema=z.object({season:z.object({year:z.number(),type:z.number()}),team,events:z.array(game)});
const statsSchema=z.object({season:z.object({year:z.number(),type:z.number()}),team,results:z.object({stats:z.object({categories:z.array(z.object({name:z.string(),stats:z.array(z.object({name:z.string(),value:z.number().finite().optional()}))}))})})});
const summarySchema=z.object({header:z.object({id:z.string(),competitions:z.array(competition)}),injuries:z.array(z.object({team,injuries:z.array(z.object({status:z.string(),date:z.string().optional(),athlete:z.object({displayName:z.string()})}))})).optional()});
const normalize=(name:string)=>name.toLowerCase().replace(/[^a-z0-9]/g,'');
function request<T>(resource:string,schema:z.ZodType<T>){
 return providerJson({provider:'ESPN NFL',cacheKey:`espn-nfl:${resource}`,url:base+resource,ttl:300000,validate:data=>({data:schema.parse(data),observedAt:new Date().toISOString()})});
}
function exactMatch(c:z.infer<typeof competition>,event:MarketEvent){
 return c.competitors.length===2&&['home','away'].every(side=>c.competitors.filter(p=>p.homeAway===side&&normalize(p.team.displayName)===normalize(side==='home'?event.home_team??'':event.away_team??'')).length===1)&&Math.abs(Date.parse(c.date)-Date.parse(event.commence_time))<=15*60000;
}
const metrics:Record<string,string[]>={passing:['completionPct','netPassingYardsPerGame','yardsPerPassAttempt','passingTouchdowns','interceptions','QBRating'],rushing:['rushingYardsPerGame','yardsPerRushAttempt','rushingTouchdowns'],miscellaneous:['thirdDownConvPct','redzoneTouchdownPct','turnOverDifferential'],defensive:['sacks','tacklesForLoss'],scoring:['totalPointsPerGame'],general:['gamesPlayed']};

/** Public, attributed NFL research inputs. No odds, ESPN predictions or analyst picks enter GCM. */
export async function nflResearch(event:MarketEvent):Promise<ResearchInput>{
 const input:ResearchInput={eventId:event.id,sport:event.sport_key,startTime:event.commence_time,home:event.home_team??'',away:event.away_team??'',provider:'ESPN NFL',providerEventId:null,retrievedAt:new Date().toISOString(),status:'INCOMPLETE',evidence:[],gaps:[],risks:[],lineupConfirmed:false,injuriesVerified:false,pregame:false};
 const add=(entity:string,metric:string,value:string|number,resource:string,observedAt:string,period:string)=>input.evidence.push({id:`nfl${input.evidence.length+1}`,entity,metric,value,sourceUrl:base+resource,observedAt,period});
 try{
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(event.commence_time)).replaceAll('-','');
  const resource=`scoreboard?dates=${date}`;const board=await request(resource,scoreboardSchema);
  const matches=board.data.events.flatMap(g=>g.competitions.filter(c=>exactMatch(c,event)).map(c=>({id:g.id,competition:c})));
  if(matches.length!==1){input.gaps.push('This matchup and start time could not be uniquely verified in the NFL schedule.');return input;}
  const matched=matches[0];input.providerEventId=matched.id;
  input.pregame=matched.competition.status.type.state==='pre'&&matched.competition.status.type.name==='STATUS_SCHEDULED'&&Date.now()<Math.min(Date.parse(event.commence_time),Date.parse(matched.competition.date));
  input.phase=input.pregame?'PREGAME':matched.competition.status.type.completed?'FINAL':matched.competition.status.type.state==='in'?'LIVE':'SUSPENDED';
  add('event','verified NFL game state',matched.competition.status.type.name,resource,board.observedAt,'current');
  if(!input.pregame){input.risks.push('The verified NFL game state is not scheduled pregame.');return input;}
  const season=board.data.leagues[0]?.season;
  if(!season||season.type.type!==2){input.gaps.push('The NFL fallback currently supports verified regular-season research only.');return input;}
  await Promise.all(matched.competition.competitors.map(async participant=>{
   const name=participant.team.displayName;const id=participant.team.id;let gamesPlayed:number|null=null;
   const scheduleResource=`teams/${id}/schedule?season=${season.year}&seasontype=2`;
   try{
    const schedule=await request(scheduleResource,scheduleSchema);
    if(schedule.data.team.id!==id||normalize(schedule.data.team.displayName)!==normalize(name)||schedule.data.season.year!==season.year||schedule.data.season.type!==2)throw new Error('Identity mismatch');
    if(schedule.data.events.filter(g=>g.id===matched.id&&g.competitions.some(c=>exactMatch(c,event))).length!==1)throw new Error('Event mismatch');
    const cutoff=Math.min(Date.now(),Date.parse(event.commence_time));
    const unique=new Map(schedule.data.events.map(g=>[g.id,g]));
    const finals=[...unique.values()].filter(g=>g.id!==matched.id&&Date.parse(g.date)<cutoff&&g.competitions.length===1&&g.competitions[0].status.type.completed&&g.competitions[0].status.type.name==='STATUS_FINAL').flatMap(g=>{
     const c=g.competitions[0];const own=c.competitors.filter(t=>t.team.id===id);const opponent=c.competitors.filter(t=>t.team.id!==id);
     const score=(p:z.infer<typeof competitor>)=>typeof p.score==='object'?p.score.value:typeof p.score==='string'&&/^\d+$/.test(p.score)?Number(p.score):NaN;
     if(own.length!==1||opponent.length!==1||!Number.isFinite(score(own[0]))||!Number.isFinite(score(opponent[0])))return [];
     return [{date:g.date,points:score(own[0]),against:score(opponent[0]),home:own[0].homeAway==='home'}];
    }).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
    gamesPlayed=finals.length;
    for(const [label,games] of [['season completed games',finals],['last five completed games',finals.slice(0,5)]] as const){
     if(!games.length)continue;
     const wins=games.filter(g=>g.points>g.against).length;const losses=games.filter(g=>g.points<g.against).length;
     add(name,`${label} sample`,games.length,scheduleResource,schedule.observedAt,`regular season ${season.year}`);
     add(name,`${label} record (wins-losses-ties)`,`${wins}-${losses}-${games.length-wins-losses}`,scheduleResource,schedule.observedAt,`regular season ${season.year}`);
     add(name,`${label} points per game`,Number((games.reduce((s,g)=>s+g.points,0)/games.length).toFixed(2)),scheduleResource,schedule.observedAt,`regular season ${season.year}`);
     add(name,`${label} points allowed per game`,Number((games.reduce((s,g)=>s+g.against,0)/games.length).toFixed(2)),scheduleResource,schedule.observedAt,`regular season ${season.year}`);
    }
    if(finals.length)add(name,'full rest days since last completed game',Math.max(0,Math.floor((Date.parse(event.commence_time)-Date.parse(finals[0].date))/86400000)-1),scheduleResource,schedule.observedAt,'schedule');
    else input.gaps.push(`No completed current-season games verified for ${name}.`);
   }catch{input.gaps.push(`Recent results and schedule could not be verified for ${name}.`);}
   const statsResource=`teams/${id}/statistics?season=${season.year}&seasontype=2`;
   try{
    const stats=await request(statsResource,statsSchema);const data=stats.data;
    const sample=data.results.stats.categories.find(c=>c.name==='general')?.stats.find(s=>s.name==='gamesPlayed')?.value;
    if(data.team.id!==id||normalize(data.team.displayName)!==normalize(name)||data.season.year!==season.year||data.season.type!==2||!gamesPlayed||sample!==gamesPlayed)throw new Error('Season/sample mismatch');
    for(const category of data.results.stats.categories)for(const metric of metrics[category.name]??[]){const stat=category.stats.find(s=>s.name===metric);if(stat?.value!==undefined)add(name,`${category.name} ${metric}`,stat.value,statsResource,stats.observedAt,`regular season ${season.year}, ${gamesPlayed} completed games`);}
   }catch{input.gaps.push(`Season efficiency statistics and their game sample could not be verified for ${name}.`);}
  }));
  const summaryResource=`summary?event=${matched.id}`;
  try{
   const summary=await request(summaryResource,summarySchema);
   if(summary.data.header.id!==matched.id||summary.data.header.competitions.length!==1||!exactMatch(summary.data.header.competitions[0],event))throw new Error('Event mismatch');
   for(const report of summary.data.injuries??[]){
    const participant=matched.competition.competitors.find(p=>p.team.id===report.team.id&&normalize(p.team.displayName)===normalize(report.team.displayName));if(!participant)continue;
    for(const injury of report.injuries.slice(0,30)){
     if(!injury.date||!Number.isFinite(Date.parse(injury.date))||Date.parse(injury.date)>Date.now()+60000||Date.now()-Date.parse(injury.date)>7*86400000)continue;
     add(participant.team.displayName,'reported player availability',`${injury.athlete.displayName}: ${injury.status}; report ${injury.date}`,summaryResource,summary.observedAt,'current injury report; final game status unconfirmed');
     input.risks.push(`${participant.team.displayName}: ${injury.athlete.displayName} reported ${injury.status}; final availability and matchup impact require confirmation.`);
    }
   }
  }catch{input.gaps.push('Current NFL injury reporting could not be retrieved.');}
  input.gaps.push('Final active rosters, starting quarterbacks, comprehensive injury clearance, workload, opponent-adjusted EPA, line matchups, weather and settlement rules remain unverified. Public injury reports do not confirm availability.');
  input.status=input.evidence.filter(e=>e.entity!=='event').length>=6?'AVAILABLE':'INCOMPLETE';
 }catch{input.status='ERROR';input.gaps.push('The NFL research provider could not return valid current data. Retry when the source is available.');}
 return input;
}

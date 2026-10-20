import 'server-only';
import {z} from 'zod';
import {providerJson} from '../server/provider-http';
import {sportProfile} from '../sport-profiles';
import {participantKey,sameStart} from '../event-identity';
import type {MarketEvent} from '../markets';
import type {ResearchInput} from '../research-types';
const team=z.object({id:z.string(),displayName:z.string()});
const status=z.object({type:z.object({name:z.string(),state:z.string(),completed:z.boolean()})});
const competitor=z.object({id:z.string().optional(),homeAway:z.string(),team,score:z.union([z.string(),z.object({value:z.number()})]).optional()});
const competition=z.object({id:z.string().optional(),date:z.string(),timeValid:z.boolean().optional(),competitors:z.array(competitor),status});
const game=z.object({id:z.string(),date:z.string(),season:z.object({year:z.number(),type:z.number().optional()}).optional(),competitions:z.array(competition)});
const boardSchema=z.object({events:z.array(game)});
const scheduleSchema=z.object({team,season:z.object({year:z.number(),type:z.number()}),events:z.array(game)});
const statsSchema=z.object({team,season:z.object({year:z.number(),type:z.number()}),results:z.object({stats:z.object({categories:z.array(z.object({name:z.string(),stats:z.array(z.object({name:z.string(),value:z.number().finite().optional()}))}))})})});
const summarySchema=z.object({header:z.object({id:z.string(),competitions:z.array(competition)}),boxscore:z.object({teams:z.array(z.object({team,statistics:z.array(z.object({name:z.string(),displayValue:z.string()})).optional()})).optional()}).optional(),lastFiveGames:z.array(z.object({team,events:z.array(z.object({id:z.string(),gameDate:z.string(),homeTeamId:z.string(),awayTeamId:z.string(),homeTeamScore:z.string(),awayTeamScore:z.string(),gameResult:z.string(),leagueAbbreviation:z.string().optional()}))})).optional(),injuries:z.array(z.object({team,injuries:z.array(z.object({status:z.string(),date:z.string().optional(),athlete:z.object({displayName:z.string()})}))})).optional()});
const metrics:Record<string,string[]>={basketball:['gamesPlayed','avgPoints','avgRebounds','avgAssists','avgTurnovers','avgOffensiveRebounds','avgDefensiveRebounds','fieldGoalPct','threePointPct','threePointFieldGoalPct','freeThrowPct','scoringEfficiency','shootingEfficiency','assistTurnoverRatio'],hockey:['gamesPlayed','goals','avgGoals','goalsAgainst','avgGoalsAgainst','shots','avgShots','shotsAgainst','powerPlayPct','penaltyKillPct','savePct','shootingPct'],football:['gamesPlayed','completionPct','yardsPerPassAttempt','netPassingYardsPerGame','QBRating','rushingYardsPerGame','yardsPerRushAttempt','thirdDownConvPct','redzoneTouchdownPct','turnOverDifferential','totalPointsPerGame','sacks'],soccer:['goalDifference','totalGoals','goalsConceded','goalAssists','totalShots','shotsOnTarget','possessionPct']};
type Result={id:string;date:string;for:number;against:number;home:boolean};
export async function espnTeamResearch(event:MarketEvent):Promise<ResearchInput>{
 const profile=sportProfile(event.sport_key);const input:ResearchInput={eventId:event.id,sport:event.sport_key,startTime:event.commence_time,home:event.home_team??'',away:event.away_team??'',provider:`ESPN ${profile?.label??'unmapped'}`,providerEventId:null,retrievedAt:new Date().toISOString(),status:'INCOMPLETE',evidence:[],gaps:[],risks:[],lineupConfirmed:false,injuriesVerified:false,pregame:false};
 if(!profile?.espn||profile.research!=='TEAM'){input.gaps.push('No exact public team competition adapter is mapped.');return input;}
 const base=`https://site.api.espn.com/apis/site/v2/sports/${profile.espn}/`;
 const request=<T>(resource:string,schema:z.ZodType<T>)=>providerJson({provider:`ESPN ${profile.espn} ${resource.split('?')[0].replace(/teams\/\d+\//,'')}`,cacheKey:`espn-team-v1:${profile.espn}:${resource}`,url:base+resource,ttl:300000,validate:data=>({data:schema.parse(data),observedAt:new Date().toISOString()})});
 const add=(entity:string,metric:string,value:string|number,resource:string,observedAt:string,period:string)=>input.evidence.push({id:`espn${input.evidence.length+1}`,entity,metric,value,sourceUrl:base+resource,observedAt,period});
 const exact=(c:z.infer<typeof competition>)=>c.timeValid!==false&&c.competitors.length===2&&sameStart(c.date,event.commence_time)&&['home','away'].every(side=>c.competitors.filter(p=>p.homeAway===side&&participantKey(p.team.displayName)===participantKey(side==='home'?input.home:input.away)).length===1);
 try{
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(event.commence_time)).replaceAll('-','');
  const resource=`scoreboard?dates=${date}&limit=1000${profile.espn==='football/college-football'?'&groups=80':profile.espn.includes('college-basketball')?'&groups=50':''}`;
  const board=await request(resource,boardSchema);const matches=board.data.events.flatMap(g=>g.competitions.filter(exact).map(c=>({game:g,c})));
  if(matches.length!==1){input.gaps.push('Both participants, competition and start time could not be uniquely matched to the public schedule (15-minute tolerance).');return input;}
  const {game:matched,c}=matches[0];input.providerEventId=`${profile.espn}:${matched.id}`;
  input.pregame=c.status.type.name==='STATUS_SCHEDULED'&&c.status.type.state==='pre'&&Date.now()<Math.min(Date.parse(event.commence_time),Date.parse(c.date));input.phase=input.pregame?'PREGAME':c.status.type.completed?'FINAL':c.status.type.state==='in'?'LIVE':'SUSPENDED';
  add('event','verified competition state',c.status.type.name,resource,board.observedAt,'current');
  if(!input.pregame){input.risks.push('The verified event is not scheduled pregame; no pregame approval.');return input;}
  const season=matched.season;if(!season?.type){input.gaps.push('Exact competition season/type is unavailable.');return input;}
  const samples=new Map<string,number>();
  const describe=(name:string,results:Result[],url:string,at:string,period:string)=>{
   const recent=results.sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)).slice(0,5);if(!recent.length)return;
   add(name,'verified recent completed sample',recent.length,url,at,period);
   add(name,'recent wins-losses-draws',`${recent.filter(r=>r.for>r.against).length}-${recent.filter(r=>r.for<r.against).length}-${recent.filter(r=>r.for===r.against).length}`,url,at,period);
   add(name,`recent ${profile.scoreUnit} scored mean`,recent.reduce((s,r)=>s+r.for,0)/recent.length,url,at,period);
   add(name,`recent ${profile.scoreUnit} allowed mean`,recent.reduce((s,r)=>s+r.against,0)/recent.length,url,at,period);
   for(const location of ['home','away']){const part=recent.filter(r=>r.home===(location==='home'));if(part.length)add(name,`${location} recent scoring margin mean`,part.reduce((s,r)=>s+r.for-r.against,0)/part.length,url,at,`${period}; ${part.length} ${location} games`);}
   add(name,'schedule rest days since last start',Math.max(0,Math.floor((Date.parse(event.commence_time)-Date.parse(recent[0].date))/86400000)-1),url,at,'derived from prior completed game start; not workload clearance');
  };
  await Promise.all(c.competitors.map(async p=>{
   const scheduleUrl=`teams/${p.team.id}/schedule?season=${season.year}${profile.family==='soccer'?'':`&seasontype=${season.type}`}`;
   try{const schedule=await request(scheduleUrl,scheduleSchema);if(schedule.data.team.id!==p.team.id||schedule.data.season.year!==season.year||(profile.family!=='soccer'&&schedule.data.season.type!==season.type))throw Error('Identity mismatch');
    const cutoff=Math.min(Date.now(),Date.parse(event.commence_time));const finals=[...new Map(schedule.data.events.map(g=>[g.id,g])).values()].filter(g=>g.id!==matched.id&&Date.parse(g.date)<cutoff&&Date.parse(g.date)>=cutoff-profile.windowDays*86400000&&g.competitions.length===1&&g.competitions[0].status.type.completed&&g.competitions[0].status.type.name===(profile.family==='soccer'?'STATUS_FULL_TIME':'STATUS_FINAL')&&(!g.season||g.season.year===season.year));
    const results:Result[]=finals.flatMap(g=>{const ps=g.competitions[0].competitors;const own=ps.find(t=>t.team.id===p.team.id),other=ps.find(t=>t.team.id!==p.team.id);const score=(t:typeof own)=>typeof t?.score==='object'?t.score.value:typeof t?.score==='string'&&/^\d+(?:\.\d+)?$/.test(t.score)?Number(t.score):NaN;return ps.length===2&&own&&other&&Number.isFinite(score(own))&&Number.isFinite(score(other))?[{id:g.id,date:g.date,for:score(own),against:score(other),home:own.homeAway==='home'}]:[];});
    samples.set(p.team.id,results.length);describe(p.team.displayName,results,scheduleUrl,schedule.observedAt,`season ${season.year}, type ${season.type}, within ${profile.windowDays} days`);
    if(!results.length)input.gaps.push(`No completed current-season recent results for ${p.team.displayName}; prior seasons are not relabeled as current form.`);
   }catch{input.gaps.push(`Verified current-season game history unavailable for ${p.team.displayName}.`);}
   // Soccer's public season-statistics shape differs; use exact-match summary statistics below.
   if(profile.family==='soccer')return;
   const statUrl=`teams/${p.team.id}/statistics?season=${season.year}&seasontype=${season.type}`;
   try{const result=await request(statUrl,statsSchema);const d=result.data;const count=d.results.stats.categories.flatMap(c=>c.stats).find(s=>s.name==='gamesPlayed')?.value;
    if(d.team.id!==p.team.id||d.season.year!==season.year||d.season.type!==season.type||!count||count!==(samples.get(p.team.id)??0))throw Error('Unverified sample');
    for(const group of d.results.stats.categories)for(const stat of group.stats)if(metrics[profile.family]?.includes(stat.name)&&stat.value!==undefined)add(p.team.displayName,`${profile.family} ${stat.name}`,stat.value,statUrl,result.observedAt,`season ${season.year}, type ${season.type}, ${count} verified completed games`);
   }catch{input.gaps.push(`Current-season efficiency statistics/sample could not be verified for ${p.team.displayName}.`);}
  }));
  const summaryUrl=`summary?event=${matched.id}`;
  try{const summary=await request(summaryUrl,summarySchema);const d=summary.data;if(d.header.id!==matched.id||d.header.competitions.length!==1||!exact(d.header.competitions[0]))throw Error('Summary mismatch');
   if(profile.family==='soccer')for(const record of d.boxscore?.teams??[]){const target=c.competitors.find(p=>p.team.id===record.team.id&&participantKey(p.team.displayName)===participantKey(record.team.displayName));if(!target)continue;for(const stat of record.statistics??[])if(metrics.soccer.includes(stat.name)&&/^-?\d+(?:\.\d+)?$/.test(stat.displayValue))add(target.team.displayName,`soccer season ${stat.name}`,Number(stat.displayValue),summaryUrl,summary.observedAt,`provider summary for season ${season.year}; sample not independently confirmed`);}
   for(const report of d.injuries??[]){const target=c.competitors.find(p=>p.team.id===report.team.id);if(!target)continue;for(const injury of report.injuries){const at=injury.date?Date.parse(injury.date):NaN;if(!Number.isFinite(at)||at>Date.now()||Date.now()-at>7*86400000)continue;add(target.team.displayName,'reported player availability',`${injury.athlete.displayName}: ${injury.status}; reported ${injury.date}`,summaryUrl,summary.observedAt,'reported status; not confirmed game availability');input.risks.push(`${target.team.displayName}: ${injury.athlete.displayName} ${injury.status}; impact and final availability unverified.`);}}
  }catch{input.gaps.push('Exact-event summary/availability reporting could not be verified.');}
  input.gaps.push(...profile.required.map(metric=>`${metric}: complete current verification is still required.`),'Bookmaker settlement and independently validated sport/market probability remain required for official approval.');
  input.status=[input.home,input.away].every(name=>input.evidence.filter(e=>e.entity===name).length>=3)?'AVAILABLE':'INCOMPLETE';
 }catch{input.status='ERROR';input.gaps.push(`The public ${profile.label} source did not return a valid current event. Other sports continue independently.`);}
 return input;
}

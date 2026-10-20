import 'server-only';
import { z } from 'zod';
import { mlbResearch } from './mlb';
import { nflResearch } from './nfl';
import {ballDontLieResearch} from './balldontlie';
import {bdlSport,bdlEventDataSports} from './balldontlie-sports';
import {sportProfile} from '../sport-profiles';
import {eventIdentity} from '../event-identity';
import {espnTeamResearch} from './espn-team';
import {espnIndividualResearch} from './espn-individual';
import { providerJson } from '../server/provider-http';
import type { ResearchInput } from '../research-types';
import type { MarketEvent } from '../markets';
// These documented feeds are real APIs. No endpoint is treated as connected before a successful response.
const sports:Record<string,string>={americanfootball_nfl:'nfl',basketball_nba:'nba',icehockey_nhl:'nhl',baseball_mlb:'mlb'};
const keyFor=(sport:string)=>process.env[`SPORTSDATAIO_${sport.toUpperCase()}_KEY`]||process.env.SPORTSDATAIO_API_KEY;
async function legacyStatistics(event:MarketEvent):Promise<ResearchInput>{
 if(event.sport_key==='baseball_mlb'&&!keyFor('mlb'))return mlbResearch(event);
 if(event.sport_key==='americanfootball_nfl'&&(!keyFor('nfl')||process.env.SPORTSDATAIO_REAL_DATA_CONFIRMED!=='true'))return nflResearch(event);
 const sport=sports[event.sport_key];
 const result:ResearchInput={eventId:event.id,sport:event.sport_key,startTime:event.commence_time,home:event.home_team||'',away:event.away_team||'',provider:sport?'SportsDataIO':'Not connected',providerEventId:null,retrievedAt:new Date().toISOString(),status:'INCOMPLETE',evidence:[],gaps:[],risks:[],lineupConfirmed:false,injuriesVerified:false,pregame:Date.now()<Date.parse(event.commence_time)};
 if(!sport){result.gaps.push(`A verified sport-specific statistics adapter is not connected for ${event.sport_key}. NCAA, soccer and tennis require their own subscribed feeds and schemas.`);return result;}
 if(!keyFor(sport)){result.gaps.push(`Configure SPORTSDATAIO_${sport.toUpperCase()}_KEY with a real-data statistics subscription.`);return result;}
 if(process.env.SPORTSDATAIO_REAL_DATA_CONFIRMED!=='true'){result.gaps.push('SportsDataIO real-data access has not been confirmed. Scrambled trial statistics are not eligible research inputs.');return result;}
 try{
  const teams=await providerJson({provider:'SportsDataIO',cacheKey:`sdi:${sport}:teams`,url:`https://api.sportsdata.io/v3/${sport}/scores/json/Teams`,headers:{'Ocp-Apim-Subscription-Key':keyFor(sport)!},ttl:21600000,validate:data=>z.array(z.object({TeamID:z.number(),Key:z.string(),Name:z.string(),City:z.string().nullish(),FullName:z.string().nullish()}).passthrough()).parse(data)});
  const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
  const matched=[result.away,result.home].map(name=>teams.filter(team=>normalize(team.FullName||`${team.City||''} ${team.Name}`)===normalize(name)));
  if(matched.some(list=>list.length!==1)){result.gaps.push('Statistics provider teams do not uniquely match the market participants. No guessed mapping was used.');return result;}
  for(const [index,list]of matched.entries()){
   const team=list[0];result.evidence.push({id:`team${index}`,entity:index===0?result.away:result.home,metric:'verified provider team identity',value:team.Key,sourceUrl:`https://sportsdata.io/developers/api-documentation/${sport}`,observedAt:result.retrievedAt,period:'current'});
  }
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(event.commence_time));
  const request=async(resource:string)=>providerJson({provider:'SportsDataIO',cacheKey:`sdi:${sport}:${resource}`,url:`https://api.sportsdata.io/v3/${sport}/scores/json/${resource}`,headers:{'Ocp-Apim-Subscription-Key':keyFor(sport)!},ttl:300000,validate:data=>z.array(z.record(z.string(),z.unknown())).parse(data)});
  const scheduled=await request(`${sport==='nfl'?'ScoresByDate':'GamesByDate'}/${date}`);
  const matching=scheduled.filter(game=>game.AwayTeamID===matched[0][0].TeamID&&game.HomeTeamID===matched[1][0].TeamID&&typeof game.DateTimeUTC==='string'&&Math.abs(Date.parse(game.DateTimeUTC.endsWith('Z')?game.DateTimeUTC:game.DateTimeUTC+'Z')-Date.parse(event.commence_time))<=90*60000);
  if(matching.length!==1){result.gaps.push('An exact provider event/start-time match is not available. Seasonal statistics are not assigned to an assumed game.');return result;}
  const game=matching[0];result.providerEventId=String(game.ScoreID??game.GameID);result.pregame=result.pregame&&['Scheduled','PreGame'].includes(String(game.Status));
  const season=game.Season;
  if(typeof season!=='number'){result.gaps.push('The provider season identifier is unavailable.');return result;}
  const stats=await request(`TeamSeasonStats/${season}`);
  const metrics:Record<string,string[]>={nfl:['Games','Points','OpponentPoints','OffensiveYards','OffensiveYardsPerPlay','OpponentOffensiveYardsPerPlay','ThirdDownPercentage','OpponentThirdDownPercentage','TurnoverDifferential'],nba:['Games','Points','Possessions','OffensiveRebounds','DefensiveRebounds','Assists','Turnovers','EffectiveFieldGoalsPercentage','TrueShootingPercentage','OpponentPoints'],nhl:['Games','Goals','ShotsOnGoal','PowerPlayGoals','PowerPlayPercentage','PenaltyKillPercentage','SavePercentage','OpponentGoals','OpponentShotsOnGoal'],mlb:['Games','Runs','Hits','HomeRuns','OnBasePercentage','SluggingPercentage','BattingAverage','EarnedRunAverage','WalksHitsPerInningsPitched']};
  for(const [index,list]of matched.entries()){
   const target=list[0];const rows=stats.filter(row=>row.TeamID===target.TeamID);
   for(const row of rows)for(const metric of metrics[sport]){const value=row[metric];if(typeof value==='number'&&Number.isFinite(value))result.evidence.push({id:`s${result.evidence.length+1}`,entity:index===0?result.away:result.home,metric,value,sourceUrl:`https://sportsdata.io/developers/api-documentation/${sport}#/endpoint/team-season-stats`,observedAt:result.retrievedAt,period:`season ${season}`});}
  }
  result.gaps.push('Event mapping and available season statistics are verified. Confirmed starters, current injury reports, recent game-level form, advanced matchup features and travel are not yet mapped for this subscribed product.');
  // Quantitative and featured approval remain disabled until the sport-specific minimum inputs exist.
 }catch(error){result.status='ERROR';result.gaps.push(error instanceof Error?error.message:'Statistics provider failed.');}
 return result;
}

export async function getStatistics(event:MarketEvent):Promise<ResearchInput>{
 const profile=sportProfile(event.sport_key),bdl=bdlSport(event.sport_key);
 const licensed=!!sports[event.sport_key]&&!!keyFor(sports[event.sport_key])&&process.env.SPORTSDATAIO_REAL_DATA_CONFIRMED==='true';
 const primary=['baseball_mlb','americanfootball_nfl'].includes(event.sport_key)||licensed?legacyStatistics(event):profile?.research==='TEAM'?espnTeamResearch(event):espnIndividualResearch(event);
 const requests=[primary];if(process.env.BALLDONTLIE_API_KEY&&bdl&&bdlEventDataSports.has(bdl))requests.push(ballDontLieResearch(event));
 const settled=await Promise.allSettled(requests);const packets=settled.flatMap(p=>p.status==='fulfilled'?[p.value]:[]);
 if(!packets.length)throw new Error('No sport-specific statistics provider completed this request.');
 const ranked=[...packets].sort((a,b)=>Number(b.status==='AVAILABLE')-Number(a.status==='AVAILABLE')||Number(!!b.providerEventId)-Number(!!a.providerEventId)||b.evidence.length-a.evidence.length);
 const chosen=ranked[0],usable=packets.filter(p=>p.providerEventId&&p.pregame&&p.evidence.length>0&&p.status!=='ERROR');
 const conflict=packets.some(p=>p.providerEventId&&!p.pregame);
 const evidence=chosen.pregame?usable.flatMap(p=>p.evidence):chosen.evidence;
 const result:ResearchInput={...chosen,provider:chosen.pregame&&usable.length?usable.map(p=>p.provider).join(' + '):chosen.provider,evidence:evidence.length?evidence:chosen.evidence,pregame:chosen.pregame&&!conflict,gaps:[...new Set(packets.flatMap(p=>p.gaps))],risks:[...new Set(packets.flatMap(p=>p.risks))]};
 if(conflict){result.phase=chosen.phase==='PREGAME'?'SUSPENDED':chosen.phase;result.gaps.push('Matched providers do not agree on scheduled pregame state. Approval is withheld.');}
 result.identity={...eventIdentity(event),providerBindings:packets.filter(p=>p.providerEventId).map(p=>({provider:p.provider,eventId:p.providerEventId!}))};
 result.coverage={family:profile?.family??null,researchAdapter:profile?.research??null,verifiedMetrics:[...new Set(result.evidence.filter(e=>e.entity!=='event').map(e=>e.metric))],requiredFeatures:profile?.required??['A verified sport-specific statistical module'],limits:'Evidence availability is separate from complete approval inputs and calibrated model readiness.'};
 return result;
}

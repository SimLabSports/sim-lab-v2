import 'server-only';
import {createHash} from 'node:crypto';
import {unstable_cache} from 'next/cache';
import {database} from '../server/database';
import {z} from 'zod';
import {participantKey,sameStart} from '../event-identity';
import type {MarketEvent} from '../markets';
import type {ResearchInput} from '../research-types';

const slugs=['football','basketball','tennis','hockey','american-football','baseball','mma'] as const;
export type SportsApiProSport=typeof slugs[number];
export const sportsApiProSlugs=slugs;
export function sportsApiProSport(key:string):SportsApiProSport|null{return ({basketball_nba:'basketball',basketball_wnba:'basketball',basketball_ncaab:'basketball',americanfootball_nfl:'american-football',americanfootball_ncaaf:'american-football',baseball_mlb:'baseball',icehockey_nhl:'hockey',mma_mixed_martial_arts:'mma'} as Record<string,SportsApiProSport>)[key]??(key.startsWith('soccer_')?'football':key.startsWith('tennis_')?'tennis':null);}
const limit=()=>Math.min(80,Math.max(1,Math.floor(Number(process.env.SPORTSAPIPRO_DAILY_LIMIT)||80)));
const base='https://api.sportsapipro.com/v2';
export async function sportsApiProBudget(){const r=await database().query<{used:number}>("SELECT count(*)::int AS used FROM intelligence_audit WHERE action='sportsapipro_request' AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'");return {used:r.rows[0].used,limit:limit()};}
async function admit(path:string){const client=await database().connect();try{await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtext('simlab-sportsapipro-budget'))");const r=await client.query<{used:number}>("SELECT count(*)::int AS used FROM intelligence_audit WHERE action='sportsapipro_request' AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'");if(r.rows[0].used>=limit())throw Error('SportsAPIPro local daily budget reached; retry after midnight UTC.');await client.query("INSERT INTO intelligence_audit(action,record_id) VALUES('sportsapipro_request',$1)",[createHash('sha256').update(path).digest('hex')]);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
async function load(path:string){
 if(!process.env.SPORTSAPIPRO_API_KEY)throw Error('SportsAPIPro key is not configured.');
 await admit(path);
 try{
  const r=await fetch(base+path,{headers:{'x-api-key':process.env.SPORTSAPIPRO_API_KEY},cache:'no-store',signal:AbortSignal.timeout(15000)});
  const quota={remaining:r.headers.get('x-ratelimit-remaining'),reset:r.headers.get('x-ratelimit-reset')};
  if(!r.ok)return {ok:false,status:r.status,observedAt:new Date().toISOString(),sourceUrl:base+path,data:null,quota};
  const raw:unknown=await r.json();if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error();const data=raw as Record<string,unknown>;
  return {ok:data.success===true,status:r.status,observedAt:new Date().toISOString(),sourceUrl:base+path,data,quota};
 }catch{
  // Negative caching also covers timeouts/malformed responses, preventing repeated billable misses.
  return {ok:false,status:504,observedAt:new Date().toISOString(),sourceUrl:base+path,data:null,quota:{remaining:null,reset:null}};
 }
}
// Cache unsuccessful HTTP responses as well: polling cannot repeatedly consume a rejected allowance.
const cached=unstable_cache(load,['sportsapipro-v2'],{revalidate:600});
const status=unstable_cache(load,['sportsapipro-status-v1'],{revalidate:3600});
const scheduled=z.object({success:z.literal(true),events:z.array(z.object({id:z.number().int().positive(),homeTeam:z.object({name:z.string()}),awayTeam:z.object({name:z.string()}),startTimestamp:z.number(),status:z.object({type:z.string()}),tournament:z.object({name:z.string()})}))});
const player=z.object({player:z.object({id:z.number(),name:z.string()}),substitute:z.boolean()});
const card=z.object({players:z.array(player),missingPlayers:z.array(z.object({type:z.string()})).optional()});
const lineup=z.object({success:z.literal(true),matchId:z.number(),data:z.object({confirmed:z.boolean(),home:card,away:card})});
function correctLeague(key:string,name:string){const leagues:Record<string,RegExp>={basketball_nba:/^NBA$/,basketball_wnba:/^WNBA$/,basketball_ncaab:/NCAA/,americanfootball_nfl:/^NFL(?:,|$)/,americanfootball_ncaaf:/NCAA/,baseball_mlb:/\bMLB\b/,icehockey_nhl:/^NHL(?:,|$)/};return !leagues[key]||leagues[key].test(name);}

// Only derived assessments leave this module. Raw rosters and injury records remain private.
export async function enrichSportsApiPro(event:MarketEvent,input:ResearchInput):Promise<ResearchInput>{
 const sport=sportsApiProSport(event.sport_key);if(!process.env.SPORTSAPIPRO_API_KEY||!sport||!input.pregame||!event.home_team||!event.away_team)return input;
 const result:ResearchInput={...input,evidence:[...input.evidence],gaps:[...input.gaps],risks:[...input.risks],identity:input.identity?{...input.identity,providerBindings:[...input.identity.providerBindings]}:undefined};
 try{
  const page=await cached(`/${sport}/schedule/${event.commence_time.slice(0,10)}`);if(!page.ok){result.gaps.push(`SportsAPIPro ${sport} schedule returned HTTP ${page.status}; no event mapping or clearance used.`);return result;}
  const matches=scheduled.parse(page.data).events.filter(e=>participantKey(e.homeTeam.name)===participantKey(input.home)&&participantKey(e.awayTeam.name)===participantKey(input.away)&&sameStart(new Date(e.startTimestamp*1000).toISOString(),event.commence_time)&&correctLeague(event.sport_key,e.tournament.name));
  if(matches.length!==1){result.gaps.push('SportsAPIPro did not uniquely match sport, competition, participant roles and start; no guessed binding used.');return result;}
  const match=matches[0];if(match.status.type!=='notstarted'){result.pregame=false;result.phase='SUSPENDED';result.risks.push('SportsAPIPro event state does not confirm pregame; approval withheld.');return result;}
  result.provider+=' + SportsAPIPro';result.identity?.providerBindings.push({provider:'SportsAPIPro',eventId:String(match.id)});
  const add=(entity:string,metric:string,value:string,source:typeof page)=>{const id=`sap${result.evidence.length+1}`;result.evidence.push({id,entity,metric,value,sourceUrl:source.sourceUrl,observedAt:source.observedAt,period:'derived assessment for this exact event; not a probability or injury clearance'});return id;};
  add('event','SportsAPIPro event cross-check','Participants, competition, scheduled start and pregame state match.',page);
  if(!['basketball','baseball'].includes(sport)){result.gaps.push(`SportsAPIPro ${sport} schedule matched; lineup and availability interpretation not yet verified.`);return result;}
  const response=await cached(`/${sport}/match/${match.id}/lineups`);if(!response.ok){result.gaps.push(`SportsAPIPro ${sport} lineup endpoint returned HTTP ${response.status}; availability remains unverified.`);return result;}
  const parsed=lineup.safeParse(response.data);if(!parsed.success||parsed.data.matchId!==match.id){result.gaps.push('SportsAPIPro lineup response lacks verified event-specific schema; no clearance used.');return result;}
  const data=parsed.data.data,ids:string[]=[];let complete=data.confirmed;
  for(const [side,name] of [['home',input.home],['away',input.away]] as const){const starters=data[side].players.filter(p=>p.substitute===false),expected=sport==='basketball'?5:9;const valid=starters.length===expected&&new Set(starters.map(p=>p.player.id)).size===expected&&starters.every(p=>p.player.name.trim().length>0);complete=complete&&valid;
   ids.push(add(name,'SportsAPIPro starting-lineup assessment',data.confirmed&&valid?'Confirmed complete starting unit.':'Final starting unit is unconfirmed or incomplete.',response));
   const unavailable=data[side].missingPlayers;if(unavailable){const concerns=unavailable.filter(p=>['missing','doubtful'].includes(p.type)).length;add(name,'SportsAPIPro availability assessment',concerns?'Availability concerns detected; final status and impact require verification.':'No concerns listed; complete injury clearance is not established.',response);if(concerns)result.risks.push(`SportsAPIPro flags availability concerns for ${name}; no injury, workload or probability adjustment is assumed.`);}
  }
  if(complete&&sport==='basketball'&&!result.verifications?.some(v=>v.kind==='lineup'&&v.status==='BLOCKED')){result.lineupConfirmed=true;result.verifications=[...(result.verifications??[]).filter(v=>v.kind!=='lineup'),{kind:'lineup',status:'CLEAR',evidenceIds:ids,observedAt:response.observedAt}];}
  // Baseball also requires a verified starting pitcher, beyond a batting card.
  result.gaps.push('SportsAPIPro availability analysis does not establish complete injuries, minutes restrictions, workload clearance or a calibrated probability. Unconfirmed starters remain an approval blocker.');
 }catch(error){result.gaps.push(error instanceof z.ZodError?'SportsAPIPro schedule schema unsupported; no replacement data used.':error instanceof Error?error.message:'SportsAPIPro enrichment unavailable.');}
 return result;
}
export async function sportsApiProAccess(){if(!process.env.SPORTSAPIPRO_API_KEY)return {configured:false,status:'NOT_CONFIGURED'};try{const r=await status('/basketball/status');const account=r.data?.account as Record<string,unknown>|undefined;const usage=r.data?.usage as Record<string,unknown>|undefined;return {configured:true,status:r.ok?'VERIFIED':'UNAVAILABLE',httpStatus:r.status,checkedAt:r.observedAt,plan:typeof account?.plan==='string'?account.plan:null,dailyLimit:typeof usage?.daily_limit==='number'?usage.daily_limit:null,remaining:typeof usage?.remaining==='number'?usage.remaining:null,quota:r.quota,localDailyLimit:limit()};}catch(e){return {configured:true,status:'UNAVAILABLE',reason:e instanceof Error?e.message:'SportsAPIPro unavailable.'};}}
export async function inspectSportsApiPro(sport:SportsApiProSport,action:'status'|'schedule'|'match',date?:string,matchId?:number,section?:string){if(action==='status')return {access:await sportsApiProAccess(),budget:await sportsApiProBudget()};const path=action==='schedule'?`/${sport}/schedule/${date}`:`/${sport}/match/${matchId}${section?'/'+section:''}`;return {...await cached(path),budget:await sportsApiProBudget()};}

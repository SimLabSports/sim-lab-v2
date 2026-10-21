import 'server-only';
import {createHash} from 'node:crypto';
import {unstable_cache} from 'next/cache';
import {z} from 'zod';
import {database} from '../server/database';
import {providerFailed,providerSucceeded} from '../server/provider-http';
import {participantKey,sameStart} from '../event-identity';
import type {MarketEvent} from '../markets';
import type {ResearchInput} from '../research-types';

const sports:Record<string,string>={americanfootball_nfl:'NFL',americanfootball_ncaaf:'NCAAF',basketball_nba:'NBA',basketball_wnba:'WNBA',basketball_ncaab:'NCAAB',baseball_mlb:'MLB',icehockey_nhl:'NHL',mma_mixed_martial_arts:'UFC',golf_pga_championship_winner:'GOLF'};
export const bettingProsSport=(key:string)=>sports[key]??(key.startsWith('soccer_')?'SOCCER':key.startsWith('golf_')?'GOLF':null);
const metadata=z.object({tier:z.string(),page_limit:z.number().int().positive()});
const envelope=z.object({consumer_api:metadata.optional(),_pagination:z.object({page:z.number(),total_pages:z.number(),total_items:z.number(),limit:z.number()}).optional()}).passthrough();
const person=z.object({id:z.union([z.string(),z.number()]).nullable(),name:z.string().nullable(),team:z.object({city:z.string().optional(),name:z.string().optional(),team_pace_efficiency:z.object({season:z.number(),pace:z.number(),offensive_efficiency:z.number(),defensive_efficiency:z.number(),adj_offensive_efficiency:z.number(),adj_defensive_efficiency:z.number()}).nullable().optional()}).optional()});
const slot=z.object({slot:z.number().int(),participant:person});
const eventSchema=z.object({id:z.number(),sport:z.string(),scheduled:z.string(),season:z.union([z.number(),z.string()]),status:z.string(),home:z.string().nullable(),visitor:z.string().nullable(),participants:z.array(person),lineups:z.object({home_lineup:z.array(slot).nullable().optional(),visitor_lineup:z.array(slot).nullable().optional(),home_lineup_type:z.string().nullable().optional(),visitor_lineup_type:z.string().nullable().optional()}).nullable().optional()});
const eventsSchema=envelope.extend({events:z.array(eventSchema)});
const base='https://api.bettingpros.com/v3';
const budgetLimit=()=>Math.min(90,Math.max(1,Number(process.env.BETTINGPROS_DAILY_LIMIT)||90));
export async function bettingProsBudgetStatus(){const r=await database().query<{used:number}>("SELECT count(*)::int AS used FROM intelligence_audit WHERE action='bettingpros_request' AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'");const now=new Date();return {used:r.rows[0].used,limit:budgetLimit(),resetsAt:new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1)).toISOString()};}


// Shared UTC-day budget survives serverless workers. A cache hit never spends allowance.
async function admit(path:string){
 const client=await database().connect();
 try{await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtext('simlab-bettingpros-budget'))");
  const count=await client.query<{used:number}>("SELECT count(*)::int AS used FROM intelligence_audit WHERE action='bettingpros_request' AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'");
  const limit=budgetLimit();
  if(count.rows[0].used>=limit)throw Error('BettingPros daily request budget reached; retry after midnight UTC.');
  await client.query("INSERT INTO intelligence_audit(action,record_id) VALUES('bettingpros_request',$1)",[createHash('sha256').update(path).digest('hex')]);await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
async function load(path:string){
 if(!process.env.BETTINGPROS_API_KEY)throw Error('BETTINGPROS_API_KEY is not configured.');
 await admit(path);
 try{const response=await fetch(base+path,{headers:{'x-api-key':process.env.BETTINGPROS_API_KEY},cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error(response.status===403?'BettingPros rejected this key (HTTP 403).':response.status===429?'BettingPros rate or daily allowance reached (HTTP 429).':`BettingPros returned HTTP ${response.status}; no replacement data used.`);
  const data=envelope.parse(await response.json());providerSucceeded('BettingPros');return {data,observedAt:new Date().toISOString(),sourceUrl:base+path};
 }catch(error){const reason=error instanceof Error&&error.message.startsWith('BettingPros ')?error.message:'BettingPros did not return a valid response before the deadline.';providerFailed('BettingPros',reason);throw Error(reason);}
}
const cachedData=unstable_cache(load,['bettingpros-data-v1'],{revalidate:600});
const cachedMetadata=unstable_cache(load,['bettingpros-metadata-v1'],{revalidate:3600});
const request=(path:string)=>path.startsWith('/books?')||path.startsWith('/markets?')?cachedMetadata(path):cachedData(path);

export async function bettingProsAccess(){
 if(!process.env.BETTINGPROS_API_KEY)return {configured:false,status:'NOT_CONFIGURED',reason:'BETTINGPROS_API_KEY is absent.'};
 try{const result=await request('/books?location=MD');const books=z.array(z.object({id:z.number(),name:z.string()})).parse(result.data.books);return {configured:true,status:'VERIFIED',membership:result.data.consumer_api??null,checkedAt:result.observedAt,books:books.length,fanaticsAvailable:books.some(b=>/fanatics/i.test(b.name)),dailyRequestBudget:budgetLimit()};}
 catch(error){return {configured:true,status:'UNAVAILABLE',reason:error instanceof Error?error.message:'BettingPros access unavailable.'};}
}

async function events(sport:string,date:string,page=1){
 const end=new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);
 const result=await request(`/events?${new URLSearchParams({sport,start:date,end,limit:'50',page:String(page),lineups:'true'})}`);
 return {...result,data:eventsSchema.parse(result.data)};
}
const fullName=(p:z.infer<typeof person>,name:string)=>[p.name,p.team?.name,p.team?.city&&p.name?`${p.team.city} ${p.name}`:null,p.team?.city&&p.team.name?`${p.team.city} ${p.team.name}`:null].some(value=>value&&participantKey(value)===participantKey(name));
const utc=(date:string)=>/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(date)?date.replace(' ','T')+'Z':date;

export async function enrichBettingPros(event:MarketEvent,input:ResearchInput):Promise<ResearchInput>{
 const sport=bettingProsSport(event.sport_key);if(!process.env.BETTINGPROS_API_KEY||!sport||!input.pregame||!event.home_team||!event.away_team)return input;
 const result:ResearchInput={...input,evidence:[...input.evidence],gaps:[...input.gaps],risks:[...input.risks]};
 try{
  const first=await events(sport,event.commence_time.slice(0,10));const pages=[first];
  // Follow the documented capped page size; bounded traversal never silently claims full coverage.
  const total=first.data._pagination?.total_pages??1;
  for(let page=2;page<=Math.min(total,5);page++)pages.push(await events(sport,event.commence_time.slice(0,10),page));
  if(total>5){result.gaps.push('BettingPros event window exceeded the five-page scan bound; event enrichment withheld.');return result;}
  const exact=pages.flatMap(page=>page.data.events.filter(e=>e.sport===sport&&sameStart(utc(e.scheduled),event.commence_time)&&e.participants.filter(p=>String(p.id)===e.home&&fullName(p,input.home)).length===1&&e.participants.filter(p=>String(p.id)===e.visitor&&fullName(p,input.away)).length===1).map(e=>({e,page})));
  if(exact.length!==1){result.gaps.push('BettingPros could not uniquely match both participants, sport and scheduled start; its data was not assigned to this matchup.');return result;}
  const {e,page}=exact[0];
  const add=(entity:string,metric:string,value:string|number,period:string)=>{const id=`bp${result.evidence.length+1}`;result.evidence.push({id,entity,metric,value,period,sourceUrl:page.sourceUrl,observedAt:page.observedAt});return id;};
  if(!['scheduled','not_started','created'].includes(e.status)||Date.now()>=Date.parse(utc(e.scheduled))){result.pregame=false;result.phase='SUSPENDED';result.risks.push('BettingPros does not confirm a scheduled pregame state; approval withheld.');return result;}
  add('event','BettingPros verified schedule',`${e.id}: ${e.status}; ${utc(e.scheduled)}`,'current provider event state');
  result.provider+=' + BettingPros';result.identity?.providerBindings.push({provider:'BettingPros',eventId:String(e.id)});
  for(const [side,name]of [['home',input.home],['visitor',input.away]] as const){
   const p=e.participants.find(p=>String(p.id)===e[side]);const metrics=p?.team?.team_pace_efficiency;
   if(sport==='NCAAB'&&metrics){for(const metric of ['pace','offensive_efficiency','defensive_efficiency','adj_offensive_efficiency','adj_defensive_efficiency'] as const)add(name,`BettingPros NCAAB ${metric}`,metrics[metric],`provider season ${metrics.season}; event season ${e.season}; sample size not supplied`);}
  }
  if(sport==='MLB'&&e.lineups){const ids:string[]=[];let confirmed=true;
   for(const [side,name]of [['home',input.home],['visitor',input.away]] as const){const list=e.lineups[`${side}_lineup`]??[];const type=e.lineups[`${side}_lineup_type`];const valid=type==='confirmed'&&list.length===9&&new Set(list.map(p=>p.slot)).size===9&&list.every(p=>p.slot>=1&&p.slot<=9&&p.participant.name&&p.participant.id!==null)&&new Set(list.map(p=>p.participant.id)).size===9;
    confirmed=confirmed&&valid;if(list.length)ids.push(add(name,`BettingPros ${type==='confirmed'?'confirmed':'projected'} batting order`,list.map(p=>`${p.slot}: ${p.participant.name??'unnamed'}`).join('; '),'exact event; projected orders do not clear lineup approval'));
   }
   if(confirmed&&ids.length===2&&result.verifications?.some(v=>v.kind==='lineup'&&v.status==='BLOCKED'))result.risks.push('BettingPros confirmed order conflicts with another blocked lineup verification; no clearance override.');
   else if(confirmed&&ids.length===2){result.lineupConfirmed=true;result.verifications=[...(result.verifications??[]).filter(v=>v.kind!=='lineup'),{kind:'lineup',status:'CLEAR',evidenceIds:ids,observedAt:page.observedAt}];}
  }
  result.gaps.push('BettingPros projections and aggregate pick counts are external opinions, not GCM training inputs or individually verified expert votes. NBA final injuries, starting five and workload are not cleared by this feed.');
 }catch(error){result.gaps.push(error instanceof z.ZodError?'BettingPros returned an event-schema mismatch; unsupported fields were not used.':error instanceof Error?error.message:'BettingPros enrichment unavailable.');}
 return result;
}

// Authenticated access inspection; never returns the key or synthesizes analyst identities.
export async function inspectBettingPros(sport:string,date:string){
 const access=await bettingProsAccess();if(access.status!=='VERIFIED')return {access};
 const [eventPage,marketPage]=await Promise.all([events(sport,date),request(`/markets?${new URLSearchParams({sport,market_category:'game-odds',market_period:'game'})}`)]);
 const markets=z.array(z.object({id:z.number(),slug:z.string(),period:z.string(),active:z.boolean().optional()})).parse(marketPage.data.markets);
 const moneyline=markets.filter(m=>m.slug==='moneyline'&&m.period==='game'&&m.active!==false);
 const sample=eventPage.data.events.find(e=>['scheduled','not_started','created'].includes(e.status)&&Date.parse(utc(e.scheduled))>Date.now());let offerSummary:unknown=null;
 if(sample&&moneyline.length===1){const r=await request(`/offers?${new URLSearchParams({sport,event_id:String(sample.id),market_id:String(moneyline[0].id),picks:'true',location:'MD',limit:'1'})}`);const offers=z.array(z.object({selections:z.array(z.object({participant:z.string().nullable().optional(),selection:z.string().nullable().optional(),picks:z.object({expert:z.number().optional(),quick:z.number().optional(),custom:z.number().optional(),sync:z.number().optional()}).passthrough().optional()}))})).parse(r.data.offers);offerSummary={observedAt:r.observedAt,sourceUrl:r.sourceUrl,offers:offers.length,selections:offers.flatMap(o=>o.selections),qualifyingIndependentSources:0,reason:'Aggregated counts do not supply individual analyst identities, original pick URLs or publication timestamps.'};}
 return {access,budget:await bettingProsBudgetStatus(),sport,observedAt:eventPage.observedAt,pagination:eventPage.data._pagination,events:eventPage.data.events.slice(0,3).map(e=>({id:e.id,status:e.status,scheduled:utc(e.scheduled),participants:e.participants.map(p=>({id:p.id,name:p.name,city:p.team?.city})),lineups:e.lineups??null})),moneylineMarkets:moneyline,offerSummary};
}

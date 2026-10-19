import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { database,databaseFailure } from '../server/database';
import type { ExpertPick, ExpertConsensus } from '../research-types';
import { getMarket, type MarketEvent, type MarketKey } from '../markets';
const sourceUrl=z.string().url().refine(url=>new URL(url).protocol==='https:','Source URL must use HTTPS.');
export const expertImportSchema=z.object({eventId:z.string().min(1).max(100),sport:z.string().regex(/^[a-z0-9_]+$/),market:z.enum(['h2h','spreads','totals','outrights']),line:z.number().nullable(),selection:z.string().min(1).max(200),analystId:z.string().min(1).max(150),analystName:z.string().min(1).max(200),sourceName:z.string().min(1).max(200),organizationId:z.string().min(1).max(150),originId:z.string().min(1).max(150),sourceUrl,publishedAt:z.string().datetime(),expiresAt:z.string().datetime(),licenseBasis:z.string().min(10).max(1000),originalPick:z.string().min(3).max(2000),reviewed:z.literal(true),price:z.number().refine(p=>Math.abs(p)>=100).nullable(),bookmaker:z.string().nullable()}).strict();
export interface ExpertPickProvider {getPicks(event:MarketEvent,market:MarketKey):Promise<ExpertPick[]>;}
export class ManualCuratedProvider implements ExpertPickProvider {
 async getPicks(event:MarketEvent,market:MarketKey){
  const rows=await database().query<{record:ExpertPick}>('SELECT record FROM expert_picks WHERE event_id=$1 AND sport=$2 AND market=$3 AND retracted=false',[event.id,event.sport_key,market]);
  return rows.rows.map(row=>row.record);
 }
}
export async function importExpertPick(data:z.infer<typeof expertImportSchema>,event:MarketEvent){
 const now=Date.now();const start=Date.parse(event.commence_time);const published=Date.parse(data.publishedAt);
 if(event.id!==data.eventId||event.sport_key!==data.sport)throw new Error('Provider event does not match the imported pick.');
 if(now>=start||published>=start||published>now||now>=Date.parse(data.expiresAt))throw new Error('Only current, pregame, previously published picks can be imported.');
 if(Date.parse(data.expiresAt)>start)throw new Error('Expert pick expiry must be no later than event start.');
 const market=getMarket(event,data.market);if(!market?.outcomes.some(outcome=>outcome.name===data.selection&&(outcome.point??null)===data.line))throw new Error('Selection and line must match a current Fanatics outcome exactly.');
 if(['spreads','totals'].includes(data.market)&&data.line===null)throw new Error('Spread and total picks require an exact line.');
 if(data.price!==null&&data.bookmaker!=='fanatics')throw new Error('A price-specific Fanatics pick must identify Fanatics as its bookmaker.');
 const pick:ExpertPick={...data,id:randomUUID(),startTime:event.commence_time,importedAt:new Date().toISOString(),retracted:false};
 const client=await database().connect();
 try{await client.query('BEGIN');await client.query('INSERT INTO expert_picks(id,event_id,sport,market,origin_id,published_at,expires_at,record) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[pick.id,pick.eventId,pick.sport,pick.market,pick.originId,pick.publishedAt,pick.expiresAt,JSON.stringify(pick)]);await client.query('INSERT INTO intelligence_audit(action,record_id) VALUES($1,$2)',['expert_pick_imported',pick.id]);await client.query('COMMIT');}
 catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 return pick;
}
export async function expertConsensus(event:MarketEvent,key:MarketKey,line:number|null):Promise<ExpertConsensus>{
 const empty:ExpertConsensus={status:'INSUFFICIENT_DATA',selection:null,supporters:0,total:0,share:null,sources:[],excluded:0,reason:'At least three verified independent sources for this exact market and line are required.'};
 let records:ExpertPick[];try{records=await new ManualCuratedProvider().getPicks(event,key);}catch(error){return {...empty,status:'UNAVAILABLE',reason:`Expert storage unavailable: ${databaseFailure(error).message}`};}
 const now=Date.now();const start=Date.parse(event.commence_time);const maxAge=Math.max(1,Math.min(168,Number(process.env.EXPERT_MAX_AGE_HOURS)||48))*3600000;
 const market=getMarket(event,key);const targetLine=key==='spreads'&&line!==null?Math.abs(line):line;
 const eligible=records.filter(p=>p.reviewed&&!p.retracted&&p.eventId===event.id&&p.sport===event.sport_key&&p.market===key&&Date.parse(p.startTime)===start&&Date.parse(p.publishedAt)<start&&Date.parse(p.publishedAt)<=now&&now-Date.parse(p.publishedAt)<maxAge&&Date.parse(p.expiresAt)>now&&now<start&&!!p.licenseBasis&&(p.bookmaker===null||p.bookmaker==='fanatics')&&market?.outcomes.some(outcome=>outcome.name===p.selection&&(outcome.point??null)===p.line&&(p.price===null||outcome.price===p.price))&&(key==='spreads'?Math.abs(p.line??NaN)===targetLine:p.line===line));
 // One vote per independent origin, organization and analyst. Newer reviewed opinions supersede older ones.
 const origins=new Set<string>(),organizations=new Set<string>(),analysts=new Set<string>();const unique:ExpertPick[]=[];
 for(const pick of eligible.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt))){const normalize=(s:string)=>s.trim().toLowerCase();const origin=normalize(pick.originId),organization=normalize(pick.organizationId),analyst=normalize(pick.analystId);if(origins.has(origin)||organizations.has(organization)||analysts.has(analyst))continue;origins.add(origin);organizations.add(organization);analysts.add(analyst);unique.push(pick);}
 const votes=new Map<string,number>();for(const pick of unique)votes.set(pick.selection,(votes.get(pick.selection)??0)+1);
 const sorted=[...votes].sort((a,b)=>b[1]-a[1]);const supporters=sorted[0]?.[1]??0;
 if(unique.length<3)return {...empty,sources:unique,total:unique.length,supporters,excluded:records.length-unique.length,reason:`${unique.length} verified independent sources qualify for this exact event, market and line; at least three are required. ${records.length-unique.length} stored picks were excluded as duplicate, expired, unverified or non-comparable. No automated licensed expert feed is connected.`};
 const majority=supporters>unique.length/2;return {status:majority?'QUALIFIED':'MIXED',selection:majority?sorted[0][0]:null,supporters,total:unique.length,share:supporters/unique.length*100,sources:unique,excluded:records.length-unique.length,reason:majority?'Verified independent source selection share; not an outcome probability.':'No majority among the verified independent sources.'};
}

import 'server-only';
import {createHash} from 'node:crypto';
import {database} from '../server/database';
export type ScanQuota={scope:'GLOBAL_HOURLY'|'GLOBAL_DAILY'|'VISITOR_HOURLY'|'MATCHUP_BUSY';used:number;limit:number;resetsAt:string;retryAfterSeconds:number};
export class ScanAdmissionError extends Error{constructor(public quota:ScanQuota){super(quota.scope==='MATCHUP_BUSY'?'This matchup is already being evaluated. Read its saved result shortly.':`${quota.scope.toLowerCase().replaceAll('_',' ')} research limit reached (${quota.used}/${quota.limit}). Retry after ${quota.resetsAt}.`);}}
const cap=(name:string,fallback:number)=>Math.max(1,Math.min(1000,Number(process.env[name])||fallback));
const visitorHash=(visitor:string)=>createHash('sha256').update(`${process.env.SIMLAB_ADMIN_TOKEN||'simlab-scan'}:${visitor}`).digest('hex');
type Counts={hour:number;day:number;visitor:number;hour_first:Date|string|null;day_first:Date|string|null;visitor_first:Date|string|null};
const usageSql=`SELECT count(*) FILTER(WHERE action='gcm_scan_started' AND created_at>now()-interval '1 hour')::int AS hour,count(*) FILTER(WHERE action='gcm_scan_started')::int AS day,count(*) FILTER(WHERE action='gcm_scan_visitor' AND record_id=$1 AND created_at>now()-interval '1 hour')::int AS visitor,min(created_at) FILTER(WHERE action='gcm_scan_started' AND created_at>now()-interval '1 hour') AS hour_first,min(created_at) FILTER(WHERE action='gcm_scan_started') AS day_first,min(created_at) FILTER(WHERE action='gcm_scan_visitor' AND record_id=$1 AND created_at>now()-interval '1 hour') AS visitor_first FROM intelligence_audit WHERE created_at>now()-interval '1 day' AND action IN('gcm_scan_started','gcm_scan_visitor')`;
function windows(c:Counts){const now=Date.now();const make=(scope:ScanQuota['scope'],used:number,limit:number,first:Date|string|null,duration:number):ScanQuota=>{const reset=first?new Date(first).getTime()+duration:now;return {scope,used,limit,resetsAt:new Date(reset).toISOString(),retryAfterSeconds:Math.max(0,Math.ceil((reset-now)/1000))};};return [make('GLOBAL_HOURLY',c.hour,cap('GCM_SCAN_HOURLY_LIMIT',20),c.hour_first,3600000),make('GLOBAL_DAILY',c.day,cap('GCM_SCAN_DAILY_LIMIT',50),c.day_first,86400000),make('VISITOR_HOURLY',c.visitor,cap('GCM_SCAN_VISITOR_HOURLY_LIMIT',5),c.visitor_first,3600000)];}
export async function scanBudgetStatus(visitor:string){const r=await database().query<Counts>(usageSql,[visitorHash(visitor)]);return {windows:windows(r.rows[0]),counting:'Only admitted new OpenAI attempts consume quota. Reads, polling and admission rejections do not.',rollingWindows:true};}

// Database admission is shared across serverless workers. No raw visitor addresses are stored.
export async function admitScan(identity:string,visitor:string){
 const client=await database().connect();
 const job=createHash('sha256').update(identity).digest('hex');
 const visitorId=visitorHash(visitor);
 try{
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('simlab-gcm-scan-budget'))");
  const recent=await client.query<{created_at:Date}>("SELECT created_at FROM intelligence_audit WHERE action='gcm_scan_started' AND record_id=$1 AND created_at>now()-interval '90 seconds' ORDER BY created_at DESC LIMIT 1",[job]);
  if(recent.rowCount)throw new ScanAdmissionError({scope:'MATCHUP_BUSY',used:1,limit:1,resetsAt:new Date(new Date(recent.rows[0].created_at).getTime()+90000).toISOString(),retryAfterSeconds:Math.max(1,Math.ceil((new Date(recent.rows[0].created_at).getTime()+90000-Date.now())/1000))});
  const detailed=await client.query<Counts>(usageSql,[visitorId]);
  const exceeded=windows(detailed.rows[0]).filter(w=>w.used>=w.limit).sort((a,b)=>b.retryAfterSeconds-a.retryAfterSeconds)[0];if(exceeded)throw new ScanAdmissionError(exceeded);
  await client.query("INSERT INTO intelligence_audit(action,record_id) VALUES('gcm_scan_started',$1),('gcm_scan_visitor',$2)",[job,visitorId]);
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

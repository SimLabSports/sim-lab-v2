import 'server-only';
import {createHash} from 'node:crypto';
import {database} from '../server/database';

// Database admission is shared across serverless workers. No raw visitor addresses are stored.
export async function admitScan(identity:string,visitor:string){
 const client=await database().connect();
 const job=createHash('sha256').update(identity).digest('hex');
 const visitorId=createHash('sha256').update(`${process.env.SIMLAB_ADMIN_TOKEN||'simlab-scan'}:${visitor}`).digest('hex');
 const limit=(name:string,fallback:number)=>Math.max(1,Math.min(1000,Number(process.env[name])||fallback));
 try{
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('simlab-gcm-scan-budget'))");
  const recent=await client.query("SELECT 1 FROM intelligence_audit WHERE action='gcm_scan_started' AND record_id=$1 AND created_at>now()-interval '90 seconds' LIMIT 1",[job]);
  if(recent.rowCount)throw new Error('This matchup is already being evaluated. Retry shortly to read the saved result.');
  const usage=await client.query<{hour:number;day:number;visitor:number}>(`SELECT
   count(*) FILTER (WHERE action='gcm_scan_started' AND created_at>now()-interval '1 hour')::int AS hour,
   count(*) FILTER (WHERE action='gcm_scan_started')::int AS day,
   count(*) FILTER (WHERE action='gcm_scan_visitor' AND record_id=$1 AND created_at>now()-interval '1 hour')::int AS visitor
   FROM intelligence_audit WHERE created_at>now()-interval '1 day' AND action IN ('gcm_scan_started','gcm_scan_visitor')`,[visitorId]);
  const counts=usage.rows[0];
  if(counts.hour>=limit('GCM_SCAN_HOURLY_LIMIT',20)||counts.day>=limit('GCM_SCAN_DAILY_LIMIT',50)||counts.visitor>=limit('GCM_SCAN_VISITOR_HOURLY_LIMIT',5))throw new Error('The research scan limit has been reached. Cached research remains available; try again later.');
  await client.query("INSERT INTO intelligence_audit(action,record_id) VALUES('gcm_scan_started',$1),('gcm_scan_visitor',$2)",[job,visitorId]);
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

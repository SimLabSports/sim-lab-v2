import 'server-only';
import {lookup} from 'node:dns/promises';
import {database,databaseFailure} from './database';
import {inspectDatabaseConfiguration} from './database-configuration';

export async function databaseDiagnostics(){
 const inspected=inspectDatabaseConfiguration();
 const result={configured:inspected.details.present,connected:false,tablesReady:false,error:null as string|null,errorCode:null as string|null,configuration:inspected.details,dns:{status:'NOT_CHECKED',ipv4Available:false,ipv6Available:false},authentication:'NOT_CHECKED',tables:{} as Record<string,{accessible:boolean;errorCode:string|null}>,checkedAt:new Date().toISOString()};
 const fail=(error:unknown)=>{const reason=databaseFailure(error);result.error=reason.message;result.errorCode=reason.code;return result;};
 if(inspected.issue)return fail(inspected.issue);
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const addresses=await Promise.race([lookup(inspected.hostname!,{all:true}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('DNS timeout'),{code:'DNS_TIMEOUT'})),3000);})]);
  result.dns={status:'RESOLVED',ipv4Available:addresses.some(a=>a.family===4),ipv6Available:addresses.some(a=>a.family===6)};
 }catch(error){result.dns.status='FAILED';return fail(error);}finally{if(timer)clearTimeout(timer);}
 try{
  await database().query('SELECT 1 AS connection_verified');
  result.connected=true;result.authentication='SUCCEEDED';
 }catch(error){result.authentication='FAILED';return fail(error);}
 // Fixed identifiers, actual SELECT permission and expected columns, not just to_regclass.
 const tables=[['expert_picks','id,event_id,sport,market,record'],['gcm_evaluations','id,event_id,sport,market,record'],['intelligence_audit','id,action,record_id,created_at']];
 const reads=await Promise.allSettled(tables.map(([name,columns])=>database().query(`SELECT ${columns} FROM public.${name} LIMIT 0`)));
 for(const [index,read]of reads.entries()){
  const name=tables[index][0];
  if(read.status==='fulfilled')result.tables[name]={accessible:true,errorCode:null};
  else{const reason=databaseFailure(read.reason);result.tables[name]={accessible:false,errorCode:reason.code};if(!result.error){result.error=reason.message;result.errorCode=reason.code;}}
 }
 result.tablesReady=Object.values(result.tables).every(table=>table.accessible);
 return result;
}

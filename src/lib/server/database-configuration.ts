import 'server-only';

export class DatabaseConfigurationError extends Error {
 constructor(public code:string,message:string){super(message);}
}

// Never return the URI, credentials, project reference or actual hostname to clients.
export function inspectDatabaseConfiguration(){
 const raw=process.env.DATABASE_URL;
 const details={present:!!raw,uriValid:false,poolerHostnameMatches:false,connectionMode:'UNKNOWN',transactionPortMatches:false,pooledUsernameMatches:false,databaseNameMatches:false,expectedProjectConfigured:!!process.env.SUPABASE_EXPECTED_PROJECT_REF,projectMatch:'UNVERIFIED'};
 if(!raw)return {details,hostname:null,issue:new DatabaseConfigurationError('DATABASE_URL_MISSING','DATABASE_URL is absent in this deployment environment.')};
 try{
  if(raw!==raw.trim()||/[\r\n]/.test(raw))throw new Error();
  const parsed=new URL(raw);
  decodeURIComponent(parsed.password); // Reject malformed percent escapes before pg parses credentials.
  if(!['postgres:','postgresql:'].includes(parsed.protocol)||!parsed.hostname||!parsed.username||!parsed.password||parsed.hash||['[YOUR-PASSWORD]','[PROJECT-REF]','[POOLER-HOST]'].some(value=>raw.includes(value)))throw new Error();
  const hostname=parsed.searchParams.get('host')||parsed.hostname;
  const username=parsed.searchParams.get('user')||decodeURIComponent(parsed.username);
  const port=parsed.searchParams.get('port')||parsed.port||'5432';
  if(!/^\d+$/.test(port)||Number(port)<1||Number(port)>65535)throw new Error();
  const shared=/^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(hostname);
  const direct=hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/);
  const pooledUser=username.match(/^[a-zA-Z0-9_-]+\.([a-z0-9]+)$/);
  details.uriValid=true;
  details.poolerHostnameMatches=shared;
  details.transactionPortMatches=port==='6543';
  details.pooledUsernameMatches=!!pooledUser;
  details.databaseNameMatches=decodeURIComponent(parsed.pathname)==='/postgres';
  details.connectionMode=shared?(port==='6543'?'SHARED_TRANSACTION_POOLER':port==='5432'?'SHARED_SESSION_POOLER':'SHARED_POOLER_OTHER_PORT'):direct?(port==='6543'?'DEDICATED_TRANSACTION_POOLER':'DIRECT'):'OTHER';
  const expected=process.env.SUPABASE_EXPECTED_PROJECT_REF;
  if(expected){
   const actual=shared?pooledUser?.[1]:direct?.[1];
   details.projectMatch=actual===expected?'MATCH':'MISMATCH';
   if(details.projectMatch==='MISMATCH')return {details,hostname,issue:new DatabaseConfigurationError('PROJECT_MISMATCH','DATABASE_URL does not match SUPABASE_EXPECTED_PROJECT_REF. Use the connection URI from the intended Sim Lab 2.0 project; no database operations were attempted.')};
  }
  return {details,hostname,issue:null};
 }catch{return {details,hostname:null,issue:new DatabaseConfigurationError('DATABASE_URL_INVALID','DATABASE_URL must be one PostgreSQL URI, without enclosing quotes, line breaks, literal placeholders or a URL fragment. Percent-encode reserved password characters; use the exact Supabase Connect URI.')};}
}

import 'server-only';
import { Pool } from 'pg';
const root=globalThis as typeof globalThis & {simlabDatabase?:Pool};
export function databaseFailure(error:unknown):{code:string;message:string}{
 const item=error as {code?:string;message?:string;errors?:{code?:string}[]};
 const code=item?.code||item?.errors?.[0]?.code;
 const reasons:Record<string,string>={
  ENOTFOUND:'The database hostname cannot be resolved. Copy the PostgreSQL connection URI from Supabase Connect; check the hostname.',
  ENETUNREACH:'The database network is unreachable. Use a Supabase connection endpoint reachable from Vercel, such as the IPv4 session pooler.',
  ECONNREFUSED:'The database host refused the connection. Verify the Supabase database is active and the connection port is correct.',
  ETIMEDOUT:'Database connection timed out. Check database availability, network restrictions and the Supabase connection endpoint.',
  '28P01':'PostgreSQL rejected the database credentials. Correct the username/password in DATABASE_URL; URL-encode special password characters.',
  '28000':'PostgreSQL rejected authentication. Verify the server connection role and Supabase connection settings.',
  '3D000':'The PostgreSQL database name does not exist. Correct the database segment of DATABASE_URL.',
  '42501':'The database role lacks permission to inspect the intelligence tables. Use the intended private server database role.',
  SELF_SIGNED_CERT_IN_CHAIN:'Database TLS certificate validation failed. Configure the provider-supported CA/TLS connection settings; do not disable certificate validation.',
  DEPTH_ZERO_SELF_SIGNED_CERT:'Database TLS certificate validation failed. Configure the provider-supported CA/TLS connection settings.',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE:'The database TLS certificate chain could not be verified. Configure the provider-supported CA chain.',
  ERR_INVALID_URL:'DATABASE_URL is not a valid PostgreSQL connection URI. Use the Supabase PostgreSQL connection string, with special password characters URL-encoded.',
 };
 if(code&&reasons[code])return {code,message:reasons[code]};
 if(/timeout/i.test(item?.message||''))return {code:'CONNECTION_TIMEOUT',message:reasons.ETIMEDOUT};
 return {code:'CONNECTION_FAILED',message:'Database connection failed. Verify DATABASE_URL is a PostgreSQL URI and that the Supabase database is active and reachable from Vercel.'};
}
export function database(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is not configured. Persistent research and expert storage is unavailable.');
 return root.simlabDatabase??=new Pool({connectionString:process.env.DATABASE_URL,max:4,connectionTimeoutMillis:8000,idleTimeoutMillis:30000});
}

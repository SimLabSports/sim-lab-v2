import 'server-only';
import { Pool } from 'pg';
const root=globalThis as typeof globalThis & {simlabDatabase?:Pool};
export function database(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is not configured. Persistent research and expert storage is unavailable.');
 return root.simlabDatabase??=new Pool({connectionString:process.env.DATABASE_URL,max:4,connectionTimeoutMillis:8000,idleTimeoutMillis:30000});
}

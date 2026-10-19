import {cookies} from 'next/headers';
import {AdminIntelligence} from '@/components/admin-intelligence';
import {adminCookie,sessionValid} from '@/lib/server/admin-auth';
export const dynamic='force-dynamic';
export const metadata={title:'Sim Lab — Administrator',robots:{index:false,follow:false}};
export default async function Page(){const jar=await cookies();return <AdminIntelligence authenticated={sessionValid(jar.get(adminCookie)?.value)}/>;}

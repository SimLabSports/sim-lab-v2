import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {sameOrigin,authorized} from '@/lib/server/admin-auth';
import {getLiveEvent} from '@/lib/market-server';
import {intelligence} from '@/lib/server/intelligence';
// Allow bounded statistical adapters plus the existing 45-second AI deadline to finish.
// This changes execution time only; the shared research quotas still govern every scan.
export const runtime='nodejs';export const maxDuration=120;
export async function POST(request:NextRequest){
 if(!sameOrigin(request))return NextResponse.json({error:'Same-origin request required.'},{status:403});
 try{const body=z.object({eventId:z.string().regex(/^[a-zA-Z0-9_-]+$/),sport:z.string().regex(/^[a-z0-9_]+$/),market:z.enum(['h2h','spreads','totals','outrights'])}).strict().parse(await request.json());const {event}=await getLiveEvent(body.eventId,body.sport);const visitor=authorized(request)?'authenticated-administrator':request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'local';const value=await intelligence(event,body.market,true,visitor);const quota=value.gcm?.scanQuota;return NextResponse.json(value,{status:quota?(quota.scope==='MATCHUP_BUSY'?202:429):200,headers:{'Cache-Control':'no-store',...(quota?{'Retry-After':String(quota.retryAfterSeconds)}:{})}});}catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:'A valid event, sport and market are required.'},{status:400});return NextResponse.json({error:process.env.ODDS_API_KEY?'The live research request failed. Verify provider access, event identity, and persistent storage.':'Live market access is unavailable. Configure ODDS_API_KEY in the deployment environment and redeploy.'},{status:503});}
}

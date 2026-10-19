import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {sameOrigin} from '@/lib/server/admin-auth';
import {getLiveEvent} from '@/lib/market-server';
import {intelligence} from '@/lib/server/intelligence';
export const runtime='nodejs';export const maxDuration=60;
export async function POST(request:NextRequest){
 if(!sameOrigin(request))return NextResponse.json({error:'Same-origin request required.'},{status:403});
 try{const body=z.object({eventId:z.string().regex(/^[a-zA-Z0-9_-]+$/),sport:z.string().regex(/^[a-z0-9_]+$/),market:z.enum(['h2h','spreads','totals','outrights'])}).strict().parse(await request.json());const {event}=await getLiveEvent(body.eventId,body.sport);const visitor=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'local';return NextResponse.json(await intelligence(event,body.market,true,visitor),{headers:{'Cache-Control':'no-store'}});}catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:'A valid event, sport and market are required.'},{status:400});return NextResponse.json({error:process.env.ODDS_API_KEY?'The live research request failed. Verify provider access, event identity, and persistent storage.':'Live market access is unavailable. Configure ODDS_API_KEY in the deployment environment and redeploy.'},{status:503});}
}

import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {authorized,sameOrigin} from '@/lib/server/admin-auth';
import {getLiveEvent} from '@/lib/market-server';
import {intelligence} from '@/lib/server/intelligence';
export const runtime='nodejs';export const maxDuration=60;
export async function POST(request:NextRequest){
 if(!authorized(request))return NextResponse.json({error:'Administrator authentication is required to run billable research.'},{status:401});
 if(!sameOrigin(request))return NextResponse.json({error:'Same-origin request required.'},{status:403});
 try{const body=z.object({eventId:z.string().regex(/^[a-zA-Z0-9_-]+$/),sport:z.string().regex(/^[a-z0-9_]+$/),market:z.enum(['h2h','spreads','totals','outrights'])}).parse(await request.json());const {event}=await getLiveEvent(body.eventId,body.sport);return NextResponse.json(await intelligence(event,body.market,true),{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'The live research request failed. Verify provider access, event identity, and persistent storage.'},{status:503});}
}

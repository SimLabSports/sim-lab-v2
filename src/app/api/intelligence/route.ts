import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {getLiveEvent} from '@/lib/market-server';
import {intelligence} from '@/lib/server/intelligence';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const params=z.object({eventId:z.string().regex(/^[a-zA-Z0-9_-]+$/),sport:z.string().regex(/^[a-z0-9_]+$/),market:z.enum(['h2h','spreads','totals','outrights'])}).safeParse({eventId:request.nextUrl.searchParams.get('eventId'),sport:request.nextUrl.searchParams.get('sport'),market:request.nextUrl.searchParams.get('market')||'h2h'});
 if(!params.success)return NextResponse.json({error:'Valid eventId, sport and market are required.'},{status:400});
 try{const {event}=await getLiveEvent(params.data.eventId,params.data.sport);return NextResponse.json(await intelligence(event,params.data.market),{headers:{'Cache-Control':'no-store'}});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Live intelligence unavailable.'},{status:503});}
}

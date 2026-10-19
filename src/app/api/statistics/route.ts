import {NextRequest,NextResponse} from 'next/server';
import {getLiveEvent} from '@/lib/market-server';
import {getStatistics} from '@/lib/providers/statistics';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const eventId=request.nextUrl.searchParams.get('eventId')||'';const sport=request.nextUrl.searchParams.get('sport')||'';
 try{const {event}=await getLiveEvent(eventId,sport);return NextResponse.json(await getStatistics(event),{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({status:'INCOMPLETE',error:'A real current event and functioning market-provider connection are required.'},{status:503});}
}

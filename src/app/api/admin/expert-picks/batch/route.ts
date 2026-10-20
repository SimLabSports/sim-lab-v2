import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {authorized,sameOrigin} from '@/lib/server/admin-auth';
import {expertImportSchema,importExpertPick} from '@/lib/providers/experts';
import {getLiveEvent} from '@/lib/market-server';
export const runtime='nodejs';export const maxDuration=60;
// One source-normalized import endpoint for every sport. No votes are generated,
// scraped, synthesized from odds, or published without the existing admin review.
export async function POST(request:NextRequest){
 if(!authorized(request))return NextResponse.json({error:'Administrator authentication required.'},{status:401});
 if(!sameOrigin(request))return NextResponse.json({error:'Same-origin import required.'},{status:403});
 const text=await request.text();if(text.length>128000)return NextResponse.json({error:'Import exceeds 128 KB.'},{status:413});
 let value:unknown;try{value=JSON.parse(text);}catch{return NextResponse.json({error:'Valid JSON required.'},{status:400});}
 const parsed=z.object({picks:z.array(expertImportSchema).min(1).max(25)}).strict().safeParse(value);
 if(!parsed.success)return NextResponse.json({error:'Supply 1–25 real, reviewed, source-attributed picks.',issues:parsed.error.issues.map(i=>({field:i.path.join('.'),message:i.message}))},{status:400});
 const results=[];
 for(const [index,data]of parsed.data.picks.entries()){
  try{const {event}=await getLiveEvent(data.eventId,data.sport);const saved=await importExpertPick(data,event);results.push({index,eventId:data.eventId,sport:data.sport,imported:true,id:saved.id});}
  catch{results.push({index,eventId:data.eventId,sport:data.sport,imported:false,reason:'Import rejected: verify exact current event/selection/line, timestamps, source independence, duplicate records and storage access. No vote from this item was added.'});}
 }
 return NextResponse.json({imported:results.filter(r=>r.imported).length,rejected:results.filter(r=>!r.imported).length,results,atomic:false},{status:results.every(r=>r.imported)?200:207});
}

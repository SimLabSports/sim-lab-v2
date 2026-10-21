import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {authorized,sameOrigin} from '@/lib/server/admin-auth';
import {inspectBettingPros} from '@/lib/providers/bettingpros';
export const runtime='nodejs';export const maxDuration=60;
export async function POST(request:NextRequest){
 if(!authorized(request)||!sameOrigin(request))return NextResponse.json({error:'Administrator session and same-origin request required.'},{status:403});
 let body;try{body=z.object({sport:z.enum(['NBA','NFL','MLB','NHL','WNBA','NCAAF','NCAAB','SOCCER','UFC','GOLF']),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>Number.isFinite(Date.parse(s+'T00:00:00Z')))}).strict().parse(await request.json());}catch{return NextResponse.json({error:'A supported sport and ISO date are required.'},{status:400});}
 try{return NextResponse.json(await inspectBettingPros(body.sport,body.date),{headers:{'Cache-Control':'no-store'}});}
 catch(error){return NextResponse.json({error:error instanceof Error&&error.message.startsWith('BettingPros ')?error.message:'The BettingPros response did not match the documented schema; no unsupported feed was published.',...(error instanceof z.ZodError?{schemaIssues:error.issues.map(issue=>({path:issue.path,code:issue.code}))}:{})},{status:503});}
}

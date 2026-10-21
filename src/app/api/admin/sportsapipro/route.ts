import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {authorized,sameOrigin} from '@/lib/server/admin-auth';
import {inspectSportsApiPro,sportsApiProSlugs} from '@/lib/providers/sportsapipro';
export const runtime='nodejs';export const maxDuration=30;
export async function POST(request:NextRequest){
 if(!authorized(request)||!sameOrigin(request))return NextResponse.json({error:'Administrator session and same-origin request required.'},{status:403});
 const schema=z.object({sport:z.enum(sportsApiProSlugs),action:z.enum(['status','schedule','match']),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),matchId:z.number().int().positive().optional(),section:z.enum(['lineups','missing-players','pregame-form','statistics','player-statistics']).optional()}).strict();
 const body=schema.safeParse(await request.json().catch(()=>null));if(!body.success)return NextResponse.json({error:'Invalid supported sport, action, date or match identifier.'},{status:400});const b=body.data;
 if(b.action==='schedule'&&(!b.date||!Number.isFinite(Date.parse(b.date+'T00:00:00Z')))||b.action==='match'&&!b.matchId)return NextResponse.json({error:'Date or match ID is required for this action.'},{status:400});
 if(b.section==='missing-players'&&!['basketball','baseball','american-football','football'].includes(b.sport))return NextResponse.json({error:'Missing-player coverage is not documented for this sport.'},{status:400});
 try{return NextResponse.json(await inspectSportsApiPro(b.sport,b.action,b.date,b.matchId,b.section),{headers:{'Cache-Control':'no-store'}});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Provider inspection unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}

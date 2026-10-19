import {NextRequest,NextResponse} from 'next/server';
import {authorized,sameOrigin} from '@/lib/server/admin-auth';
import {expertImportSchema,importExpertPick} from '@/lib/providers/experts';
import {getLiveEvent} from '@/lib/market-server';
import {database} from '@/lib/server/database';
export const runtime='nodejs';
export async function POST(request:NextRequest){
 if(!authorized(request))return NextResponse.json({error:'Administrator authentication required.'},{status:401});
 if(!sameOrigin(request))return NextResponse.json({error:'Same-origin import required.'},{status:403});
 if(Number(request.headers.get('content-length')||0)>20000)return NextResponse.json({error:'Request too large.'},{status:413});
 try{const parsed=expertImportSchema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:'Invalid expert pick.',issues:parsed.error.issues.map(issue=>({field:issue.path.join('.'),message:issue.message}))},{status:400});const {event}=await getLiveEvent(parsed.data.eventId,parsed.data.sport);const pick=await importExpertPick(parsed.data,event);return NextResponse.json({id:pick.id,imported:true});}
 catch(error){return NextResponse.json({error:error instanceof Error&&!/password|connect|sql|relation|duplicate|ENOTFOUND|ECONN|database/i.test(error.message)?error.message:'Expert storage or import is unavailable. Verify database access, apply the migration, and check duplicate source records.'},{status:400});}
}
export async function DELETE(request:NextRequest){
 if(!authorized(request))return NextResponse.json({error:'Administrator authentication required.'},{status:401});
 if(!sameOrigin(request))return NextResponse.json({error:'Same-origin request required.'},{status:403});
 try{const {id}=await request.json();if(typeof id!=='string')return NextResponse.json({error:'Pick id required.'},{status:400});await database().query("UPDATE expert_picks SET retracted=true, record=jsonb_set(record,'{retracted}','true'::jsonb) WHERE id=$1",[id]);await database().query('INSERT INTO intelligence_audit(action,record_id) VALUES($1,$2)',['expert_pick_retracted',id]);return NextResponse.json({retracted:true});}catch{return NextResponse.json({error:'Expert storage is unavailable.'},{status:503});}
}

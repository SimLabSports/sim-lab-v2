import {NextRequest,NextResponse} from 'next/server';
import {adminConfigured,adminCookie,allowLogin,createSession,sameOrigin,tokenMatches} from '@/lib/server/admin-auth';
export const runtime='nodejs';
export async function POST(request:NextRequest){
 if(!sameOrigin(request))return NextResponse.json({error:'Same-origin sign-in required.'},{status:403});
 if(!adminConfigured())return NextResponse.json({error:'Set SIMLAB_ADMIN_TOKEN to a private random value of at least 32 characters in the server environment.'},{status:503});
 if(!allowLogin(request))return NextResponse.json({error:'Too many sign-in attempts. Retry in one minute.'},{status:429});
 let body;try{body=await request.json();}catch{return NextResponse.json({error:'Invalid request.'},{status:400});}
 if(typeof body.token!=='string'||body.token.length>1000||!tokenMatches(body.token))return NextResponse.json({error:'Invalid administrator credential.'},{status:401});
 const response=NextResponse.json({authenticated:true});
 response.cookies.set(adminCookie,createSession(),{httpOnly:true,secure:new URL(request.url).protocol==='https:',sameSite:'strict',path:'/',maxAge:8*3600});return response;
}
export async function DELETE(request:NextRequest){
 if(!sameOrigin(request))return NextResponse.json({error:'Same-origin request required.'},{status:403});
 const response=NextResponse.json({authenticated:false});response.cookies.set(adminCookie,'',{httpOnly:true,sameSite:'strict',path:'/',maxAge:0});return response;
}

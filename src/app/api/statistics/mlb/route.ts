import {NextRequest,NextResponse} from 'next/server';
import {mlbSchedule,mlbResearch} from '@/lib/providers/mlb';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const date=request.nextUrl.searchParams.get('date')||new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date)))return NextResponse.json({error:'Use a real YYYY-MM-DD date.'},{status:400});
 try{const schedule=await mlbSchedule(date);const id=request.nextUrl.searchParams.get('gameId');if(!id)return NextResponse.json(schedule,{headers:{'Cache-Control':'no-store'}});const game=schedule.games.find(game=>String(game.gamePk)===id);if(!game)return NextResponse.json({error:'Official game not found on this date.'},{status:404});const input=await mlbResearch({id:`mlb:${game.gamePk}`,sport_key:'baseball_mlb',sport_title:'MLB',commence_time:game.gameDate,home_team:game.teams.home.team.name,away_team:game.teams.away.team.name,bookmakers:[]});return NextResponse.json(input,{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({status:'INCOMPLETE',error:'Official MLB data retrieval failed; no archived or invented data was substituted.'},{status:503});}
}

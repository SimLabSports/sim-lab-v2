import {NextResponse} from 'next/server';
import {getMarketData} from '@/lib/market-server';
import {bdlAccess} from '@/lib/providers/balldontlie-http';
import {bdlCoverage} from '@/lib/providers/balldontlie-sports';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(){
 const [catalog,access]=await Promise.all([getMarketData(),bdlAccess()]);
 return NextResponse.json({provider:'BALLDONTLIE',access,sports:catalog.sports.map(league=>{const coverage=bdlCoverage(league.key);const subscription=access.subscriptions.find(s=>s.sport===coverage.sport||s.sport==='all_access_v3');return {key:league.key,title:league.title,group:league.group,market:league.hasOutrights?'FUTURES':'EVENT_MARKETS',...coverage,subscription:subscription??null,publicFallback:league.key==='baseball_mlb'?'MLB Stats API':league.key==='americanfootball_nfl'?'ESPN NFL':null,endpointVerification:'Individual event and statistics endpoints require a successful request; a subscription listing alone is not a data connection.'};}),catalogError:catalog.refreshError},{headers:{'Cache-Control':'no-store'}});
}

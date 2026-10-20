import {NextResponse} from 'next/server';
import {getMarketData} from '@/lib/market-server';
import {bdlAccess} from '@/lib/providers/balldontlie-http';
import {bdlCoverage} from '@/lib/providers/balldontlie-sports';
import {sportCoverage} from '@/lib/server/sport-coverage';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(){
 const [catalog,access]=await Promise.all([getMarketData(),bdlAccess()]);
 return NextResponse.json({provider:'MULTI_SPORT',access,sports:catalog.sports.map(league=>{const coverage=bdlCoverage(league.key);const subscription=access.subscriptions.find(s=>s.sport===coverage.sport||s.sport==='all_access_v3');return {key:league.key,title:league.title,group:league.group,market:league.hasOutrights?'FUTURES':'EVENT_MARKETS',...coverage,subscription:subscription??null,endpointVerification:'Individual event and statistics endpoints require a successful request; a subscription listing alone is not a data connection.'};}),coverage:await sportCoverage(catalog),catalogError:catalog.refreshError},{headers:{'Cache-Control':'no-store'}});
}

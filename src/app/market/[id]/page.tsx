import { getMarketData } from '@/lib/market-server';
import { MarketDetail } from '@/components/market-board';
import { notFound } from 'next/navigation';
import {Shell} from '@/components/shell';
import {intelligence} from '@/lib/server/intelligence';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{sport?:string}>}) {
  const {id}=await params;
  const {sport}=await searchParams;
  const data=await getMarketData(sport && /^[a-z0-9_]+$/.test(sport)?sport:undefined);
  if(data.refreshError)return <Shell active="matchup"><div className="page detail-page"><div className="content-panel"><h3>Market data incomplete</h3><p>{data.refreshError}</p><p>No saved or synthetic matchup was substituted.</p></div></div></Shell>;
  const feed=data.sports.find(item=>item.events.some(event=>event.id===id));
  const event=feed?.events.find(item=>item.id===id);
  if(!event || !feed)notFound();
  event.intelligence={h2h:await intelligence(event,'h2h')};
  return <MarketDetail event={event} feed={feed} mode={data.refreshMode}/>;
}

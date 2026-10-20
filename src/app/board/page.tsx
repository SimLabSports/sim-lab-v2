import { MarketBoard } from '@/components/market-board';
export default async function Page({searchParams}:{searchParams:Promise<{sport?:string;scan?:string}>}) {
  const {sport,scan}=await searchParams;
  return <MarketBoard initialCategory={sport || 'NFL'} requestedScan={scan==='1'}/>;
}

import { MarketBoard } from '@/components/market-board';
export default async function Page({searchParams}:{searchParams:Promise<{sport?:string}>}) {
  const {sport}=await searchParams;
  return <MarketBoard initialCategory={sport || 'NFL'}/>;
}

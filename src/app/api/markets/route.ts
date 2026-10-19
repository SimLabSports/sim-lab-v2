import { NextRequest, NextResponse } from 'next/server';
import { getMarketData } from '@/lib/market-server';
import {intelligence} from '@/lib/server/intelligence';
import type {MarketKey} from '@/lib/markets';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest) {
  const sport=request.nextUrl.searchParams.get('sport') ?? 'all';
  const market=(request.nextUrl.searchParams.get('market')||'h2h') as MarketKey;
  if(!['h2h','spreads','totals','outrights'].includes(market))return NextResponse.json({error:'Invalid market.'},{status:400});
  if(!/^[a-z0-9_]+$/.test(sport))return NextResponse.json({error:'Invalid sport key.'},{status:400});
  try{const data=await getMarketData(sport);for(const feed of data.sports)if(feed.events.length)feed.events=await Promise.all(feed.events.map(async event=>({...event,intelligence:{[market]:await intelligence(event,market)}})));return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});}
  catch{return NextResponse.json({error:'Market data is temporarily unavailable. Please try again.'},{status:503});}
}

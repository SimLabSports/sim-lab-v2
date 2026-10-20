'use client';
import Link from 'next/link';
import { ArrowRight, Info, Layers3 } from 'lucide-react';
import { useMemo } from 'react';
import { AlignmentInspector, TeamLogo, useMarketFeed } from './market-ui';
import { formatEventTime, matchesCategory } from '@/lib/markets';
import { teamAbbreviation } from '@/lib/team-identity';

export function MarketPreview({category}:{category:string}) {
  const keys:Record<string,string>={NFL:'americanfootball_nfl',NBA:'basketball_nba',MLB:'baseball_mlb',NHL:'icehockey_nhl',NCAAF:'americanfootball_ncaaf',NCAAB:'basketball_ncaab',NCAAW:'basketball_wncaab',WNBA:'basketball_wnba',Soccer:'soccer',Tennis:'tennis',MMA:'mma_mixed_martial_arts',Boxing:'boxing_boxing',Golf:'golf'};
  const {data,loading,error,reload}=useMarketFeed(keys[category]||'all',category==='Golf'?'outrights':'h2h');
  const rows=useMemo(()=>data?.sports.filter(feed=>matchesCategory(feed,category)&&(category==='Golf'?feed.hasOutrights:!feed.hasOutrights)).flatMap(feed=>feed.events.map(event=>({event,feed}))).sort((a,b)=>Date.parse(a.event.commence_time)-Date.parse(b.event.commence_time)).slice(0,3)??[],[data,category]);
  if(loading&&!data)return <div className="market-loading">Loading matchups…</div>;
  if(error&&!rows.length)return <div className="empty-state"><Info/><h3>Market data incomplete</h3><p>{error}</p><button className="text-link" onClick={reload}>Try again</button></div>;
  if(!rows.length)return <div className="empty-state"><Layers3/><h3>{category} coverage</h3><p>No matching fixtures in the active feed.</p><Link className="text-link" href={`/board?sport=${encodeURIComponent(category)}`}>Explore markets <ArrowRight size={14}/></Link></div>;
  return <div className="match-list reference-preview">{rows.map(({event,feed})=>{
    const away=event.away_team||feed.title;const home=event.home_team;
    return <article className="reference-match-card" key={event.id}><Link className="reference-card-main" href={`/market/${event.id}?sport=${feed.key}`}><div className="reference-team-pair"><TeamLogo name={away} sport={event.sport_key}/>{home&&<TeamLogo name={home} sport={event.sport_key}/>}</div><div><strong>{teamAbbreviation(away,event.sport_key)}{home&&<> <span>@</span> {teamAbbreviation(home,event.sport_key)}</>}</strong><small>{formatEventTime(event.commence_time)} ET</small><span>{feed.title}</span></div></Link><div className="reference-card-alignment"><AlignmentInspector event={event}/><small>VIEW PERSPECTIVES</small></div></article>;
  })}</div>;
}

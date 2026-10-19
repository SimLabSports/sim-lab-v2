'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowLeft, ArrowRight, BarChart3, Check, ChevronDown, ChevronRight, Clock3, Database, Info, Layers3, Minus, RefreshCw, Search, ShieldCheck, Users } from 'lucide-react';
import { Shell } from './shell';
import { eventTitle, formatEventTime, formatOdds, formatUpdated, getBook, getMarket, impliedProbability, isStale, marketFavorite, marketNames, matchesCategory, preferredSports, type Market, type MarketEvent, type MarketKey, type MarketResponse, type Outcome, type SportFeed } from '@/lib/markets';

import {useMarketFeed} from './market-ui';
export {BoardScan as MarketBoard} from './board-scan';
export {MarketPreview} from './market-preview';
export {MatchupAnalysis as MarketDetail} from './matchup-analysis';

export function CoverageScreen() {
  const {data,loading,error,reload}=useMarketFeed();
  const groups=[...new Set(data?.sports.map(feed=>feed.group)??[])].sort();
  return <Shell active="coverage"><div className="page coverage-page"><div className="detail-top"><Link className="text-link" href="/board"><ArrowLeft size={15}/> Back to board</Link></div><div className="page-heading"><div><span className="eyebrow">TRANSPARENT BY DESIGN</span><h1>Sports coverage<span className="title-dot">.</span></h1><p>Every active league, every source, and what’s still to connect.</p></div></div><div className="connection-summary"><Database size={24}/><div><h2>{error?'Market connection incomplete':data?.sports.length?'Provider catalog retrieved':'Connecting market data'}</h2><p>Fanatics prices via The Odds API. {data?.refreshError?data.refreshError:'Only successfully retrieved current provider responses are displayed. Selected leagues refresh every minute.'} Expert picks and auditable GCM assessments use independent server services. Missing sources remain incomplete.</p></div></div>{error&&<div className="market-error"><p>{error}</p><button onClick={reload}>Retry</button></div>}{loading&&!data&&<div className="market-loading">Loading coverage…</div>}<div className="coverage-grid">{groups.map(group=><section className="coverage-card" key={group}><h2>{group}</h2><span>{data?.sports.filter(feed=>feed.group===group).length} active leagues & markets</span><ul>{data?.sports.filter(feed=>feed.group===group).sort((a,b)=>a.title.localeCompare(b.title)).map(feed=><li key={feed.key}><span>{feed.title}{feed.hasOutrights&&<small>FUTURES</small>}</span><span>{feed.events.length} event{feed.events.length===1?'':'s'}</span></li>)}</ul></section>)}</div><div className="note"><Info size={16}/><span>Coverage follows the provider’s active catalog. An active league does not guarantee Fanatics offers every event or market. Off-season and unavailable sports show empty states. Personal betting history is not required.</span></div></div></Shell>;
}

'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {runGcmScan,useGcmScan} from './use-gcm-scan';
import { ArrowRight, ChevronDown, ChevronRight, Info, RefreshCw, Search, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { Shell } from './shell';
import { AlignmentInspector, TeamLogo, useMarketFeed } from './market-ui';
import { teamAbbreviation } from '@/lib/team-identity';
import { evaluateMarketAlignment } from '@/lib/alignment';
import { eventTitle, formatEventTime, formatOdds, formatUpdated, getMarket, marketNames, matchesCategory, preferredSports, type MarketKey, type MarketEvent, type SportFeed } from '@/lib/markets';

export function BoardScan({initialCategory='NFL',requestedScan=false}:{initialCategory?:string;requestedScan?:boolean}) {
  const [category,setCategory]=useState(initialCategory);
  const scanStarted=useRef(false);
  const mounted=useRef(false);
  const [scanProgress,setScanProgress]=useState('');
  const [scanError,setScanError]=useState<string|null>(null);
  const [league,setLeague]=useState('all');
  const [marketKey,setMarketKey]=useState<MarketKey>('h2h');
  const scanContext=useRef('');scanContext.current=`${category}:${marketKey}`;
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState('all');
  const [filters,setFilters]=useState(false);
  const [limit,setLimit]=useState(20);
  const primary:Record<string,string>={NFL:'americanfootball_nfl',NBA:'basketball_nba',MLB:'baseball_mlb',NHL:'icehockey_nhl',NCAAF:'americanfootball_ncaaf',WNBA:'basketball_wnba',Soccer:'soccer',Tennis:'tennis'};
  const {data,loading,error,reload}=useMarketFeed(league==='all'?primary[category]||'all':league,marketKey);
  const feeds=useMemo(()=>data?.sports.filter(feed=>matchesCategory(feed,category))??[],[data,category]);
  const rows=useMemo(()=>feeds.filter(feed=>(league==='all'||feed.key===league)&&(marketKey==='outrights'?feed.hasOutrights:!feed.hasOutrights)).flatMap(feed=>feed.events.map(event=>({event,feed,market:getMarket(event,marketKey)}))).filter(({event,market})=>(status!=='priced'||!!market?.outcomes.length)&&(status!=='aligned'||evaluateMarketAlignment(event,marketKey).aligned)&&`${eventTitle(event)} ${event.sport_title} ${market?.outcomes.map(o=>o.name).join(' ')??''}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>Date.parse(a.event.commence_time)-Date.parse(b.event.commence_time)),[feeds,league,marketKey,status,query]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    if(!requestedScan||scanStarted.current||loading||!data)return;
    const candidates=rows.filter(({event,market})=>market?.outcomes.length&&Date.now()<Date.parse(event.commence_time)).slice(0,3);
    const context=`${category}:${marketKey}`;
    // Defer admission so Strict Mode's setup/cleanup replay cannot consume the one-shot scan.
    // Feed polling may rerender the board while a scan is running; it must not cancel that batch.
    const timer=setTimeout(()=>{
      if(scanStarted.current||!mounted.current)return;scanStarted.current=true;
      void(async()=>{for(let i=0;i<candidates.length;i++){if(!mounted.current)return;if(scanContext.current!==context)break;setScanProgress(`Scanning ${i+1}/${candidates.length}`);try{await runGcmScan(candidates[i].event,marketKey);}catch(error){if(mounted.current)setScanError(error instanceof Error?error.message:'Research could not be completed.');break;}}if(mounted.current){setScanProgress('');reload();}})();
    },0);
    return()=>clearTimeout(timer);
  },[requestedScan,loading,data,category,marketKey,reload,rows]);
  const chooseCategory=(value:string)=>{setCategory(value);setLeague('all');setLimit(20);};
  const options=['NFL','NBA','MLB','NHL','NCAAF','Soccer','Tennis'];
  return <Shell active="board"><div className="page board-page reference-board">
    <div className="reference-page-heading"><div><span className="eyebrow">SPORTS INTELLIGENCE</span><h1>Board Scan</h1><p>REAL DATA. MULTIPLE PERSPECTIVES.<br/>BETTER DECISIONS.</p></div><button className="icon-button board-search-button" onClick={()=>setFilters(!filters)} aria-label="Search and filter board"><Search size={21}/></button></div>
    <div className="reference-sport-rail sport-tabs">{options.map(sport=><button className={category===sport?'selected':''} key={sport} onClick={()=>chooseCategory(sport)}>{sport}</button>)}</div>
    <div className="reference-controls"><div className="select-wrap green-select"><select aria-label="Sport category" value={category} onChange={e=>chooseCategory(e.target.value)}><option>All sports</option>{preferredSports.map(sport=><option key={sport}>{sport}</option>)}</select><ChevronDown size={14}/></div><div className="select-wrap"><select aria-label="Market" value={marketKey} onChange={e=>{setMarketKey(e.target.value as MarketKey);setLeague('all');setLimit(20);}}>{Object.entries(marketNames).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select><ChevronDown size={14}/></div><div className="select-wrap"><select aria-label="Alignment filter" value={status} onChange={e=>{setStatus(e.target.value);setLimit(20);}}><option value="all">All Games</option><option value="priced">With prices</option><option value="aligned">3/3 aligned</option></select><ChevronDown size={14}/></div><button className={`icon-button ${filters?'green':''}`} onClick={()=>setFilters(!filters)} aria-label="Toggle advanced filters" aria-expanded={filters}><SlidersHorizontal size={18}/></button></div>
    {filters&&<div className="reference-advanced"><label className="search-field"><Search size={16}/><input placeholder="Search teams or players…" aria-label="Search market teams" value={query} onChange={e=>{setQuery(e.target.value);setLimit(20);}}/></label><div className="select-wrap"><select aria-label="League" value={league} onChange={e=>{setLeague(e.target.value);setLimit(20);}}><option value="all">All {category==='All sports'?'leagues':category+' leagues'}</option>{feeds.filter(feed=>marketKey==='outrights'?feed.hasOutrights:!feed.hasOutrights).map(feed=><option key={feed.key} value={feed.key}>{feed.title}</option>)}</select><ChevronDown size={14}/></div></div>}
    <div className="reference-feed-status"><span><i/>{data?.refreshError?'INCOMPLETE':data?.sports.some(feed=>feed.fetchedAt)?'PROVIDER FEED':'CONNECTING'}<span className="feed-provider"> · Fanatics</span></span><button onClick={reload} disabled={loading} aria-label="Reload fetched snapshot"><span>{scanProgress|| (loading?'Loading…':error?'Connection required':`Fetched ${formatUpdated(data?.sports.find(feed=>feed.key===primary[category])?.fetchedAt||data?.capturedAt)}`)}</span><RefreshCw size={12} className={loading?'spinning':''}/></button></div>
    {scanError&&<div className="market-error" role="alert"><Info size={17}/><p>{scanError}</p></div>}
    {error&&<div className="market-error" role="alert"><Info size={17}/><p>{error}</p><button onClick={reload}>Retry</button></div>}
    <div className="scan-table-wrap"><table className="scan-table"><thead><tr><th>MATCHUP</th><th>TIME (ET)</th><th>FANATICS<br/>{marketNames[marketKey].toUpperCase()}</th><th>IMPLIED</th><th>SIM LAB<br/>EDGE</th><th>ALIGNMENT</th><th>VIEW</th></tr></thead><tbody>{rows.slice(0,limit).map(({event,feed})=><BoardRow key={event.id} initialEvent={event} feed={feed} marketKey={marketKey}/>)}</tbody></table>{loading&&!data?<div className="market-loading">Loading the board…</div>:!rows.length&&<div className="empty-state"><ShieldCheck/><h3>{status==='aligned'?'No verified 3/3 alignments yet':`No ${category==='All sports'?'matching':category} events found`}</h3><p>{status==='aligned'?'No current event has three qualifying, fresh perspectives supporting the same selection.':'Try a different sport, league, market, or team.'}</p><button className="text-link" onClick={()=>{setStatus('all');setQuery('');chooseCategory('NFL');setMarketKey('h2h');}}>Reset filters <ArrowRight size={14}/></button></div>}</div>
    <div className="scan-footer"><span>{Math.min(limit,rows.length)} of {rows.length} events</span><span>Market · Experts · Method</span></div>{rows.length>limit&&<button className="load-more" onClick={()=>setLimit(value=>value+20)}>View more matchups <ChevronDown size={13}/></button>}
    <div className="alignment-board-note"><ShieldCheck size={20}/><div><strong>Three perspectives. Independently evaluated.</strong><p>Tap the checks to inspect each source. Gray means not evaluated; amber means stale. A 3/3 alignment requires all three to agree on the same selection.</p></div><Link href="/coverage" aria-label="View coverage and sources"><ChevronRight size={18}/></Link></div><div className="note"><Info size={14}/><span>Fetched market prices with source timestamps. {data?.refreshError?'The provider connection is incomplete.':'Current provider responses are cached briefly to respect API limits.'} Model probability, edge, and uncertainty await verified inputs. Alignment alone does not establish profit.</span></div>
  </div></Shell>;
}

function BoardRow({initialEvent,feed,marketKey}:{initialEvent:MarketEvent;feed:SportFeed;marketKey:MarketKey}){
 const scan=useGcmScan(initialEvent,marketKey);const event=scan.event;const market=getMarket(event,marketKey);const evaluation=evaluateMarketAlignment(event,marketKey);
 const favorite=market?.outcomes.find(outcome=>outcome.name===evaluation.selection);const away=event.away_team||feed.title;const home=event.home_team;const detail=`/market/${event.id}?sport=${feed.key}`;
 return <tr ><td><Link className="scan-matchup" href={detail}><TeamLogo name={away} sport={event.sport_key}/><span><strong title={away}>{teamAbbreviation(away,event.sport_key)}</strong>{home&&<strong title={home}>{teamAbbreviation(home,event.sport_key)}</strong>}<small>{feed.title}</small></span></Link></td><td><span className="scan-time">{formatEventTime(event.commence_time).replace(/^[A-Za-z]+ \d+, /,'')}</span><small className="scan-date">{formatEventTime(event.commence_time).split(',')[0]}</small></td><td><strong className="scan-odds">{favorite?formatOdds(favorite.price):market?.outcomes.length?market.outcomes.map(outcome=>formatOdds(outcome.price)).slice(0,2).join(' / '):'—'}</strong><small className="scan-quote-note">{evaluation.stale&&market?'Stale quote':market?'Fanatics':'Price pending'}</small></td><td className="scan-implied">{evaluation.implied===null?'—':`${evaluation.implied.toFixed(1)}%`}</td><td className="scan-edge"><span>{evaluation.edgePp==null?'—':`${evaluation.edgePp>=0?'+':''}${evaluation.edgePp.toFixed(1)} pp`}</span><small>{evaluation.edgePp==null?(evaluation.probability==null?'Pending model':'Edge unverified'):'Verified model edge'}</small></td><td><AlignmentInspector event={event} marketKey={marketKey}/></td><td><Link href={detail} className="scan-view">{evaluation.selection?'REVIEW':'PENDING'}<ChevronRight size={11}/></Link></td></tr>;
}

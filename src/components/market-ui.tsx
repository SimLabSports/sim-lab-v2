'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, BarChart3, Check, Clock3, Minus, ShieldCheck, Trophy, Users, X } from 'lucide-react';
import {GcmDecision} from './gcm-decision';
import {useGcmScan} from './use-gcm-scan';
import { teamIdentity } from '@/lib/team-identity';
import { evaluateMarketAlignment } from '@/lib/alignment';
import { eventTitle, formatUpdated, type MarketEvent, type MarketKey, type MarketResponse } from '@/lib/markets';

export function useMarketFeed(sport='all',market:MarketKey='h2h') {
  const [data,setData]=useState<MarketResponse|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);
    fetch(`/api/markets?sport=${encodeURIComponent(sport)}&market=${market}`,{signal:controller.signal,cache:'no-store'})
      .then(async response=>{if(!response.ok)throw new Error('Market data could not be loaded.');return response.json() as Promise<MarketResponse>;})
      .then(value=>{setData(value);setError(value.refreshError);})
      .catch(reason=>{if(reason.name!=='AbortError'){setData(null);setError(reason.message);}})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[sport,market,revision]);
  useEffect(()=>{
    if(data?.refreshMode!=='automatic'||sport==='all')return;
    const timer=setInterval(()=>setRevision(value=>value+1),Math.max(data.refreshIntervalSeconds??60,30)*1000);
    return()=>clearInterval(timer);
  },[data?.refreshMode,data?.refreshIntervalSeconds,sport]);
  return {data,loading,error,reload:useCallback(()=>setRevision(value=>value+1),[])};
}

export function TeamLogo({name,sport,large=false}:{name:string;sport:string;large?:boolean}) {
  const identity=teamIdentity(name,sport);
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[identity?.logo]);
  return <span className={`team-logo ${large?'team-logo-large':''}`}>
    {identity&&!failed?<img src={identity.logo} alt={`${name} logo`} width={large?110:46} height={large?110:46} onError={()=>setFailed(true)}/>:<Trophy aria-label={`${name}: team logo unavailable`} size={large?45:25}/>}
  </span>;
}

export function AlignmentInspector({event,marketKey='h2h',large=false}:{event:MarketEvent;marketKey?:MarketKey;large?:boolean}) {
  const [now,setNow]=useState(()=>Date.now());
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[]);
  const scan=useGcmScan(event,marketKey);
  const evaluation=evaluateMarketAlignment(scan.event,marketKey,now);
  const icons=[BarChart3,Users,Activity];
  return <>
    <button className={`alignment-trigger ${large?'alignment-trigger-large':''}`} onClick={()=>{dialog.current?.showModal();void scan.run();}} aria-label={`Inspect alignment for ${eventTitle(event)}`}>
      <span className="source-checks">{evaluation.perspectives.map(p=><span key={p.key} className={p.available?(p.stale?'source-stale':p.selection===evaluation.selection?'available':''):''}>{p.available&&!p.stale&&p.selection===evaluation.selection?<Check size={large?21:13} strokeWidth={3}/>:<Minus size={large?19:12}/>}</span>)}</span>
      <span className="alignment-count">{evaluation.evaluated}/3 <span>{evaluation.status==='INCOMPLETE'?'incomplete':'agree'}</span></span>
    </button>
    <dialog ref={dialog} className="alignment-dialog" onClick={event=>{if(event.target===event.currentTarget)dialog.current?.close();}} aria-labelledby={`alignment-title-${event.id}-${marketKey}`}>
      <div className="alignment-dialog-heading"><span className="eyebrow">THE TRIPLE GREEN CHECK</span><button className="icon-button" onClick={()=>dialog.current?.close()} aria-label="Close alignment"><X size={18}/></button></div>
      <h2 id={`alignment-title-${event.id}-${marketKey}`}>Three perspectives.<br/><span>A clearer picture.</span></h2><p className="alignment-event-name">{eventTitle(event)}</p>
      <div className="alignment-evaluations">{evaluation.perspectives.map((p,index)=>{const Icon=icons[index];return <section key={p.key}><Icon size={24}/><div><h3>{p.name}</h3><strong>{p.key==='method'&&scan.loading?'Evaluating both sides…':p.selection??(p.key==='method'&&evaluation.gcm?'No supported selection':'Awaiting evaluation')}</strong><p>{p.key==='method'&&scan.loading?'Checking current matchup statistics and evidence for both participants.':p.detail}</p><small>{p.source}{p.key==='market'&&evaluation.updated&&` · ${formatUpdated(evaluation.updated)}`}</small>{p.key==='method'&&evaluation.gcm&&!scan.loading&&<GcmDecision evaluation={evaluation.gcm} embedded/>}</div><span className={`evaluation-state ${p.available&&!p.stale&&p.selection===evaluation.selection?'ready':p.stale&&p.available?'stale':''}`}>{p.available?(p.stale?'STALE':p.selection===evaluation.selection?'AGREES':'OPPOSES'):p.key==='method'?(scan.loading?'EVALUATING':evaluation.gcm?.status==='LEAN_ONLY'?'RESEARCH LEAN':evaluation.gcm?.status==='ERROR'?'ERROR':evaluation.gcm?.status==='PASS'?'PASS':'INCOMPLETE'):'PENDING'}</span></section>;})}</div>
      {scan.error&&<p className="alignment-event-name" role="alert">{scan.error}</p>}
      {evaluation.gcm&&<p className="alignment-event-name">{evaluation.gcm.status==='LEAN_ONLY'?'RESEARCH LEAN · NOT VALIDATED GREEN APPROVAL':evaluation.gcm.status} · Statistics retrieved {formatUpdated(evaluation.gcm.input.retrievedAt)} · Evaluated {formatUpdated(evaluation.gcm.createdAt)}</p>}
      {evaluation.experts?.sources.map(source=><p className="alignment-event-name" key={source.id}><a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">{source.analystName} · {source.sourceName}</a><br/>{source.selection} · {formatUpdated(source.publishedAt)} · Curated verified source</p>)}
      {evaluation.gcm?.factors.map((factor,index)=><p className="alignment-event-name" key={index}>{factor.text} {factor.evidenceIds.map(id=>{const evidence=evaluation.gcm?.input.evidence.find(item=>item.id===id);return evidence?<a key={id} href={evidence.sourceUrl} target="_blank" rel="noopener noreferrer">[{id}]</a>:null;})}</p>)}
      {evaluation.gcm?.risks.map((risk,index)=><p className="alignment-event-name" key={`risk-${index}`}>{risk}</p>)}
      <div className="alignment-dialog-result"><ShieldCheck size={23}/><div><strong>{evaluation.aligned?'3 / 3 verified agreement':`${evaluation.evaluated} / 3 perspectives agree`}</strong><p>{evaluation.aligned?'Agreement does not establish profitability. Consider the price, uncertainty, and input quality.':'A Triple Green Check requires three fresh, independent evaluations favoring the same selection. Missing inputs do not count as agreement.'}</p></div></div>
      <div className="alignment-dialog-foot"><Clock3 size={13}/><span>Source freshness and agreement are checked when this view is rendered.</span></div>
    </dialog>
  </>;
}

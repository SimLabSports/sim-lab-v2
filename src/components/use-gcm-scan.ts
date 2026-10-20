'use client';
import {useCallback,useEffect,useState} from 'react';
import type {LiveEvaluation,MarketEvent,MarketKey} from '@/lib/markets';
import {getMarket} from '@/lib/markets';

const pending=new Map<string,Promise<LiveEvaluation>>();
const results=new Map<string,LiveEvaluation>();
const listeners=new Set<()=>void>();
const identity=(event:MarketEvent,market:MarketKey)=>`${event.sport_key}:${event.id}:${event.commence_time}:${market}:${JSON.stringify(getMarket(event,market)?.outcomes)}`;
const pendingIdentity=(event:MarketEvent,market:MarketKey)=>`${event.sport_key}:${event.id}:${event.commence_time}:${market}:${JSON.stringify(getMarket(event,market)?.outcomes.map(o=>[o.name,o.point??null]))}`;
export async function runGcmScan(event:MarketEvent,market:MarketKey){
 const key=identity(event,market),job=pendingIdentity(event,market);let task=pending.get(job);
 if(!task){
  const cached=results.get(key);
  const embedded=event.intelligence?.[market];
  if(embedded?.gcm&&embedded.gcm.status!=='ERROR'&&embedded.gcm.modelVersion.startsWith('gcm-grounded-research-7')&&Date.parse(embedded.gcm.expiresAt)>Date.now())return embedded;
  if(cached?.gcm&&cached.gcm.status!=='ERROR'&&Date.parse(cached.gcm.expiresAt)>Date.now())return cached;
  task=(async()=>{
   const response=await fetch('/api/gcm/evaluate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventId:event.id,sport:event.sport_key,market}),cache:'no-store',signal:AbortSignal.timeout(65000)});
   let value=await response.json();
   if(response.status===202){for(let i=0;i<8;i++){await new Promise(resolve=>setTimeout(resolve,1500));const read=await fetch(`/api/intelligence?eventId=${encodeURIComponent(event.id)}&sport=${event.sport_key}&market=${market}`,{cache:'no-store'});if(read.ok){const saved=await read.json();if(saved.gcm?.status!=='ERROR'&&saved.gcm?.modelVersion.startsWith('gcm-grounded-research-7')&&Date.parse(saved.gcm.expiresAt)>Date.now()){value=saved;break;}}}}
   if(!response.ok)throw new Error(value.gcm?.explanation||value.error||'The scan could not be completed.');
   for(const [id,stored]of results)if(!stored.gcm||Date.parse(stored.gcm.expiresAt)<=Date.now())results.delete(id);
   if(results.size>=200)results.delete(results.keys().next().value!);
   results.set(key,value);if(value.gcm?.status==='ERROR')throw new Error(value.gcm.explanation||'Research is unavailable.');return value as LiveEvaluation;
  })();pending.set(job,task);listeners.forEach(update=>update());
 }
 try{return await task;}finally{pending.delete(job);listeners.forEach(update=>update());}
}
export function useGcmScan(event:MarketEvent,market:MarketKey){
 const key=identity(event,market);
 const [,refresh]=useState(0);
 const [error,setError]=useState<string|null>(null);
 useEffect(()=>{const update=()=>refresh(value=>value+1);listeners.add(update);return()=>{listeners.delete(update);};},[]);
 const run=useCallback(async()=>{
  setError(null);
  try{await runGcmScan(event,market);}catch(reason){setError(reason instanceof Error?reason.message:'Research is unavailable.');}
 },[key,event.id,event.sport_key,market]);
 const result=results.get(key);
 const expiry=result?.gcm?.approval?.expiresAt??event.intelligence?.[market]?.gcm?.approval?.expiresAt;
 useEffect(()=>{const delay=expiry?Date.parse(expiry)-Date.now():NaN;if(!Number.isFinite(delay)||delay<=0)return;const timer=setTimeout(()=>refresh(value=>value+1),Math.min(delay+25,2147483647));return()=>clearTimeout(timer);},[expiry]);
 const usable=result?.gcm&&Date.parse(result.gcm.expiresAt)>Date.now()?result:undefined;
 return {event:usable?{...event,intelligence:{...event.intelligence,[market]:usable}}:event,loading:pending.has(pendingIdentity(event,market)),error,run};
}

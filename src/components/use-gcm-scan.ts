'use client';
import {useCallback,useEffect,useState} from 'react';
import type {LiveEvaluation,MarketEvent,MarketKey} from '@/lib/markets';
import {getMarket} from '@/lib/markets';

const pending=new Map<string,Promise<LiveEvaluation>>();
const results=new Map<string,LiveEvaluation>();
const listeners=new Set<()=>void>();
const identity=(event:MarketEvent,market:MarketKey)=>`${event.sport_key}:${event.id}:${event.commence_time}:${market}:${JSON.stringify(getMarket(event,market)?.outcomes)}`;
export function useGcmScan(event:MarketEvent,market:MarketKey){
 const key=identity(event,market);
 const [,refresh]=useState(0);
 const [error,setError]=useState<string|null>(null);
 useEffect(()=>{const update=()=>refresh(value=>value+1);listeners.add(update);return()=>{listeners.delete(update);};},[]);
 const run=useCallback(async()=>{
  setError(null);
  let task=pending.get(key);
  if(!task){
   const cached=results.get(key);
   if(cached?.gcm&&Date.parse(cached.gcm.expiresAt)>Date.now()&&(!cached.gcm.approval||Date.parse(cached.gcm.approval.expiresAt)>Date.now()))return;
   task=(async()=>{
    const response=await fetch('/api/gcm/evaluate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventId:event.id,sport:event.sport_key,market}),cache:'no-store',signal:AbortSignal.timeout(65000)});
    const value=await response.json();
    if(!response.ok)throw new Error(value.error||'The scan could not be completed.');
    for(const [id,stored]of results)if(!stored.gcm||Date.parse(stored.gcm.expiresAt)<=Date.now())results.delete(id);
    if(results.size>=200)results.delete(results.keys().next().value!);
    results.set(key,value);return value as LiveEvaluation;
   })();
   pending.set(key,task);listeners.forEach(update=>update());
  }
  try{await task;}catch(reason){setError(reason instanceof Error?reason.message:'Research is unavailable.');}
  finally{pending.delete(key);listeners.forEach(update=>update());}
 },[key,event.id,event.sport_key,market]);
 const result=results.get(key);
 const expiry=result?.gcm?.approval?.expiresAt??event.intelligence?.[market]?.gcm?.approval?.expiresAt;
 useEffect(()=>{const delay=expiry?Date.parse(expiry)-Date.now():NaN;if(!Number.isFinite(delay)||delay<=0)return;const timer=setTimeout(()=>refresh(value=>value+1),Math.min(delay+25,2147483647));return()=>clearTimeout(timer);},[expiry]);
 const usable=result?.gcm&&Date.parse(result.gcm.expiresAt)>Date.now()?result:undefined;
 return {event:usable?{...event,intelligence:{...event.intelligence,[market]:usable}}:event,loading:pending.has(key),error,run};
}

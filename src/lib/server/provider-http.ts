import 'server-only';
export class ProviderError extends Error {
  constructor(public provider:string,public code:string,message:string,public status=503){super(message);}
}
type Entry={value:unknown;expires:number};
type Health={lastSuccessAt:string|null;lastError:string|null};
type State={cache:Map<string,Entry>;pending:Map<string,Promise<unknown>>;backoff:Map<string,number>;health:Map<string,Health>};
const root=globalThis as typeof globalThis & {simlabProviders?:State};
const state:State=root.simlabProviders??={cache:new Map(),pending:new Map(),backoff:new Map(),health:new Map()};
export function providerHealth(provider:string){return state.health.get(provider)??{lastSuccessAt:null,lastError:null};}
export function providerSucceeded(provider:string){state.health.set(provider,{lastSuccessAt:new Date().toISOString(),lastError:null});}
export async function providerJson<T>(options:{provider:string;cacheKey:string;url:string;headers?:Record<string,string>;ttl:number;validate:(input:unknown)=>T}):Promise<T>{
  const old=state.cache.get(options.cacheKey);
  if(old&&old.expires>Date.now())return old.value as T;
  if((state.backoff.get(options.provider)??0)>Date.now())throw new ProviderError(options.provider,'BACKOFF','Provider is temporarily paused after a failure. Retry shortly.',429);
  const pending=state.pending.get(options.cacheKey);if(pending)return pending as Promise<T>;
  const task=(async()=>{
    try{
      const response=await fetch(options.url,{headers:options.headers,cache:'no-store',signal:AbortSignal.timeout(15000)});
      if(!response.ok){
        const seconds=Math.min(3600,Math.max(30,Number(response.headers.get('retry-after'))||60));
        state.backoff.set(options.provider,Date.now()+seconds*1000);
        throw new ProviderError(options.provider,response.status===401||response.status===403?'ACCESS_DENIED':response.status===429?'RATE_LIMIT':'PROVIDER_ERROR',`${options.provider} returned HTTP ${response.status}. Check the server credential and subscription.`,response.status===429?429:503);
      }
      const value=options.validate(await response.json());
      state.cache.set(options.cacheKey,{value,expires:Date.now()+options.ttl});
      state.health.set(options.provider,{lastSuccessAt:new Date().toISOString(),lastError:null});
      return value;
    }catch(error){
      const safe=error instanceof ProviderError?error:new ProviderError(options.provider,'FETCH_FAILED',`${options.provider} could not return valid current data. No saved or demo data was substituted.`);
      state.backoff.set(options.provider,Math.max(state.backoff.get(options.provider)??0,Date.now()+30000));
      state.health.set(options.provider,{lastSuccessAt:state.health.get(options.provider)?.lastSuccessAt??null,lastError:safe.message});
      throw safe;
    }
  })();
  state.pending.set(options.cacheKey,task);
  try{return await task;}finally{state.pending.delete(options.cacheKey);}
}

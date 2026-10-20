import 'server-only';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {providerFailed,providerSucceeded} from '../server/provider-http';

export class BdlError extends Error{constructor(public status:number,message:string){super(message);}}
const cache=new Map<string,{value:unknown;expires:number}>();
const pending=new Map<string,Promise<unknown>>();
const denied=new Map<string,{status:number;expires:number}>();
const keyId=()=>createHash('sha256').update(process.env.BALLDONTLIE_API_KEY??'').digest('hex').slice(0,16);
export async function bdlRequest<T>(path:string,params:URLSearchParams,validate:(data:unknown)=>T,ttl=300000,account=false):Promise<{data:T;observedAt:string;sourceUrl:string}>{
 const key=process.env.BALLDONTLIE_API_KEY?.trim();if(!key)throw new BdlError(503,'BALLDONTLIE access has not been configured.');
 if(!/^\/(?:[a-z0-9]+\/v[12]\/|account\/v1\/subscriptions$)/.test(path)||path.includes('..'))throw new BdlError(400,'Unsupported statistics endpoint.');
 const url=new URL(path,'https://api.balldontlie.io');url.search=params.toString();
 const identity=`${keyId()}:${url}`;const previous=cache.get(identity);if(previous&&previous.expires>Date.now())return previous.value as {data:T;observedAt:string;sourceUrl:string};
 const scope=`${keyId()}:${path}`;const blocked=denied.get(scope);if(blocked&&blocked.expires>Date.now())throw new BdlError(blocked.status,blocked.status===429?'BALLDONTLIE request quota reached; retry after the source cooldown.':'This BALLDONTLIE endpoint is unavailable under the current key or subscription.');
 const inflight=pending.get(identity);if(inflight)return inflight as Promise<{data:T;observedAt:string;sourceUrl:string}>;
 const task=(async()=>{
  try{
   const response=await fetch(url,{headers:{Authorization:account?`Bearer ${key}`:key},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
   if(!response.ok){
    const status=response.status;const seconds=status===429?Math.min(3600,Math.max(60,Number(response.headers.get('retry-after'))||60)):status===401||status===403?600:30;
    denied.set(scope,{status,expires:Date.now()+seconds*1000});
    throw new BdlError(status,status===401?'BALLDONTLIE rejected the configured key.':status===403?'This BALLDONTLIE endpoint requires access not included in the current subscription.':status===429?'BALLDONTLIE request quota reached; retry after the source cooldown.':`BALLDONTLIE could not return this resource (HTTP ${status}).`);
   }
   const value={data:validate(await response.json()),observedAt:new Date().toISOString(),sourceUrl:url.toString()};
   for(const [id,entry] of cache)if(entry.expires<=Date.now())cache.delete(id);
   if(cache.size>=250)cache.delete(cache.keys().next().value!);
   cache.set(identity,{value,expires:Date.now()+ttl});providerSucceeded('BALLDONTLIE');return value;
  }catch(error){const safe=error instanceof BdlError?error:new BdlError(503,'BALLDONTLIE did not return valid current data. No estimate was substituted.');providerFailed('BALLDONTLIE',safe.message);throw safe;}
 })();pending.set(identity,task);try{return await task;}finally{pending.delete(identity);}
}
const subscriptionsSchema=z.object({data:z.array(z.object({sport:z.string(),tier:z.string(),status:z.string().nullable().optional()}))});
export async function bdlAccess(){
 if(!process.env.BALLDONTLIE_API_KEY)return {configured:false,status:'NOT_CONFIGURED',subscriptions:[] as {sport:string;tier:string;status?:string|null}[],reason:'BALLDONTLIE_API_KEY is not available to this deployment.'};
 try{const result=await bdlRequest('/account/v1/subscriptions',new URLSearchParams(),data=>subscriptionsSchema.parse(data),600000,true);return {configured:true,status:'VERIFIED',subscriptions:result.data.data,checkedAt:result.observedAt,reason:'Subscription metadata verified. Individual data endpoints still require successful requests.'};}
 catch(error){return {configured:true,status:'UNVERIFIED',subscriptions:[],reason:error instanceof BdlError?error.message:'Account access could not be verified.'};}
}

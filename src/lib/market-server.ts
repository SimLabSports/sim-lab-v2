import 'server-only';
import { z } from 'zod';
import type { MarketEvent, MarketResponse, SportFeed } from './markets';
import { providerJson, ProviderError } from './server/provider-http';
const TTL=60000;
const outcomeSchema=z.object({name:z.string(),price:z.number().refine(n=>Math.abs(n)>=100),point:z.number().optional(),description:z.string().optional()});
const eventSchema=z.object({id:z.string(),sport_key:z.string(),sport_title:z.string(),commence_time:z.string().datetime(),home_team:z.string().nullable(),away_team:z.string().nullable(),bookmakers:z.array(z.object({key:z.string(),title:z.string(),last_update:z.string().optional(),markets:z.array(z.object({key:z.string(),last_update:z.string().optional(),outcomes:z.array(outcomeSchema)}))}))});
const catalogSchema=z.array(z.object({key:z.string(),title:z.string(),group:z.string(),description:z.string(),has_outrights:z.boolean(),active:z.boolean()}));
const root=globalThis as typeof globalThis & {simlabLiveFeeds?:Map<string,{feed:SportFeed;expires:number}>};
const feeds=root.simlabLiveFeeds??=new Map();
function oddsRequest<T>(pathname:string,parameters:Record<string,string>,validate:(data:unknown)=>T,ttl=TTL):Promise<T>{
 const key=process.env.ODDS_API_KEY;
 if(!key)throw new ProviderError('The Odds API','MISSING_CREDENTIAL','ODDS_API_KEY is not configured on the website server. The ChatGPT connector cannot supply this credential.',503);
 const url=new URL(`https://api.the-odds-api.com/v4/${pathname}`);
 url.searchParams.set('apiKey',key);for(const [name,value]of Object.entries(parameters))url.searchParams.set(name,value);
 return providerJson({provider:'The Odds API',cacheKey:`odds:${pathname}:${JSON.stringify(parameters)}`,url:url.toString(),ttl,validate});
}
export async function getMarketData(sportKey='all'):Promise<MarketResponse>{
 const base:MarketResponse={source:'The Odds API',bookmaker:'fanatics',capturedAt:new Date().toISOString(),sports:[],refreshMode:'automatic',refreshIntervalSeconds:60,refreshError:null};
 try{
  const catalog=await oddsRequest('sports',{},data=>catalogSchema.parse(data),21600000);
  const active=catalog.filter(item=>item.active&&item.group!=='Politics');
  if(sportKey==='soccer')sportKey=active.find(item=>item.key==='soccer_epl')?.key||active.find(item=>item.group==='Soccer'&&!item.has_outrights)?.key||'soccer_unavailable';
  if(sportKey==='golf')sportKey=active.find(item=>item.group==='Golf'&&item.has_outrights)?.key||'golf_unavailable';
  if(sportKey==='tennis')sportKey=active.find(item=>item.group==='Tennis'&&!item.has_outrights)?.key||'tennis_unavailable';
  if(sportKey!=='all'&&!active.some(item=>item.key===sportKey))throw new ProviderError('The Odds API','SPORT_UNAVAILABLE','This league is not active in the provider catalog.',404);
  const selected=sportKey==='all'?active:active.filter(item=>item.key===sportKey);
  // The all-sports board requests the catalog and current cached feeds only. Specific leagues refresh on demand.
  for(const item of selected){
   const current=feeds.get(item.key);
   let feed:SportFeed={key:item.key,title:item.title,group:item.group,description:item.description,hasOutrights:item.has_outrights,fetchedAt:null,error:null,events:[]};
   if(current&&current.expires>Date.now())feed=current.feed;
   else if(sportKey!=='all'){
    try{
     const events=await oddsRequest(`sports/${encodeURIComponent(item.key)}/odds`,{bookmakers:'fanatics',markets:item.has_outrights?'outrights':'h2h,spreads,totals',oddsFormat:'american',dateFormat:'iso'},data=>z.array(eventSchema).parse(data));
     // No sportsbook substitution; source timestamps govern individual quote freshness.
     feed={...feed,events:events.map(event=>({...event,bookmakers:event.bookmakers.filter(book=>book.key==='fanatics')})) as MarketEvent[],fetchedAt:new Date().toISOString()};
     feeds.set(item.key,{feed,expires:Date.now()+TTL});
    }catch(error){feed.error=error instanceof Error?error.message:'Provider retrieval failed.';base.refreshError=feed.error;}
   }
   base.sports.push(feed);
  }
  // Keep the complete live catalog for controls, while only the requested league consumes odds credits.
  if(sportKey!=='all')for(const item of active.filter(item=>item.key!==sportKey)){
   const cached=feeds.get(item.key);
   base.sports.push(cached&&cached.expires>Date.now()?cached.feed:{key:item.key,title:item.title,group:item.group,description:item.description,hasOutrights:item.has_outrights,fetchedAt:null,error:null,events:[]});
  }
 }catch(error){base.refreshError=error instanceof Error?error.message:'Market provider unavailable.';}
 return base;
}
export async function getLiveEvent(id:string,sport:string){
 if(!/^[a-z0-9_]+$/.test(sport)||!/^[a-zA-Z0-9_-]+$/.test(id))throw new ProviderError('The Odds API','INVALID_EVENT','Invalid event identity.',400);
 const data=await getMarketData(sport);if(data.refreshError)throw new ProviderError('The Odds API','UNAVAILABLE',data.refreshError,503);
 const feed=data.sports.find(item=>item.key===sport);const event=feed?.events.find(item=>item.id===id);
 if(!event||!feed)throw new ProviderError('The Odds API','EVENT_NOT_FOUND','This event is no longer offered in the current provider feed.',404);
 return {event,feed,mode:data.refreshMode};
}

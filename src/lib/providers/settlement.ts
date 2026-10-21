import 'server-only';
import {unstable_cache} from 'next/cache';
import {createHash} from 'node:crypto';
import reviewedContract from '../../../data/settlement/fanatics-md-nba.json';
import {getBook,getMarket,type MarketEvent} from '../markets';
import type {ResearchInput} from '../research-types';
const url='https://sportsbook.fanatics.com/legal/md/house-rules/';
const rules=unstable_cache(async()=>{
 const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error(`Fanatics Maryland rule source returned HTTP ${response.status}.`);const raw=await response.text();if(raw.length>3000000)throw Error('House-rule response exceeds its size bound.');const text=raw.replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|amp);/g,' ').replace(/\s+/g,' ');
 const start=text.indexOf('General Basketball Rules'),end=text.indexOf('Basketball Player Market Rules',start);if(start<0||end<start)throw Error('Basketball settlement section could not be isolated.');const section=text.slice(start,end);
 if(createHash('sha256').update(section).digest('hex')!==reviewedContract.sectionSha256)throw Error('Fanatics Maryland basketball rules differ from the reviewed contract; settlement requires review.');
 if(!/August\s+31,\s+2026/.test(text)||!/2-way.{0,40}Moneyline.{0,40}Overtime/i.test(section)||!/tie.{0,50}push/i.test(section)||!/48\s+hours/.test(section)||!/venue.{0,80}neutral\s+site/i.test(section)||!/start.{0,25}midnight.{0,25}local/i.test(section))throw Error('Fanatics Maryland rule version or required settlement clauses changed; mapping withheld.');
 return {observedAt:new Date().toISOString(),effective:'2026-08-31'};
},['fanatics-md-basketball-contract-v1'],{revalidate:300});

export async function enrichSettlement(event:MarketEvent,input:ResearchInput):Promise<ResearchInput>{
 if(event.sport_key!=='basketball_nba'||!input.pregame||!input.providerEventId)return input;
 const result={...input,evidence:[...input.evidence],gaps:[...input.gaps],verifications:[...(input.verifications??[])]};
 const market=getMarket(event,'h2h'),book=getBook(event);
 if(book?.key!=='fanatics'||market?.outcomes.length!==2||market.outcomes.some(o=>![input.home,input.away].includes(o.name)||o.point!==undefined)||new Set(market.outcomes.map(o=>o.name)).size!==2)return result;
 // Maryland was explicitly confirmed by the project owner. An explicit different
 // deployment jurisdiction must never silently inherit Maryland rules.
 if(process.env.SIMLAB_SPORTSBOOK_STATE&&process.env.SIMLAB_SPORTSBOOK_STATE!=='MD'){result.gaps.push('No reviewed settlement adapter exists for the configured sportsbook jurisdiction.');return result;}
 try{const contract=await rules(),id=`settlement${result.evidence.length+1}`;
  result.evidence.push({id,entity:'event',metric:'Fanatics Maryland NBA full-game moneyline contract',value:'Two named team outcomes including overtime. Ties refund the stake. Void/abandonment, resumption, changed-venue and local start-date conditions apply. Model value is conditional on a decisive action result; no void probability or unconditional ROI is estimated.',sourceUrl:url,observedAt:contract.observedAt,period:`Maryland confirmed by owner; rules effective ${contract.effective}; exact Fanatics h2h event ${event.id}; event integrity remains a separate gate`});
  result.settlement='TWO_WAY_REFUND_ON_VOID';
  if(!result.verifications.some(v=>v.kind==='settlement'&&v.status==='BLOCKED'))result.verifications=[...result.verifications.filter(v=>v.kind!=='settlement'),{kind:'settlement',status:'CLEAR',evidenceIds:[id],observedAt:contract.observedAt}];
  result.gaps.push('Maryland full-game moneyline contract mapped. Conditional value does not establish unchanged venue/schedule, absence of integrity concerns, or a probability of action/void.');
 }catch(e){const reason=e instanceof Error?e.message:'Bookmaker settlement contract unavailable.';result.gaps.push(reason);if(!result.verifications.some(v=>v.kind==='settlement'&&v.status==='BLOCKED'))result.verifications=[...result.verifications.filter(v=>v.kind!=='settlement'),{kind:'settlement',status:'UNKNOWN',evidenceIds:[],observedAt:new Date().toISOString(),reason}];}
 return result;
}

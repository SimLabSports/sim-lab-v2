import 'server-only';
import {expertConsensus} from '../providers/experts';
import {withApproval} from '../gcm/decision-server';
import {storedGcm,evaluateGcm} from '../gcm/evaluator';
import {getBook,getMarket,impliedProbability,isStale,marketFavorite,type MarketEvent,type MarketKey} from '../markets';
export async function intelligence(event:MarketEvent,key:MarketKey='h2h',runResearch=false,visitor?:string){
 const market=getMarket(event,key);const favorite=marketFavorite(market);const outcome=market?.outcomes.find(item=>item.name===favorite);const line=outcome?.point??market?.outcomes[0]?.point??null;
 const updated=market?.last_update||getBook(event)?.last_update;const stale=isStale(updated);const pregame=Date.now()<Date.parse(event.commence_time);
 const [experts,savedGcm]=await Promise.all([expertConsensus(event,key,line),runResearch?evaluateGcm(event,key,line,visitor):storedGcm(event,key,line)]);
 const gcm=savedGcm?withApproval(event,key,savedGcm):null;
 const perspectives=[{key:'market',name:'Market Favorite',selection:favorite,available:!!favorite,stale,source:'Fanatics / The Odds API',detail:favorite?'Current comparable market favorite; raw implied includes bookmaker margin.':'No comparable, valid favorite is available.'},{key:'expert',name:'Expert Consensus',selection:experts.selection,available:experts.status==='QUALIFIED',stale:!pregame,source:'Verified administrator-curated independent sources',detail:experts.share===null?experts.reason:`${experts.supporters} of ${experts.total} independent sources (${experts.share.toFixed(1)}%) select ${experts.selection??'no majority'}. This is source selection share, not win probability.`},{key:'method',name:'The Green Check Method',selection:gcm?.selection??null,available:!!gcm?.eligibleForAlignment,stale:!!gcm&&Date.parse(gcm.expiresAt)<=Date.now(),source:gcm?.modelVersion??'Grounded GCM research',detail:gcm?.explanation??'No current auditable GCM evaluation. Verified statistics and server-side AI access are required.'}];
 const evaluated=perspectives.filter(p=>p.available&&!p.stale);const agreeing=evaluated.filter(p=>!!favorite&&p.selection===favorite);const aligned=agreeing.length===3;
 const gates=gcm?.approval?.candidates.find(c=>c.selection===gcm.selection)?.gates??[];
 const candidateStatus=gcm?.approval?.approved?(aligned?'QUALIFIED':'GCM_APPROVED'):gcm?.approval?.status??'INCOMPLETE';
 const total=market?.outcomes.reduce((sum,o)=>sum+(impliedProbability(o.price)??0),0)??0;
 const complete=market&&((key==='h2h'&&event.sport_key.startsWith('soccer_'))?market.outcomes.length===3&&market.outcomes.some(o=>o.name==='Draw'):key==='h2h'||key==='spreads'||key==='totals'?market.outcomes.length===2:key==='outrights'&&market.outcomes.length>=2);
 const noVig=complete&&market&&market.outcomes.every(o=>impliedProbability(o.price)!==null)&&total>0?market.outcomes.map(o=>({selection:o.name,probability:impliedProbability(o.price)!/total*100})):null;
 return {eventId:event.id,sport:event.sport_key,market:key,line,perspectives,selection:favorite,updated,stale,implied:outcome?impliedProbability(outcome.price):null,evaluated:agreeing.length,aligned,status:evaluated.length===3?'EVALUATED':'INCOMPLETE',candidateStatus,gates,experts,gcm,noVig,probability:gcm?.probability??null,edgePp:gcm?.edgePp??null,uncertainty:gcm?.uncertainty??null,computedAt:new Date().toISOString()};
}

export type MarketKey = 'h2h' | 'spreads' | 'totals' | 'outrights';
export type Outcome = { name: string; price: number; point?: number; description?: string };
export type Market = { key: string; last_update?: string; outcomes: Outcome[] };
export type Bookmaker = { key: string; title: string; last_update?: string; markets: Market[] };
export type Perspective={key:string;name:string;selection:string|null;available:boolean;stale:boolean;source:string;detail:string};
export type LiveEvaluation={perspectives:Perspective[];selection:string|null;updated:string|undefined;stale:boolean;implied:number|null;evaluated:number;aligned:boolean;status:string;experts?:import('./research-types').ExpertConsensus;gcm?:import('./research-types').GcmEvaluation|null;probability?:number|null;edgePp?:number|null;candidateStatus?:string};
export type MarketEvent = { id: string; sport_key: string; sport_title: string; commence_time: string; home_team: string | null; away_team: string | null; bookmakers: Bookmaker[]; intelligence?:Partial<Record<MarketKey,LiveEvaluation>> };
export type SportFeed = { key: string; title: string; group: string; description: string; hasOutrights: boolean; fetchedAt: string | null; error: string | null; events: MarketEvent[] };
export type MarketSnapshot = { source: string; bookmaker: string; capturedAt: string; sports: SportFeed[] };
export type MarketResponse = MarketSnapshot & { refreshMode: 'connector-snapshot' | 'automatic'; refreshIntervalSeconds: number | null; refreshError: string | null };
export const marketNames: Record<MarketKey, string> = { h2h: 'Moneyline', spreads: 'Spread', totals: 'Total', outrights: 'Futures' };
export const preferredSports = ['NFL', 'NBA', 'MLB', 'NHL', 'NCAAF', 'NCAAB', 'NCAAW', 'WNBA', 'Soccer', 'Tennis', 'MMA', 'Boxing', 'Cricket', 'Golf', 'Basketball', 'Hockey', 'Aussie Rules', 'Handball', 'Rugby'];

export function matchesCategory(sport: Pick<SportFeed, 'title' | 'group' | 'key'>, category: string) {
  if (category === 'All sports') return true;
  const prefixes:Record<string,string>={NFL:'americanfootball_nfl',NCAAF:'americanfootball_ncaaf',NCAAB:'basketball_ncaab',NCAAW:'basketball_wncaab',NBA:'basketball_nba',WNBA:'basketball_wnba',MLB:'baseball_mlb',NHL:'icehockey_nhl'};
  if(prefixes[category])return sport.key===prefixes[category] || sport.key.startsWith(prefixes[category]+'_');
  const groups: Record<string,string> = { Soccer:'Soccer', Tennis:'Tennis', MMA:'Mixed Martial Arts', Boxing:'Boxing', Cricket:'Cricket', Golf:'Golf', Basketball:'Basketball', Hockey:'Ice Hockey', 'Aussie Rules':'Aussie Rules', Handball:'Handball', Rugby:'Rugby' };
  if(category==='Rugby')return sport.group.startsWith('Rugby');
  return groups[category] ? sport.group===groups[category] : sport.title===category || sport.group===category;
}

export function impliedProbability(price: number): number | null {
  if (!Number.isFinite(price) || Math.abs(price) < 100) return null;
  return price > 0 ? 100 / (price + 100) * 100 : -price / (-price + 100) * 100;
}
export function formatOdds(price: number) { return price > 0 ? `+${price}` : `${price}`; }
export function isStale(timestamp: string | null | undefined, now = Date.now()) {
  const time = timestamp ? Date.parse(timestamp) : NaN;
  return !Number.isFinite(time) || now - time > 15 * 60 * 1000 || time > now + 60000;
}
// Compare only mutually exclusive moneyline/futures selections. A soccer draw is a real outcome.
export function marketFavorite(market?: Market): string | null {
  if (!market || !['h2h','outrights','spreads','totals'].includes(market.key) || market.outcomes.length < 2) return null;
  if(market.key==='spreads'&&(market.outcomes.length!==2||market.outcomes.some(o=>!Number.isFinite(o.point))||Math.abs(market.outcomes[0].point!+market.outcomes[1].point!)>0.00001))return null;
  if(market.key==='totals'&&(market.outcomes.length!==2||market.outcomes.some(o=>!Number.isFinite(o.point))||market.outcomes[0].point!==market.outcomes[1].point))return null;
  const probabilities = market.outcomes.map(outcome=>({name:outcome.name,probability:impliedProbability(outcome.price)}));
  if (probabilities.some(p=>p.probability===null)) return null;
  probabilities.sort((a,b)=>b.probability!-a.probability!);
  return probabilities[0].probability === probabilities[1].probability ? null : probabilities[0].name;
}
export function getBook(event: MarketEvent) { return event.bookmakers.find(book=>book.key==='fanatics'); }
export function getMarket(event: MarketEvent, key: MarketKey) { return getBook(event)?.markets.find(market=>market.key===key); }
export function formatEventTime(date: string) {
  if (!Number.isFinite(Date.parse(date))) return 'Time pending';
  return new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(date));
}
export function formatUpdated(date: string | null | undefined) {
  if (!date || !Number.isFinite(Date.parse(date))) return 'Not available';
  return new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(date))+' ET';
}
export function eventTitle(event: MarketEvent) {
  return event.home_team && event.away_team ? `${event.away_team} @ ${event.home_team}` : event.sport_title;
}
export function hasVerifiedAlignment(perspectives: {selection: string | null; available: boolean; stale: boolean}[]) {
  return perspectives.length===3 && perspectives.every(p=>p.available && !p.stale && !!p.selection && p.selection===perspectives[0].selection);
}

export function evaluateMarketAlignment(event:MarketEvent,key:MarketKey='h2h',now=Date.now()):LiveEvaluation {
  const published=event.intelligence?.[key];
  if(published){
    const stale=isStale(published.updated,now);
    let gcm=published.gcm;
    if(gcm?.approval?.approved&&(stale||now>=Date.parse(gcm.approval.expiresAt)||now>=Date.parse(gcm.expiresAt))){
      const reason='GCM approval freshness expired or the market quote is stale. Refresh before treating this as official approval.';
      gcm={...gcm,status:'INCOMPLETE',eligibleForAlignment:false,eligibleForFeatured:false,probability:null,edgePp:null,uncertainty:null,explanation:reason,approval:{...gcm.approval,approved:false,status:'INCOMPLETE',grade:null,category:null,reasons:[reason],candidates:gcm.approval.candidates.map(c=>({...c,approved:false,status:'INCOMPLETE',grade:null,category:null,gates:[...c.gates,{key:'expired',status:'MISSING',reason}],reasons:[reason]}))}};
    }
    const perspectives=published.perspectives.map(p=>({...p,available:p.key==='method'?p.available&&gcm?.status==='APPROVED'&&gcm.approval?.approved===true:p.available,stale:p.key==='market'?stale:p.key==='expert'?p.stale||now>=Date.parse(event.commence_time)||!!published.experts?.sources.some(source=>now>=Date.parse(source.expiresAt)):p.stale||!!gcm&&now>=Date.parse(gcm.approval?.expiresAt??gcm.expiresAt)}));
    const metricsFresh=!stale&&!!gcm&&now<Date.parse(gcm.approval?.expiresAt??gcm.expiresAt)&&now<Date.parse(gcm.expiresAt)&&(gcm.input.phase==='LIVE'||now<Date.parse(event.commence_time));
    return {...published,gcm,stale,perspectives,probability:metricsFresh?published.probability??null:null,edgePp:metricsFresh?published.edgePp??null:null,evaluated:perspectives.filter(p=>p.available&&!p.stale&&!!published.selection&&p.selection===published.selection).length,status:perspectives.every(p=>p.available&&!p.stale)?'EVALUATED':'INCOMPLETE',aligned:hasVerifiedAlignment(perspectives)};
  }
  const market=getMarket(event,key);
  const selection=marketFavorite(market);
  const updated=market?.last_update||getBook(event)?.last_update;
  const stale=isStale(updated,now);
  const price=market?.outcomes.find(outcome=>outcome.name===selection)?.price;
  const perspectives=[
    {key:'market',name:'Market Favorite',selection,available:!!selection,stale,source:'Fanatics via The Odds API',detail:selection?`Lowest-priced ${key==='outrights'?'futures':'moneyline'} selection. ${stale?'The original quote is stale and cannot count toward alignment.':'The source quote is within the freshness window.'}`:['spreads','totals'].includes(key)?'A spread or total is a separate market. Moneyline agreement cannot be carried over to it.':'No valid market favorite in the fetched prices.'},
    {key:'expert',name:'Expert Consensus',selection:null,available:false,stale:false,source:'Independent source pending',detail:'No verified analyst or independent model opinion is connected for this event. This check stays unevaluated.'},
    {key:'method',name:'The Green Check Method',selection:null,available:false,stale:false,source:'Statistical evaluation pending',detail:'Performance, form, injuries, and sport-specific metrics have not been evaluated by a validated model. This check stays unevaluated.'},
  ];
  const verified=perspectives.filter(item=>item.available&&!item.stale);
  return {perspectives,selection,updated,stale,implied:price===undefined?null:impliedProbability(price),evaluated:verified.length,aligned:hasVerifiedAlignment(perspectives),status:verified.length===3?'Evaluated':selection&&stale?'Stale market':'INCOMPLETE'};
}

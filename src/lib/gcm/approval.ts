import {getMarket,impliedProbability,type MarketEvent,type MarketKey} from '../markets';
import type {GcmEvaluation} from '../research-types';
import type {ApprovalGate,CandidateDecision,CategoryDecision,GcmApproval,GcmCategory,Prediction} from './decision-types';
export const approvalRuleVersion='gcm-approval-1';
type Policy={safeMinimum:number;minimumEdgePp:number;priceMin:number;priceMax:number};
export function approvalPolicy():Policy{
 const number=(name:string,fallback:number)=>{const n=Number(process.env[name]);return Number.isFinite(n)&&process.env[name]?.trim()?n:fallback;};
 return {safeMinimum:Math.min(99,Math.max(70,number('GCM_SAFE_MIN_PROBABILITY',70))),minimumEdgePp:Math.max(0.01,number('GCM_MIN_EDGE_PP',2)),priceMin:number('GCM_PRICE_MIN',-250),priceMax:number('GCM_PRICE_MAX',-120)};
}
const fresh=(timestamp:string|undefined,now:number,age=900000)=>!!timestamp&&Number.isFinite(Date.parse(timestamp))&&Date.parse(timestamp)<=now&&now-Date.parse(timestamp)<=age;
const gate=(key:string,status:ApprovalGate['status'],reason:string,evidenceIds?:string[]):ApprovalGate=>({key,status,reason,evidenceIds});
function category(category:GcmCategory,checks:ApprovalGate[]):CategoryDecision{return {category,status:checks.some(g=>g.status==='MISSING')?'INCOMPLETE':checks.every(g=>g.status==='PASS')?'QUALIFIED':'FAIL',gates:checks};}

// No market-favorite or expert-consensus value is an input to this decision function.
export function approveGcm(event:MarketEvent,key:MarketKey,research:GcmEvaluation,prediction:Prediction,policy=approvalPolicy(),now=Date.now()):GcmApproval{
 const input=research.input,market=getMarket(event,key);const phase=input.phase??(input.pregame?'PREGAME':null);
 const live=phase==='LIVE',age=live?30000:900000;
 const identity=input.eventId===event.id&&input.sport===event.sport_key&&input.startTime===event.commence_time&&input.home===event.home_team&&input.away===event.away_team&&research.market===key;
 const phaseVerified=phase==='PREGAME'?input.pregame&&now<Date.parse(event.commence_time):phase==='LIVE'&&now>=Date.parse(event.commence_time);
 const exactMarket=key==='h2h'&&research.line===null&&!!event.home_team&&!!event.away_team&&market?.outcomes.length===2&&new Set(market.outcomes.map(o=>o.name)).size===2&&market.outcomes.every(o=>[event.home_team,event.away_team].includes(o.name)&&o.point===undefined)&&!event.sport_key.startsWith('soccer_');
 const uniqueEvidence=new Set(input.evidence.map(e=>e.id)).size===input.evidence.length;
 const evidenceValid=(id:string)=>input.evidence.some(e=>e.id===id&&e.sourceUrl.startsWith('https://')&&fresh(e.observedAt,now,age));
 const bothSides=[input.home,input.away].every(side=>research.sideAssessments?.filter(a=>a.selection===side).length===1);
 const base:ApprovalGate[]=[
  gate('event_market',identity&&exactMarket?'PASS':'MISSING',identity&&exactMarket?'Exact event and two-outcome moneyline; both participants independently assessed.':'Exact event/line mapping or a compatible probability model for this market is missing. Soccer draws, spreads, totals and futures require distinct models.'),
  gate('event_state',phaseVerified?'PASS':'FAIL',phaseVerified?`Verified ${phase} evaluation window.`:'Event is started, suspended, final, delayed or its phase is unverified for this model.'),
  gate('research',bothSides&&research.status!=='ERROR'?'PASS':'MISSING',bothSides?'Independent supporting and opposing evidence recorded for both sides.':'Independent AI research for both participants is not available.'),
  gate('source_integrity',uniqueEvidence&&!!input.providerEventId&&fresh(input.retrievedAt,now)&&input.evidence.length>0&&input.evidence.every(e=>evidenceValid(e.id))?'PASS':'MISSING','Requires a unique provider event, uniquely identified evidence, HTTPS citations and fresh observations.'),
  gate('data_completeness',input.status==='AVAILABLE'&&!input.gaps.length?'PASS':'MISSING',input.gaps.length?input.gaps.join(' '):input.status==='AVAILABLE'?'Required statistical packet is available.':'Required sport-specific statistical packet is incomplete.'),
  gate('known_risks',input.risks.length?'FAIL':'PASS',input.risks.length?input.risks.join(' '):'No disqualifying risks reported in the verified input packet; separate clearance checks still apply.'),
  gate('model_validation',prediction.status==='VALIDATED'?'PASS':'MISSING',prediction.reason),
 ];
 for(const kind of ['lineup','injuries','workload','environment','integrity','settlement',...(live?['liveState']:[])] as const){
  const proof=input.verifications?.find(v=>v.kind===kind);
  const confirmed=kind==='lineup'?input.lineupConfirmed:kind==='injuries'?input.injuriesVerified:true;
  const valid=proof&&confirmed&&proof.evidenceIds.length>0&&proof.evidenceIds.every(evidenceValid)&&fresh(proof.observedAt,now,age);
  base.push(gate(kind,valid&&proof.status==='CLEAR'?'PASS':proof?.status==='BLOCKED'?'FAIL':'MISSING',valid&&proof.status==='CLEAR'?`Current ${kind} clearance is backed by cited provider evidence.`:proof?.status==='BLOCKED'?`Verified ${kind} concern disqualifies approval.`:`Current, cited ${kind} clearance is missing or stale.`,proof?.evidenceIds));
 }
 const candidates:CandidateDecision[]=[input.home,input.away].filter(Boolean).map(selection=>{
  const outcome=market?.outcomes.find(o=>o.name===selection),price=outcome?.price??null,implied=price===null?null:impliedProbability(price);
  const forecast=prediction.forecasts.find(f=>f.selection===selection),assessment=research.sideAssessments?.find(a=>a.selection===selection);
  const probability=forecast?.probability??null;
  const edge=probability===null||implied===null?null:probability-implied;
  const expectedReturn=probability===null||price===null||implied===null?null:probability/100*(price>0?price/100:100/-price)-(1-probability/100);
  const cited=assessment&&research.selection===selection&&assessment.supportingEvidenceIds.length>=3&&assessment.supportingEvidenceIds.every(evidenceValid)&&assessment.counterEvidenceIds.every(evidenceValid)&&!assessment.supportingEvidenceIds.some(id=>assessment.counterEvidenceIds.includes(id));
  const directionallySupported=forecast&&forecast.advantages>=Math.max(3,forecast.minimumAdvantages);
  const quoteFresh=!!market&&fresh(market.last_update,now,age);
  const numeric=forecast&&Number.isFinite(forecast.probability)&&forecast.probability>0&&forecast.probability<100&&forecast.uncertainty.low<=forecast.probability&&forecast.uncertainty.high>=forecast.probability&&forecast.phase===phase;
  const checks=[...base,
   gate('supporting_evidence',cited?'PASS':'MISSING',cited?'At least three distinct, cited supporting factors and separately identified opposing evidence.':'Sufficient independent supporting/opposing research evidence is missing.',assessment?.supportingEvidenceIds),
   gate('sport_performance',forecast?(directionallySupported&&forecast.recentFormVerified&&forecast.consistencyVerified&&forecast.sampleVerified?'PASS':'FAIL'):'MISSING',forecast?'Requires the reviewed sport-specific features, minimum samples, consistency, recent form and multiple measured matchup advantages.':'Reviewed sport-specific performance features and sample quality are not validated.'),
   gate('calibrated_estimate',forecast?(numeric?'PASS':'FAIL'):'MISSING',numeric?'Probability and historical calibration band are consistent with a reviewed exact-market model.':'A consistent calibrated estimate and supported uncertainty band are required.'),
   gate('current_price',implied!==null&&quoteFresh?'PASS':'MISSING',implied!==null&&quoteFresh?'Current Fanatics selection price is valid.':'Fresh, valid Fanatics pricing is missing.'),
   gate('positive_value',edge===null?'MISSING':edge>=policy.minimumEdgePp&&expectedReturn!==null&&expectedReturn>0?'PASS':'FAIL',edge===null?'No validated probability is available to calculate price edge.':`Edge ${edge.toFixed(2)} percentage points; minimum ${policy.minimumEdgePp.toFixed(2)}. Expected return must also be positive.`),
   gate('uncertainty_value',!forecast||implied===null?'MISSING':forecast.uncertainty.low>implied?'PASS':'FAIL','The historical calibration-band lower bound must exceed raw implied probability; point-estimate edge alone is insufficient.'),
  ];
  const priceInRange=price!==null&&price>=Math.min(policy.priceMin,policy.priceMax)&&price<=Math.max(policy.priceMin,policy.priceMax);
  const positive=checks.find(g=>g.key==='positive_value')!;
  const categories=[
   category('SAFE',[gate('safe_probability',probability===null?'MISSING':probability>=policy.safeMinimum?'PASS':'FAIL',`SAFE requires at least ${policy.safeMinimum}% validated probability (70% baseline, adjustable upward).`),gate('preferred_price',price===null?'MISSING':priceInRange?'PASS':'FAIL','SAFE uses the configured general price range; expensive favorites are not automatically safe.'),gate('pregame',phase==='PREGAME'?'PASS':'FAIL','SAFE is a pregame classification.'),positive]),
   category('VALUE',[positive,gate('pregame',phase==='PREGAME'?'PASS':'FAIL','VALUE is pregame; positive conservative price value is the documented exception to the general price preference.')]),
   category('BLOWOUT',[gate('margin_model',forecast?.margin?'PASS':'MISSING','BLOWOUT requires a separately reviewed score-margin model; moneyline probability is insufficient.'),gate('one_sided_script',forecast?.margin?(forecast.margin.low>=forecast.margin.threshold&&forecast.advantages>=4?'PASS':'FAIL'):'MISSING','The calibrated margin lower bound must exceed the reviewed sport-specific blowout margin and show four measured advantages.'),gate('pregame',phase==='PREGAME'?'PASS':'FAIL','BLOWOUT is pregame.'),positive]),
   category('LIVE CONTROL',[gate('live_context',phase==='LIVE'?'PASS':'MISSING','Requires verified live state, a live-trained model, fresh live prices and original matchup thesis integrity.'),positive]),
   category('UPSET RADAR',[gate('underdog_price',price===null?'MISSING':price>0?'PASS':'FAIL','UPSET RADAR requires an offered underdog price.'),gate('multiple_upset_signals',forecast?(forecast.advantages>=3?'PASS':'FAIL'):'MISSING','Requires three distinct measured performance/matchup advantages for the underdog.'),gate('pregame',phase==='PREGAME'?'PASS':'FAIL','UPSET RADAR is pregame.'),positive]),
  ];
  const priority:GcmCategory[]=['LIVE CONTROL','BLOWOUT','UPSET RADAR','SAFE','VALUE'];
  const qualified=priority.map(c=>categories.find(a=>a.category===c)!).find(c=>c.status==='QUALIFIED');
  const approved=checks.every(g=>g.status==='PASS')&&!!qualified;
  const hasVeto=checks.some(g=>g.status==='FAIL');
  const status:CandidateDecision['status']=approved?'APPROVED':hasVeto?'PASS':research.selection===selection&&cited?'LEAN':'INCOMPLETE';
  const reasons=checks.filter(g=>g.status!=='PASS').map(g=>g.reason);
  if(!qualified)reasons.push('No category has met all of its classification-specific conditions.');
  return {selection,status,approved,grade:approved?(probability!>=80&&edge!>=5&&forecast!.advantages>=4?'A+':'A'):null,category:approved?qualified!.category:null,price,impliedProbability:implied,probability,edgePp:edge,expectedReturn,uncertainty:forecast?.uncertainty??null,modelVersion:forecast?.modelVersion??null,gates:checks,categories,qualifyingEvidenceIds:[...new Set([...(assessment?.supportingEvidenceIds??[]),...(forecast?.featureEvidenceIds??[])])],reasons};
 });
 const approved=candidates.filter(c=>c.approved);
 // Mutually exclusive sides cannot both be officially approved. Conflicts fail closed.
 const chosen=approved.length===1?approved[0]:candidates.find(c=>c.selection===research.selection)??candidates[0];
 const green=approved.length===1;
 const expires=Math.min(Date.parse(research.expiresAt),now+age,prediction.expiresAt?Date.parse(prediction.expiresAt):Infinity,...(input.verifications??[]).map(v=>Date.parse(v.observedAt)+age),...input.evidence.map(e=>Date.parse(e.observedAt)+age),market?.last_update?Date.parse(market.last_update)+age:now+age);
 const selected=green?chosen:candidates.find(c=>c.selection===research.selection);
 return {ruleVersion:approvalRuleVersion,assessedAt:new Date(now).toISOString(),expiresAt:new Date(Number.isFinite(expires)?expires:now).toISOString(),status:approved.length>1?'PASS':chosen?.status??'INCOMPLETE',approved:green,selection:selected?.selection??null,grade:green?chosen!.grade:null,category:green?chosen!.category:null,price:selected?.price??null,probability:selected?.probability??null,edgePp:selected?.edgePp??null,uncertainty:selected?.uncertainty??null,modelVersion:selected?.modelVersion??null,reasons:approved.length>1?['Conflicting approval of mutually exclusive sides; no official GCM approval was issued.']:chosen?.reasons??['No verified participants available.'],candidates};
}

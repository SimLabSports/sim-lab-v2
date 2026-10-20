import {Check,Info} from 'lucide-react';
import type {GcmEvaluation} from '@/lib/research-types';
import {formatOdds,formatUpdated} from '@/lib/markets';
export function GcmDecision({evaluation,embedded=false}:{evaluation:GcmEvaluation;embedded?:boolean}){
 const decision=evaluation.approval;if(!decision)return null;
 const label=decision.approved?'QUALIFIED':decision.status==='LEAN'?'RESEARCH LEAN':decision.status==='INCOMPLETE'?'INSUFFICIENT DATA':'PASS';
 return <div aria-label="The Green Check Method · third alignment perspective">
  {!embedded&&<h3 className={decision.approved?'green':''}>{decision.approved&&<Check size={18}/>} The Green Check Method</h3>}
  <div className="metric-row"><span>Third perspective</span><strong>{label}</strong></div>
  <div className="metric-row"><span>Selection</span><strong>{decision.selection??'Not established'}</strong></div>
  <div className="metric-row"><span>Grade / category</span><strong>{decision.grade&&decision.category?`${decision.grade} · ${decision.category}`:'Not qualified'}</strong></div>
  <div className="metric-row"><span>Fanatics price</span><strong>{decision.price===null?'Unavailable':formatOdds(decision.price)}</strong></div>
  <div className="metric-row"><span>Validated probability / price edge</span><strong>{decision.probability===null?'Not validated':`${decision.probability.toFixed(1)}% · ${decision.edgePp===null?'No quote':`${decision.edgePp>=0?'+':''}${decision.edgePp.toFixed(1)} pp`}`}</strong></div>
  {decision.uncertainty&&<p>95% historical calibration band: {decision.uncertainty.low.toFixed(1)}–{decision.uncertainty.high.toFixed(1)}% ({decision.uncertainty.sample} held-out outcomes). This describes the historical calibration bin, not a guarantee or a game outcome interval.</p>}
  <p><Info size={13}/> The Green Check Method supplies the third check in Triple Green Check. Market Favorite, Expert Consensus and The Green Check Method must all qualify and support the same selection for 3/3 alignment.</p>
  {!decision.approved&&decision.reasons.slice(0,3).map((reason,index)=><p key={index}>{reason}</p>)}
  {decision.candidates.map(candidate=><details key={candidate.selection}>
   <summary>{candidate.selection} · {candidate.status==='LEAN'?'RESEARCH LEAN':candidate.status} · Gate details</summary>
   <p>Price {candidate.price===null?'unavailable':formatOdds(candidate.price)} · Probability {candidate.probability===null?'not validated':`${candidate.probability.toFixed(1)}%`} · Edge {candidate.edgePp===null?'unavailable':`${candidate.edgePp.toFixed(1)} pp`}.</p>
   {candidate.gates.map(g=><p key={g.key}><strong>{g.status}</strong> · {g.reason}</p>)}
   {candidate.categories.map(c=><details key={c.category}><summary>{c.category} · {c.status==='QUALIFIED'?'CATEGORY CONDITIONS MET':c.status}</summary>{c.gates.map((g,index)=><p key={index}><strong>{g.status}</strong> · {g.reason}</p>)}</details>)}
   {candidate.qualifyingEvidenceIds.map(id=>{const e=evaluation.input.evidence.find(e=>e.id===id);return e?<p key={id}><a href={e.sourceUrl} target="_blank" rel="noopener noreferrer">[{id}] {e.entity}: {e.metric} — {e.value}</a></p>:null;})}
  </details>)}
  <p>{decision.ruleVersion} · Assessed {formatUpdated(decision.assessedAt)} · {decision.modelVersion??'No validated probability model'}.</p>
 </div>;
}

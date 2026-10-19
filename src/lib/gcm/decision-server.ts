import 'server-only';
import type {MarketEvent,MarketKey} from '../markets';
import type {GcmEvaluation} from '../research-types';
import {approveGcm} from './approval';
import {reviewedPrediction} from './reviewed-models';

export function withApproval(event:MarketEvent,key:MarketKey,research:GcmEvaluation):GcmEvaluation{
 const prediction=reviewedPrediction(research.input,key);
 const approval=approveGcm(event,key,research,prediction);
 const green=research.status!=='ERROR'&&approval.approved&&Date.parse(approval.expiresAt)>Date.now();
 const status=research.status==='ERROR'?'ERROR':green?'APPROVED':approval.status==='PASS'?'PASS':research.selection&&research.sideAssessments?.length===2?'LEAN_ONLY':'INCOMPLETE';
 const summary=approval.reasons.slice(0,2).join(' ');
 const explanation=research.status==='ERROR'?research.explanation:green?`Official GCM Green Check: ${approval.selection} · ${approval.grade} · ${approval.category}. Every required approval gate passed. This is independent of expert and market alignment.`:status==='PASS'?`GCM PASS. ${summary}`:status==='LEAN_ONLY'?`Research lean: ${research.selection}. Official GCM approval withheld: ${summary}`:`Insufficient data for official GCM approval. ${research.explanation} ${summary}`;
 return {...research,status,selection:green?approval.selection:research.selection,probability:approval.probability,edgePp:approval.edgePp,uncertainty:approval.uncertainty,eligibleForAlignment:green,eligibleForFeatured:false,explanation,approval:{...approval,approved:green,status:green?'APPROVED':approval.status}};
}

import 'server-only';
import type {MarketEvent,MarketKey} from '../markets';
import type {GcmEvaluation} from '../research-types';
import {approveGcm} from './approval';
import {reviewedPrediction} from './reviewed-models';

export function withApproval(event:MarketEvent,key:MarketKey,research:GcmEvaluation):GcmEvaluation{
 const prediction=reviewedPrediction(research.input,key);
 const approval=approveGcm(event,key,research,prediction);
 const green=research.status!=='ERROR'&&approval.approved&&Date.parse(approval.expiresAt)>Date.now();
 const status=research.status==='ERROR'?'ERROR':green?'APPROVED':approval.status==='PASS'?'PASS':research.selection&&[research.input.home,research.input.away].every(side=>research.sideAssessments?.filter(a=>a.selection===side).length===1)?'LEAN_ONLY':'INCOMPLETE';
 const summary=[...new Set([...research.input.gaps,...approval.reasons])].slice(0,2).join(' ');
 const explanation=research.status==='ERROR'?research.explanation:green?`The Green Check Method qualifies for ${approval.selection} · ${approval.grade} · ${approval.category}. All method requirements passed. This supplies the third perspective; 3/3 requires Market Favorite and Expert Consensus to support the same selection.`:status==='PASS'?`The Green Check Method: PASS. ${summary}`:status==='LEAN_ONLY'?`Research lean: ${research.selection}. The Green Check Method has not qualified for the third alignment check: ${summary}`:`Insufficient data to qualify The Green Check Method for the third alignment check. ${summary}`;
 return {...research,status,selection:green?approval.selection:research.selection,probability:approval.probability,edgePp:approval.edgePp,uncertainty:approval.uncertainty,eligibleForAlignment:green,eligibleForFeatured:false,explanation,approval:{...approval,approved:green,status:green?'APPROVED':approval.status}};
}

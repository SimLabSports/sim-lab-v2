import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {getStatistics} from '../providers/statistics';
import {bdlSport,bdlTeamResearchSports} from '../providers/balldontlie-sports';
import {database,databaseFailure} from '../server/database';
import {providerSucceeded,providerFailed} from '../server/provider-http';
import {openAiFailure} from './openai-errors';
import {withApproval} from './decision-server';
import {admitScan} from './scan-budget';
import {GREEN_CHECK_RESEARCH_INSTRUCTIONS} from './green-check-instructions';
import type {GcmEvaluation,ResearchInput} from '../research-types';
import type {MarketEvent,MarketKey} from '../markets';
const version='gcm-grounded-research-4';
const sideSchema=z.object({selection:z.string(),supportingEvidenceIds:z.array(z.string()).max(12),counterEvidenceIds:z.array(z.string()).max(12)}).strict();
const decisionSchema=z.object({selection:z.string().nullable(),assessments:z.array(sideSchema).length(2),riskIndices:z.array(z.number().int().min(0)).max(30)}).strict();
const busy=new Map<string,Promise<GcmEvaluation>>();
function incomplete(event:MarketEvent,key:MarketKey,line:number|null,input:ResearchInput,reason:string):GcmEvaluation{return {id:randomUUID(),eventId:event.id,sport:event.sport_key,market:key,line,selection:null,status:input.status==='ERROR'?'ERROR':'INCOMPLETE',probability:null,edgePp:null,uncertainty:null,explanation:reason,factors:[],risks:[...input.risks,...input.gaps],modelVersion:version,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+300000).toISOString(),eligibleForAlignment:false,eligibleForFeatured:false,provider:input.provider,input};}
export async function storedGcm(event:MarketEvent,key:MarketKey,line:number|null):Promise<GcmEvaluation|null>{
 try{const result=await database().query<{record:GcmEvaluation}>('SELECT record FROM gcm_evaluations WHERE event_id=$1 AND sport=$2 AND market=$3 AND expires_at>now() ORDER BY created_at DESC LIMIT 20',[event.id,event.sport_key,key]);return result.rows.map(row=>row.record).find(row=>row.line===line&&row.input.startTime===event.commence_time&&row.modelVersion.startsWith(version))??null;}catch{return null;}
}
async function record(evaluation:GcmEvaluation){
 const client=await database().connect();
 try{await client.query('BEGIN');await client.query('INSERT INTO gcm_evaluations(id,event_id,sport,market,created_at,expires_at,record) VALUES($1,$2,$3,$4,$5,$6,$7)',[evaluation.id,evaluation.eventId,evaluation.sport,evaluation.market,evaluation.createdAt,evaluation.expiresAt,JSON.stringify(evaluation)]);await client.query('INSERT INTO intelligence_audit(action,record_id) VALUES($1,$2)',['gcm_evaluated',evaluation.id]);await client.query('COMMIT');}catch{await client.query('ROLLBACK');throw new Error('The research audit could not be persisted. No GCM evaluation was published.');}finally{client.release();}
}
export async function evaluateGcm(event:MarketEvent,key:MarketKey,line:number|null,visitor='administrator'):Promise<GcmEvaluation>{
 const identity=`${event.sport_key}:${event.id}:${key}:${line}`;const pending=busy.get(identity);if(pending)return pending;
 const task:Promise<GcmEvaluation>=(async():Promise<GcmEvaluation>=>{
  const existing=await storedGcm(event,key,line);if(existing)return withApproval(event,key,existing);
  const input=await getStatistics(event);
  let evaluation=incomplete(event,key,line,input,'Verified sport-specific inputs are incomplete. No independent probability or edge is available.');
  const save=async(result:GcmEvaluation)=>{
   result=withApproval(event,key,result);
   result={...result,createdAt:new Date().toISOString(),expiresAt:new Date(Math.min(Date.parse(result.expiresAt),Date.parse(event.commence_time))).toISOString()};
   if(!process.env.DATABASE_URL)return result;
   try{await record(result);return result;}catch(error){const reason=databaseFailure(error);return {...result,status:'ERROR' as const,errorCode:reason.code,selection:null,factors:[],eligibleForAlignment:false,eligibleForFeatured:false,explanation:`Research storage is unavailable: ${reason.message} No auditable result was published.`};}
  };
  if(!input.pregame){evaluation.explanation='Pregame GCM is unavailable for started, delayed, suspended, canceled, or unmatched events.';return save(evaluation);}
  if(input.status==='ERROR'||input.evidence.length<6){evaluation.explanation=`Insufficient verified statistical evidence. ${input.gaps.join(' ')}`;return save(evaluation);}
  if(!process.env.OPENAI_API_KEY||!process.env.OPENAI_MODEL){evaluation.explanation='Real statistics retrieved. Configure OPENAI_API_KEY and OPENAI_MODEL for server-side GCM research interpretation.';return save(evaluation);}
  if(!process.env.DATABASE_URL){evaluation.explanation='Real statistics retrieved. Configure DATABASE_URL and apply the migration before publishing auditable AI evaluations.';return evaluation;}
  // Partial verified statistics can support qualitative research; they cannot pass approval gates.
  if(!(['baseball_mlb','americanfootball_nfl','basketball_nba','icehockey_nhl'].includes(event.sport_key)||bdlTeamResearchSports.has(bdlSport(event.sport_key)??''))||key!=='h2h'){evaluation.explanation=`Verified GCM research features are not mapped for ${event.sport_key} / ${key}. Moneyline research is never transferred to spread, total or futures markets.`;return save(evaluation);}
  const allowedIds=new Set(input.evidence.map(item=>item.id));
  const risks=[...input.risks,...input.gaps];
  const evidenceIds={type:'array',maxItems:12,items:{type:'string',enum:[...allowedIds]}};
  const schema={type:'object',properties:{selection:{type:['string','null'],enum:[input.home,input.away,null]},assessments:{type:'array',minItems:2,maxItems:2,items:{type:'object',properties:{selection:{type:'string',enum:[input.home,input.away]},supportingEvidenceIds:evidenceIds,counterEvidenceIds:evidenceIds},required:['selection','supportingEvidenceIds','counterEvidenceIds'],additionalProperties:false}},riskIndices:{type:'array',maxItems:30,items:{type:'integer',minimum:0}}},required:['selection','assessments','riskIndices'],additionalProperties:false};
  try{await admitScan(`${identity}:${event.commence_time}`,visitor);}catch(error){
   const message=error instanceof Error?error.message:'';
   const busy=message.startsWith('This matchup');const limited=message.startsWith('The research scan limit');
   const reason=busy||limited?{code:busy?'GCM_SCAN_BUSY':'GCM_SCAN_LIMIT',message}:databaseFailure(error);
   return save({...evaluation,status:'ERROR',errorCode:reason.code,explanation:`Research scan admission: ${reason.message}`,expiresAt:new Date(Date.now()+90000).toISOString()});
  }
  try{
   const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},cache:'no-store',signal:AbortSignal.timeout(45000),body:JSON.stringify({model:process.env.OPENAI_MODEL,store:false,max_output_tokens:1800,instructions:GREEN_CHECK_RESEARCH_INSTRUCTIONS,input:JSON.stringify({event:{sport:event.sport_key,home:input.home,away:input.away,start:input.startTime,market:key},evidence:input.evidence,risks}),text:{format:{type:'json_schema',name:'gcm_grounded_research',strict:true,schema}}})});
   if(!response.ok){
    const providerError=await response.json().catch(()=>null);
    const reason=openAiFailure(response.status,providerError?.error?.code);
    providerFailed('OpenAI GCM',reason.message);
    return save({...evaluation,status:'ERROR',errorCode:reason.code,explanation:reason.message,expiresAt:new Date(Date.now()+90000).toISOString()});
   }
   const payload=await response.json();
   const raw=payload.output?.flatMap((item:{content?:{type:string;text?:string}[]})=>item.content??[]).filter((part:{type:string})=>part.type==='output_text').map((part:{text:string})=>part.text).join('');
   if(payload.status!=='completed'||!raw)throw new Error('The AI provider did not complete a valid grounded response.');
   const decision=decisionSchema.parse(JSON.parse(raw));
   if(decision.selection!==null&&![input.home,input.away].includes(decision.selection))throw new Error('Invalid research selection.');
   if(new Set(decision.assessments.map(a=>a.selection)).size!==2||decision.assessments.some(a=>![input.home,input.away].includes(a.selection)))throw new Error('The AI did not independently assess both exact participants.');
   if(decision.assessments.some(a=>[...a.supportingEvidenceIds,...a.counterEvidenceIds].some(id=>!allowedIds.has(id))||a.supportingEvidenceIds.some(id=>a.counterEvidenceIds.includes(id)))||decision.riskIndices.some(index=>index>=risks.length))throw new Error('The AI response referenced missing or contradictory evidence IDs.');
   const sideAssessments=decision.assessments.map(a=>({...a,supportingEvidenceIds:[...new Set(a.supportingEvidenceIds)],counterEvidenceIds:[...new Set(a.counterEvidenceIds)]}));
   const chosen=sideAssessments.find(a=>a.selection===decision.selection);
   const supported=chosen?.supportingEvidenceIds??[];const selected=decision.selection&&supported.length>=3?decision.selection:null;
   const factors=supported.map(id=>{const evidence=input.evidence.find(item=>item.id===id)!;return {text:`${evidence.entity}: ${evidence.metric} — ${evidence.value} (${evidence.period}).`,evidenceIds:[id]};});
   const model=process.env.OPENAI_MODEL;const hash=createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0,16);
   const age=Math.max(1,Math.min(60,Number(process.env.GCM_MAX_AGE_MINUTES)||15))*60000;
   evaluation={...evaluation,sideAssessments,selection:selected,status:'LEAN_ONLY',explanation:selected?`Research lean: ${selected}. The AI selected the cited statistical evidence below. Probability is unavailable; the research assessment has not been calibrated and cannot qualify a featured candidate.`:'The grounded statistical assessment does not establish a supported selection. Probability is unavailable.',factors,risks:[...risks,...(chosen?.counterEvidenceIds??[]).map(id=>{const e=input.evidence.find(item=>item.id===id)!;return `Counter-evidence: ${e.entity} ${e.metric} = ${e.value}.`;})],modelVersion:`${version}:${model}:${hash}`,eligibleForAlignment:false,eligibleForFeatured:false,expiresAt:new Date(Math.min(Date.now()+age,Date.parse(event.commence_time))).toISOString()};
   providerSucceeded('OpenAI GCM');return save(evaluation);
  }catch(error){
   const invalid=error instanceof z.ZodError;const malformed=error instanceof SyntaxError;
   const reason=invalid?'The AI research response failed the evidence schema checks. No unsupported result was published.':malformed?'The AI research response was not valid structured JSON. No unsupported result was published.':error instanceof Error&&/^(OpenAI|The AI|The research|This matchup)/.test(error.message)?error.message:'The OpenAI research request could not be processed. Check provider connectivity and the configured model. No estimate was substituted.';
   providerFailed('OpenAI GCM',reason);
   return save({...evaluation,status:'ERROR',errorCode:invalid?'OPENAI_RESPONSE_VALIDATION_FAILED':malformed?'OPENAI_RESPONSE_INVALID_JSON':'OPENAI_RESPONSE_FAILED',expiresAt:new Date(Math.min(Date.now()+90000,Date.parse(event.commence_time))).toISOString(),explanation:reason});
  }
 })();busy.set(identity,task);try{return await task;}finally{busy.delete(identity);}
}

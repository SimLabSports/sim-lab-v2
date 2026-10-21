import {bettingProsAccess} from '@/lib/providers/bettingpros';
import {sportsApiProAccess} from '@/lib/providers/sportsapipro';
import {bdlAccess} from '@/lib/providers/balldontlie-http';
import {database} from '@/lib/server/database';
import {databaseDiagnostics} from '@/lib/server/database-diagnostics';
import {NextResponse} from 'next/server';
import {providerHealth} from '@/lib/server/provider-http';
import type {GcmEvaluation} from '@/lib/research-types';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=30;
export async function GET(){
 const [storage,ballDontLie,bettingPros,sportsApiPro]=await Promise.all([databaseDiagnostics(),bdlAccess(),bettingProsAccess(),sportsApiProAccess()]);
 const ai={configured:!!process.env.OPENAI_API_KEY&&!!process.env.OPENAI_MODEL,...providerHealth('OpenAI GCM'),lastAttemptAt:null as string|null,lastAssessmentStatus:null as string|null,lastErrorCode:null as string|null,lastPersistedEvaluationId:null as string|null,storageReadVerified:false};
 let experts={provider:'Verified administrator-curated picks',storedPicks:null as number|null,currentlyUnexpiredPicks:null as number|null,minimumIndependentSources:3,licensedAutomaticFeedConnected:false};
 if(storage.tablesReady){
  const checks=await Promise.allSettled([
   database().query<{record:GcmEvaluation}>("SELECT record FROM public.gcm_evaluations ORDER BY created_at DESC LIMIT 1"),
   database().query<{record:GcmEvaluation}>("SELECT record FROM public.gcm_evaluations WHERE record->>'status' IN ('LEAN_ONLY','APPROVED','PASS','INCOMPLETE') AND record->>'modelVersion' LIKE 'gcm-grounded-research-%:%' ORDER BY created_at DESC LIMIT 1"),
   database().query<{stored:number;current:number}>("SELECT count(*)::int AS stored,count(*) FILTER (WHERE retracted=false AND expires_at>now())::int AS current FROM public.expert_picks"),
  ]);
  const latest=checks[0],success=checks[1],picks=checks[2];
  if(latest.status==='fulfilled'){
   ai.storageReadVerified=true;
   const evaluation=latest.value.rows[0]?.record;
   if(evaluation){ai.lastAttemptAt=evaluation.createdAt;ai.lastAssessmentStatus=evaluation.status;ai.lastPersistedEvaluationId=evaluation.id;if(evaluation.status==='ERROR'){ai.lastError=evaluation.explanation;ai.lastErrorCode=evaluation.errorCode??null;}}
  }
  if(success.status==='fulfilled'&&success.value.rows[0])ai.lastSuccessAt=success.value.rows[0].record.createdAt;
  if(picks.status==='fulfilled')experts={...experts,storedPicks:picks.value.rows[0].stored,currentlyUnexpiredPicks:picks.value.rows[0].current};
 }
 return NextResponse.json({ballDontLie,bettingPros,sportsApiPro,odds:{configured:!!process.env.ODDS_API_KEY,...providerHealth('The Odds API')},mlbStatistics:{provider:'MLB Stats API',...providerHealth('MLB Stats API')},nflStatistics:{provider:'ESPN NFL',requiresKey:false,...providerHealth('ESPN NFL')},licensedStatistics:{configured:!!process.env.SPORTSDATAIO_API_KEY||['NFL','NBA','NHL','MLB'].some(sport=>!!process.env[`SPORTSDATAIO_${sport}_KEY`]),realDataConfirmed:process.env.SPORTSDATAIO_REAL_DATA_CONFIRMED==='true',...providerHealth('SportsDataIO')},ai,expertStorage:storage,experts,admin:{configured:(process.env.SIMLAB_ADMIN_TOKEN?.length??0)>=32}},{headers:{'Cache-Control':'no-store'}});
}

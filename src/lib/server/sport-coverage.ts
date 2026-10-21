import {bettingProsSport} from '../providers/bettingpros';
import 'server-only';
import {majorSportKeys,sportProfile} from '../sport-profiles';
import {reviewedModelInventory} from '../gcm/reviewed-models';
import {bdlCoverage} from '../providers/balldontlie-sports';
import {database} from './database';
import type {MarketResponse} from '../markets';
import type {GcmEvaluation} from '../research-types';
import sourceAudit from '../../../data/multisport-source-audit.json';
import historyAudit from '../../../data/multisport-history-audit.json';
export async function sportCoverage(catalog:MarketResponse){
 let latest:GcmEvaluation[]=[],storage='NOT_CONFIGURED';
 if(process.env.DATABASE_URL)try{const rows=await database().query<{record:GcmEvaluation}>('SELECT DISTINCT ON (sport) record FROM gcm_evaluations ORDER BY sport,created_at DESC');latest=rows.rows.map(r=>r.record);storage='READ_VERIFIED';}catch{storage='UNAVAILABLE';}
 const now=Date.now(),models=reviewedModelInventory(now);
 const keys=[...new Set([...majorSportKeys,...catalog.sports.filter(s=>sportProfile(s.key)).map(s=>s.key)])];
 return {storage,asOf:new Date(now).toISOString(),sports:keys.map(key=>{
  const profile=sportProfile(key)!,league=catalog.sports.find(s=>s.key===key),bdl=bdlCoverage(key),saved=latest.find(g=>g.sport===key),currentModels=models.filter(m=>m.sport===key&&m.current);
  const audit=sourceAudit.sports.find(a=>a.sport===key);const soccer=profile.family==='soccer';const field=profile.research==='FIELD';
  const modelReason=currentModels.length?'A reviewed model is deployed; exact current feature ranges and all approval gates still apply.':soccer?'A validated three-outcome regulation-time model is missing.':field?'A validated multi-runner tournament/field and dead-heat model is missing.':'An exact sport/market historical model with chronological calibration is not deployed.';
  const missing=[...profile.required,modelReason,'Cited current lineup/participant, injury, workload, environment, integrity and bookmaker-settlement clearances','At least three independent, current, comparable expert/model selections with display rights'];
  if(!profile.espn&&key!=='baseball_mlb')missing.unshift('Verified sport-specific performance source and adapter');
  return {key,title:league?.title??profile.label,family:profile.family,
   odds:{provider:'The Odds API',bookmaker:'fanatics',credentialConfigured:!!process.env.ODDS_API_KEY,catalogActive:!!league,currentWorkerFetchedAt:league?.fetchedAt??null,currentWorkerEvents:league?.events.length??0,currentWorkerPricedEvents:league?.events.filter(e=>e.bookmakers.some(b=>b.key==='fanatics'&&b.markets.some(m=>m.key==='h2h'&&m.outcomes.length>=2))).length??0,status:!league?'INACTIVE_IN_CATALOG':league.fetchedAt?'FETCHED_SNAPSHOT':'NOT_FETCHED_IN_THIS_WORKER',auditSnapshot:audit?.marketSnapshot??null},
   statistics:{publicSource:key==='baseball_mlb'?'MLB Stats API':profile.espn?`https://site.api.espn.com/apis/site/v2/sports/${profile.espn}/`:null,publicSourceNeedsCredential:false,bettingPros:{credentialConfigured:!!process.env.BETTINGPROS_API_KEY,providerSport:bettingProsSport(key),uses:key==='baseball_mlb'?['exact event state','confirmed/projected batting orders']:key==='basketball_ncaab'?['exact event state','dated pace and efficiency']:['exact event state where uniquely matched'],limits:'Aggregate picks are not individual expert votes; external projections are not independent GCM forecasts.'},ballDontLie:bdl,ballDontLieCredentialConfigured:!!process.env.BALLDONTLIE_API_KEY,lastSourceAudit:audit??null,auditIsCurrent:!!audit&&now-Date.parse(audit.checkedAt)<900000},
   historicalModeling:{status:currentModels.length?'BOUNDED_MODEL_DEPLOYED':profile.espn&&profile.research==='TEAM'?'RESULT_COLLECTION_AVAILABLE_NOT_CALIBRATED':profile.research==='TENNIS'?'CURRENT_DRAW_RESULTS_ONLY':profile.research==='COMBAT'?'BOUT_RECORDS_ONLY_WHERE_MATCHED':'VERIFIED_HISTORY_REQUIRED',models:currentModels,resultCollection:historyAudit.datasets.find(d=>d.sport===key)??null,reason:modelReason},
   gcm:{adapter:profile.research,aiCredentialConfigured:!!process.env.OPENAI_API_KEY,aiModelConfigured:!!process.env.OPENAI_MODEL,researchMapped:!!profile.espn&&!field,lastEvaluation:saved?{eventId:saved.eventId,status:saved.status,createdAt:saved.createdAt,expiresAt:saved.expiresAt,fresh:Date.parse(saved.expiresAt)>now,currentEngine:saved.modelVersion.startsWith('gcm-grounded-research-9'),provider:saved.provider,evidenceCount:saved.input.evidence.length,assessedSelections:saved.sideAssessments?.map(a=>a.selection)??[],approved:saved.approval?.approved===true&&Date.parse(saved.approval.expiresAt)>now}:null},
   expertConsensus:{service:'Shared verified-source service',markets:['h2h','spreads','totals','outrights'],minimumIndependentSources:3,automaticLicensedFeedConnected:false,status:'REQUIRES_EVENT_SPECIFIC_VERIFIED_PICKS',adminImportCredentialConfigured:(process.env.SIMLAB_ADMIN_TOKEN?.length??0)>=32},
   tripleGreenCheck:{status:'INCOMPLETE',reason:'Each event must have a current market selection, three qualifying independent expert sources and approved sport-specific GCM for the same exact outcome. Research availability does not imply approval.'},
   missing,credentials:{requiredForPublicResearch:[],market:'ODDS_API_KEY',optionalMultiSportStats:'BALLDONTLIE_API_KEY',ai:['OPENAI_API_KEY','OPENAI_MODEL'],persistence:'DATABASE_URL',expertImport:'SIMLAB_ADMIN_TOKEN',automaticExpertFeed:'No licensed automatic adapter is configured; a provider contract and verified source-level payload are required.'},
  };
 })};
}

import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {formFeatures,rollingForm} from '../src/lib/gcm/form-features.ts';
import {fitLogistic,predictLogistic,scoreForecasts} from '../src/lib/gcm/calibration.ts';

const [inputPath='.cache/gcm/baseball_mlb-history.json']=process.argv.slice(2);
const raw=await readFile(inputPath,'utf8');const history=JSON.parse(raw);
if(history.sport!=='baseball_mlb'||!Array.isArray(history.games))throw new Error('A verified official MLB completion-time history packet is required.');
const seen=new Set(),teams=new Map(),rows=[];let insufficient=0;
for(const g of [...history.games].sort((a,b)=>Date.parse(a.startTime)-Date.parse(b.startTime))){
 if(seen.has(g.id)||!Number.isFinite(Date.parse(g.availableAt))||Date.parse(g.availableAt)<=Date.parse(g.startTime)||Date.parse(g.availableAt)>Date.now()||!g.sourceUrl.startsWith('https://statsapi.mlb.com/')||![g.homeScore,g.awayScore].every(n=>Number.isFinite(n)&&n>=0))throw new Error('Invalid source, time, outcome or duplicate game.');seen.add(g.id);
 const identities=[g.homeId,g.awayId].map(id=>`${g.season}:${id}`);const features=identities.map((key,index)=>rollingForm(teams.get(key)??[],index===0?g.homeId:g.awayId,g.season,Date.parse(g.startTime)));
 if(features.every(Boolean)&&g.homeScore!==g.awayScore){
  const x=features[0].values.map((n,i)=>n-features[1].values[i]);
  if(features.some(f=>Date.parse(f.availableThrough)>=Date.parse(g.startTime))||x.some(n=>!Number.isFinite(n)))throw new Error('Historical feature leakage or non-finite feature.');
  rows.push({id:g.id,startTime:g.startTime,settledAt:g.availableAt,sourceUrl:g.sourceUrl,x,y:g.homeScore>g.awayScore?1:0,absoluteFeatures:features.map(f=>f.values),featureGameIds:features.map(f=>f.gameIds)});
 }else insufficient++;
 for(const key of identities){const previous=teams.get(key)??[];previous.push(g);teams.set(key,previous);}
}
const trainBefore=Date.parse('2024-01-01T00:00:00Z'),calibrationBefore=Date.parse('2025-01-01T00:00:00Z');
const train=rows.filter(r=>Date.parse(r.startTime)<trainBefore&&Date.parse(r.settledAt)<trainBefore);
const calibration=rows.filter(r=>Date.parse(r.startTime)>=trainBefore&&Date.parse(r.startTime)<calibrationBefore&&Date.parse(r.settledAt)<calibrationBefore);
const holdout=rows.filter(r=>Date.parse(r.startTime)>=calibrationBefore);
if(train.length<500||calibration.length<150||holdout.length<150)throw new Error('Insufficient chronological train/calibration/holdout samples.');
const fit=fitLogistic(train);const logit=p=>Math.log(p/(1-p));
const calibrator=fitLogistic(calibration.map(r=>({x:[logit(predictLogistic(fit,r.x))],y:r.y})));
const forecast=rs=>rs.map(r=>({id:r.id,p:predictLogistic(calibrator,[logit(predictLogistic(fit,r.x))]),y:r.y}));
const predictions=forecast(holdout),metrics=scoreForecasts(predictions);const base=train.reduce((sum,r)=>sum+r.y,0)/train.length;
const baseline=scoreForecasts(holdout.map(r=>({p:base,y:r.y})));
// Independent scoring calculation checks the shared metric implementation.
const independentBrier=predictions.reduce((sum,r)=>sum+Math.pow(r.y-r.p,2),0)/predictions.length;
const independentLogLoss=predictions.reduce((sum,r)=>sum-Math.log(r.y?r.p:1-r.p),0)/predictions.length;
if(Math.abs(independentBrier-metrics.brier)>1e-12||Math.abs(independentLogLoss-metrics.logLoss)>1e-12)throw new Error('Independent holdout metric audit failed.');
const bySeason=Object.fromEntries([2025,2026].map(year=>{const selected=holdout.filter(r=>new Date(r.startTime).getUTCFullYear()===year);return [year,{count:selected.length,model:scoreForecasts(forecast(selected)),baseline:scoreForecasts(selected.map(r=>({p:base,y:r.y})))}];}));
const passes=metrics.brier<baseline.brier&&metrics.logLoss<baseline.logLoss&&metrics.calibrationError<=.05&&Object.values(bySeason).every(s=>s.count>=150&&s.model.brier<s.baseline.brier&&s.model.logLoss<s.baseline.logLoss);
const now=new Date().toISOString();
const boundedFeatures=formFeatures.map((f,i)=>{const values=train.flatMap(r=>r.absoluteFeatures.map(v=>v[i]));return {...f,minimumValue:Math.max(f.minimumValue,Math.floor(Math.min(...values)*1000)/1000),maximumValue:Math.min(f.maximumValue,Math.ceil(Math.max(...values)*1000)/1000)};});
const model={kind:'WIN_LOGISTIC',id:'mlb-official-scoring-form',version:'1',sport:'baseball_mlb',market:'h2h',phase:'PREGAME',targetDefinition:'homeWin',features:boundedFeatures,fit,calibrator,minimumAdvantages:3,minimumBinSample:50,training:{train:train.length,calibration:calibration.length,holdout:holdout.length,trainBefore:new Date(trainBefore).toISOString(),calibrationBefore:new Date(calibrationBefore).toISOString(),settledThrough:new Date(Math.max(...holdout.map(r=>Date.parse(r.settledAt)))).toISOString(),inputSha256:createHash('sha256').update(raw).digest('hex')},holdout:{...metrics,baselineBrier:baseline.brier,baselineLogLoss:baseline.logLoss},review:{approved:false,reviewer:'Pending documented code and held-out statistical review',reference:'https://github.com/SimLabSports/sim-lab-v2/blob/main/docs/gcm-model-validation.md',reviewedAt:now,expiresAt:new Date(Date.now()+30*86400000).toISOString()}};
const report={createdAt:now,sport:history.sport,sourceGames:history.games.length,eligibleRecords:rows.length,insufficientSamples:insufficient,counts:{train:train.length,calibration:calibration.length,holdout:holdout.length},holdout:metrics,baseline,bySeason,passesEngineeringChecks:passes,liveApproved:false,model,limitations:['Reconstructed rolling features, not archived betting picks or pregame injury snapshots.','Game availability bounds are derived from official first pitch, duration and delay plus 60 minutes; ambiguous/resumed games excluded.','Scoring-form baseline omits player-level pitching, lineup, park and weather predictors. These require separate current risk checks.','No ROI, profitability, expert consensus or performance guarantee is claimed.','Promotion requires documented model review, matched live feature extraction, current approval gates and supported market settlement.']};
await writeFile(resolve('.cache/gcm/baseball_mlb-form-report.json'),JSON.stringify(report,null,2));
await writeFile(resolve('.cache/gcm/baseball_mlb-holdout.json'),JSON.stringify({predictions,rows:holdout.map(r=>({id:r.id,startTime:r.startTime,settledAt:r.settledAt,x:r.x,y:r.y,featureGameIds:r.featureGameIds}))}));
console.log(JSON.stringify({sport:history.sport,counts:report.counts,holdout:{brier:metrics.brier,logLoss:metrics.logLoss,calibrationError:metrics.calibrationError},baseline:{brier:baseline.brier,logLoss:baseline.logLoss},passesEngineeringChecks:passes,bySeason:Object.fromEntries(Object.entries(bySeason).map(([year,s])=>[year,{count:s.count,brier:s.model.brier,baselineBrier:s.baseline.brier}]))}));

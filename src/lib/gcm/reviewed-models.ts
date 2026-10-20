import 'server-only';
import {z} from 'zod';
import registry from '../../../data/gcm-reviewed-models.json';
import type {ResearchInput} from '../research-types';
import type {Forecast,Prediction} from './decision-types';

const finite=z.number().finite();const unit=finite.min(0).max(1);
const fit=z.object({weights:z.array(finite).min(2),mean:z.array(finite).min(1),scale:z.array(finite.positive()).min(1)});
const feature=z.object({metric:z.string().min(1),group:z.enum(['RECENT_FORM','MATCHUP','CONSISTENCY','SAMPLE','EFFICIENCY','STARTER','CONTEXT','LIVE_STATE']),direction:z.union([z.literal(-1),z.literal(0),z.literal(1)]),minimumValue:finite,maximumValue:finite,minimumSample:finite.nonnegative().optional()});
const base={id:z.string().min(1),version:z.string().min(1),sport:z.string().min(1),market:z.literal('h2h'),phase:z.enum(['PREGAME','LIVE']),targetDefinition:z.string().min(1),features:z.array(feature).min(4),fit,minimumAdvantages:z.number().int().min(2),minimumBinSample:z.number().int().min(50),training:z.object({train:z.number().int().min(500),calibration:z.number().int().min(150),holdout:z.number().int().min(150),trainBefore:z.string().datetime(),calibrationBefore:z.string().datetime(),settledThrough:z.string().datetime(),inputSha256:z.string().regex(/^[a-f0-9]{64}$/)}),review:z.object({approved:z.literal(true),reviewer:z.string().min(1),reference:z.string().url().startsWith('https://'),reviewedAt:z.string().datetime(),expiresAt:z.string().datetime()})};
const win=z.object({...base,kind:z.literal('WIN_LOGISTIC'),targetDefinition:z.literal('homeWin'),calibrator:fit,holdout:z.object({brier:unit,logLoss:finite.nonnegative(),calibrationError:unit.max(.05),baselineBrier:unit,baselineLogLoss:finite.positive(),bins:z.array(z.object({count:z.number().int().nonnegative(),meanProbability:unit.nullable(),observedFrequency:unit.nullable()})).length(10)})});
const margin=z.object({...base,kind:z.literal('MARGIN_LINEAR'),targetDefinition:z.literal('homeScoreMinusAwayScore'),blowoutThreshold:finite.positive(),residualLow:finite.negative(),residualHigh:finite.positive(),holdoutCoverage:unit.min(.95),holdoutRmse:finite.positive()});
const modelSchema=z.discriminatedUnion('kind',[win,margin]);
type Model=z.infer<typeof modelSchema>;
const sigmoid=(x:number)=>1/(1+Math.exp(-Math.max(-35,Math.min(35,x))));
const fitValid=(f:z.infer<typeof fit>,length:number)=>f.mean.length===length&&f.scale.length===length&&f.weights.length===length+1;
const predict=(f:z.infer<typeof fit>,values:number[])=>f.weights[0]+values.reduce((sum,value,index)=>sum+(value-f.mean[index])/f.scale[index]*f.weights[index+1],0);
const date=(value:string)=>Date.parse(value);
function validReview(model:Model,now:number){
 const t=model.training,r=model.review;
 return date(t.trainBefore)<date(t.calibrationBefore)&&date(t.calibrationBefore)<date(t.settledThrough)&&date(t.settledThrough)<=date(r.reviewedAt)&&now-date(t.settledThrough)<=366*86400000&&date(r.reviewedAt)<=now&&date(r.expiresAt)>now&&date(r.expiresAt)-date(r.reviewedAt)<=180*86400000&&fitValid(model.fit,model.features.length)&&new Set(model.features.map(f=>f.metric)).size===model.features.length&&model.features.every(f=>f.minimumValue<f.maximumValue)&&['RECENT_FORM','MATCHUP','CONSISTENCY','SAMPLE','EFFICIENCY','CONTEXT'].every(group=>model.features.some(f=>f.group===group))&&model.features.some(f=>f.group==='SAMPLE'&&f.minimumSample!==undefined)&&(model.phase!=='LIVE'||model.features.filter(f=>f.group==='LIVE_STATE').length>=2);
}
function extract(model:Model,input:ResearchInput,now:number){
 const evidenceIds:string[]=[];const values:number[]=[];let homeAdvantages=0,awayAdvantages=0;
 for(const feature of model.features){
  const rows=[input.home,input.away].map(entity=>input.evidence.filter(e=>e.entity===entity&&e.metric===feature.metric));
  if(rows.some(list=>list.length!==1))return null;
  const pair=rows.map(list=>list[0]);
  if(pair.some(e=>!Number.isFinite(date(e.observedAt))||date(e.observedAt)>now||now-date(e.observedAt)>(feature.group==='LIVE_STATE'?30000:900000)||!e.sourceUrl.startsWith('https://')))return null;
  // Explicit numeric values only: never parse a record, score, percentage label or narrative as a feature.
  if(pair.some(e=>typeof e.value==='string'&&!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(e.value)))return null;
  const numbers=pair.map(e=>Number(e.value));if(numbers.some(v=>!Number.isFinite(v)||v<feature.minimumValue||v>feature.maximumValue))return null;
  if(feature.minimumSample!==undefined&&numbers.some(v=>v<feature.minimumSample!))return null;
  const difference=numbers[0]-numbers[1];values.push(difference);evidenceIds.push(...pair.map(e=>e.id));
  if(feature.group!=='SAMPLE'){if(feature.direction*difference>0)homeAdvantages++;if(feature.direction*difference<0)awayAdvantages++;}
 }
 return {values,evidenceIds,homeAdvantages,awayAdvantages};
}
function band(probability:number,bins:z.infer<typeof win>['holdout']['bins'],minimum:number){
 const b=bins[Math.min(9,Math.floor(probability*10))];if(b.count<minimum||b.observedFrequency===null||b.meanProbability===null)return null;
 const successes=b.observedFrequency*b.count;if(Math.abs(successes-Math.round(successes))>1e-5)return null;
 const z=1.959963984540054,n=b.count,p=b.observedFrequency,denominator=1+z*z/n;
 const center=(p+z*z/(2*n))/denominator,half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/denominator;
 return {low:Math.max(0,center-half)*100,high:Math.min(1,center+half)*100,level:.95 as const,method:'HELD_OUT_BIN_WILSON' as const,sample:n};
}

// This allowlist is trusted deployment configuration. AI responses and request bodies cannot register models.
export function reviewedPrediction(input:ResearchInput,market:string,now=Date.now()):Prediction{
 const parsed=z.array(modelSchema).safeParse(registry);
 if(!parsed.success)return {status:'INVALID',reason:'The reviewed model registry failed validation. No modeled probability was published.',forecasts:[],expiresAt:null};
 const phase=input.phase??(input.pregame?'PREGAME':null);
 const matching=parsed.data.filter(m=>m.sport===input.sport&&m.market===market&&m.phase===phase&&validReview(m,now));
 const candidates=matching.filter((m):m is z.infer<typeof win>=>m.kind==='WIN_LOGISTIC').sort((a,b)=>date(b.review.reviewedAt)-date(a.review.reviewedAt));
 const m=candidates[0];if(!m)return {status:'UNAVAILABLE',reason:`No current, reviewed ${input.sport} / ${market} / ${phase??'unverified phase'} probability model is deployed. AI research confidence is not a calibrated forecast.`,forecasts:[],expiresAt:null};
 // Event forecasts remain independent; price edge and approval still require compatible verified settlement.
 if(!fitValid(m.calibrator,1)||m.holdout.brier>=m.holdout.baselineBrier||m.holdout.logLoss>=m.holdout.baselineLogLoss||m.holdout.bins.reduce((sum,b)=>sum+b.count,0)!==m.training.holdout)return {status:'INVALID',reason:'The reviewed model failed calibration, holdout or baseline checks.',forecasts:[],expiresAt:null};
 const extracted=extract(m,input,now);if(!extracted){
  const outside=m.features.flatMap(feature=>input.evidence.filter(e=>[input.home,input.away].includes(e.entity)&&e.metric===feature.metric&&typeof e.value==='number'&&(e.value<feature.minimumValue||e.value>feature.maximumValue)).map(e=>`${e.entity}: ${feature.metric} ${e.value} is outside the trained range ${feature.minimumValue}–${feature.maximumValue}`));
  return {status:'UNAVAILABLE',reason:outside.length?outside.join('; ')+'. Forecast withheld; model bounds are not widened for a current matchup.':'The model requires exact current features for both participants and its reviewed minimum sample sizes. One or more inputs are absent, ambiguous, stale or below sample requirements.',forecasts:[],expiresAt:null};
 }
 const raw=sigmoid(predict(m.fit,extracted.values));const homeProbability=sigmoid(predict(m.calibrator,[Math.log(raw/(1-raw))]));
 const homeBand=band(homeProbability,m.holdout.bins,m.minimumBinSample);if(!homeBand)return {status:'UNAVAILABLE',reason:'The relevant held-out calibration bin has insufficient verified outcomes for an uncertainty band.',forecasts:[],expiresAt:null};
 const forecasts:Forecast[]=[{selection:input.home,probability:homeProbability*100,uncertainty:homeBand,advantages:extracted.homeAdvantages},{selection:input.away,probability:(1-homeProbability)*100,uncertainty:{...homeBand,low:100-homeBand.high,high:100-homeBand.low},advantages:extracted.awayAdvantages}].map(f=>({...f,modelVersion:`${m.id}:${m.version}`,featureEvidenceIds:extracted.evidenceIds,recentFormVerified:true,consistencyVerified:true,sampleVerified:true,minimumAdvantages:m.minimumAdvantages,phase:m.phase}));
 let expiresAt=m.review.expiresAt;
 const marginModel=matching.find((other):other is z.infer<typeof margin>=>other.kind==='MARGIN_LINEAR');
 if(marginModel){const features=extract(marginModel,input,now);if(features){const homeMargin=predict(marginModel.fit,features.values);if(Number.isFinite(homeMargin)){if(date(marginModel.review.expiresAt)<date(expiresAt))expiresAt=marginModel.review.expiresAt;}if(Number.isFinite(homeMargin))for(const [index,f]of forecasts.entries()){f.margin={expected:index===0?homeMargin:-homeMargin,low:index===0?homeMargin+marginModel.residualLow:-homeMargin-marginModel.residualHigh,high:index===0?homeMargin+marginModel.residualHigh:-homeMargin-marginModel.residualLow,threshold:marginModel.blowoutThreshold,modelVersion:`${marginModel.id}:${marginModel.version}`};}}}
 return {status:'VALIDATED',reason:'Reviewed statistical model with chronological held-out calibration and a separate historical calibration uncertainty band.',forecasts,expiresAt};
}

// Offline modelling only. A report is never permission to publish a live probability.
// Each sport uses separate performance features and separately fitted parameters.
export const featureContracts:Record<string,string[]>={
 baseball_mlb:['hitting ops','pitching era','pitching whip','full rest days since last game'],
 americanfootball_nfl:['OffensiveYardsPerPlay','OpponentOffensiveYardsPerPlay','ThirdDownPercentage','TurnoverDifferential'],
 basketball_nba:['EffectiveFieldGoalsPercentage','TrueShootingPercentage','Turnovers','OpponentPoints'],
 icehockey_nhl:['PowerPlayPercentage','PenaltyKillPercentage','SavePercentage','OpponentGoals'],
};
export type HistoricalGame={eventId:string;sport:string;startTime:string;observedAt:string;settledAt:string;homeWon:0|1;features:number[];sourceUrls:string[]};
type Fit={weights:number[];mean:number[];scale:number[]};
const sigmoid=(x:number)=>1/(1+Math.exp(-Math.max(-35,Math.min(35,x))));
const dot=(a:number[],b:number[])=>a.reduce((sum,value,index)=>sum+value*b[index],0);
function fit(rows:{x:number[];y:number}[]):Fit{
 const count=rows[0].x.length;
 const mean=Array.from({length:count},(_,j)=>rows.reduce((s,r)=>s+r.x[j],0)/rows.length);
 const scale=mean.map((value,j)=>Math.sqrt(rows.reduce((s,r)=>s+(r.x[j]-value)**2,0)/rows.length)||1);
 const standardized=rows.map(r=>({x:[1,...r.x.map((v,j)=>(v-mean[j])/scale[j])],y:r.y}));
 const weights=Array(count+1).fill(0) as number[];
 for(let step=0;step<2000;step++){
  const gradient=Array(count+1).fill(0) as number[];
  for(const row of standardized){const residual=sigmoid(dot(weights,row.x))-row.y;row.x.forEach((v,j)=>gradient[j]+=residual*v/rows.length);}
  weights.forEach((v,j)=>weights[j]-=0.05*(gradient[j]+(j===0?0:0.01*v)));
 }
 return {weights,mean,scale};
}
function predict(model:Fit,features:number[]){return sigmoid(dot(model.weights,[1,...features.map((v,j)=>(v-model.mean[j])/model.scale[j])]));}
const logit=(p:number)=>Math.log(p/(1-p));
function metrics(rows:{p:number;y:number}[]){
 const brier=rows.reduce((sum,r)=>sum+(r.p-r.y)**2,0)/rows.length;
 const logLoss=-rows.reduce((sum,r)=>sum+r.y*Math.log(Math.max(1e-12,r.p))+(1-r.y)*Math.log(Math.max(1e-12,1-r.p)),0)/rows.length;
 const bins=Array.from({length:10},(_,index)=>{const selected=rows.filter(r=>Math.min(9,Math.floor(r.p*10))===index);return {count:selected.length,meanProbability:selected.length?selected.reduce((s,r)=>s+r.p,0)/selected.length:null,observedFrequency:selected.length?selected.reduce((s,r)=>s+r.y,0)/selected.length:null};});
 const calibrationError=bins.reduce((sum,b)=>sum+(b.count?Math.abs(b.meanProbability!-b.observedFrequency!)*b.count/rows.length:0),0);
 return {brier,logLoss,calibrationError,bins};
}
export function trainHistoricalModel(sport:string,games:HistoricalGame[]){
 const contract=featureContracts[sport];if(!contract)throw new Error(`No verified feature contract for ${sport}. A sport-specific historical feed and schema are required.`);
 const seen=new Set<string>();
 for(const game of games){
  if(game.sport!==sport||seen.has(game.eventId)||game.features.length!==contract.length||game.features.some(v=>!Number.isFinite(v))||![0,1].includes(game.homeWon)||!game.sourceUrls.length||game.sourceUrls.some(url=>!url.startsWith('https://'))||![game.observedAt,game.startTime,game.settledAt].every(t=>Number.isFinite(Date.parse(t)))||Date.parse(game.observedAt)>=Date.parse(game.startTime)||Date.parse(game.settledAt)<=Date.parse(game.startTime)||Date.parse(game.settledAt)>Date.now())throw new Error('Historical data failed event uniqueness, feature, source, pregame timestamp or settled-outcome checks.');
  seen.add(game.eventId);
 }
 // Engineering minima, not evidence of efficacy. A deployment still requires independent review.
 if(games.length<1000)throw new Error(`Need at least 1,000 genuine settled pregame records for ${sport}; found ${games.length}. No model was fitted.`);
 const ordered=[...games].sort((a,b)=>Date.parse(a.startTime)-Date.parse(b.startTime));
 const firstCut=Date.parse(ordered[Math.floor(ordered.length*.6)].startTime),secondCut=Date.parse(ordered[Math.floor(ordered.length*.8)].startTime);
 const train=ordered.filter(g=>Date.parse(g.startTime)<firstCut&&Date.parse(g.settledAt)<firstCut);
 const calibrate=ordered.filter(g=>Date.parse(g.startTime)>=firstCut&&Date.parse(g.startTime)<secondCut&&Date.parse(g.settledAt)<secondCut);
 const holdout=ordered.filter(g=>Date.parse(g.startTime)>=secondCut);
 if(train.length<500||calibrate.length<150||holdout.length<150)throw new Error('Insufficient disjoint chronological train/calibration/holdout records after settlement leakage exclusions.');
 const model=fit(train.map(g=>({x:g.features,y:g.homeWon})));
 const calibrator=fit(calibrate.map(g=>({x:[logit(predict(model,g.features))],y:g.homeWon})));
 const forecasts=holdout.map(g=>({p:predict(calibrator,[logit(predict(model,g.features))]),y:g.homeWon}));
 const baseRate=train.reduce((sum,g)=>sum+g.homeWon,0)/train.length;
 const report=metrics(forecasts),baseline=metrics(holdout.map(g=>({p:baseRate,y:g.homeWon})));
 return {sport,market:'h2h',version:'performance-logistic-platt-1',createdAt:new Date().toISOString(),features:contract,orientation:'home minus away',model,calibrator,counts:{train:train.length,calibration:calibrate.length,holdout:holdout.length},cutoffs:{trainBefore:new Date(firstCut).toISOString(),calibrationBefore:new Date(secondCut).toISOString()},holdout:report,baseline,passesEngineeringChecks:report.brier<baseline.brier&&report.logLoss<baseline.logLoss&&report.calibrationError<=.05,approvedForLive:false,limitations:['No live approval: independent review, data rights and sport-specific completeness gates remain required.','No uncertainty interval or ROI claim is produced by this pipeline.']};
}

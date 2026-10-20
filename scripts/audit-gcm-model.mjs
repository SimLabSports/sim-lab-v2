import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const raw=await readFile('.cache/gcm/baseball_mlb-history.json','utf8');const history=JSON.parse(raw);
const report=JSON.parse(await readFile('.cache/gcm/baseball_mlb-form-report.json','utf8'));
const holdout=JSON.parse(await readFile('.cache/gcm/baseball_mlb-holdout.json','utf8'));
if(createHash('sha256').update(raw).digest('hex')!==report.model.training.inputSha256)throw new Error('History hash does not match fitted model.');
const index=new Map(history.games.map(g=>[g.id,g]));const base=report.baseline.bins.find(b=>b.count).meanProbability;
const blocks=new Map();
for(let i=0;i<holdout.rows.length;i++){
 const row=holdout.rows[i],prediction=holdout.predictions[i],target=index.get(row.id);
 if(!target||prediction.id!==row.id||new Set(row.featureGameIds.flat()).has(row.id))throw new Error('Outcome identity or self-feature leakage.');
 for(const ids of row.featureGameIds)for(const id of ids){const g=index.get(id);if(!g||Date.parse(g.availableAt)>=Date.parse(target.startTime)||g.season!==target.season)throw new Error('Future or cross-season feature leakage.');}
 const block=Math.floor(Date.parse(row.startTime)/(7*86400000));const entry=blocks.get(block)??{sum:0,count:0};entry.sum+=(base-row.y)**2-(prediction.p-row.y)**2;entry.count++;blocks.set(block,entry);
}
// Fixed weekly-cluster bootstrap keeps games in the same week together, rather than treating every team-game as independent.
const clusters=[...blocks.values()];let seed=104729;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};const boot=[];
for(let sample=0;sample<5000;sample++){let sum=0,count=0;for(let i=0;i<clusters.length;i++){const cluster=clusters[Math.floor(random()*clusters.length)];sum+=cluster.sum;count+=cluster.count;}boot.push(sum/count);}
boot.sort((a,b)=>a-b);const interval=[boot[Math.floor(.025*boot.length)],boot[Math.floor(.975*boot.length)]];
let independentFeatureChecks=0;
for(let i=0;i<40;i++){
 const row=holdout.rows[Math.floor(i*(holdout.rows.length-1)/39)],g=index.get(row.id),asOf=Date.parse(g.startTime);
 const values=[g.homeId,g.awayId].map(team=>{
  const games=history.games.filter(p=>p.season===g.season&&(p.homeId===team||p.awayId===team)&&Date.parse(p.availableAt)<asOf&&Date.parse(p.startTime)>=asOf-90*86400000).sort((a,b)=>Date.parse(b.startTime)-Date.parse(a.startTime)).slice(0,20);
  const scored=games.map(p=>p.homeId===team?p.homeScore:p.awayScore),allowed=games.map(p=>p.homeId===team?p.awayScore:p.homeScore);const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;const margin=mean(scored)-mean(allowed);
  return [mean(scored),mean(allowed),margin,Math.sqrt(mean(scored.map((s,i)=>(s-allowed[i]-margin)**2))),games.length,Math.max(0,Math.min(30,Math.floor((asOf-Date.parse(games[0].startTime))/86400000)-1))];
 });
 if(row.x.some((x,i)=>Math.abs(x-(values[0][i]-values[1][i]))>1e-10))throw new Error('Independent feature reconstruction disagrees.');independentFeatureChecks++;
}
const sourceChecks=[];
if(process.argv.includes('--verify-sources'))for(let i=0;i<12;i++){
 const g=history.games[Math.floor(i*(history.games.length-1)/11)];const sourceUrl=`https://statsapi.mlb.com/api/v1.1/game/${g.id}/feed/live`;
 const response=await fetch(sourceUrl,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('Official source audit unavailable.');const d=await response.json();
 const plays=d.liveData?.plays?.allPlays;const last=plays?.at(-1);const end=Date.parse(last?.about?.endTime??'');
 const home=d.liveData?.linescore?.teams?.home?.runs,away=d.liveData?.linescore?.teams?.away?.runs;
 const passed=String(d.gamePk)===g.id&&home===g.homeScore&&away===g.awayScore&&Number.isFinite(end)&&end<=Date.parse(g.availableAt);
 sourceChecks.push({id:g.id,sourceUrl,passed,availabilityBound:g.availableAt,lastPlayEndedAt:Number.isFinite(end)?new Date(end).toISOString():null});if(!passed)throw new Error(`Official outcome/completion audit failed for ${g.id}`);
}
const result={createdAt:new Date().toISOString(),historySha256:report.model.training.inputSha256,holdoutRecords:holdout.rows.length,weeklyBlocks:clusters.length,weeklyClusterBrierImprovement95Interval:interval,independentFeatureChecks,sourceChecks,passes:report.passesEngineeringChecks&&interval[0]>0&&sourceChecks.length===12&&sourceChecks.every(c=>c.passed),reviewScope:'Reproducible code, source and chronological replay audit. Not an external human endorsement, prospective performance record or profitability test.'};
await writeFile('.cache/gcm/baseball_mlb-audit.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));

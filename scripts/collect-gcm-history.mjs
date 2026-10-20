import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {completedMlbGame} from '../src/lib/providers/mlb-history.ts';

const [sport='baseball_mlb',fromText='2020',throughText=String(new Date().getUTCFullYear())]=process.argv.slice(2);
const from=Number(fromText),through=Number(throughText);
if(sport!=='baseball_mlb'||!Number.isInteger(from)||!Number.isInteger(through)||from<2000||through<from||through>new Date().getUTCFullYear())throw new Error('Supported command: node scripts/collect-gcm-history.mjs baseball_mlb FIRST_YEAR LAST_YEAR. Other sports require verified completion-time adapters.');
const directory=resolve('.cache/gcm');await mkdir(directory,{recursive:true});
const records=new Map();const sources=[];const exclusions={missingCompletion:0,nonFinal:0,ambiguousOrResumed:0,invalidScore:0};
for(let year=from;year<=through;year++){
 const url=`https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${year}-01-01&endDate=${year}-12-31&hydrate=gameInfo`;
 const cache=resolve(directory,`mlb-${year}-source.json`);let payload;
 try{const saved=JSON.parse(await readFile(cache,'utf8'));if(saved.url===url&&year<new Date().getUTCFullYear())payload=saved;}catch{}
 if(!payload){const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`Official history returned HTTP ${response.status} for ${year}`);payload={url,retrievedAt:new Date().toISOString(),data:await response.json()};await writeFile(cache,JSON.stringify(payload));}
 if(!Array.isArray(payload.data.dates))throw new Error('Official schedule schema is unavailable.');
 sources.push({url,retrievedAt:payload.retrievedAt,sha256:createHash('sha256').update(JSON.stringify(payload.data)).digest('hex')});
 for(const g of payload.data.dates.flatMap(d=>d.games??[])){
  if(g.scheduledInnings!==9||!['R','F','D','L','W'].includes(g.gameType)||g.status?.abstractGameState!=='Final'||g.status?.detailedState!=='Final'){exclusions.nonFinal++;continue;}
  if(g.resumeDate||g.resumedFrom||g.resumedFromDate||g.rescheduleDate||g.rescheduledFrom||g.rescheduledFromDate||g.status?.startTimeTBD){exclusions.ambiguousOrResumed++;continue;}
  const info=g.gameInfo,start=Date.parse(info?.firstPitch??'');const duration=info?.gameDurationMinutes,delay=info?.delayDurationMinutes;
  if(!Number.isFinite(start)||typeof duration!=='number'||duration<=0||duration>600||typeof delay!=='number'||delay<0||delay>360){exclusions.missingCompletion++;continue;}
  const available=start+(duration+delay+60)*60000; // Conservative upper bound, not a claimed observed timestamp.
  if(available>=Date.now()){exclusions.nonFinal++;continue;}
  const home=g.teams?.home,away=g.teams?.away;
  if(!Number.isInteger(home?.score)||!Number.isInteger(away?.score)||home.score<0||away.score<0||!home.team?.id||!away.team?.id||home.team.id===away.team.id){exclusions.invalidScore++;continue;}
  const scheduled=Date.parse(g.gameDate);if(!Number.isFinite(scheduled)||Math.abs(scheduled-start)>3600000){exclusions.ambiguousOrResumed++;continue;}
  const item=completedMlbGame(g,url);if(!item){exclusions.ambiguousOrResumed++;continue;}const id=item.id;
  const previous=records.get(id);if(previous&&JSON.stringify(previous)!==JSON.stringify(item))throw new Error(`Conflicting official result for ${id}`);records.set(id,item);
 }
 console.log(`${year}: ${records.size} verified completed games accumulated`);
}
const games=[...records.values()].sort((a,b)=>Date.parse(a.startTime)-Date.parse(b.startTime));
const dataset={sport,createdAt:new Date().toISOString(),method:'Official final results with verified first pitch and game duration; availability bound adds provider delay plus 60 minutes. Resumed/rescheduled or ambiguous games excluded.',sources,exclusions,games};
const output=resolve(directory,`${sport}-history.json`);await writeFile(output,JSON.stringify(dataset));console.log(JSON.stringify({file:output,games:games.length,exclusions,sha256:createHash('sha256').update(JSON.stringify(dataset)).digest('hex')}));

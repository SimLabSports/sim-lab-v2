import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {sportProfile} from '../src/lib/sport-profiles.ts';
const [sport,seasonText,...teamIds]=process.argv.slice(2),season=Number(seasonText),profile=sportProfile(sport??'');
if(!profile?.espn||profile.research!=='TEAM'||!Number.isInteger(season)||season<2000||season>new Date().getUTCFullYear()+1||!teamIds.length||teamIds.length>20||teamIds.some(id=>!/^\d+$/.test(id)))throw Error('Usage: node --experimental-strip-types scripts/collect-multisport-results.mjs SPORT SEASON VERIFIED_TEAM_ID... (1–20 exact IDs). Collects actual settled results, not calibrated models.');
const base=`https://site.api.espn.com/apis/site/v2/sports/${profile.espn}/`,sources=[],games=new Map();
for(const id of teamIds)for(const type of profile.family==='soccer'?[null]:[2,3]){
 const sourceUrl=`${base}teams/${id}/schedule?season=${season}${type?`&seasontype=${type}`:''}`,response=await fetch(sourceUrl,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error(`History request failed (${response.status}) for team ${id}.`);const data=await response.json(),observedAt=new Date().toISOString();
 if(data.team?.id!==id||data.season?.year!==season||!Array.isArray(data.events))throw Error('Unverified team, season or result schema.');
 const sha256=createHash('sha256').update(JSON.stringify(data)).digest('hex');sources.push({sourceUrl,observedAt,sha256,data});
 for(const event of data.events){const c=event.competitions?.length===1?event.competitions[0]:null;const finalName=profile.family==='soccer'?'STATUS_FULL_TIME':'STATUS_FINAL';if(!c||c.status?.type?.name!==finalName||!c.status.type.completed||c.competitors?.length!==2||!Number.isFinite(Date.parse(event.date))||Date.parse(event.date)>=Date.now()||event.season&&event.season.year!==season)continue;
  const participants=c.competitors.map(p=>({id:p.team?.id,name:p.team?.displayName,side:p.homeAway,score:typeof p.score==='object'?p.score.value:typeof p.score==='string'&&/^\d+$/.test(p.score)?Number(p.score):NaN}));if(participants.some(p=>!p.id||!p.name||!Number.isFinite(p.score))||new Set(participants.map(p=>p.id)).size!==2||!participants.some(p=>p.id===id))continue;
  games.set(event.id,{eventId:event.id,sport,season,startTime:event.date,participants,resultObservedAt:observedAt,resultSourceUrl:sourceUrl,pointInTimeTrainingEligible:false,limitation:'This is a result observed now, not an archived pregame feature packet or verified historical completion timestamp.'});
 }
}
await mkdir('.cache/gcm',{recursive:true});const output={sport,season,collectedAt:new Date().toISOString(),sources,results:[...games.values()],modelPublished:false};await writeFile(`.cache/gcm/${sport}-${season}-results.json`,JSON.stringify(output));console.log(JSON.stringify({sport,season,actualResults:games.size,sourceResponses:sources.length,pointInTimeTrainingEligible:false,modelPublished:false}));

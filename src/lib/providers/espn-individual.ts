import 'server-only';
import {z} from 'zod';
import {providerJson} from '../server/provider-http';
import {sportProfile} from '../sport-profiles';
import {participantKey,sameStart} from '../event-identity';
import type {MarketEvent} from '../markets';
import type {ResearchInput} from '../research-types';
const competitor=z.object({id:z.string(),type:z.string().optional(),athlete:z.object({displayName:z.string()}),winner:z.boolean().optional(),records:z.array(z.object({type:z.string(),summary:z.string()})).optional(),linescores:z.array(z.object({value:z.number().finite()})).optional()});
const bout=z.object({id:z.string(),date:z.string(),timeValid:z.boolean().optional(),wasSuspended:z.boolean().optional(),competitors:z.array(z.unknown()),status:z.object({type:z.object({name:z.string(),state:z.string(),completed:z.boolean()})})});
const board=z.object({events:z.array(z.object({id:z.string(),name:z.string(),date:z.string(),competitions:z.array(bout).optional(),groupings:z.array(z.object({grouping:z.object({slug:z.string()}),competitions:z.array(bout)})).optional()}))});
export async function espnIndividualResearch(event:MarketEvent):Promise<ResearchInput>{
 const profile=sportProfile(event.sport_key);const input:ResearchInput={eventId:event.id,sport:event.sport_key,startTime:event.commence_time,home:event.home_team??'',away:event.away_team??'',provider:profile?.espn?`ESPN ${profile.label}`:'Not connected',providerEventId:null,retrievedAt:new Date().toISOString(),status:'INCOMPLETE',evidence:[],gaps:[],risks:[],lineupConfirmed:false,injuriesVerified:false,pregame:false};
 if(!profile?.espn||!['TENNIS','COMBAT','FIELD'].includes(profile.research)){input.gaps.push('No verified individual-sport source is available for this competition. Boxing needs a separately verified bout/performance feed.');return input;}
 const resource=`https://site.api.espn.com/apis/site/v2/sports/${profile.espn}/scoreboard`;
 try{const source=await providerJson({provider:`ESPN ${profile.espn} scoreboard`,cacheKey:`espn-individual-v1:${profile.espn}`,url:resource,ttl:300000,validate:data=>({data:board.parse(data),observedAt:new Date().toISOString()})});
  const add=(entity:string,metric:string,value:string|number,period:string)=>input.evidence.push({id:`individual${input.evidence.length+1}`,entity,metric,value,sourceUrl:resource,observedAt:source.observedAt,period});
  if(profile.research==='FIELD'){input.gaps.push('A PGA scoreboard is available, but an exact tournament/field-to-outright mapping, strokes-gained history and multi-runner/dead-heat model are not implemented. No two-team probabilities are applied to golf.');return input;}
  const competitions=source.data.events.flatMap(t=>profile.research==='TENNIS'?(t.groupings??[]).filter(g=>g.grouping.slug.endsWith('-singles')).flatMap(g=>g.competitions.map(c=>({t,c}))):(t.competitions??[]).map(c=>({t,c})));
  const players=(c:z.infer<typeof bout>)=>c.competitors.map(p=>competitor.safeParse(p)).flatMap(p=>p.success?[p.data]:[]);
  const matches=competitions.filter(({c})=>c.timeValid!==false&&!c.wasSuspended&&sameStart(c.date,event.commence_time)&&c.competitors.length===2&&players(c).length===2&&[input.home,input.away].every(name=>players(c).filter(p=>participantKey(p.athlete.displayName)===participantKey(name)).length===1));
  if(matches.length!==1){input.gaps.push('No unique, exact participant pair and scheduled start could be verified in the current source. Other MMA promotions, doubles, and ambiguous tournament matches are not substituted.');return input;}
  const {t,c}=matches[0];input.providerEventId=`${profile.espn}:${t.id}:${c.id}`;input.pregame=c.status.type.name==='STATUS_SCHEDULED'&&c.status.type.state==='pre'&&Date.now()<Math.min(Date.parse(event.commence_time),Date.parse(c.date));input.phase=input.pregame?'PREGAME':c.status.type.completed?'FINAL':c.status.type.state==='in'?'LIVE':'SUSPENDED';
  add('event','verified individual competition',t.name,'current');add('event','verified event state',c.status.type.name,'current');
  if(!input.pregame){input.risks.push('Verified individual event is not scheduled pregame.');return input;}
  for(const p of players(c)){const name=[input.home,input.away].find(n=>participantKey(n)===participantKey(p.athlete.displayName))!;
   if(profile.research==='COMBAT'){const record=p.records?.find(r=>r.type==='total');if(record&&/^\d+-\d+-\d+$/.test(record.summary)){const [wins,losses,draws]=record.summary.split('-').map(Number);add(name,'career recorded wins',wins,'provider overall record; opponent strength and recency unverified');add(name,'career recorded losses',losses,'provider overall record; not a modeled win probability');add(name,'career recorded draws',draws,'provider overall record; no-contest history not supplied');}else input.gaps.push(`A valid career record was not supplied for ${name}.`);}
   else{const cutoff=Math.min(Date.now(),Date.parse(event.commence_time));const prior=competitions.filter(r=>r.t.id===t.id&&r.c.id!==c.id&&r.c.status.type.completed&&r.c.status.type.name==='STATUS_FINAL'&&Date.parse(r.c.date)<cutoff&&!r.c.wasSuspended&&players(r.c).some(q=>q.id===p.id)&&r.c.competitors.length===2);
    if(!prior.length){input.gaps.push(`No completed singles results in this tournament draw for ${name}; qualifying results elsewhere and past tournaments are not implied.`);continue;}
    const own=prior.map(r=>({p:players(r.c).find(q=>q.id===p.id)!,other:players(r.c).find(q=>q.id!==p.id)!}));const complete=own.filter(r=>r.p.linescores?.length&&r.p.linescores.length===r.other.linescores?.length);const period=`${t.name}; ${prior.length} completed same-draw matches; not full career or surface coverage`;
    add(name,'completed current-draw singles sample',prior.length,period);add(name,'current-draw recorded wins',own.filter(r=>r.p.winner).length,period);
    if(complete.length){add(name,'current-draw games won',complete.reduce((sum,r)=>sum+r.p.linescores!.reduce((s,l)=>s+l.value,0),0),period);add(name,'current-draw games conceded',complete.reduce((sum,r)=>sum+r.other.linescores!.reduce((s,l)=>s+l.value,0),0),period);}
   }
  }
  input.gaps.push(...profile.required.map(metric=>`${metric}: verified coverage remains incomplete.`),'Retirements, draws/no-contests and bookmaker-specific void rules need compatible market settlement and historical validation.');
  input.status=[input.home,input.away].every(n=>input.evidence.filter(e=>e.entity===n).length>=3)?'AVAILABLE':'INCOMPLETE';
 }catch{input.status='ERROR';input.gaps.push(`Public ${profile.label} event data could not be validated. No alternate participant or invented performance was used.`);}
 return input;
}

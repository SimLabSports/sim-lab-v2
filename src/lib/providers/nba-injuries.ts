import 'server-only';
import {unstable_cache} from 'next/cache';
import {getDocumentProxy} from 'unpdf';
import {participantKey} from '../event-identity';
import {easternTimestamp,parseInjuryTable,type PositionedText} from './nba-injury-parser';
import type {MarketEvent} from '../markets';
import type {ResearchInput} from '../research-types';

async function latest(season:string){
 const index=`https://official.nba.com/nba-injury-report-${season}-season/`;
 const page=await fetch(index,{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!page.ok)throw Error(`Official NBA injury index returned HTTP ${page.status}.`);const html=await page.text();if(html.length>2000000)throw Error('Official NBA injury index exceeds the bounded size.');
 const links=[...html.matchAll(/https:\/\/ak-static\.cms\.nba\.com\/referee\/injury\/Injury-Report_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})(AM|PM)\.pdf/g)].map(m=>({url:m[0],date:m[1],clock:`${m[2]}:${m[3]}`,period:m[4],reportedAt:easternTimestamp(m[1],`${m[2]}:${m[3]}`,m[4])})).filter(l=>l.reportedAt&&Date.parse(l.reportedAt)<=Date.now()).sort((a,b)=>Date.parse(b.reportedAt!)-Date.parse(a.reportedAt!));
 if(!links.length)throw Error('Official NBA injury index has no published, non-future report link.');const selected=links[0];
 const response=await fetch(selected.url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error(`Official NBA report PDF returned HTTP ${response.status}.`);if(Number(response.headers.get('content-length'))>2000000)throw Error('Official NBA report PDF exceeds size bound.');const data=new Uint8Array(await response.arrayBuffer());if(data.byteLength>2000000||new TextDecoder().decode(data.slice(0,5))!=='%PDF-')throw Error('Official NBA report is not a bounded PDF.');
 const pdf=await getDocumentProxy(data);if(pdf.numPages<1||pdf.numPages>20)throw Error('Official NBA report page count exceeds bounds.');const pages:PositionedText[][]=[];
 for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i);const text=await p.getTextContent();pages.push(text.items.filter((x):x is typeof x&PositionedText=>'str'in x&&'transform'in x));}
 const header=pages[0].filter(i=>i.transform[5]>500).map(i=>i.str).join(' ').replace(/\s+/g,' ').trim();const [y,m,d]=selected.date.split('-');if(!header.includes(`Injury Report: ${m}/${d}/${y.slice(-2)} ${selected.clock} ${selected.period}`))throw Error('NBA injury PDF header and publication link disagree.');
 return {sourceUrl:selected.url,reportedAt:selected.reportedAt!,retrievedAt:new Date().toISOString(),rows:parseInjuryTable(pages)};
}
const cached=unstable_cache(latest,['nba-official-injury-v1'],{revalidate:120});
const key=(name:string)=>participantKey(name==='LA Clippers'?'Los Angeles Clippers':name);
export async function enrichNbaInjuries(event:MarketEvent,input:ResearchInput):Promise<ResearchInput>{
 if(event.sport_key!=='basketball_nba'||!input.pregame)return input;const result={...input,evidence:[...input.evidence],gaps:[...input.gaps],risks:[...input.risks]};
 try{const year=Number(event.commence_time.slice(0,4))-(new Date(event.commence_time).getUTCMonth()<8?1:0),report=await cached(`${year}-${String(year+1).slice(-2)}`);
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:true}).formatToParts(new Date(event.commence_time));const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));const date=`${p.month}/${p.day}/${p.year}`,time=`${p.hour}:${p.minute} (ET)`;
  const matches=report.rows.filter(r=>r.date===date&&r.time===time&&[key(input.home),key(input.away)].includes(key(r.team)));const groups=[...new Set(matches.map(r=>r.matchup))];
  if(groups.length!==1||![input.home,input.away].every(name=>matches.some(r=>key(r.team)===key(name))))throw Error('Official injury report lacks both exact teams in one matching game/date/time block.');
  result.provider+=' + NBA Official Injury Report';const evidenceIds:string[]=[];
  for(const name of [input.home,input.away]){const entries=matches.filter(r=>key(r.team)===key(name));const submitted=!entries.some(r=>r.status==='NOT_YET_SUBMITTED');
   const id=`nbair${result.evidence.length+1}`;evidenceIds.push(id);result.evidence.push({id,entity:name,metric:'official NBA event injury report',value:submitted?entries.map(r=>`${r.player}: ${r.status}; ${r.reason}`).join(' | '):'NOT YET SUBMITTED',sourceUrl:report.sourceUrl,observedAt:report.reportedAt,period:`published ${report.reportedAt}; retrieved ${report.retrievedAt}; exact ${date} ${time} matchup; unlisted players are not assumed healthy`});
   if(!submitted)result.gaps.push(`${name}: official event injury report has not been submitted.`);
   if(entries.some(r=>r.status!=='Available'&&r.status!=='NOT_YET_SUBMITTED'))result.risks.push(`${name}: official NBA report contains unavailable or unresolved participants; minutes restrictions and modeled impact require verification.`);
  }
  if(Date.now()-Date.parse(report.reportedAt)>900000)result.gaps.push('Latest official NBA injury report is older than the 15-minute approval window; original publication time is preserved.');
  const reasons={injuries:'Official event injury statuses are available, but unresolved participation, unlisted roster members and calibrated injury impact are not cleared.',workload:'The official injury report does not establish current minutes restrictions, rotation workload or their calibrated effect.'};
  for(const kind of ['injuries','workload'] as const){if(!result.verifications?.some(v=>v.kind===kind&&['CLEAR','BLOCKED'].includes(v.status)))result.verifications=[...(result.verifications??[]).filter(v=>v.kind!==kind),{kind,status:'UNKNOWN',evidenceIds,observedAt:report.reportedAt,reason:reasons[kind]}];}
  result.gaps.push('Official injury statuses are connected. Final starting units, full roster availability, minutes restrictions and validated injury-impact adjustments are separate approval requirements.');
 }catch(e){result.gaps.push(e instanceof Error?e.message:'Official NBA injury report unavailable.');}
 return result;
}

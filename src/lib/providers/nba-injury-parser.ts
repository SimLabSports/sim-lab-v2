export type PositionedText={str:string;transform:number[]};
export type InjuryRow={date:string;time:string;matchup:string;team:string;player:string;status:string;reason:string};
export function parseInjuryTable(pages:PositionedText[][]){
 const rows:InjuryRow[]=[];let date='',time='',matchup='',team='';let last:InjuryRow|undefined;
 const header=pages[0]?.filter(i=>Math.abs(i.transform[5]-480.12)<3).map(i=>i.str).join(' ').replace(/\s+/g,' ');
 if(!header?.includes('Game Date Game Time Matchup Team Player Name Current Status Reason'))throw Error('Official NBA injury table layout changed; no clearance used.');
 for(const [pageIndex,page]of pages.entries()){const lines=new Map<number,PositionedText[]>(),anchors:{y:number;row:InjuryRow}[]=[],reasons:{y:number;text:string}[]=[];for(const item of page){const y=item.transform[5];if(!item.str.trim()||y<=70||y>=(pageIndex===0?477:515))continue;const key=Math.round(y);const line=lines.get(key)??[];line.push(item);lines.set(key,line);}
  for(const [y,items]of [...lines].sort((a,b)=>b[0]-a[0])){const cells=Array.from({length:7},()=>[] as PositionedText[]);for(const item of items){const x=item.transform[4];const c=x<100?0:x<190?1:x<255?2:x<415?3:x<575?4:x<660?5:6;cells[c].push(item);}const value=cells.map(c=>c.sort((a,b)=>a.transform[4]-b.transform[4]).map(i=>i.str).join(' ').replace(/\s+/g,' ').trim());
   if(value[0]){if(!/^\d{2}\/\d{2}\/\d{4}$/.test(value[0]))throw Error('Unrecognized official report date.');date=value[0];}
   if(value[1]){if(!/^\d{2}:\d{2} \(ET\)$/.test(value[1]))throw Error('Unrecognized official report game time.');time=value[1];}
   if(value[2]){if(!/^[A-Z]{2,3}@[A-Z]{2,3}$/.test(value[2]))throw Error('Unrecognized official report matchup.');matchup=value[2];team='';last=undefined;}
   if(value[3])team=value[3];
   if(!value[4]&&value[6]==='NOT YET SUBMITTED'){value[4]=value[6];value[6]='';}
   if(value[4]){if(!date||!time||!matchup||!team)throw Error('Official report row lacks game context.');const submitted=value[4]==='NOT YET SUBMITTED';if(!submitted&&(!value[4].includes(',')||!['Out','Doubtful','Questionable','Probable','Available'].includes(value[5])))throw Error('Official report player/status schema changed.');last={date,time,matchup,team,player:submitted?'':value[4],status:submitted?'NOT_YET_SUBMITTED':value[5],reason:''};rows.push(last);anchors.push({y,row:last});}
   if(value[6])reasons.push({y,text:value[6]});
  }
  // Reasons wrap above and below a vertically centered player name. Assign by
  // geometry, rather than attaching the next player's first reason to the previous row.
  for(const reason of reasons){const nearest=[...anchors].sort((a,b)=>Math.abs(a.y-reason.y)-Math.abs(b.y-reason.y));if(!nearest[0]||Math.abs(nearest[0].y-reason.y)>18||nearest[1]&&Math.abs(nearest[0].y-reason.y)===Math.abs(nearest[1].y-reason.y))throw Error('Ambiguous official injury reason alignment.');nearest[0].row.reason+=(nearest[0].row.reason?' ':'')+reason.text;}
 }
 if(!rows.length)throw Error('Official report contains no interpretable player rows.');return rows;
}

export function easternTimestamp(date:string,clock:string,period:string){
 const [y,m,d]=date.split('-').map(Number),[hour,minute]=clock.split(':').map(Number);const h=hour%12+(period==='PM'?12:0);if(hour<1||hour>12||minute>59)return null;
 for(const offset of [4,5]){const timestamp=Date.UTC(y,m-1,d,h+offset,minute);const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(timestamp);const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));if(Number(p.year)===y&&Number(p.month)===m&&Number(p.day)===d&&Number(p.hour)===h&&Number(p.minute)===minute)return new Date(timestamp).toISOString();}
 return null;
}

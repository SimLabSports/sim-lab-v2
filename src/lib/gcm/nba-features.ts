export type NbaGame={id:string;season:string;startTime:string;availableAt:string;homeId:number;awayId:number;home:string;away:string;homePoints:number;awayPoints:number;possessions:number;sourceUrl:string};
export const nbaFeatures=[
 {metric:'NBA weighted estimated offensive rating',group:'EFFICIENCY',direction:1,minimumValue:60,maximumValue:170},
 {metric:'NBA weighted estimated defensive rating',group:'MATCHUP',direction:-1,minimumValue:60,maximumValue:170},
 {metric:'NBA weighted scoring margin',group:'RECENT_FORM',direction:0,minimumValue:-50,maximumValue:50},
 {metric:'NBA weighted margin deviation',group:'CONSISTENCY',direction:-1,minimumValue:0,maximumValue:50},
 {metric:'NBA retained completed sample',group:'SAMPLE',direction:0,minimumValue:10,maximumValue:20,minimumSample:10},
 {metric:'NBA capped schedule rest days',group:'CONTEXT',direction:0,minimumValue:0,maximumValue:14},
 {metric:'NBA current-season weight share',group:'CONTEXT',direction:0,minimumValue:0,maximumValue:1},
 {metric:'NBA weighted estimated possessions',group:'CONTEXT',direction:0,minimumValue:65,maximumValue:145},
] as const;
export function nbaForm(games:NbaGame[],teamId:number,season:string,asOf:number){
 const selected=games.filter(g=>(g.homeId===teamId||g.awayId===teamId)&&Date.parse(g.availableAt)<asOf&&Date.parse(g.startTime)<asOf&&asOf-Date.parse(g.startTime)<450*86400000&&(g.season===season||Number(g.season.slice(0,4))===Number(season.slice(0,4))-1)).sort((a,b)=>Date.parse(b.startTime)-Date.parse(a.startTime)).slice(0,20);
 if(selected.length<10)return null;
 const rows=selected.map((g,i)=>({g,w:Math.pow(.5,i/10)*(g.season===season?1:.35),points:g.homeId===teamId?g.homePoints:g.awayPoints,against:g.homeId===teamId?g.awayPoints:g.homePoints}));const weight=rows.reduce((s,r)=>s+r.w,0);const mean=(f:(r:typeof rows[number])=>number)=>rows.reduce((s,r)=>s+r.w*f(r),0)/weight;
 const margin=mean(r=>r.points-r.against);const values=[mean(r=>100*r.points/r.g.possessions),mean(r=>100*r.against/r.g.possessions),margin,Math.sqrt(mean(r=>(r.points-r.against-margin)**2)),rows.length,Math.min(14,Math.max(0,Math.floor((asOf-Date.parse(rows[0].g.startTime))/86400000)-1)),rows.filter(r=>r.g.season===season).reduce((s,r)=>s+r.w,0)/weight,mean(r=>r.g.possessions)];
 return {values,gameIds:selected.map(g=>g.id),priorSeasonGames:selected.filter(g=>g.season!==season).length,period:`${selected.length} verified prior completed games; prior-season observations receive 0.35 relative weight, with a 10-game recency half-life; not current-season form`};
}

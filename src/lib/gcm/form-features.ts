// Identical rolling feature calculations are used by historical replay and live inputs.
// These are scoring-form features, not pitcher, player-health or possession-efficiency estimates.
export type CompletedGame={id:string;season:number;startTime:string;availableAt:string;homeId:string;awayId:string;homeName:string;awayName:string;homeScore:number;awayScore:number;sourceUrl:string};
export const formFeatures=[
 {metric:'verified recent scoring mean',group:'EFFICIENCY',direction:1,minimumValue:0,maximumValue:200},
 {metric:'verified recent opponent scoring mean',group:'MATCHUP',direction:-1,minimumValue:0,maximumValue:200},
 {metric:'verified recent scoring margin',group:'RECENT_FORM',direction:0,minimumValue:-100,maximumValue:100},
 {metric:'verified recent margin deviation',group:'CONSISTENCY',direction:-1,minimumValue:0,maximumValue:100},
 {metric:'verified recent completed sample',group:'SAMPLE',direction:0,minimumValue:10,maximumValue:20,minimumSample:10},
 {metric:'verified schedule rest days',group:'CONTEXT',direction:1,minimumValue:0,maximumValue:30},
] as const;
export function rollingForm(games:CompletedGame[],teamId:string,season:number,asOf:number){
 const recent=games.filter(g=>g.season===season&&(g.homeId===teamId||g.awayId===teamId)&&Date.parse(g.availableAt)<asOf&&Date.parse(g.startTime)<asOf&&Date.parse(g.startTime)>=asOf-90*86400000).sort((a,b)=>Date.parse(b.startTime)-Date.parse(a.startTime)).slice(0,20);
 if(recent.length<10)return null;
 const scores=recent.map(g=>g.homeId===teamId?{for:g.homeScore,against:g.awayScore}:{for:g.awayScore,against:g.homeScore});
 const mean=(values:number[])=>values.reduce((s,v)=>s+v,0)/values.length;
 const scored=mean(scores.map(s=>s.for)),allowed=mean(scores.map(s=>s.against));const margins=scores.map(s=>s.for-s.against),margin=mean(margins);
 const values=[scored,allowed,margin,Math.sqrt(mean(margins.map(m=>(m-margin)**2))),recent.length,Math.max(0,Math.min(30,Math.floor((asOf-Date.parse(recent[0].startTime))/86400000)-1))];
 return {values,gameIds:recent.map(g=>g.id),availableThrough:new Date(Math.max(...recent.map(g=>Date.parse(g.availableAt)))).toISOString()};
}

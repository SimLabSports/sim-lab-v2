import {z} from 'zod';
import type {CompletedGame} from '../gcm/form-features';
const side=z.object({score:z.number().int().nonnegative(),team:z.object({id:z.number().int().positive(),name:z.string()})});
const historicalGame=z.object({gamePk:z.number().int().positive(),gameType:z.string(),season:z.string(),gameDate:z.string().datetime(),scheduledInnings:z.number(),status:z.object({abstractGameState:z.string(),detailedState:z.string(),startTimeTBD:z.boolean().optional()}),teams:z.object({home:side,away:side}),gameInfo:z.object({firstPitch:z.string().datetime(),gameDurationMinutes:z.number().positive().max(600),delayDurationMinutes:z.number().nonnegative().max(360)})}).passthrough();
/** An explicitly derived conservative availability bound, never an invented observed timestamp. */
export function completedMlbGame(value:unknown,sourceUrl:string,now=Date.now()):CompletedGame|null{
 const parsed=historicalGame.safeParse(value);if(!parsed.success)return null;const g=parsed.data;
 if(g.scheduledInnings!==9||!['R','F','D','L','W'].includes(g.gameType)||g.status.abstractGameState!=='Final'||g.status.detailedState!=='Final'||g.status.startTimeTBD||g.teams.home.team.id===g.teams.away.team.id)return null;
 if(['resumeDate','resumedFrom','resumedFromDate','rescheduleDate','rescheduledFrom','rescheduledFromDate'].some(key=>!!g[key]))return null;
 const firstPitch=Date.parse(g.gameInfo.firstPitch),start=Date.parse(g.gameDate);
 if(Math.abs(start-firstPitch)>3600000)return null;
 const available=firstPitch+(g.gameInfo.gameDurationMinutes+g.gameInfo.delayDurationMinutes+60)*60000;
 if(available>=now||available<=start)return null;
 return {id:String(g.gamePk),season:Number(g.season),startTime:new Date(start).toISOString(),availableAt:new Date(available).toISOString(),homeId:String(g.teams.home.team.id),awayId:String(g.teams.away.team.id),homeName:g.teams.home.team.name,awayName:g.teams.away.team.name,homeScore:g.teams.home.score,awayScore:g.teams.away.score,sourceUrl};
}

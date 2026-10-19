import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {trainHistoricalModel} from '../src/lib/gcm/calibration.ts';
const [sport,input,output]=process.argv.slice(2);
if(!sport||!input||!output)throw new Error('Usage: node --experimental-strip-types scripts/calibrate-gcm.mjs SPORT REAL_HISTORY.json NEW_REPORT.json');
const raw=await readFile(input,'utf8');
const report=trainHistoricalModel(sport,JSON.parse(raw));
await writeFile(output,JSON.stringify({...report,inputSha256:createHash('sha256').update(raw).digest('hex')},null,2),{flag:'wx'});
console.log(`Saved offline calibration report. Live approval remains disabled. Counts: ${JSON.stringify(report.counts)}`);

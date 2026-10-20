import {z} from 'zod';
// A historical result alone is not a point-in-time training packet. All sports use
// the same timing/provenance contract; their features and target outcomes differ.
export const historicalRecordSchema=z.object({
 sport:z.string(),eventId:z.string(),market:z.enum(['h2h','spreads','totals','outrights']),
 target:z.enum(['TWO_WAY_WINNER','THREE_WAY_REGULATION','MARGIN','TOTAL','MULTI_RUNNER']),
 decisionAt:z.string().datetime(),settledAt:z.string().datetime(),
 selections:z.array(z.string().min(1)).min(2),observedOutcome:z.string().min(1),
 features:z.array(z.object({participant:z.string(),metric:z.string(),value:z.number().finite(),observedAt:z.string().datetime(),sourceUrl:z.string().url().startsWith('https://')})).min(1),
 settledValue:z.number().finite().optional(),settlementDefinition:z.string().min(10),sourceResultUrl:z.string().url().startsWith('https://'),
}).superRefine((record,ctx)=>{
 if(Date.parse(record.decisionAt)>=Date.parse(record.settledAt))ctx.addIssue({code:'custom',message:'Decision must precede settlement.'});
 if(record.features.some(f=>Date.parse(f.observedAt)>Date.parse(record.decisionAt)))ctx.addIssue({code:'custom',message:'Post-decision feature leakage.'});
 if(new Set(record.selections).size!==record.selections.length||!record.selections.includes(record.observedOutcome))ctx.addIssue({code:'custom',message:'Invalid or duplicate outcome selections.'});
 if(['MARGIN','TOTAL'].includes(record.target)&&record.settledValue===undefined)ctx.addIssue({code:'custom',message:'A score-margin/total model needs the verified settled numeric target.'});
 if(record.target==='TWO_WAY_WINNER'&&(record.selections.length!==2||record.sport.startsWith('soccer_')))ctx.addIssue({code:'custom',message:'Binary winner targets cannot replace soccer draws or multi-runner markets.'});
 if(record.target==='THREE_WAY_REGULATION'&&(record.selections.length!==3||!record.selections.includes('Draw')))ctx.addIssue({code:'custom',message:'Three-way regulation requires a separate Draw outcome.'});
});
export type HistoricalRecord=z.infer<typeof historicalRecordSchema>;

// Provider response messages can echo key fragments. Only fixed, classified text escapes.
export function openAiFailure(status:number,code?:unknown){
 if(status===401)return {code:'OPENAI_AUTHENTICATION_FAILED',message:'OpenAI rejected OPENAI_API_KEY (HTTP 401). Replace this secret in the Vercel Production environment with a valid OpenAI API project key, then redeploy. Database and statistics access do not fix AI authentication.'};
 if(status===403)return {code:'OPENAI_ACCESS_DENIED',message:'OpenAI denied this project or key access (HTTP 403). Verify project permissions and model availability for the configured key.'};
 if(status===429&&code==='insufficient_quota')return {code:'OPENAI_QUOTA_EXHAUSTED',message:'OpenAI reports insufficient API quota. Check API project billing and spending limits; no research estimate was substituted.'};
 if(status===429)return {code:'OPENAI_RATE_LIMITED',message:'OpenAI rate-limited the research request. Retry after the saved failure expires.'};
 if(code==='model_not_found'||status===404)return {code:'OPENAI_MODEL_UNAVAILABLE',message:'OpenAI could not access OPENAI_MODEL. Verify the exact model identifier and that this API project has access.'};
 if(code==='invalid_json_schema')return {code:'OPENAI_SCHEMA_REJECTED',message:'OpenAI rejected the structured research schema. No research result was substituted.'};
 return {code:status>=500?'OPENAI_PROVIDER_UNAVAILABLE':'OPENAI_REQUEST_REJECTED',message:`OpenAI returned HTTP ${status}. Verify model/API compatibility${status>=500?' or retry after the provider recovers':''}. No research result was substituted.`};
}

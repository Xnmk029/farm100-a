import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {TASKS} from '../packages/benchmark-v2/catalog';
import {AnswerSchema,type Attempt} from '../packages/benchmark-v2/scoring';
import {runCase,assess,sha,writeJSON} from './benchmark-v2-engine';
const root=path.resolve('artifacts/scoring-v2');
const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
for(const input of process.argv.slice(2)){
 const p=JSON.parse(await readFile(input,'utf8'));if(p.model!=='gpt-5.6-luna'||p.reasoning!=='max')throw Error('agent model configuration mismatch');
 const t=TASKS.find(t=>t.id===p.taskId);if(!t)throw Error('unknown task');
 const id=p.model+'-'+p.taskId+'-'+p.round,dir='calls/agent-'+id;
 const call={id:'agent-'+id,model:p.model,actualModel:p.model,identitySource:'Accepted explicit subagent model override; backend revision not exposed',reasoning:'max',agentId:p.agent_id,startedAt:p.startedAt,finishedAt:p.finishedAt,durationMs:Date.parse(p.finishedAt)-Date.parse(p.startedAt),durationMeaning:'Dispatch to completion receipt including orchestration latency',usage:null,billing:'codex-subscription',additionalRmb:null,reserved:0,priceSource:'Codex in-app subagent subscription',evidence:dir,status:'completed'};
 Object.assign(call,{resumeHistory:p.resumeHistory??[]});
 await writeJSON(path.join(root,dir,'request.json'),{model:p.model,prompt:p.prompt,sha256:sha(p.prompt),reasoning:'max',agentId:p.agent_id,messages:p.messages});
 await writeJSON(path.join(root,dir,'response-normalized.json'),{model:p.model,identitySource:call.identitySource,content:p.response,usage:null});
 const a:Attempt={id,model:p.model,taskId:p.taskId,round:p.round,status:'evaluated',cases:[],call};
 try{a.answer=AnswerSchema.parse(JSON.parse(p.response.replace(/^```(?:json)?\s*|\s*```$/g,'')));a.sourceHash=sha(a.answer.source);}catch(e){a.status='submission_error';a.rawSubmission=p.response;a.error=String(e);}
 if(a.answer)try{for(const spec of t.cases){const file='runs/'+id+'/'+spec.id.replaceAll('/','-')+'.json';const run=await runCase(t,spec,a.answer.source);await writeJSON(path.join(root,file),run);a.cases.push(assess(t,spec,run,manifest.references[spec.id].primary,file));}}catch(e){a.status='infrastructure_error';a.error=String(e);}
 await writeJSON(path.join(root,'agent-results',id+'.json'),a);console.log(JSON.stringify({id,status:a.status,passed:a.cases.filter(c=>c.passed).length,cases:t.cases.length}));
}

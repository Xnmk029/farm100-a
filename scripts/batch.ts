import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execute} from '../packages/runner';
import {VERSION,RULE} from '../packages/protocol';
import {validateRun} from '../packages/recording';
const suite=JSON.parse(await readFile('scenarios/sort-field-v1/suites/standard.json','utf8'));
await mkdir('artifacts/batch',{recursive:true});
const summary=[];
for(const example of ['reference','cached-insertion']){
  const source=await readFile(`examples/${example}.js`,'utf8');
  for(const size of suite.sizes)for(const seed of suite.seeds){
    const run=await execute({protocolVersion:VERSION,runId:randomUUID(),source,label:example,attempt:1,config:{rule:RULE,size,seed,budget:suite.budgets[size]}});
    validateRun(run);
    if(seed===42&&size===8)await writeFile(`artifacts/batch/${example}-8-42.farmrun`,JSON.stringify(run));
    summary.push({example,size,seed,reason:run.result.reason,cost:run.result.state.cost,...run.result.state.counts,hash:run.logicalHash});
    console.log(example,size,seed,run.result.reason,run.result.state.cost);
  }
}
await writeFile('artifacts/batch/summary.json',JSON.stringify(summary,null,2));
const keys=Object.keys(summary[0]);await writeFile('artifacts/batch/summary.csv',keys.join(',')+'\n'+summary.map(r=>keys.map(k=>(r as Record<string,unknown>)[k]).join(',')).join('\n'));

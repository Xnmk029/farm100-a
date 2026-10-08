import {dialog} from 'electron';
import {readFile,writeFile,mkdir,rename,stat,realpath,copyFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {TASKS,BENCHMARK_VERSION,MANUAL_KEYS} from '../../../../packages/benchmark-v2/catalog';
import {AnswerSchema,ReviewSchema,validateReview,leaderboard,budgetReservation,exportCSV,mergeImportedReviews,type Bundle} from '../../../../packages/benchmark-v2/scoring';
import {assess} from '../../../../packages/benchmark-v2/evaluate';
import {canonical} from '../../../../packages/protocol';
import {z} from 'zod';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
async function bounded(file:string){if((await stat(file)).size>64*1024*1024)throw Error('文件超过64MiB');return readFile(file,'utf8');}
async function evidenceFile(root:string,relative:string){
 if(path.isAbsolute(relative))throw Error('证据必须使用相对路径');
 const base=await realpath(root),file=await realpath(path.resolve(root,relative));
 if(!file.toLowerCase().startsWith(base.toLowerCase()+path.sep))throw Error('证据路径越界');return file;
}
export async function validateBundle(raw:unknown,root:string):Promise<Bundle>{
 const b=z.object({version:z.literal(BENCHMARK_VERSION),manifest:z.any(),models:z.array(z.string().min(1).max(100)).max(3),attempts:z.array(z.any()).max(186),reviews:z.array(z.any()).max(10000),ledger:z.array(z.any()).max(1000),providers:z.array(z.any()).max(100)}).parse(raw) as Bundle;
 budgetReservation(b.ledger,0);if(new Set(b.models).size!==b.models.length)throw Error('重复模型');
 const ledgerById=new Map<string,any>();
 for(const entry of b.ledger){
  const checked=z.object({id:z.string().min(1),model:z.string().min(1),evidence:z.string().min(1).optional(),reserved:z.number().finite().nonnegative(),charged:z.number().finite().nonnegative().optional()}).passthrough().parse(entry);
  if(ledgerById.has(checked.id))throw Error('重复账本记录');ledgerById.set(checked.id,checked);
  if(checked.billing==='grok-build-subscription-or-metered'){
   if(!checked.evidence)throw Error('Grok 账本缺少调用证据');
   let request:any;
   try{request=JSON.parse(await bounded(await evidenceFile(root,checked.evidence+'/request.json')));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'&&checked.status==='infrastructure_error'&&checked.costStatus==='unknown; full reservation retained'&&checked.reserved>0&&checked.charged===undefined&&checked.reportedCostUsd===undefined)continue;throw error;}
   const expectedReserved=((16000+Math.ceil(Buffer.byteLength(request.prompt)/4))*2+6000*6)/1e6*10;
   if(request.model!==checked.model||request.sha256!==hash(request.prompt)||checked.cnyPerUsdCeiling!==10||checked.inputPrice!==2||checked.outputPrice!==6||Math.abs(checked.reserved-expectedReserved)>1e-12)throw Error('Grok 预留费用与请求证据不一致');
   if(checked.status==='completed'){
    const response=JSON.parse(await bounded(await evidenceFile(root,checked.evidence+'/response-normalized.json'))),rawResponse=JSON.parse(await bounded(await evidenceFile(root,checked.evidence+'/stdout.txt'))),cost=rawResponse.total_cost_usd;
    if(Object.keys(rawResponse.modelUsage??{})[0]!==checked.model||String(rawResponse.text??'').trim()!==String(response.content??'').trim()||canonical(rawResponse.usage??null)!==canonical(response.usage??null)||canonical(cost??null)!==canonical(response.totalCostUsd??null)||!Number.isFinite(cost)||checked.reportedCostUsd!==cost||typeof checked.charged!=='number'||!Number.isFinite(checked.charged)||Math.abs(checked.charged-cost*10)>1e-12)throw Error('Grok 费用与原始响应不一致');
   }else if(checked.charged!==undefined||checked.reportedCostUsd!==undefined)throw Error('未完成的 Grok 调用不能确认费用');
  }
 }
 const {hash:expected,...body}=b.manifest;if(expected!==hash(canonical(body))||canonical(body.tasks)!==canonical(TASKS))throw Error('清单哈希或题目规则不匹配');
 for(const task of TASKS)for(const spec of task.cases){const ref=b.manifest.references[spec.id];if(!ref)throw Error('缺少冻结参考');const text=await bounded(await evidenceFile(root,ref.file));if(hash(text)!==ref.recordHash)throw Error('参考记录已变更');const run=JSON.parse(text);if(hash(run.source)!==ref.sourceHash)throw Error('参考源码哈希不同');const result=assess(task,spec,run,ref.primary,ref.file);if(!result.passed||result.primary!==ref.primary)throw Error('参考成绩不成立');}
 const ids=new Set<string>(),slots=new Set<string>();
 for(const a of b.attempts){
  z.object({id:z.string().min(1),taskId:z.string(),model:z.string(),round:z.union([z.literal(1),z.literal(2)]),status:z.enum(['evaluated','infrastructure_error','submission_error']),cases:z.array(z.any()),call:z.any()}).parse(a);
  const task=TASKS.find(t=>t.id===a.taskId);const slot=a.model+'/'+a.taskId+'/'+a.round;
  if(!task||!b.models.includes(a.model)||ids.has(a.id)||slots.has(slot))throw Error('未知或重复提交');ids.add(a.id);slots.add(slot);
  if(a.answer){a.answer=AnswerSchema.parse(a.answer);if(hash(a.answer.source)!==a.sourceHash)throw Error('源码哈希不同');}
  if(a.status!=='infrastructure_error'){
   if(!a.call?.id||!a.call?.evidence||a.call.actualModel!==a.model)throw Error('模型调用证据缺失');
   const ledger=ledgerById.get(a.call.id);if(!ledger)throw Error('提交缺少对应账本记录');
   if((ledger.evidence??'calls/'+ledger.id)!==a.call.evidence)throw Error('提交调用与账本记录不一致');
   for(const key of ['model','reserved','charged','billing','route','actualModel','reportedCostUsd','usage','cnyPerUsdCeiling','inputPrice','outputPrice','priceSource','additionalRmb','status'] as const)if(canonical(ledger[key]??null)!==canonical(a.call[key]??null))throw Error('提交调用与账本记录不一致');
   const response=JSON.parse(await bounded(await evidenceFile(root,a.call.evidence+'/response-normalized.json')));const request=JSON.parse(await bounded(await evidenceFile(root,a.call.evidence+'/request.json')));if(request.model!==a.model||request.sha256!==hash(request.prompt)||response.model!==a.model)throw Error('调用模型或请求哈希不同');
   if(ledger.billing==='codex-subscription'){if(ledger.reserved!==0||ledger.charged!==undefined||ledger.reportedCostUsd!==undefined)throw Error('订阅调用费用记录不一致');}
   if(ledger.billing==='grok-build-subscription-or-metered'){
    const rawResponse=JSON.parse(await bounded(await evidenceFile(root,a.call.evidence+'/stdout.txt'))),cost=rawResponse.total_cost_usd;
    if(Object.keys(rawResponse.modelUsage??{})[0]!==a.model||String(rawResponse.text??'').trim()!==String(response.content??'').trim()||canonical(rawResponse.usage??null)!==canonical(response.usage??null)||canonical(cost??null)!==canonical(response.totalCostUsd??null))throw Error('Grok 原始响应与标准化证据不一致');
    if(!Number.isFinite(cost)||ledger.reportedCostUsd!==cost||!Number.isFinite(ledger.charged)||Math.abs(ledger.charged-cost*10)>1e-12)throw Error('Grok 费用与原始响应不一致');
   }
   const content=response.content??response.choices?.[0]?.message?.content;if(a.answer){const submitted=AnswerSchema.parse(JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g,'')));if(canonical(submitted)!==canonical(a.answer))throw Error('响应与提交不同');}
  }
  if(a.status==='evaluated'||a.cases.length){
   if(!a.answer||(a.status==='evaluated'&&a.cases.length!==task.cases.length))throw Error('执行证据不完整');
   const seen=new Set<string>();
   for(const c of a.cases){const spec=task.cases.find(s=>s.id===c.id);if(!spec||seen.has(c.id))throw Error('案例不匹配');seen.add(c.id);
    const run=JSON.parse(await bounded(await evidenceFile(root,c.evidence)));if(run.source!==a.answer.source)throw Error('运行源码与提交不同');
    const computed=assess(task,spec,run,b.manifest.references[c.id].primary,c.evidence);if(canonical(computed)!==canonical(c))throw Error('分数与事件不一致');
   }
  }
 }
 for(const a of b.attempts.filter(a=>a.round===2)){const first=b.attempts.find(f=>f.model===a.model&&f.taskId===a.taskId&&f.round===1);if(!first||first.status==='infrastructure_error'||first.status==='evaluated'&&first.cases.every(c=>c.passed))throw Error('修订必须对应一次真实失败的首次提交');}
 let revision=0;for(const r of b.reviews){const a=b.attempts.find(a=>a.id===r.attemptId);if(!a)throw Error('评分引用未知提交');const {revision:rev,at,...content}=r;validateReview(content,a);if(!Number.isInteger(rev)||rev<=revision||!Number.isFinite(Date.parse(at)))throw Error('人工评分修订历史无效');revision=rev;}
 return b;
}
export function benchmarkHandlers(dataRoot:()=>string){
 const file=()=>path.join(dataRoot(),'benchmark-v2.json');let cached:{bundle:Bundle;sourceRoot:string}|null=null;let queue=Promise.resolve();
 async function load(){if(cached)return cached;try{const parsed=JSON.parse(await bounded(file()));parsed.bundle=await validateBundle(parsed.bundle,parsed.sourceRoot);cached=parsed;return cached;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}}
 async function save(value:{bundle:Bundle;sourceRoot:string}){await mkdir(dataRoot(),{recursive:true});const tmp=file()+'.tmp-'+randomUUID();await writeFile(tmp,JSON.stringify(value));await rename(tmp,file());cached=value;}
 return {
  get:async()=>{const x=await load();return x?.bundle??null;},
  import:async()=>{const d=await dialog.showOpenDialog({filters:[{name:'评分v2证据包',extensions:['json']}],properties:['openFile']});if(d.canceled)return null;const imported=JSON.parse(await bounded(d.filePaths[0]));const parent=path.dirname(d.filePaths[0]);if(imported.evidenceDirectory&&(path.basename(imported.evidenceDirectory)!==imported.evidenceDirectory))throw Error('非法证据目录');const sourceRoot=imported.evidenceDirectory?path.join(parent,imported.evidenceDirectory):parent,bundle=await validateBundle(imported,sourceRoot);const previous=await load();if(previous&&previous.bundle.reviews.length){if(previous.bundle.manifest.hash!==bundle.manifest.hash)throw Error('请先导出当前人工评分，不能覆盖不同清单');const importedIds=new Set(bundle.attempts.map(a=>a.id));for(const review of previous.bundle.reviews){const old=previous.bundle.attempts.find(a=>a.id===review.attemptId),fresh=bundle.attempts.find(a=>a.id===review.attemptId);if(!fresh||old?.sourceHash!==fresh.sourceHash||canonical(old?.cases)!==canonical(fresh.cases))throw Error('已有人工评分的提交证据不能改变');}if(previous.bundle.reviews.some(r=>!importedIds.has(r.attemptId)))throw Error('新证据包缺少已有人工评分的提交');bundle.reviews=mergeImportedReviews(previous.bundle.reviews,bundle.reviews);}await save({bundle,sourceRoot});return bundle;},
  review:(arg:any)=>{const operation=queue.then(async()=>{const x=await load();if(!x)throw Error('请先导入证据包');const revision=x.bundle.reviews.at(-1)?.revision??0;if(arg.expectedRevision!==revision)throw Error('评分已更新，请重新加载');const attempt=x.bundle.attempts.find(a=>a.id===arg.review?.attemptId);if(!attempt)throw Error('提交不存在');const r=validateReview(arg.review,attempt);const bundle={...x.bundle,reviews:[...x.bundle.reviews,{...r,revision:revision+1,at:new Date().toISOString()}]};await save({...x,bundle});return bundle;});queue=operation.then(()=>{},()=>{});return operation;},
  evidence:async(arg:any)=>{const x=await load();if(!x)throw Error('缺少证据');const a=x.bundle.attempts.find(a=>a.id===arg.attemptId);const c=a?.cases.find(c=>c.id===arg.caseId);if(!c)throw Error('证据不存在');return bounded(await evidenceFile(x.sourceRoot,c.evidence));},
  export:async(format:any)=>{const x=await load();if(!x)throw Error('缺少证据');if(!['json','csv'].includes(format))throw Error('未知导出格式');const d=await dialog.showSaveDialog({defaultPath:'farm100-scores-v2.'+format});if(d.canceled||!d.filePath)return false;
   let text=JSON.stringify(x.bundle,null,2);
   if(format==='json'){
    const evidenceDirectory=path.basename(d.filePath)+'.evidence',destination=path.join(path.dirname(d.filePath),evidenceDirectory);
    const paths=new Set([...Object.values(x.bundle.manifest.references).map(r=>r.file),...x.bundle.attempts.flatMap(a=>a.cases.map(c=>c.evidence))]);
    for(const entry of [...x.bundle.ledger,...x.bundle.attempts.map(a=>a.call)]){const folder=entry?.evidence??(entry?.id?'calls/'+entry.id:null);if(!folder)continue;try{const full=await evidenceFile(x.sourceRoot,folder);for(const name of await readdir(full)){if(['request.json','response.json','response-normalized.json','stdout.txt','stderr.txt'].includes(name))paths.add(folder+'/'+name);}}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
    for(const relative of paths){const from=await evidenceFile(x.sourceRoot,relative),to=path.resolve(destination,relative);if(!to.toLowerCase().startsWith(path.resolve(destination).toLowerCase()+path.sep))throw Error('导出路径越界');await mkdir(path.dirname(to),{recursive:true});await copyFile(from,to);}
    text=JSON.stringify({...x.bundle,evidenceDirectory,leaderboards:{first:leaderboard(x.bundle,1),revised:leaderboard(x.bundle,2)}},null,2);
   }
   if(format==='csv')text=exportCSV(x.bundle);
   await writeFile(d.filePath,text);return true;},
 };
}

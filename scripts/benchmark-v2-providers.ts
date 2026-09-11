import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {budgetReservation} from '../packages/benchmark-v2/scoring';
import {writeJSON,sha} from './benchmark-v2-engine';
export const CANDIDATES=['gpt-5.3-codex-spark','gpt-5.6-luna'];
export const BILLING_SOURCE='https://opencode.ai/v2/docs/console/go';
export async function providerInventory(){
 const config=JSON.parse(await readFile(path.join(os.homedir(),'.pi/agent/models.json'),'utf8'));
 return Object.entries(config.providers).map(([id,v]:[string,any])=>({id,endpoint:new URL(v.baseUrl??'http://unknown').origin+new URL(v.baseUrl??'http://unknown').pathname,credentialPresent:!!v.apiKey,source:'~/.pi/agent/models.json',selected:id==='opencode-go',note:id==='scnet'?'套餐不用于非交互式批量调用':id==='opencode-go'?'Go 支持API；可能使用余额，按公开价预留费用':'本轮未纳入，未确认计费或不需要更多模型'}));
}
export async function callModel(model:string,prompt:string,root:string,id:string,ledger:any[],route:'go'|'deepseek'='go'){
 if(!CANDIDATES.includes(model))throw Error('模型未获准');
 if(Buffer.byteLength(prompt)>60000)throw Error('Prompt exceeds fixed input bound');
 const dir=path.join(root,'calls',id);await mkdir(dir,{recursive:true});
 const native=['gpt-5.3-codex-spark','gpt-5.6-luna'].includes(model);const effort=model==='gpt-5.6-luna'?'max':'medium';
 if(native){const auth=JSON.parse(await readFile(path.join(os.homedir(),'.codex/auth.json'),'utf8'));if(auth.auth_mode!=='chatgpt')throw Error('Spark 非订阅登录，费用未知');}
 // 10 CNY/USD is an explicit conservative ceiling, not a claimed exchange rate or bill.
 const inputPrice=route==='deepseek'?.44:.14,outputPrice=route==='deepseek'?1.32:.28;
 const reservation=budgetReservation(ledger,native?0:(Buffer.byteLength(prompt)*inputPrice+6000*outputPrice)/1e6*10);
 const entry:any={id,model,evidence:'calls/'+id,startedAt:new Date().toISOString(),reserved:reservation,billing:native?'codex-subscription':route==='deepseek'?'metered':'go-subscription-or-balance',route:native?'codex-cli':route,inputPrice:native?null:inputPrice,outputPrice:native?null:outputPrice,additionalRmb:null,cnyPerUsdCeiling:10,priceSource:native?'local auth_mode=chatgpt':route==='deepseek'?'https://api-docs.deepseek.com/quick_start/pricing/':BILLING_SOURCE};ledger.push(entry);await writeJSON(path.join(root,'ledger.json'),ledger);
 await writeJSON(path.join(dir,'request.json'),{model,prompt,maxOutputTokens:native?null:6000,reasoning:native?effort:'provider-default',sha256:sha(prompt)});
 try{
  let content='',response:any,actualModel:string|undefined;
  if(native){
   const isolated=path.join(root,'isolated',id);await mkdir(isolated,{recursive:true});
   const args=['exec','--ignore-user-config','--ephemeral','--sandbox','read-only','--skip-git-repo-check','--disable','shell_tool','--disable','multi_agent','-C',isolated,'-m',model,'-c','model_reasoning_effort='+effort,'-'];
   const child=spawn('codex',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
   child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',c=>stderr+=c);child.stdin.end(prompt);
   const timer=setTimeout(()=>child.kill(),600000);const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);}).finally(()=>clearTimeout(timer));
   await writeFile(path.join(dir,'stdout.txt'),stdout);await writeFile(path.join(dir,'stderr.txt'),stderr);
   actualModel=stderr.match(/^model:\s*(\S+)/m)?.[1];if(code!==0)throw Error(/usage limit|quota/i.test(stderr)?'quota_exhausted: Codex model usage limit':'Codex failed: '+String(code));
   if(actualModel!==model)throw Error('CLI 模型身份未确认或不同');
   content=stdout.trim();response={model:actualModel,identitySource:'Codex runtime banner',usage:{reportedTotal:stderr.match(/tokens used\s+([\d,]+)/)?.[1]??null},content};
  }else{
   const config=JSON.parse(await readFile(path.join(os.homedir(),'.pi/agent/models.json'),'utf8')).providers[route==='deepseek'?'DeepSeek':'opencode-go'];
   if(config.baseUrl!==(route==='deepseek'?'https://api.deepseek.com/v1':'https://opencode.ai/zen/go/v1')||typeof config.apiKey!=='string'||!config.apiKey)throw Error('套餐配置缺失或端点不匹配');
   const res=await fetch(config.baseUrl+'/chat/completions',{method:'POST',redirect:'error',signal:AbortSignal.timeout(180000),headers:{Authorization:'Bearer '+config.apiKey,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'user',content:prompt}],max_tokens:6000,temperature:0})});
   const raw=(await res.text()).replaceAll(config.apiKey,'[REDACTED]');await writeFile(path.join(dir,'response.json'),raw);
   if(!res.ok)throw Error(route+' HTTP '+res.status);
   response=JSON.parse(raw);actualModel=response.model;entry.actualModel=actualModel;entry.usage=response.usage??null;
   if(actualModel!==model)throw Error('API 返回模型不同：'+String(actualModel));
   content=response.choices?.[0]?.message?.content??'';
   const usage=response.usage;entry.usage=usage??null;
   if(usage&&Number.isFinite(usage.prompt_tokens)&&Number.isFinite(usage.completion_tokens)){
    const upper=(usage.prompt_tokens*inputPrice+usage.completion_tokens*outputPrice)/1e6*10;
    entry.charged=upper;entry.chargedMeaning='人民币支出上界，实际套餐/余额扣费未知';
    if(upper>reservation)throw Error('响应用量超出预留边界，暂停后续调用');
   }
  }
  entry.usage=response.usage??null;entry.actualModel=actualModel;entry.durationMs=Date.now()-Date.parse(entry.startedAt);entry.finishedAt=new Date().toISOString();entry.status='completed';
  await writeJSON(path.join(dir,'response-normalized.json'),response);await writeJSON(path.join(root,'ledger.json'),ledger);
  return {content,metadata:{...entry,evidence:'calls/'+id}};
 }catch(error){entry.durationMs=Date.now()-Date.parse(entry.startedAt);entry.finishedAt=new Date().toISOString();entry.status='infrastructure_error';entry.error=String(error);await writeJSON(path.join(root,'ledger.json'),ledger);throw error;}
}

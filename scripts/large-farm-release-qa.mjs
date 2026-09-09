import {spawn} from 'node:child_process';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';

const exe=path.resolve(process.argv[2]??'release/large-farm-0.5.3-final/win-unpacked/FARM100.exe');
const out=path.resolve(process.argv[3]??`artifacts/large-farm/release-${Date.now()}`);
const input=path.resolve(process.argv[4]??'artifacts/large-farm/preparation-v2/earned.garden.json');
await mkdir(out,{recursive:true});
const sha=async file=>{const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');};
const files=await Promise.all([exe,path.join(path.dirname(exe),'resources/app.asar')].map(async file=>({path:file,sha256:await sha(file)})));
const report={startedAt:new Date().toISOString(),pass:false,files,input,inputSHA256:await sha(input),runs:[]};
const save=()=>writeFile(path.join(out,'release-qa.json'),JSON.stringify(report,null,2));
async function run(name,command,args,extra={}){
  const dir=path.join(out,name);await mkdir(dir,{recursive:true});
  const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('FARM100_')||key==='ELECTRON_RUN_AS_NODE')delete env[key];
  Object.assign(env,extra);
  const row={name,command,args,env:extra,startedAt:new Date().toISOString()};report.runs.push(row);await save();
  const log=createWriteStream(path.join(dir,'process.log'));
  const child=spawn(command,args,{cwd:process.cwd(),env,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
  row.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});log.end();
  row.completedAt=new Date().toISOString();await save();assert.equal(row.exitCode,0,name+' exit');console.log(name+' completed');
}
try{
  await run('compatibility',process.execPath,['scripts/stream-release-qa.mjs',exe,path.join(out,'compatibility')]);
  const compatible=JSON.parse(await readFile(path.join(out,'compatibility/packaged-verification.json'),'utf8'));assert.equal(compatible.pass,true);
  for(const seconds of [120,1800]){
    const name=seconds===120?'calibration':'performance-30m',dir=path.join(out,name);
    await run(name,exe,['--qa-render','--qa-garden','--qa-performance'],{FARM100_QA_DIR:dir,FARM100_PERF_SECONDS:String(seconds),FARM100_PERF_SAVE:input});
    const result=JSON.parse(await readFile(path.join(dir,'performance-qa.json'),'utf8'));
    if(seconds===120)for(const [check,pass]of Object.entries(result.checks)){if(check!=='duration')assert.equal(pass,true,'Calibration '+check);}
    else assert.equal(result.pass,true,'30 minute performance acceptance');
    report.runs.at(-1).proof={pass:seconds===1800?result.pass:true,p95Ms:result.p95Ms,cancelMs:result.cancelMs,events:result.events,checks:result.checks};await save();
  }
  for(const file of files)assert.equal(await sha(file.path),file.sha256,'Package changed during acceptance');
  report.pass=true;
}catch(error){report.error=String(error);process.exitCode=1;}
report.completedAt=new Date().toISOString();await save();

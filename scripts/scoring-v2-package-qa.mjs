import {spawn} from 'node:child_process';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const exe=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
await mkdir(out,{recursive:true});
const sha=async file=>{const h=createHash('sha256');for await(const c of createReadStream(file))h.update(c);return h.digest('hex');};
const files=await Promise.all([exe,path.join(path.dirname(exe),'resources/app.asar')].map(async file=>({file,sha256:await sha(file)})));
const report={pass:false,startedAt:new Date().toISOString(),files};
try{
  const env={...process.env};for(const k of Object.keys(env))if(k.startsWith('FARM100_')||k==='ELECTRON_RUN_AS_NODE')delete env[k];
  Object.assign(env,{FARM100_QA_DIR:out,FARM100_QA_BUNDLE:path.resolve(process.argv[4])});
  const log=createWriteStream(path.join(out,'process.log'));
  const child=spawn(exe,['--qa-render','--qa-garden','--qa-benchmark-v2'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
  report.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});log.end();
  assert.equal(report.exitCode,0);
  report.proof=JSON.parse(await readFile(path.join(out,'benchmark-v2-qa.json'),'utf8'));assert.equal(report.proof.pass,true);
  for(const f of files)assert.equal(await sha(f.file),f.sha256,'Package changed during QA');
  report.pass=true;
}catch(e){report.error=String(e);process.exitCode=1;}
report.completedAt=new Date().toISOString();
await writeFile(path.join(out,'packaged-verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({pass:report.pass,error:report.error}));

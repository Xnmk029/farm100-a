import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const exe=path.resolve(process.argv[2]);
const out=path.resolve(process.argv[3]);
await mkdir(out,{recursive:true});
const report={exe,startedAt:new Date().toISOString(),pass:false,runs:[]};
try{
  for(const [name,flag,dpr,proof] of [
    ['lessons','--qa-lessons-ui','1','lessons-ui-qa.json'],
    ...['1','1.5','2'].map(dpr=>['display-'+dpr,'--qa-display-ui',dpr,'display-ui-qa.json'])
  ]){
    const dir=path.join(out,name);await mkdir(dir,{recursive:true});
    const env={...process.env};
    for(const key of Object.keys(env))if(key.startsWith('FARM100_')||key==='ELECTRON_RUN_AS_NODE')delete env[key];
    Object.assign(env,{FARM100_QA_DIR:dir,FARM100_QA_DPR:dpr});
    const log=createWriteStream(path.join(dir,'process.log'));
    const child=spawn(exe,['--qa-render','--qa-garden',flag,'--force-device-scale-factor='+dpr],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
    const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
    log.end();assert.equal(exitCode,0,name);
    const result=JSON.parse(await readFile(path.join(dir,proof),'utf8'));assert.equal(result.pass,true,name);
    report.runs.push({name,exitCode,proof:path.join(dir,proof),pass:true});
    console.log(name+' passed');
  }
  report.pass=true;
}catch(error){report.error=String(error);process.exitCode=1;}
report.completedAt=new Date().toISOString();
await writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,2));

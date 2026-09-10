import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const out=path.resolve(process.argv[2]??'artifacts/audio/final-20260910');await mkdir(out,{recursive:true});
const report={pass:false,startedAt:new Date().toISOString(),runs:[]};
const save=()=>writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,2));
async function run(name,args,extra={}){
  const row={name,args,startedAt:new Date().toISOString()};report.runs.push(row);await save();
  const env={...process.env};for(const k of Object.keys(env))if(k.startsWith('FARM100_')||k==='ELECTRON_RUN_AS_NODE')delete env[k];Object.assign(env,extra);
  const log=createWriteStream(path.join(out,name+'.log')),child=spawn(process.execPath,args,{cwd:process.cwd(),env,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
  row.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});log.end();row.completedAt=new Date().toISOString();await save();assert.equal(row.exitCode,0,name);console.log(name+' passed');
}
try{
  await run('typecheck',['node_modules/typescript/bin/tsc','--noEmit']);
  await run('tests',['node_modules/tsx/dist/cli.mjs','--test','tests/*.test.ts']);
  await run('build',['scripts/build.mjs']);
  await run('audio',['scripts/audio-render-qa.mjs',path.join(out,'audio')]);
  for(const dpr of ['1','1.5','2']){
    const dir=path.join(out,'dpr-'+dpr);
    await run('dpr-'+dpr,['node_modules/electron/cli.js','.','--qa-render','--qa-garden','--qa-display-ui','--force-device-scale-factor='+dpr],{FARM100_QA_DIR:dir,FARM100_QA_DPR:dpr});
    assert.equal(JSON.parse(await readFile(path.join(dir,'display-ui-qa.json'),'utf8')).pass,true);
  }
  report.pass=true;
}catch(e){report.error=String(e);process.exitCode=1;}
report.completedAt=new Date().toISOString();await save();

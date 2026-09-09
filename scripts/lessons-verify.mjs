import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const out=path.resolve(process.argv[2]??'artifacts/lessons/verification'),after=process.argv[3]?path.resolve(process.argv[3]):undefined;
await mkdir(out,{recursive:true});
const report={pass:false,startedAt:new Date().toISOString(),after,status:after?'waiting for performance measurement and recovery':'running',runs:[]};
const save=()=>writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,2));
async function run(name,args,extra={}){
  report.status=name;const row={name,args,startedAt:new Date().toISOString()};report.runs.push(row);await save();
  const env={...process.env};for(const k of Object.keys(env))if(k.startsWith('FARM100_')||k==='ELECTRON_RUN_AS_NODE')delete env[k];Object.assign(env,extra);
  const log=createWriteStream(path.join(out,name+'.log')),child=spawn(process.execPath,args,{cwd:process.cwd(),env,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
  row.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});log.end();row.completedAt=new Date().toISOString();await save();assert.equal(row.exitCode,0,name);console.log(name+' passed');
}
try{
  await save();
  if(after){
    const deadline=Date.now()+3*60*60*1000;
    for(;;){
      try{const p=JSON.parse(await readFile(after,'utf8'));if(p.completedAt&&p.seconds===1800){report.dependency={completedAt:p.completedAt,pass:p.pass};break;}}
      catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
      if(Date.now()>deadline)throw Error('Timed out waiting for completed performance measurement; no tests started');
      await new Promise(r=>setTimeout(r,5000));
    }
  }
  await run('typecheck',['node_modules/typescript/bin/tsc','--noEmit']);
  await run('lessons',['node_modules/tsx/dist/cli.mjs','--test','tests/garden-lessons.test.ts']);
  await run('build',['scripts/build.mjs']);
  await run('ui',['node_modules/electron/cli.js','.','--qa-render','--qa-garden','--qa-lessons-ui'],{FARM100_QA_DIR:path.join(out,'ui')});
  const ui=JSON.parse(await readFile(path.join(out,'ui/lessons-ui-qa.json'),'utf8'));assert.equal(ui.pass,true);
  report.pass=true;report.status='passed';
}catch(e){report.error=String(e);report.status='failed';process.exitCode=1;}
report.completedAt=new Date().toISOString();await save();

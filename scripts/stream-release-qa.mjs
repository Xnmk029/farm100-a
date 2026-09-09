import {spawn} from 'node:child_process';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';

const exe=path.resolve(process.argv[2]??'release/stream-0.5.2-20260910/win-unpacked/FARM100.exe');
const out=path.resolve(process.argv[3]??`artifacts/stream/final-${Date.now()}`);
await mkdir(out,{recursive:true});
const sha=async file=>{const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');};
const files=await Promise.all([exe,path.join(path.dirname(exe),'resources/app.asar')].map(async file=>({path:file,bytes:(await stat(file)).size,sha256:await sha(file)})));
const report={version:JSON.parse(await readFile('package.json','utf8')).version,startedAt:new Date().toISOString(),files,pass:false,runs:[],limits:['Development-machine packaged QA, not clean Windows installation acceptance','Native file dialog choices are substituted by the QA harness','Large record is an 8x8 eight-drone wait workload, not 32x32 mixed production performance']};
const save=()=>writeFile(path.join(out,'packaged-verification.json'),JSON.stringify(report,null,2));
async function run(name,args,{dir=name,env={},expectedExit=0,proof}={}){
  const destination=path.join(out,dir);await mkdir(destination,{recursive:true});
  const environment={...process.env,FARM100_QA_DIR:destination,...env};delete environment.ELECTRON_RUN_AS_NODE;
  for(const key of ['FARM100_CHALLENGE','FARM100_DRONES','FARM100_QA_PROFILE','FARM100_STREAM_ARCHIVE'])if(!(key in env))delete environment[key];
  const row={name,args,env:Object.fromEntries(Object.entries(environment).filter(([k])=>k.startsWith('FARM100_'))),startedAt:new Date().toISOString()};report.runs.push(row);await save();
  const log=createWriteStream(path.join(destination,name+'.log'));
  const child=spawn(exe,args,{cwd:process.cwd(),env:environment,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
  row.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});log.end();row.completedAt=new Date().toISOString();await save();
  assert.equal(row.exitCode,expectedExit,name+' exit');
  if(proof){row.proof=JSON.parse(await readFile(path.join(destination,proof),'utf8'));assert.equal(row.proof.pass,true,name+' proof');}
  row.pass=true;await save();console.log(name+' passed');
}
try{
  await run('stream-utility',['--qa-stream-utility'],{proof:'stream-utility-qa.json'});
  await run('stream-ui',['--qa-render','--qa-garden','--qa-stream-ui'],{env:{FARM100_STREAM_ARCHIVE:path.join(out,'stream-utility/large.farmjournal')},proof:'stream-ui-qa.json'});
  const profile=path.join(out,'history-profile');
  await run('history-crash',['--qa-history-crash'],{dir:'history',env:{FARM100_QA_PROFILE:profile},expectedExit:86});
  await run('history-ui',['--qa-render','--qa-garden','--qa-history-ui'],{dir:'history',env:{FARM100_QA_PROFILE:profile},proof:'history-ui-qa.json'});
  await run('economy',['--qa-render','--qa-garden','--qa-economy-ui'],{proof:'economy-ui-qa.json'});
  await run('challenge',['--qa-render','--qa-garden','--qa-challenge-ui'],{env:{FARM100_CHALLENGE:'maze-3'},proof:'challenge-ui-qa.json'});
  await run('fleet',['--qa-render','--qa-garden','--qa-fleet-ui'],{proof:'fleet-ui-qa.json'});
  for(const file of files)assert.equal(await sha(file.path),file.sha256,'Package changed during QA');
  report.pass=true;
}catch(error){report.error=String(error);process.exitCode=1;}
report.completedAt=new Date().toISOString();await save();

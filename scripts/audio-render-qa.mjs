import {build} from 'esbuild';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const out=path.resolve(process.argv[2]??'artifacts/audio/render-20260910');await mkdir(out,{recursive:true});
const bundle=await build({entryPoints:['packages/garden-view/audio.ts'],bundle:true,platform:'browser',format:'iife',globalName:'FarmAudioModule',write:false});
const source=bundle.outputFiles[0].text;await writeFile(path.join(out,'audio.js'),source);
const browserTest=async()=>{
  const {FarmAudio}=FarmAudioModule;
  const cases=[
    {id:'silence',levels:[0,0,0],event:{action:'harvest',value:1}},
    {id:'ambient',levels:[1,0,0]},
    {id:'action',levels:[0,1,0],event:{action:'till',value:true}},
    {id:'action-half',levels:[0,.5,0],event:{action:'till',value:true}},
    {id:'harvest',levels:[0,0,1],event:{action:'harvest',value:1}},
    {id:'harvest-half',levels:[0,0,.5],event:{action:'harvest',value:1}},
    {id:'harvest-muted',levels:[0,1,0],event:{action:'harvest',value:1}},
    {id:'actions-muted',levels:[0,0,1],event:{action:'till',value:true}},
    {id:'empty-harvest',levels:[0,1,1],event:{action:'harvest',value:0}},
    {id:'start-event',levels:[0,1,1],event:{action:'harvest',value:1,kind:'dispatch'}},
    {id:'live-mute',levels:[1,1,1],event:{action:'harvest',value:1},mute:true},
  ];
  const rows=[];
  for(const item of cases){
    const context=new OfflineAudioContext(1,26460,44100),audio=new FarmAudio(context);audio.volume(...item.levels);await audio.enable();
    const cue=item.event?audio.event(item.event):null;if(item.mute)audio.volume(0,0,0);
    const rendered=await context.startRendering(),data=Array.from(rendered.getChannelData(0));
    const rms=a=>Math.sqrt(a.reduce((sum,v)=>sum+v*v,0)/a.length);
    rows.push({id:item.id,levels:item.levels,cue,rms:rms(data),tailRMS:rms(data.slice(8820)),peak:Math.max(...data.map(Math.abs)),sampleRate:44100,data});audio.dispose();
  }
  return rows;
};
const runner=`const {app,BrowserWindow}=require('electron');const fs=require('node:fs/promises');app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true}});await w.loadURL('data:text/html,<title>FARM100 offline audio QA</title>');await w.webContents.executeJavaScript(${JSON.stringify(source)});const rows=await w.webContents.executeJavaScript(${JSON.stringify('('+browserTest.toString()+')()')});await fs.writeFile(${JSON.stringify(path.join(out,'rendered.json'))},JSON.stringify(rows));app.exit(0);}).catch(async e=>{await fs.writeFile(${JSON.stringify(path.join(out,'error.txt'))},String(e.stack));app.exit(1);});`;
await writeFile(path.join(out,'runner.cjs'),runner);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(path.resolve('node_modules/electron/dist/electron.exe'),[path.join(out,'runner.cjs')],{env,windowsHide:true,stdio:'inherit'});
const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});assert.equal(exitCode,0,'Offline audio renderer');
const rows=JSON.parse(await readFile(path.join(out,'rendered.json'),'utf8')),by=Object.fromEntries(rows.map(r=>[r.id,r]));
for(const id of ['silence','harvest-muted','actions-muted','start-event'])assert.equal(by[id].peak,0,id);
for(const id of ['ambient','action','harvest','empty-harvest'])assert.ok(by[id].rms>.001,id);
for(const id of ['action','harvest'])assert.ok(Math.abs(by[id+'-half'].rms/by[id].rms-.5)<.00001,id+' independent half amplitude');
assert.equal(by['empty-harvest'].cue.success,false);assert.equal(by['empty-harvest'].cue.channel,'actions');assert.ok(by['live-mute'].tailRMS<.00001,'mute silences scheduled tones and environment');
for(const row of rows){
  assert.ok(row.peak<1,'unclipped '+row.id);
  const wav=Buffer.alloc(44+row.data.length*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(row.sampleRate,24);wav.writeUInt32LE(row.sampleRate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(row.data.length*2,40);row.data.forEach((v,i)=>wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,v))*32767),44+i*2));await writeFile(path.join(out,row.id+'.wav'),wav);delete row.data;
}
const report={pass:true,completedAt:new Date().toISOString(),sourceSHA256:createHash('sha256').update(await readFile('packages/garden-view/audio.ts')).digest('hex'),bundleSHA256:createHash('sha256').update(source).digest('hex'),rows,limits:['OfflineAudioContext proves waveform routing and amplitude, not device speaker quality or subjective sound preference']};
await writeFile(path.join(out,'audio-render-qa.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({pass:true,cases:rows.length}));

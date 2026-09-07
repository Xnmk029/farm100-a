import {app,BrowserWindow,ipcMain,dialog} from 'electron';
import path from 'node:path';
import {readFile,writeFile,mkdir,stat,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {setFlagsFromString} from 'node:v8';
import {runInNewContext} from 'node:vm';
import {RequestSchema,VERSION,defaultConfig,type Request,type Run} from '../../../../packages/protocol';
import {validateRun} from '../../../../packages/recording';
import {launchRun} from './host';
import {launchGarden} from './garden-host';
import {GardenConfigSchema,gardenDefault,validateGardenState,validateGardenRun,GARDEN_VERSION,type GardenRun,type GardenRequest} from '../../../../packages/garden/core';

const qa=process.argv.includes('--qa-utility');
const renderQA=process.argv.includes('--qa-render');
const gardenQA=process.argv.includes('--qa-garden');
const gardenUtilityQA=process.argv.includes('--qa-garden-utility');
const gardenFilm=process.argv.includes('--qa-garden-film');
if(gardenFilm)app.commandLine.appendSwitch('force-device-scale-factor','1');
// QA capture allocates native image memory outside V8's normal heap accounting.
// This constant host-only expression exposes GC for the offline capture harness;
// participant programs still execute exclusively in the isolated QuickJS worker.
let collectCaptureGarbage:()=>void=()=>{};
if(gardenFilm){setFlagsFromString('--expose_gc');collectCaptureGarbage=runInNewContext('gc');}
if(qa||renderQA)app.setPath('userData',path.join(app.getPath('temp'),'farm100-qa-'+randomUUID()));
let win:BrowserWindow|undefined;let active:ReturnType<typeof launchRun>|undefined;let activeId='';
let renderRuns:Run[]|undefined;
let gardenDemo:GardenRun|undefined;
let resolveGardenReady:()=>void;
let pendingFrame:{id:number;resolve:()=>void}|undefined;
const gardenReady=new Promise<void>(resolve=>{resolveGardenReady=resolve;});
let gardenActive:ReturnType<typeof launchGarden>|undefined;
const gardenWorker=path.join(__dirname,'garden-worker.cjs');
const worker=path.join(__dirname,'worker.cjs');
const dataDir=()=>path.join(app.getPath('userData'),'farm100');
const qaDir=()=>process.env.FARM100_QA_DIR??path.join(app.isPackaged?app.getPath('temp'):app.getAppPath(),'artifacts');
async function atomic(file:string,text:string){await mkdir(path.dirname(file),{recursive:true});const tmp=file+'.tmp-'+randomUUID();await writeFile(tmp,text,'utf8');await rename(tmp,file);}
async function readBounded(file:string,max=64*1024*1024){if((await stat(file)).size>max)throw Error('文件超出大小限制');return readFile(file,'utf8');}
function secureHandler(name:string,fn:(arg:any)=>unknown){ipcMain.handle(name,async(event,arg)=>{
  if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('Untrusted IPC sender');return fn(arg);
});}
async function qaUtility(){
  await mkdir(qaDir(),{recursive:true});
  const source=await readFile(path.join(app.getAppPath(),'examples/reference.js'),'utf8');
  const report:any={electron:process.versions.electron,checks:[]};
  const runCase=async(name:string,code:string,cancel=false)=>{
    const req:Request={protocolVersion:VERSION,runId:randomUUID(),config:defaultConfig,source:code,label:name,attempt:1};
    const started=performance.now();let batchCount=0;
    const controller=launchRun(req,worker,p=>{if(p.type==='events')batchCount++;if(cancel&&p.type==='ready')setTimeout(()=>controller.cancel(),100);});
    const run=await controller.promise;validateRun(run);
    report.checks.push({name,reason:run.result.reason,cost:run.result.state.cost,batches:batchCount,elapsedMs:Math.round(performance.now()-started),complete:run.complete});return run;
  };
  const r=await runCase('reference',source);
  const mem=await runCase('memory','new ArrayBuffer(256*1024*1024);');
  const cancel=await runCase('cancel-busy-loop','while(true){}',true);
  const next=await runCase('recovery',source);
  report.pass=r.result.reason==='succeeded'&&mem.result.reason==='memory_limit'&&cancel.result.reason==='cancelled'&&next.result.reason==='succeeded';
  await atomic(path.join(qaDir(),'utility-qa.json'),JSON.stringify(report,null,2));app.exit(report.pass?0:1);
}
app.whenReady().then(async()=>{
  if(gardenUtilityQA){
    const source=await readFile(path.join(app.getAppPath(),'examples/garden-cycle.js'),'utf8');
    const request={runId:randomUUID(),config:gardenDefault,source};
    const run=validateGardenRun(await launchGarden(request,gardenWorker,()=>{}).promise);
    await atomic(path.join(qaDir(),'garden-run.farmgarden'),JSON.stringify(run));
    await atomic(path.join(qaDir(),'garden-utility.json'),JSON.stringify({pass:run.result.reason==='finished'&&run.result.state.harvests===gardenDefault.size**2*8,reason:run.result.reason,harvests:run.result.state.harvests,tick:run.result.state.tick,inventory:run.result.state.inventory,events:run.events.length},null,2));
    app.exit(run.result.reason==='finished'?0:1);return;
  }
  if(qa){try{await qaUtility();}catch(e){await atomic(path.join(qaDir(),'utility-qa-error.json'),JSON.stringify({error:String(e)}));app.exit(1);}return;}
  if(renderQA&&gardenQA){
    const source=await readFile(path.join(app.getAppPath(),'examples/garden-cycle.js'),'utf8');
    gardenDemo=await launchGarden({runId:randomUUID(),config:gardenDefault,source},gardenWorker,()=>{}).promise;
  }
  if(renderQA&&process.argv.includes('--qa-replay')){
    renderRuns=[];
    for(const example of ['reference','cached-insertion']){
      const source=await readFile(path.join(app.getAppPath(),'examples',example+'.js'),'utf8');
      const req:Request={protocolVersion:VERSION,runId:randomUUID(),source,label:example==='reference'?'人工参考解':'缓存插入排序',attempt:1,config:{...defaultConfig,size:8,budget:20000}};
      renderRuns.push(await launchRun(req,worker,()=>{}).promise);
    }
  }
  win=new BrowserWindow({width:1440,height:940,minWidth:1050,minHeight:700,show:!renderQA,backgroundColor:'#101813',title:'FARM100 · 算法农场',autoHideMenuBar:true,
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:!renderQA,offscreen:renderQA}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  if(renderQA)win.webContents.on('console-message',(_event,level,message)=>console.log('RENDER',level,message));
  win.webContents.on('will-navigate',(event)=>event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  secureHandler('examples',async()=>({reference:await readFile(path.join(app.getAppPath(),'examples/reference.js'),'utf8'),improved:await readFile(path.join(app.getAppPath(),'examples/cached-insertion.js'),'utf8'),runs:renderRuns}));
  secureHandler('gardenExamples',async()=>({source:await readFile(path.join(app.getAppPath(),'examples/garden-cycle.js'),'utf8'),run:gardenDemo,preferSort:renderQA&&!gardenQA}));
  secureHandler('gardenViewReady',()=>{resolveGardenReady();return true;});
  secureHandler('gardenFrameReady',(frame)=>{if(pendingFrame&&pendingFrame.id===frame){pendingFrame.resolve();pendingFrame=undefined;}return true;});
  secureHandler('gardenStart',async(arg)=>{
    if(gardenActive||active)throw Error('已有程序执行中');
    const config=GardenConfigSchema.parse(arg.config);
    if(typeof arg.source!=='string'||Buffer.byteLength(arg.source)>1048576)throw Error('代码超出限制');
    const req:GardenRequest={runId:randomUUID(),config,source:arg.source,initial:arg.initial?validateGardenState(arg.initial,config):undefined};
    gardenActive=launchGarden(req,gardenWorker,p=>{if(win&&!win.isDestroyed())win.webContents.send('gardenProgress',p);});
    const current=gardenActive;
    current.promise.then(async(run)=>{
      if(gardenActive===current)gardenActive=undefined;
      let storageError='';try{await atomic(path.join(dataDir(),'gardens',run.runId+'.farmgarden'),JSON.stringify(run));}catch(e){storageError=String(e);}
      if(win&&!win.isDestroyed())win.webContents.send('gardenProgress',{type:'result',runId:req.runId,run,storageError});
    });return req.runId;
  });
  secureHandler('gardenCancel',()=>{gardenActive?.cancel();return true;});
  secureHandler('gardenSave',async(arg)=>{
    const config=GardenConfigSchema.parse(arg.config),state=validateGardenState(arg.state,config);
    if(typeof arg.source!=='string'||Buffer.byteLength(arg.source)>1048576)throw Error('代码超出限制');
    const r=await dialog.showSaveDialog(win!,{defaultPath:'farm100.garden.json',filters:[{name:'农场存档',extensions:['json']}]});
    if(r.canceled||!r.filePath)return false;
    await atomic(r.filePath,JSON.stringify({format:'farm100-garden-save',version:GARDEN_VERSION,config,state,source:arg.source}));return true;
  });
  secureHandler('gardenOpen',async()=>{
    const r=await dialog.showOpenDialog(win!,{filters:[{name:'农场存档或运行',extensions:['json','farmgarden']}],properties:['openFile']});if(r.canceled)return null;
    const doc=JSON.parse(await readBounded(r.filePaths[0]));
    if(doc.format==='farm100-garden')return {run:validateGardenRun(doc)};
    if(doc.format!=='farm100-garden-save'||doc.version!==GARDEN_VERSION||typeof doc.source!=='string'||Buffer.byteLength(doc.source)>1048576)throw Error('不是受支持的农场存档');
    const config=GardenConfigSchema.parse(doc.config);return {config,state:validateGardenState(doc.state,config),source:doc.source};
  });
  secureHandler('gardenExport',async(arg)=>{
    const run=validateGardenRun(arg);const r=await dialog.showSaveDialog(win!,{defaultPath:'farm100.farmgarden',filters:[{name:'农场完整运行',extensions:['farmgarden']}]});
    if(r.canceled||!r.filePath)return false;await atomic(r.filePath,JSON.stringify(run));return true;
  });
  secureHandler('start',async(arg)=>{
    if(active||gardenActive)throw Error('已有程序在执行');
    const req=RequestSchema.parse({...arg,protocolVersion:VERSION,runId:randomUUID()});activeId=req.runId;
    active=launchRun(req,worker,p=>win?.webContents.send('progress',p),true);
    const current=active;
    current.promise.then(async(run)=>{
      if(active===current)active=undefined;
      let storageError='';try{await atomic(path.join(dataDir(),'runs',run.runId+'.farmrun'),JSON.stringify(run));}catch(e){storageError=String(e);}
      if(win&&!win.isDestroyed())win.webContents.send('progress',{type:'result',runId:run.runId,run,storageError});
    });return req.runId;
  });
  secureHandler('cancel',()=>{active?.cancel();return true;});
  ipcMain.on('ack',(event,arg)=>{if(win&&event.sender===win.webContents&&arg?.runId===activeId&&Number.isInteger(arg.sequence))active?.ack(arg.sequence);});
  secureHandler('openCode',async()=>{const r=await dialog.showOpenDialog(win!,{filters:[{name:'JavaScript',extensions:['js']}],properties:['openFile']});return r.canceled?null:readBounded(r.filePaths[0],1048576);});
  secureHandler('saveWorkspace',async(arg)=>{const req=RequestSchema.parse({...arg,protocolVersion:VERSION,runId:randomUUID()});const r=await dialog.showSaveDialog(win!,{defaultPath:'farm100.workspace.json',filters:[{name:'工作区',extensions:['json']}]});if(r.canceled||!r.filePath)return false;await atomic(r.filePath,JSON.stringify({format:'farm100-workspace',version:VERSION,...req},null,2));return true;});
  secureHandler('openWorkspace',async()=>{const r=await dialog.showOpenDialog(win!,{filters:[{name:'工作区',extensions:['json']}],properties:['openFile']});if(r.canceled)return null;const doc=JSON.parse(await readBounded(r.filePaths[0],2*1048576));if(doc.format!=='farm100-workspace'||doc.version!==VERSION)throw Error('不是受支持的 FARM100 工作区');const {format,version,...req}=doc;return RequestSchema.parse(req);});
  secureHandler('openRun',async()=>{const r=await dialog.showOpenDialog(win!,{filters:[{name:'运行记录',extensions:['farmrun']}],properties:['openFile']});return r.canceled?null:validateRun(JSON.parse(await readBounded(r.filePaths[0])));});
  secureHandler('export',async(arg:{format:string;run:Run})=>{
    const run=validateRun(arg.run);const csv=arg.format==='csv';
    const r=await dialog.showSaveDialog(win!,{defaultPath:`farm100-${run.config.size}-${run.config.seed}.${csv?'csv':'farmrun'}`,filters:[{name:csv?'CSV 指标':'完整运行记录',extensions:[csv?'csv':'farmrun']}]});if(r.canceled||!r.filePath)return false;
    const cell=(x:unknown)=>{let s=String(x);if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
    const text=csv?'\ufeffmodel,attempt,size,seed,result,cost,move,measure,swap,harvest,get_size,get_position,sourceHash,configHash,generationMs,inputTokens,outputTokens,generationSource\n'+[run.label,run.attempt,run.config.size,run.config.seed,run.result.reason,run.result.state.cost,run.result.state.counts.move,run.result.state.counts.measure,run.result.state.counts.swap,run.result.state.counts.harvest,run.result.state.counts.get_size,run.result.state.counts.get_position,run.sourceHash,run.configHash,run.generation?.durationMs??'',run.generation?.inputTokens??'',run.generation?.outputTokens??'',run.generation?.source??''].map(cell).join(','):JSON.stringify(run);
    await atomic(r.filePath,text);return true;
  });
  await win.loadFile(path.join(__dirname,'renderer/index.html'));
  if(renderQA){
    const dir=qaDir();await mkdir(dir,{recursive:true});
    if(gardenQA)await Promise.race([gardenReady,new Promise((_,reject)=>setTimeout(()=>reject(Error('农场资产 20 秒内未就绪')),20000))]);
    if(gardenQA&&gardenFilm){
      win.setContentSize(1920,1080);
      await new Promise(r=>setTimeout(r,1200));
      const seconds=Math.max(5,Math.min(600,Number(process.env.FARM100_FILM_SECONDS)||15)),fps=30;
      const target=path.join(dir,`garden-motion-${seconds}s.mp4`);
      const encoder=spawn(process.env.FARM100_FFMPEG??'ffmpeg',['-y','-f','image2pipe','-vcodec','mjpeg','-framerate',String(fps),'-i','pipe:0','-an','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p',target],{windowsHide:true,stdio:['pipe','ignore','pipe']});
      let encoderError='';encoder.stderr.on('data',d=>{encoderError=(encoderError+d.toString()).slice(-4000);});
      const closed=once(encoder,'close');encoder.on('close',()=>{void atomic(path.join(dir,'encoder.log'),encoderError);});
      const startTick=Number(process.env.FARM100_FILM_START)||0;
      win.webContents.send('gardenPlayback',{tick:startTick,speed:24,cinema:true,playing:false,frameId:-1});
      await new Promise(r=>setTimeout(r,1500));
      const started=performance.now();
      const memorySamples:{frame:number;rss:number}[]=[];
      for(let frame=0;frame<seconds*fps;frame++){
        await new Promise<void>((resolve,reject)=>{
          const timer=setTimeout(()=>reject(Error('回放帧未确认')),10000);
          pendingFrame={id:frame,resolve:()=>{clearTimeout(timer);resolve();}};
          win!.webContents.send('gardenPlayback',{tick:Math.min(gardenDemo!.result.state.tick,startTick+frame*24/fps),speed:24,cinema:true,playing:false,frameId:frame});
        });
        const capture=await win.webContents.capturePage();const bitmap=capture.toJPEG(95);
        if(capture.getSize().width!==1920||capture.getSize().height!==1080)throw Error('Video frame dimensions changed');
        if(!encoder.stdin.write(bitmap))await once(encoder.stdin,'drain');
        if(frame%15===0)collectCaptureGarbage();
        if(frame%300===0)memorySamples.push({frame,rss:process.memoryUsage().rss});
      }
      encoder.stdin.end();const [exitCode]=await closed;
      await atomic(path.join(dir,'garden-film-qa.json'),JSON.stringify({file:target,seconds,fps,frames:seconds*fps,wallSeconds:(performance.now()-started)/1000,startTick,ticksPerSecond:24,mode:'offline event replay with acknowledged frames',memorySamples,exitCode,encoderError:exitCode?encoderError:undefined,audio:false},null,2));
      app.exit(exitCode===0?0:1);return;
    }
    for(const [width,height]of [[1280,720],[1920,1080]]){
      win.setContentSize(width,height);await new Promise(r=>setTimeout(r,1800));
      const image=await win.webContents.capturePage();await writeFile(path.join(dir,`${gardenQA?'garden':renderRuns?'comparison':'desktop'}-${width}x${height}.png`),image.toPNG());
    }app.exit(0);return;
  }
  win.on('closed',()=>{active?.cancel();gardenActive?.cancel();win=undefined;});
}).catch(async error=>{
  if(qa||renderQA||gardenUtilityQA){await atomic(path.join(qaDir(),'qa-error.json'),JSON.stringify({error:String(error),stack:error?.stack}));app.exit(1);}
  else dialog.showErrorBox('FARM100 启动失败',String(error));
});
app.on('window-all-closed',()=>app.quit());

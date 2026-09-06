import {app,BrowserWindow,ipcMain,dialog} from 'electron';
import path from 'node:path';
import {readFile,writeFile,mkdir,stat,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {RequestSchema,VERSION,defaultConfig,type Request,type Run} from '../../../../packages/protocol';
import {validateRun} from '../../../../packages/recording';
import {launchRun} from './host';

const qa=process.argv.includes('--qa-utility');
const renderQA=process.argv.includes('--qa-render');
if(qa||renderQA)app.setPath('userData',path.join(app.getPath('temp'),'farm100-qa-'+randomUUID()));
let win:BrowserWindow|undefined;let active:ReturnType<typeof launchRun>|undefined;let activeId='';
let renderRuns:Run[]|undefined;
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
  if(qa){try{await qaUtility();}catch(e){await atomic(path.join(qaDir(),'utility-qa-error.json'),JSON.stringify({error:String(e)}));app.exit(1);}return;}
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
  secureHandler('start',async(arg)=>{
    if(active)throw Error('已有程序在执行');
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
    for(const [width,height]of [[1280,720],[1920,1080]]){
      win.setContentSize(width,height);await new Promise(r=>setTimeout(r,1800));
      const image=await win.webContents.capturePage();await writeFile(path.join(dir,`${renderRuns?'comparison':'desktop'}-${width}x${height}.png`),image.toPNG());
    }app.exit(0);return;
  }
  win.on('closed',()=>{active?.cancel();win=undefined;});
});
app.on('window-all-closed',()=>app.quit());

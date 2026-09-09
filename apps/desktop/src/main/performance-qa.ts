import {app,dialog,screen,type BrowserWindow} from 'electron';
import {readFile,writeFile,appendFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {GardenHistory} from '../../../../packages/garden-storage/journal';

/** Measures a visible, continuously executing client. Short runs are calibration only. */
export async function performanceQA(win:BrowserWindow,root:string,dir:string){
  const seconds=Number(process.env.FARM100_PERF_SECONDS??1800);
  assert.ok(Number.isFinite(seconds)&&seconds>=10&&seconds<=1800);
  const input=path.resolve(process.env.FARM100_PERF_SAVE??'artifacts/large-farm/preparation-v2/earned.garden.json');
  const saved=JSON.parse(await readFile(input,'utf8'));assert.equal(saved.config.size,32);
  const metadata={startedAt:new Date().toISOString(),seconds,input,journalRoot:root,sourceSHA256:createHash('sha256').update(saved.source).digest('hex'),initialTick:saved.state.tick,
    hardware:{cpu:os.cpus()[0]?.model,logicalCores:os.cpus().length,ramBytes:os.totalmem(),gpu:await app.getGPUInfo('basic')},software:{...process.versions,os:os.release(),app:app.getVersion()},rendering:'visible native window kept above other windows to prevent occlusion throttling; real worker execution paced by simulated time; requestAnimationFrame intervals'};
  await writeFile(path.join(dir,'performance-metadata.json'),JSON.stringify(metadata,null,2));
  const js=(s:string)=>win.webContents.executeJavaScript(s),sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
  const wait=async(s:string)=>{for(let i=0;i<600;i++){if(await js(s))return;await sleep(100);}throw Error('Performance UI timeout: '+s);};
  const click=async(label:string)=>{await wait(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});return b&&!b.disabled;})()`);await js(`([...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)})).click()`);};
  await js(`(()=>{const e=document.querySelector('[aria-label="新农场最大尺寸"]');e.value='32';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await sleep(100);await click('新农场');await wait(`document.querySelector('.garden-shell').dataset.farmSize==='32'`);
  assert.equal(await js(`document.querySelector('.garden-shell').dataset.farmExtent`),'4');
  const openDialog=dialog.showOpenDialog;
  try{
    dialog.showOpenDialog=(async()=>({canceled:false,filePaths:[input]})) as typeof openDialog;
    await click('打开农场');await wait(`document.querySelector('.garden-shell').dataset.farmExtent==='32'&&document.querySelector('.garden-canvas').dataset.droneCount==='8'`);
  }finally{dialog.showOpenDialog=openDialog;}
  win.unmaximize();win.setFullScreen(false);win.setMaximizable(false);win.setMinimizable(false);win.setFullScreenable(false);win.setResizable(false);win.setContentSize(1920,1080);
  const display=screen.getDisplayMatching(win.getBounds());win.setPosition(display.workArea.x+Math.max(0,display.workArea.width-win.getBounds().width),display.workArea.y);
  win.setAlwaysOnTop(true,'floating');win.showInactive();await sleep(1500);
  await js(`(()=>{
    const e=document.querySelector('[aria-label="执行时实时观看"]');if(!e.checked)e.click();
    const p=window.__farmPerformance={frames:0,histogram:Array(2001).fill(0),maxFrame:0,last:0,started:0,events:0,diskBytes:0,contention:0,actions:{},planted:{},failed:0,result:null,running:true};
    window.farm.onGardenProgress(m=>{if(m.type==='events')p.diskBytes=m.recordedBytes;if(m.type==='events')for(const e of m.events){p.events=e.seq;if(!e.kind||e.kind==='complete'){p.actions[e.action]=(p.actions[e.action]||0)+1;if(e.action==='plant'&&e.value!==false)p.planted[e.args[0]]=(p.planted[e.args[0]]||0)+1;if(e.value===false)p.failed++;if(e.action==='compare_exchange'&&!e.value.exchanged)p.contention++;}}if(m.type==='result')p.result=m.run;});
    function frame(t){if(!p.running)return;if(p.last){const d=t-p.last;p.frames++;p.histogram[Math.min(2000,Math.floor(d*10))]++;p.maxFrame=Math.max(p.maxFrame,d);}else p.started=t;p.last=t;requestAnimationFrame(frame);}requestAnimationFrame(frame);
  })()`);
  await click('▶ 从当前农场执行');await wait(`document.querySelector('.garden-shell').dataset.live==='true'`);
  const started=performance.now(),samples:any[]=[];
  while(performance.now()-started<seconds*1000){
    await sleep(Math.min(5000,seconds*1000-(performance.now()-started)));
    const view=await js(`(()=>{const p=window.__farmPerformance,s=document.querySelector('.garden-shell');return {frames:p.frames,maxFrame:p.maxFrame,events:p.events,diskBytes:p.diskBytes,contention:p.contention,actions:p.actions,planted:p.planted,failed:p.failed,result:p.result?{reason:p.result.result.reason,message:p.result.result.message}:null,buffer:Number(s.dataset.liveBuffer),clock:Number(document.querySelector('.garden-canvas').dataset.playbackClock),live:s.dataset.live,visibility:document.visibilityState,overflow:document.documentElement.scrollWidth>innerWidth,dpr:devicePixelRatio,width:innerWidth,height:innerHeight};})()`);
    const sample={elapsedMs:performance.now()-started,...view,window:{visible:win.isVisible(),minimized:win.isMinimized(),alwaysOnTop:win.isAlwaysOnTop()},processes:app.getAppMetrics().map(p=>({pid:p.pid,type:p.type,name:p.name,cpu:p.cpu,memory:p.memory}))};samples.push(sample);
    await appendFile(path.join(dir,'performance-samples.jsonl'),JSON.stringify(sample)+'\n');
    if(view.result)throw Error('Production ended during measurement: '+JSON.stringify(view.result));
    if(samples.length===1||samples.length%60===0)await writeFile(path.join(dir,`production-${Math.floor(sample.elapsedMs/1000)}s.png`),(await win.webContents.capturePage()).toPNG());
  }
  const timing=await js(`(()=>{const p=window.__farmPerformance;p.running=false;return {frames:p.frames,histogram:p.histogram,maxFrame:p.maxFrame,elapsedMs:p.last-p.started};})()`);
  await writeFile(path.join(dir,'production-end.png'),(await win.webContents.capturePage()).toPNG());
  const cancelStart=performance.now();await click('中止');await wait(`!!window.__farmPerformance.result`);const cancelMs=performance.now()-cancelStart;
  const receipt=await js('window.__farmPerformance.result');assert.equal(receipt.result.reason,'cancelled');
  const reopened=await new GardenHistory(root).openPaged(receipt.runId);assert.deepEqual(reopened.receipt.result.state,receipt.result.state);
  await writeFile(path.join(dir,'production-receipt.json'),JSON.stringify(receipt));
  const p95Target=Math.ceil(timing.frames*.95);let cumulative=0,p95=0;for(let i=0;i<timing.histogram.length;i++){cumulative+=timing.histogram[i];if(cumulative>=p95Target){p95=(i+1)/10;break;}}
  const rss=samples.map(s=>s.processes.reduce((total:number,p:any)=>total+p.memory.workingSetSize*1024,0));
  const tail=Math.max(1,Math.floor(samples.length/3)),median=(a:number[])=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
  const middleRSS=median(rss.slice(tail,tail*2)),lastRSS=median(rss.slice(-tail));
  const crops=Object.keys(samples.at(-1).planted),checks={duration:seconds===1800&&timing.elapsedMs>=1800000,frameP95:p95<=20,allCrops:crops.length===8,live:samples.every(s=>s.live==='true'&&s.visibility==='visible'&&s.window.visible&&!s.window.minimized&&s.window.alwaysOnTop&&s.buffer<=192&&!s.overflow&&s.width===1920&&s.height===1080&&s.dpr===1),memory:lastRSS<=middleRSS*1.2+32*1024*1024,cancel:cancelMs<=2000,recovered:true};
  const report={...metadata,completedAt:new Date().toISOString(),pass:Object.values(checks).every(Boolean),calibration:seconds<1800,checks,p95Ms:p95,cancelMs,timing,rss:{middleMedian:middleRSS,lastMedian:lastRSS,max:Math.max(...rss)},events:receipt.eventCount,crops,finalCounters:receipt.result.state.economy.counters,runId:receipt.runId};
  await writeFile(path.join(dir,'performance-qa.json'),JSON.stringify(report,null,2));
  if(seconds===1800)assert.ok(report.pass,'Performance acceptance failed; inspect raw samples and histogram');
}

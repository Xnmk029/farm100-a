import {dialog,type BrowserWindow} from 'electron';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {validateGardenRun,type GardenRun} from '../../../../packages/garden/core';
import {evaluateChallenge} from '../../../../packages/garden/challenges';
export async function fleetUIQA(win:BrowserWindow,dir:string){
  const js=(s:string)=>win.webContents.executeJavaScript(s),settle=()=>new Promise(r=>setTimeout(r,300));
  await js(`window.addEventListener('error',e=>console.log('FLEET ERROR STACK',e.error?.stack||e.message));void 0;`);
  const click=async(label:string)=>{await js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Unavailable '+${JSON.stringify(label)});b.click();})()`);await settle();};
  const deploy=async(n:number)=>{await js(`(()=>{const s=document.querySelector('[aria-label="部署无人机"]');if(s.disabled||[...s.options].find(o=>o.value==='${n}').disabled)throw Error('Deployment locked');s.value='${n}';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);await settle();};
  const shot=async(name:string)=>{await settle();await writeFile(path.join(dir,name+'.png'),(await win.webContents.capturePage()).toPNG());};
  const waitRun=async(n:number):Promise<GardenRun>=>{for(let i=0;i<120;i++){const r=await js(`window.__fleetRuns[${n-1}]`);if(r)return validateGardenRun(r);await settle();}throw Error('Fleet UI timed out');};
  await click('新农场');
  if(!await js(`document.querySelector('[aria-label="部署无人机"] option[value="8"]').disabled`))throw Error('Fresh farm bypassed research');
  await click('挑战');await js(`document.querySelector('[data-challenge-id="fleet-harvest"] button').click()`);await settle();
  await js(`window.__fleetRuns=[];window.farm.onGardenProgress(p=>{if(p.type==='result')window.__fleetRuns.push(p.run);});void 0;`);
  await click('改进');await click('▶ 从固定初始世界执行');const one=await waitRun(1);
  await deploy(8);await click('▶ 从固定初始世界执行');const eight=await waitRun(2);
  if(!evaluateChallenge(one)!.passed||!evaluateChallenge(eight)!.passed||eight.result.state.tick>=one.result.state.tick)throw Error('Partitioning failed');
  win.webContents.send('gardenPlayback',{tick:35.5,speed:24,cinema:false,playing:false});await settle();
  for(const [w,h] of [[1280,720],[1920,1080]]){win.setContentSize(w,h);await settle();await shot(`fleet-${w}x${h}`);
    if(!await js(`document.querySelector('.garden-canvas').dataset.droneCount==='8'&&document.querySelectorAll('[data-drone-id]').length===8&&!document.querySelector('.garden-canvas').dataset.error&&document.documentElement.scrollWidth<=innerWidth`))throw Error('Fleet rendering or layout failed');
  }
  await click('挑战');await js(`[...document.querySelectorAll('.economy-panel input[type=checkbox]')].slice(0,2).forEach(e=>e.click())`);await settle();await click('并排对比所选记录');await settle();await click('播放对比');await new Promise(r=>setTimeout(r,1200));await click('暂停对比');
  if(!await js(`document.querySelector('.challenge-comparison').textContent.includes('八行麦田')&&[...document.querySelectorAll('.challenge-comparison .garden-canvas')].map(e=>e.dataset.droneCount).sort().join(',')==='1,8'`))throw Error('Wrong comparison selected');
  await shot('fleet-comparison');await click('关闭对比');
  for(let i=0;i<3;i++){await click('并排对比所选记录');await settle();await click('关闭对比');}
  await click('返回农场');
  // Real earned progression and deployment records from the deterministic QA suite.
  const saveDialog=dialog.showSaveDialog,openDialog=dialog.showOpenDialog;
  let openPath=path.resolve('artifacts/fleet/deployment.farmgarden');const savePath=path.join(dir,'fleet-roundtrip.garden.json');
  try{
    dialog.showOpenDialog=(async()=>({canceled:false,filePaths:[openPath]})) as typeof openDialog;
    dialog.showSaveDialog=(async()=>({canceled:false,filePath:savePath})) as typeof saveDialog;
    await click('打开农场');await settle();
    const record=validateGardenRun(JSON.parse(await readFile(openPath,'utf8')));
    const time=record.events.find(e=>e.kind==='dispatch')!.tick;
    win.webContents.send('gardenPlayback',{tick:time,speed:24,cinema:false,playing:false});await settle();
    if(!await js(`document.querySelector('#garden-execute').disabled`))throw Error('Pending queue silently restarted');
    await click('撤销此时未完成的动作，准备重新编程');await click('▶ 从当前农场执行');const restarted=await waitRun(3);
    if(restarted.result.reason!=='finished')throw Error('Restart failed');
    win.webContents.send('gardenPlayback',{tick:restarted.result.state.tick,speed:24,cinema:false,playing:false});await settle();await click('保存农场');
    const saved=JSON.parse(await readFile(savePath,'utf8'));if(saved.state.fleet.drones.length!==8||Object.keys(saved.state.fleet.shared).length!==8)throw Error('Fleet save incomplete');
    await click('新农场');openPath=savePath;await click('打开农场');await settle();await shot('fleet-restored');
    if(!await js(`document.querySelector('.fleet-shared').textContent.includes('station7')`))throw Error('Shared board not restored');
  }finally{dialog.showSaveDialog=saveDialog;dialog.showOpenDialog=openDialog;}
  await writeFile(path.join(dir,'fleet-ui-qa.json'),JSON.stringify({pass:true,checks:['fresh research gates','1 and 8 real worker executions','partition speedup','8 actors at 720p and 1080p','same task comparison','pending prefix explicitly cancelled','restart from earned world','fleet and shared board save/reopen'],one:evaluateChallenge(one),eight:evaluateChallenge(eight)},null,2));
}

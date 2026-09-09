import {dialog,type BrowserWindow} from 'electron';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {GARDEN_VERSION} from '../../../../packages/garden/core';

/** Exercises the shipped UI and bridge, without granting gameplay extra resources. */
export async function gardenEconomyQA(win:BrowserWindow,dir:string){
  const js=(source:string)=>win.webContents.executeJavaScript(source);
  const click=async(label:string)=>js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Button unavailable: '+${JSON.stringify(label)});b.click();})()`);
  const settle=()=>new Promise(r=>setTimeout(r,250));
  const shot=async(name:string)=>{await settle();await writeFile(path.join(dir,name+'.png'),(await win.webContents.capturePage()).toPNG());};
  const checks:string[]=[];
  for(const label of ['研究','加工','任务','手册']){await click(label);await shot('panel-'+({'研究':'research','加工':'craft','任务':'quests','手册':'guide'}[label]));checks.push('panel '+label);}
  await click('新农场');await click('研究');await settle();
  if(!await js(`document.querySelector('.garden-toolbar').textContent.includes('4 × 4')&&document.querySelector('.economy-panel').textContent.includes('材料不足')`))throw Error('Fresh research state incorrect');
  await shot('fresh-research');checks.push('fresh land and resource gate');
  await click('程序');await settle();
  await js(`window.__gardenQAResults=[];window.farm.onGardenProgress(p=>{if(p.type==='result')window.__gardenQAResults.push(p.run);});void 0;`);
  await click('▶ 从当前农场执行');
  const waitRun=async(count:number)=>{for(let i=0;i<120;i++){const r=await js(`window.__gardenQAResults[${count-1}]`);if(r)return r;await settle();}throw Error('UI run timed out');};
  const first=await waitRun(1);
  if(first.result.reason!=='finished'||first.result.state.harvests!==4||first.result.state.inventory.grain!==12)throw Error('Beginner UI program failed');
  win.webContents.send('gardenPlayback',{tick:first.result.state.tick,speed:24,cinema:false,playing:false});await settle();
  await click('研究');await click('投入研究');const research=await waitRun(2);await settle();
  if(research.result.reason!=='finished'||research.result.state.inventory.grain!==0||!research.result.state.economy.unlocks.includes('carrot'))throw Error('Research UI did not consume real grain');
  if(!await js(`document.querySelector('.garden-toolbar').textContent.includes('研究 1/23')&&document.querySelector('.stage-badge').textContent.includes('暂停')`))throw Error('Direct action displayed stale state');
  await shot('first-research-complete');checks.push('beginner program through utility bridge','research consumes grain','direct action final state is paused');
  await click('程序');await new Promise(r=>setTimeout(r,1200));await shot('preserved-editor');if(!await js(`document.querySelector('.garden-sidebar').textContent.includes('第一课')`))throw Error('Direct action replaced editor');checks.push('editor preserved');
  // Only substitute file selection in this explicit QA mode; the shipped IPC,
  // atomic writer, reader and validators execute normally.
  const saveDialog=dialog.showSaveDialog,openDialog=dialog.showOpenDialog;
  const savePath=path.join(dir,'ui-roundtrip.garden.json');
  try{
    dialog.showSaveDialog=(async()=>({canceled:false,filePath:savePath})) as typeof saveDialog;
    dialog.showOpenDialog=(async()=>({canceled:false,filePaths:[savePath]})) as typeof openDialog;
    await click('保存农场');await settle();
    const saved=JSON.parse(await readFile(savePath,'utf8'));
    if(saved.version!==GARDEN_VERSION||saved.state.economy.unlocks[0]!=='carrot'||!saved.source.includes('第一课'))throw Error('Saved content incomplete');
    await click('新农场');await settle();await click('打开农场');await settle();
    if(!await js(`document.querySelector('.garden-toolbar').textContent.includes('研究 1/23')&&document.querySelector('.garden-status').textContent.includes('农场已恢复')`))throw Error('Saved farm did not reopen');
    checks.push('save and reopen through shipped handlers');
  }finally{dialog.showSaveDialog=saveDialog;dialog.showOpenDialog=openDialog;}
  const dimensions=await js(`({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,overflow:document.documentElement.scrollWidth>innerWidth})`);
  if(dimensions.overflow)throw Error('Horizontal overflow');
  await writeFile(path.join(dir,'economy-ui-qa.json'),JSON.stringify({pass:true,checks,dimensions,first:{events:first.eventCount??first.events.length,grain:first.result.state.inventory.grain},research:{events:research.eventCount??research.events.length,grain:research.result.state.inventory.grain,unlocks:research.result.state.economy.unlocks}},null,2));
}

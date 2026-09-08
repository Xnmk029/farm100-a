import type {BrowserWindow} from 'electron';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {canonical} from '../../../../packages/protocol';
import {evaluateChallenge} from '../../../../packages/garden/challenges';
import {validateGardenRun,type GardenRun} from '../../../../packages/garden/core';
export async function challengeUIQA(win:BrowserWindow,dir:string){
  const js=(s:string)=>win.webContents.executeJavaScript(s),settle=()=>new Promise(r=>setTimeout(r,350));
  const click=async(label:string)=>{await js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Missing button '+${JSON.stringify(label)});b.click();})()`);await settle();};
  const shot=async(name:string)=>{await settle();await writeFile(path.join(dir,name+'.png'),(await win.webContents.capturePage()).toPNG());};
  await click('新农场');await click('挑战');await shot('challenge-picker');
  await js(`document.querySelector('[data-challenge-id="maze-3"] button').click();`);await settle();
  await js(`window.__challengeRuns=[];window.farm.onGardenProgress(p=>{if(p.type==='result')window.__challengeRuns.push(p.run);});void 0;`);
  await click('▶ 从固定初始世界执行');
  const waitRun=async(n:number):Promise<GardenRun>=>{for(let i=0;i<100;i++){const r=await js(`window.__challengeRuns[${n-1}]`);if(r)return validateGardenRun(r);await settle();}throw Error('Challenge UI execution timed out');};
  const base=await waitRun(1);if(!evaluateChallenge(base)!.passed)throw Error('Baseline failed');
  win.webContents.send('gardenPlayback',{tick:base.result.state.tick/2,speed:24,cinema:false,playing:false});await settle();
  await click('改进');await click('▶ 从固定初始世界执行');const improved=await waitRun(2);
  if(!evaluateChallenge(improved)!.passed||canonical(improved.initial)!==canonical(base.initial))throw Error('Challenge inherited replay state');
  const collect=improved.events.find(e=>e.action==='collect'&&e.value==='key');
  win.webContents.send('gardenPlayback',{tick:Math.max(0,(collect?.tick??50)-1),speed:24,cinema:false,playing:false});await shot('maze-key-before');
  win.webContents.send('gardenPlayback',{tick:collect?.tick??50,speed:24,cinema:false,playing:false});await shot('maze-key-after');
  const relic=improved.events.find(e=>e.action==='collect'&&e.value==='relic');win.webContents.send('gardenPlayback',{tick:Math.max(0,(relic?.fromTick??90)),speed:24,cinema:false,playing:false});await shot('maze-relic');
  await click('挑战');await js(`document.querySelectorAll('.economy-panel input[type=checkbox]').forEach(el=>el.click());`);await settle();await click('并排对比所选记录');
  for(let i=0;i<30;i++){if(await js(`document.querySelectorAll('.challenge-comparison .garden-canvas[data-ready=true]').length===2`))break;await settle();}
  await js(`(()=>{const s=document.querySelector('[aria-label="对比速度"]');s.value='240';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await click('播放对比');await new Promise(r=>setTimeout(r,700));await click('暂停对比');await shot('challenge-comparison');
  if(!await js(`(()=>{const a=[...document.querySelectorAll('.challenge-comparison .garden-canvas')];return a.length===2&&a[0].dataset.playbackClock===a[1].dataset.playbackClock&&window.__challengeRuns.length===2;})()`))throw Error('Comparison clocks or execution changed');
  await click('关闭对比');await click('程序');
  await click('失败');await click('▶ 从固定初始世界执行');const failed=await waitRun(3);if(evaluateChallenge(failed)!.passed)throw Error('Failure counted as pass');
  await shot('challenge-failure');await click('挑战');await shot('challenge-history');
  await click('返回农场');await settle();if(!await js(`document.querySelector('.garden-toolbar').textContent.includes('研究 0/23')`))throw Error('Free farm not restored');
  const report={pass:true,checks:['picker','utility execution','fixed restart after seek','key and relic replay','failure remains failure','session history','free farm restored','same clock side-by-side comparison without executing code'],baseline:evaluateChallenge(base),improved:evaluateChallenge(improved),failure:evaluateChallenge(failed)};
  await writeFile(path.join(dir,'challenge-ui-qa.json'),JSON.stringify(report,null,2));
}

import {app,type BrowserWindow} from 'electron';
import {readFile,writeFile} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {GardenJournal,GardenHistory} from '../../../../packages/garden-storage/journal';
import {gardenDefault,validateGardenRun,gardenAt,type GardenRun} from '../../../../packages/garden/core';
import {TECH} from '../../../../packages/garden/content';
import {freshGarden} from '../../../../packages/garden/core';
import {launchGarden} from './garden-host';

export async function crashHistoryQA(root:string,worker:string,dir:string){
  const config={...gardenDefault,drones:8 as const},initial=freshGarden(config);initial.economy!.unlocks=TECH.map(t=>t.id);
  const req={runId:randomUUID(),config,initial,source:'// 断电恢复专项 · 人工授权测试世界\nconst id=get_drone_id();for(let i=0;i<500;i++){write_shared("worker"+id,i);wait(10);}'};
  const j=await GardenJournal.create(root,req);
  const controller=launchGarden(req,worker,p=>{if(p.type==='events'&&p.events.at(-1).seq>=192){writeFileSync(path.join(dir,'crash-proof.json'),JSON.stringify({id:req.runId,events:p.events.at(-1).seq,tick:p.events.at(-1).tick,profile:app.getPath('userData')}),{flush:true});process.exit(86);}},{journal:j,stream:true});
  await controller.promise;throw Error('Crash injection did not trigger');
}

export async function historyUtilityQA(root:string,worker:string,dir:string){
  const rows=[];
  for(const mode of ['complete','cancel-start','cancel','worker-crash','disk-error']){
    const req={runId:randomUUID(),config:{...gardenDefault,drones:1 as const},source:'// 持久化运行器专项\nfor(let i=0;i<150;i++){write_shared("n",i);wait(1);}'};
    const j=await GardenJournal.create(root,req);let batches=0,storageErrors=0;
    if(mode==='disk-error'){const append=j.append.bind(j);let writes=0;j.append=async events=>{if(++writes===2)throw Error('ENOSPC: injected disk-full fault');await append(events);};}
    const c=launchGarden(req,worker,p=>{if(p.type==='storage-error')storageErrors++;if(p.type==='events'&&++batches===1){if(mode==='cancel')c.cancel();if(mode==='worker-crash')c.terminate();}},{journal:j});
    if(mode==='cancel-start')c.cancel();
    const r=validateGardenRun(await c.promise),recovered=await new GardenHistory(root).recover(req.runId);
    if(JSON.stringify(r.events)!==JSON.stringify(recovered.run.events)||JSON.stringify(r.result.state)!==JSON.stringify(recovered.run.result.state))throw Error('Host/disk prefix mismatch in '+mode);
    if(mode==='complete'?r.result.reason!=='finished':mode.startsWith('cancel')?r.result.reason!=='cancelled':r.result.reason!=='runner_crash')throw Error('Wrong exit in '+mode);
    if(mode==='disk-error'&&(!storageErrors||batches!==1))throw Error('Disk error did not stop acknowledgements');
    rows.push({mode,reason:r.result.reason,complete:r.complete,events:r.events.length,batches,storageErrors});
  }
  await writeFile(path.join(dir,'history-utility-qa.json'),JSON.stringify({pass:true,rows},null,2));
}

export async function historyUIQA(win:BrowserWindow,root:string,dir:string){
  const js=(s:string)=>win.webContents.executeJavaScript(s).catch(e=>{throw Error('History UI script failed: '+s+'; '+String(e));}),settle=()=>new Promise(r=>setTimeout(r,300));
  const wait=async(condition:string)=>{for(let i=0;i<100;i++){if(await js(condition))return;await new Promise(r=>setTimeout(r,100));}throw Error('History UI readiness timed out: '+condition);};
  const click=async(label:string)=>{await wait(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});return !!b&&!b.disabled;})()`);await js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});b.click();})()`);await settle();};
  const openRecord=async(id:string)=>{await wait(`!!document.querySelector('[data-history-id="${id}"] button')`);await js(`document.querySelector('[data-history-id="${id}"] button').click()`);await wait(`document.querySelector('.garden-shell').dataset.replayId==='${id}'&&document.querySelector('.garden-shell').dataset.replayLoading==='false'`);};
  const shot=async(name:string)=>{await settle();await writeFile(path.join(dir,name+'.png'),(await win.webContents.capturePage()).toPNG());};
  const proof=JSON.parse(await readFile(path.join(dir,'crash-proof.json'),'utf8')),disk=await new GardenHistory(root).recover(proof.id);
  if(disk.run.complete||disk.run.events.length!==proof.events||disk.warning==='')throw Error('Restart lost a durable batch or called prefix complete');
  await click('历史');await settle();await shot('history-recovered-list');
  await openRecord(proof.id);await shot('history-recovered-world');
  if(!await js(`document.querySelector('.garden-status').textContent.includes('已恢复')&&document.querySelector('.fleet-shared').textContent.includes('worker7')`))throw Error('Recovered world not shown');
  const last=disk.run.result.state;
  if(!await js(`document.querySelector('.garden-footer').textContent.includes('操作成本 ${last.cost}')`))throw Error('Wrong recovered cost');
  if(last.fleet!.pending.length)await click('撤销此时未完成的动作，准备重新编程');
  // Branch through the shipped renderer/bridge, while a new process owns all prior storage.
  await js(`window.__historyRuns=[];window.farm.onGardenProgress(p=>{if(p.type==='result')window.__historyRuns.push(p.run);});void 0;`);
  await click('新农场');await click('▶ 从当前农场执行');
  let next:GardenRun|undefined;for(let i=0;i<120;i++){const result=await js('window.__historyRuns[0]');if(result){next=result.format==='farm100-garden-receipt'?(await new GardenHistory(root).recover(result.runId)).run:result;break;}await settle();}
  if(!next||next.result.reason!=='finished')throw Error('New run after recovery failed');validateGardenRun(next);
  await click('历史');await settle();await shot('history-after-new-run');
  const reopened=await new GardenHistory(root).recover(next.runId);if(reopened.warning||reopened.run.events.length!==next.events.length)throw Error('Successful run did not persist');
  const before=await js('window.__historyRuns.length');await openRecord(next.runId);
  if(await js('window.__historyRuns.length')!==before)throw Error('Opening history executed code');
  const positions=[];for(let i=0;i<100;i++){const seq=i*7919%(next.events.length+1);const frame=await new GardenHistory(root).frame(next.runId,seq);if(JSON.stringify(frame.state)!==JSON.stringify(gardenAt(next,seq)))throw Error('Indexed seek differs');positions.push(seq);}
  win.webContents.send('gardenPlayback',{tick:next.result.state.tick,speed:24,cinema:false,playing:false});await settle();
  await click('挑战');await js(`document.querySelector('[data-challenge-id="farm-1"] button').click()`);await settle();await click('▶ 从固定初始世界执行');
  let challenge:GardenRun|undefined;for(let i=0;i<120;i++){challenge=await js('window.__historyRuns[1]');if(challenge)break;await settle();}if(!challenge||challenge.result.reason!=='finished')throw Error('History challenge setup failed');
  await click('返回农场');await click('历史');await openRecord(challenge.runId);await click('返回农场');await wait(`document.querySelector('.garden-shell').dataset.replayLoading==='false'`);
  if(!await js(`document.querySelector('.garden-footer').textContent.includes('操作成本 ${next.result.state.cost}')`))throw Error('Opening challenge history lost free-farm session');
  await click('历史');await js(`(()=>{const e=document.querySelector('[aria-label="搜索农场历史"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'no-such-history-729');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await settle();await settle();
  if(!await js(`document.querySelector('.garden-history').textContent.includes('没有匹配')`))throw Error('Search did not filter');
  await shot('history-search-empty');await writeFile(path.join(dir,'history-ui-qa.json'),JSON.stringify({pass:true,abruptParentExit:86,recoveredId:proof.id,recoveredEvents:disk.run.events.length,recoveredTick:last.tick,newRun:next.runId,indexedSeeks:positions.length,checks:['separate process reopening same profile','durable prefix recovered after abrupt desktop exit','shared fleet board and cost restored','explicit pending cancellation','new run persisted','open does not execute','indexed 100-point replay','search filters']},null,2));
}

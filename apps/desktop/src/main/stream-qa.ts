import {app,dialog,type BrowserWindow} from 'electron';
import {readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {GardenJournal,GardenHistory} from '../../../../packages/garden-storage/journal';
import {gardenDefault,freshGarden,applyGardenEvent,copyGarden,type GardenState} from '../../../../packages/garden/core';
import {TECH} from '../../../../packages/garden/content';
import {launchGarden} from './garden-host';

export async function streamUtilityQA(root:string,worker:string,dir:string){
  const rows:any[]=[];
  for(const mode of ['complete','cancel-start','cancel','worker-crash','disk-error','large']){
    const config={...gardenDefault,size:8 as const,drones:8 as const,budget:200000},initial=freshGarden(config);initial.economy!.unlocks=TECH.map(t=>t.id);
    const req={runId:randomUUID(),config,initial,source:`// 流式运行专项 · ${mode}\nfor(let i=0;i<${mode==='large'?4000:100};i++)wait(1);`},journal=await GardenJournal.create(root,req);
    let batches=0,count=0,state=copyGarden(initial),storageErrors=0;const samples:any[]=[],positions=new Set(Array.from({length:100},(_,i)=>i*7919%64009)),expected=new Map<number,GardenState>();expected.set(0,copyGarden(initial));
    if(mode==='disk-error'){const append=journal.append.bind(journal);journal.append=async events=>{if(batches===1)throw Error('ENOSPC injected stream fault');await append(events);};}
    const started=performance.now(),controller=launchGarden(req,worker,p=>{
      if(p.type==='storage-error')storageErrors++;
      if(p.type==='events'){
        batches++;for(const e of p.events){assert.equal(e.seq,++count);state=applyGardenEvent(state,e);if(positions.has(count))expected.set(count,copyGarden(state));}
        if(batches%100===0)samples.push({events:count,hostRSS:process.memoryUsage().rss,processes:app.getAppMetrics().map(m=>({type:m.type,name:m.name,memory:m.memory}))});
        if(batches===1){if(mode==='cancel')controller.cancel();if(mode==='worker-crash')controller.terminate();}
      }
    },{journal,stream:true});
    if(mode==='cancel-start')controller.cancel();
    const receipt=await controller.promise,h=new GardenHistory(root),opened=await h.openPaged(req.runId);
    assert.equal(receipt.eventCount,count);assert.equal(opened.receipt.eventCount,count);assert.deepEqual(receipt.result.state,state);assert.deepEqual(opened.receipt.result.state,state);
    const reason=mode==='complete'||mode==='large'?'finished':mode.startsWith('cancel')?'cancelled':'runner_crash';assert.equal(receipt.result.reason,reason);
    assert.ok(receipt.peakBufferedEvents<=96);if(mode==='disk-error'){assert.equal(batches,1);assert.ok(storageErrors);}
    let seeks=0,maxWindow=0;
    if(mode==='large'){
      assert.equal(count,64008);assert.equal(receipt.result.state.tick,4000);assert.equal(receipt.result.state.cost,32000);
      for(const [seq,wanted] of expected){const page=await h.window(req.runId,{seq});assert.deepEqual(page.state,wanted);maxWindow=Math.max(maxWindow,page.events.length);seeks++;}
      assert.ok(maxWindow<=320);await h.exportPaged(req.runId,path.join(dir,'large.farmjournal'));
    }
    rows.push({mode,reason,complete:receipt.complete,events:count,batches,storageErrors,runnerPeakEvents:receipt.peakBufferedEvents,verifierPeakEvents:opened.receipt.peakBufferedEvents,seeks,maxWindow,elapsedMs:performance.now()-started,memorySamples:samples});
  }
  await writeFile(path.join(dir,'stream-utility-qa.json'),JSON.stringify({pass:true,rows},null,2));
}
export async function streamUIQA(win:BrowserWindow,root:string,dir:string){
  const js=(source:string)=>win.webContents.executeJavaScript(source),settle=()=>new Promise(r=>setTimeout(r,100));
  const wait=async(test:()=>Promise<boolean>)=>{for(let i=0;i<1200;i++){if(await test())return;await settle();}throw Error('Stream UI timeout');};
  const click=async(label:string)=>{await js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Unavailable '+${JSON.stringify(label)});b.click();})()`);};
  const openDialog=dialog.showOpenDialog,saveDialog=dialog.showSaveDialog;let input=path.resolve(process.env.FARM100_STREAM_ARCHIVE??path.join(dir,'large.farmjournal'));const output=path.join(dir,'ui-export.farmjournal');
  try{
    dialog.showOpenDialog=(async()=>({canceled:false,filePaths:[input]})) as typeof openDialog;
    dialog.showSaveDialog=(async()=>({canceled:false,filePath:output})) as typeof saveDialog;
    await click('打开农场');
    await wait(()=>js(`document.querySelector('.garden-shell').dataset.replayFormat==='farm100-garden-receipt'&&document.querySelector('.garden-shell').dataset.replayLoading==='false'`));
    const id=await js(`document.querySelector('.garden-shell').dataset.replayId`),history=new GardenHistory(root),opened=await history.openPaged(id);assert.equal(opened.receipt.eventCount,64008);
    const seeks=[];
    for(const tick of [0,3999,12.5,2000,64,4000,100.5,3000,1,500]){
      win.webContents.send('gardenPlayback',{tick,speed:24,cinema:false,playing:false});const expected=await history.window(id,{tick});
      await wait(()=>js(`document.querySelector('.garden-shell').dataset.replayLoading==='false'&&document.querySelector('.garden-shell').dataset.replaySeq==='${expected.seq}'`));
      assert.ok(await js(`document.querySelector('.garden-footer').textContent.includes('操作成本 ${expected.state.cost}')`));
      const count=Number(await js(`document.querySelector('.garden-shell').dataset.windowEvents`));assert.ok(count<=320);seeks.push({tick,seq:expected.seq,window:count});
    }
    await click('▶ 播放');await new Promise(r=>setTimeout(r,2000));await click('Ⅱ 暂停');assert.ok(Number(await js(`document.querySelector('.garden-shell').dataset.replaySeq`))>seeks.at(-1)!.seq);
    await js(`document.querySelector('.garden-audio').open=true`);await click('导出完整运行');await wait(async()=>{try{await stat(output);return true;}catch{return false;}});
    input=output;await click('打开农场');await wait(()=>js(`document.querySelector('.garden-shell').dataset.replayId!=='${id}'&&document.querySelector('.garden-shell').dataset.replayLoading==='false'`));
    await writeFile(path.join(dir,'stream-paged-ui.png'),(await win.webContents.capturePage()).toPNG());
    assert.ok(await js(`!document.querySelector('.garden-canvas').dataset.error&&document.querySelector('.garden-canvas').dataset.droneCount==='8'`));
    await writeFile(path.join(dir,'stream-ui-qa.json'),JSON.stringify({pass:true,events:64008,seeks,checks:['portable import through shipped handler and validator (QA substitutes native dialog path)','10 out-of-order time seeks match disk world','bounded renderer window','play crosses page boundaries','portable export and reopen','8 drones rendered']},null,2));
  }finally{dialog.showOpenDialog=openDialog;dialog.showSaveDialog=saveDialog;}
}

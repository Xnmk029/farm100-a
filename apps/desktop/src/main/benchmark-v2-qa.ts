import {dialog,type BrowserWindow} from 'electron';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {validateBundle} from './benchmark-v2';
import {leaderboard,exportCSV} from '../../../../packages/benchmark-v2/scoring';
export async function benchmarkV2QA(win:BrowserWindow,dir:string){
 const source=process.env.FARM100_QA_BUNDLE;if(!source)throw Error('FARM100_QA_BUNDLE required');
 const raw=JSON.parse(await readFile(source,'utf8'));const validated=await validateBundle(raw,path.dirname(source));
 const forged=structuredClone(raw),sample=forged.attempts.find((a:any)=>a.status==='evaluated');sample.cases[0].correctness+=1;
 await assert.rejects(()=>validateBundle(forged,path.dirname(source)),/分数与事件/);
 const missingLedger=structuredClone(raw);missingLedger.ledger=[];
 await assert.rejects(()=>validateBundle(missingLedger,path.dirname(source)),/账本记录/);
 const changedLedger=structuredClone(raw),paidAttempt=changedLedger.attempts.find((a:any)=>a.status!=='infrastructure_error'&&Number.isFinite(a.call?.charged)&&a.call.charged>0);assert.ok(paidAttempt,'QA requires a paid completed call');paidAttempt.call.reserved+=0.01;
 await assert.rejects(()=>validateBundle(changedLedger,path.dirname(source)),/账本记录不一致/);
 const doubleChangedCost=structuredClone(raw),doublePaidAttempt=doubleChangedCost.attempts.find((a:any)=>a.id===paidAttempt.id),doublePaidEntry=doubleChangedCost.ledger.find((e:any)=>e.id===paidAttempt.call.id);doublePaidAttempt.call.charged=0;doublePaidAttempt.call.reportedCostUsd=0;doublePaidEntry.charged=0;doublePaidEntry.reportedCostUsd=0;
 await assert.rejects(()=>validateBundle(doubleChangedCost,path.dirname(source)),/费用与原始响应/);
 const js=(s:string)=>win.webContents.executeJavaScript(s),sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
 const wait=async(s:string)=>{for(let i=0;i<2400;i++){if(await js(s))return;await sleep(100);}throw Error('V2 UI timeout: '+s);};
 const click=async(text:string)=>{await js(`(()=>{const b=[...document.querySelectorAll('.benchmark-v2 button')].find(b=>b.textContent===${JSON.stringify(text)});if(!b||b.disabled)throw Error('Button unavailable');b.click();})()`);await sleep(200);};
 const open=dialog.showOpenDialog,save=dialog.showSaveDialog;
 try{
  let input=source;const newReview=raw.reviews.at(-1);
  if(newReview){input=path.join(path.dirname(source),'qa-incremental-'+process.pid+'.json');await writeFile(input,JSON.stringify({...raw,reviews:raw.reviews.filter((r:any)=>r.revision!==newReview.revision)}));}
  dialog.showOpenDialog=(async()=>({canceled:false,filePaths:[input]})) as typeof open;
  dialog.showSaveDialog=(async(options:any)=>({canceled:false,filePath:path.join(dir,options.defaultPath)})) as typeof save;
  await js(`document.querySelector('.score-launch').click()`);await wait(`!!document.querySelector('.benchmark-v2')&&!document.querySelector('.benchmark-v2 [role=status]')`);
  await click('导入评测证据包');await wait(`!!document.querySelector('.benchmark-v2 table')&&!document.querySelector('.benchmark-v2 [role=status]')`);
  if(await js(`!!document.querySelector('.benchmark-v2 [role=alert]')`))throw Error(await js(`document.querySelector('.benchmark-v2 [role=alert]').textContent`));
  if(newReview){input=source;await click('导入评测证据包');await wait(`!document.querySelector('.benchmark-v2 [role=status]')`);const merged=await js(`window.farm.benchmarkV2Get()`);assert.equal(merged.reviews.length,raw.reviews.length);assert.equal(merged.reviews.at(-1).attemptId,newReview.attemptId);assert.equal(merged.reviews.at(-1).at,newReview.at);assert.deepEqual(leaderboard(merged,1),leaderboard(validated,1));assert.deepEqual(leaderboard(merged,2),leaderboard(validated,2));}
  await sleep(600);
  await writeFile(path.join(dir,'score-overview.png'),(await win.webContents.capturePage()).toPNG());
  await click('查看与评分');await wait(`!!document.querySelector('#manual-review form')`);
  await js(`(()=>{const form=document.querySelector('#manual-review form');const set=(el,value)=>{const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};set(form.querySelector('input'),'QA-仅用于界面验证');for(const f of form.querySelectorAll('fieldset')){set(f.querySelector('select'),'7.5');set(f.querySelector('textarea'),'QA fixture, not a real human evaluation');set(f.querySelector('input'),'code:1');}})()`);
  await click('保存人工评分');await wait(`!document.querySelector('.benchmark-v2 [role=status]')`);
  const withReview=await js(`window.farm.benchmarkV2Get()`);assert.equal(withReview.reviews.at(-1).strategy.score,7.5);
  for(const result of leaderboard(withReview,1))if(result.coverage!==result.expected||result.tasks.some(t=>t.manual===null))assert.equal(result.total,null,'incomplete evidence or reviews must not publish a total');
  await assert.rejects(()=>js(`window.farm.benchmarkV2Review(${JSON.stringify({expectedRevision:0,review:{attemptId:withReview.reviews.at(-1).attemptId}})})`));
  await js(`document.querySelector('#manual-review form').scrollIntoView()`);await sleep(600);
  await writeFile(path.join(dir,'manual-review.png'),(await win.webContents.capturePage()).toPNG());
  await click('导出 JSON');await wait(`!document.querySelector('.benchmark-v2 [role=status]')`);
  const exported=JSON.parse(await readFile(path.join(dir,'farm100-scores-v2.json'),'utf8'));
  await validateBundle(exported,path.join(dir,exported.evidenceDirectory));
  assert.deepEqual(leaderboard(exported,1),leaderboard(withReview,1));
  await click('导出 CSV');await wait(`!document.querySelector('.benchmark-v2 [role=status]')`);
  assert.equal(await readFile(path.join(dir,'farm100-scores-v2.csv'),'utf8'),exportCSV(withReview));
  await win.webContents.reload();await sleep(1000);await wait(`!!document.querySelector('.score-launch')`);await js(`document.querySelector('.score-launch').click()`);await wait(`!!document.querySelector('.benchmark-v2 table')&&!document.querySelector('.benchmark-v2 [role=status]')`);
  const reopened=await js(`window.farm.benchmarkV2Get()`);assert.deepEqual(reopened.reviews,withReview.reviews);
  await writeFile(path.join(dir,'benchmark-v2-qa.json'),JSON.stringify({pass:true,checks:['raw evidence revalidation','forged score rejection','missing ledger rejection','paid call-ledger mismatch rejection','double-sided cost tamper rejection','incremental review upgrade','real IPC import','human form edit/save','stale revision rejection','no premature total','portable JSON revalidation','CSV export','reload preserves reviews'],limits:['QA-added reviewer is synthetic and isolated from formal evidence','native file selection substituted by QA'],models:validated.models},null,2));
 }finally{dialog.showOpenDialog=open;dialog.showSaveDialog=save;}
}

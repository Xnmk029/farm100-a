import {type BrowserWindow} from 'electron';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

export async function displayUIQA(win:BrowserWindow,dir:string){
  const js=(s:string)=>win.webContents.executeJavaScript(s),sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
  const wait=async(s:string)=>{for(let i=0;i<300;i++){if(await js(s))return;await sleep(100);}throw Error('Display QA timeout: '+s);};
  const click=async(label:string)=>{await wait(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});return b&&!b.disabled;})()`);await js(`([...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)})).click()`);};
  const dpr=Number(await js('devicePixelRatio')),width=Math.round(1920/dpr),height=Math.round(1080/dpr);
  assert.equal(dpr,Number(process.env.FARM100_QA_DPR??1),'requested device scale actually applied');
  win.setMinimumSize(700,450);
  const sizes=dpr===1?[[1280,720],[1920,1080]]:[[width,height]],rows:any[]=[];
  const inspect=async(name:string,selectors:string[])=>{
    const row=await js(`(()=>{const selectors=${JSON.stringify(selectors)};return {name:${JSON.stringify(name)},width:innerWidth,height:innerHeight,dpr:devicePixelRatio,overflowX:document.documentElement.scrollWidth>innerWidth,overflowY:document.documentElement.scrollHeight>innerHeight,controls:selectors.map(selector=>{const e=document.querySelector(selector);if(!e)return {selector,missing:true};e.scrollIntoView({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect();return {selector,visible:r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1};}),canvasError:document.querySelector('.garden-canvas')?.dataset.error??null};})()`);
    await writeFile(path.join(dir,name+'.png'),(await win.webContents.capturePage()).toPNG());rows.push(row);
    await writeFile(path.join(dir,'display-observation.json'),JSON.stringify(rows,null,2));
    assert.equal(row.overflowX,false,name+' horizontal overflow');assert.equal(row.overflowY,false,name+' vertical overflow');assert.equal(row.canvasError,null);assert.ok(row.controls.every((c:any)=>c.visible),name+' controls');
  };
  for(const [w,h]of sizes){
    win.setContentSize(w,h);await sleep(1000);
    await js(`document.querySelector('.garden-audio').open=true`);
    for(const [i,label]of ['环境','动作','收获'].entries()){
      await js(`(()=>{const e=document.querySelector('[aria-label="${label}音量"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'${[.15,.35,.65][i]}');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await js(`(()=>{const e=document.querySelector('[aria-label="${label}静音"]');if(!e.checked)e.click();})()`);
    }
    assert.deepEqual(await js(`['环境','动作','收获'].map(k=>({value:Number(document.querySelector('[aria-label="'+k+'音量"]').value),muted:document.querySelector('[aria-label="'+k+'静音"]').checked}))`),[{value:.15,muted:true},{value:.35,muted:true},{value:.65,muted:true}]);
    await js(`document.querySelector('[aria-label="动作静音"]').click()`);
    assert.deepEqual(await js(`['环境','动作','收获'].map(k=>document.querySelector('[aria-label="'+k+'静音"]').checked)`),[true,false,true]);
    await inspect(`farm-${w}x${h}-dpr${dpr}`,['[aria-label="新农场最大尺寸"]','#garden-execute','[aria-label="收获音量"]','[aria-label="环境静音"]']);
    await js(`document.querySelector('.garden-audio').open=false`);
    for(const [label,selectors]of [
      ['研究',['.economy-panel h2','.economy-panel article:last-child button']],
      ['加工',['.resource-grid','.recipe-actions button']],
      ['任务',['.economy-panel h2','.economy-panel article:last-child progress']],
      ['历史',['[aria-label="搜索农场历史"]','.history-pages']],
      ['挑战',['[aria-label="挑战种子"]','.economy-panel section:last-child article:last-child button']],
    ] as [string,string[]][]){
      await click(label);await sleep(300);await inspect(`${label}-${w}x${h}-dpr${dpr}`,selectors);
    }
    await click('程序');
    await click('学写程序');await wait(`!!document.querySelector('.lesson-write .monaco-editor [role="textbox"]')`);
    await click('执行并检查');await wait(`document.querySelector('.lesson-workspace').dataset.lessonResult==='retry'`);
    await inspect(`lesson-${w}x${h}-dpr${dpr}`,['[aria-label="选择引导练习"]','.lesson-run .primary','.lesson-write .editor','.lesson-feedback']);
    await click('返回我的农场');
  }
  await writeFile(path.join(dir,'display-ui-qa.json'),JSON.stringify({pass:true,rows,checks:['three independent volume and mute controls','farm execution and save-capacity controls reachable','lesson actual execution and feedback','no document overflow or canvas errors'],limits:['Chromium forced device scale; host Windows display setting unchanged','does not replace clean Windows VM acceptance']},null,2));
}

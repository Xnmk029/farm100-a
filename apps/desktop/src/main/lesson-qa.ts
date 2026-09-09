import {dialog,type BrowserWindow} from 'electron';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {LESSONS} from '../../../../packages/garden/lessons';
import {LESSON_SOLUTIONS} from '../../../../scripts/lesson-solutions';

export async function lessonUIQA(win:BrowserWindow,dir:string){
  const js=(s:string)=>win.webContents.executeJavaScript(s),sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
  const wait=async(s:string)=>{for(let i=0;i<600;i++){if(await js(s))return;await sleep(100);}await writeFile(path.join(dir,'lesson-timeout.png'),(await win.webContents.capturePage()).toPNG());await writeFile(path.join(dir,'lesson-timeout.json'),JSON.stringify(await js(`({body:document.body.innerText,progress:localStorage.getItem('farm100-lessons-v1'),focus:document.activeElement?.outerHTML})`),null,2));throw Error('Lesson UI timeout: '+s);};
  const click=async(label:string)=>{await wait(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});return b&&!b.disabled;})()`);await js(`([...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)})).click()`);};
  let savedPath=path.join(dir,'free-before.garden.json');const saveDialog=dialog.showSaveDialog;
  try{
    dialog.showSaveDialog=(async()=>({canceled:false,filePath:savedPath})) as typeof saveDialog;
    await click('保存农场');await wait(`document.querySelector('.garden-status').textContent.includes('已保存')`);
    await click('学写程序');await wait(`!!document.querySelector('.lesson-write .monaco-editor [role="textbox"]')`);
    await click('执行并检查');await wait(`document.querySelector('.lesson-workspace').dataset.lessonResult==='retry'`);
    assert.ok(await js(`document.querySelector('.lesson-feedback').textContent.includes('现在位于 (0,0)')`));
    await click('展开一条提示（0/2）');assert.ok(await js(`!!document.querySelector('.lesson-hint')`));
    const rows=[];
    for(let i=0;i<LESSONS.length;i++){
      const lesson=LESSONS[i],source=LESSON_SOLUTIONS[lesson.id];
      await js(`(()=>{const e=document.querySelector('[aria-label="选择引导练习"]');e.value='${i}';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await wait(`document.querySelector('.lesson-workspace').dataset.lesson===${JSON.stringify(lesson.id)}`);
      win.show();win.focus();win.webContents.focus();
      await js(`document.querySelector('.lesson-write .monaco-editor [role="textbox"]').focus()`);
      win.webContents.sendInputEvent({type:'keyDown',keyCode:'A',modifiers:['control']});win.webContents.sendInputEvent({type:'keyUp',keyCode:'A',modifiers:['control']});await sleep(50);await win.webContents.insertText(source);
      await wait(`JSON.parse(localStorage.getItem('farm100-lessons-v1')).drafts[${JSON.stringify(lesson.id)}]===${JSON.stringify(source)}`);
      await click('执行并检查');await wait(`document.querySelector('.lesson-workspace').dataset.lessonBusy==='false'&&document.querySelector('.lesson-workspace').dataset.lessonResult!==''`);
      assert.equal(await js(`document.querySelector('.lesson-workspace').dataset.lessonResult`),'pass',lesson.id+': '+await js(`document.querySelector('.lesson-feedback').textContent`));
      const proof=await js(`JSON.parse(localStorage.getItem('farm100-lessons-v1')).completed[${JSON.stringify(lesson.id)}]`);assert.ok(proof.runId);
      await js(`([...document.querySelectorAll('button')].find(b=>b.textContent==='暂停回放'))?.click()`);
      rows.push({id:lesson.id,runId:proof.runId,pass:true});
      if([0,4,8,11].includes(i))await writeFile(path.join(dir,`lesson-${lesson.id}.png`),(await win.webContents.capturePage()).toPNG());
    }
    const dimensions=[];
    for(const [width,height]of [[1280,720],[1920,1080]]){
      win.setContentSize(width,height);await sleep(1000);
      const view=await js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='执行并检查').getBoundingClientRect();return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,buttonVisible:b.bottom<=innerHeight&&b.top>=0,canvasError:document.querySelector('.garden-canvas').dataset.error??null};})()`);
      assert.equal(view.overflow,false);assert.equal(view.buttonVisible,true);assert.equal(view.canvasError,null);dimensions.push(view);
      await writeFile(path.join(dir,`lessons-${width}x${height}.png`),(await win.webContents.capturePage()).toPNG());
    }
    await click('返回我的农场');savedPath=path.join(dir,'free-after.garden.json');await click('保存农场');
    for(let i=0;;i++){try{JSON.parse(await readFile(savedPath,'utf8'));break;}catch(e){if(i>=100||((e as NodeJS.ErrnoException).code!=='ENOENT'&&!(e instanceof SyntaxError)))throw e;await sleep(100);}}
    assert.deepEqual(JSON.parse(await readFile(savedPath,'utf8')),JSON.parse(await readFile(path.join(dir,'free-before.garden.json'),'utf8')));
    await click('学写程序');assert.ok(await js(`document.querySelector('.lesson-header').textContent.includes('已完成 12 节')`));
    assert.equal(await js(`JSON.parse(localStorage.getItem('farm100-lessons-v1')).drafts.position`),LESSON_SOLUTIONS.position);
    await writeFile(path.join(dir,'lessons-ui-qa.json'),JSON.stringify({pass:true,rows,dimensions,checks:['starter failure and specific feedback','incremental hint','12 edited programs through Monaco and actual runner','per-lesson completed record and draft persisted across leaving/reentering','original farm and code preserved byte-equivalent as parsed save','1080p and 720p controls and canvas'],limits:['native save dialog paths substituted by QA','does not establish real beginner learning outcomes or clean Windows acceptance']},null,2));
  }finally{dialog.showSaveDialog=saveDialog;}
}

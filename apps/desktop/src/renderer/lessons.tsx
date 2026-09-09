import {useEffect,useMemo,useRef,useState,type ComponentType} from 'react';
import {LESSONS,LESSON_VERSION,lessonWorld,type LessonFeedback} from '../../../../packages/garden/lessons';
import {gardenAt,gardenSequence,ready,type GardenRun} from '../../../../packages/garden/core';
import {GardenView} from '../../../../packages/garden-view';
import './lessons.css';

type Editor=ComponentType<{code:string;onChange:(s:string)=>void;readOnly:boolean}>;
type Progress={version:string;completed:Record<string,{runId:string;at:string}>;drafts:Record<string,string>};
const storageKey='farm100-lessons-v1';
function load():Progress{try{const p=JSON.parse(localStorage.getItem(storageKey)??'null');if(p?.version===LESSON_VERSION&&p.completed&&p.drafts)return {version:LESSON_VERSION,completed:Object.fromEntries(LESSONS.filter(l=>typeof p.completed[l.id]?.runId==='string').map(l=>[l.id,p.completed[l.id]])),drafts:Object.fromEntries(LESSONS.filter(l=>typeof p.drafts[l.id]==='string').map(l=>[l.id,p.drafts[l.id]]))};}catch{}return {version:LESSON_VERSION,completed:{},drafts:{}};}

export function LessonWorkspace({Editor,onExit}:{Editor:Editor;onExit:()=>void}){
  const [progress,setProgress]=useState(load),[index,setIndex]=useState(0),[hint,setHint]=useState(0),[busy,setBusy]=useState(false),[run,setRun]=useState<GardenRun|null>(null),[feedback,setFeedback]=useState<LessonFeedback|null>(null),[error,setError]=useState(''),[tick,setTick]=useState(0),[playing,setPlaying]=useState(false),[selected,setSelected]=useState(0);
  const active=useRef(''),lesson=LESSONS[index],world=useMemo(()=>lessonWorld(lesson.id),[lesson.id]),code=progress.drafts[lesson.id]??lesson.starter;
  const seq=run?gardenSequence(run,tick):0,state=useMemo(()=>run?gardenAt(run,seq):world.initial,[run,seq,world]),event=run?.events[seq-1],next=run?.events[seq];
  useEffect(()=>{try{localStorage.setItem(storageKey,JSON.stringify(progress));}catch{setError('练习草稿暂时无法保存到本机；可以先复制代码。');}},[progress]);
  useEffect(()=>window.farm.onGardenProgress(p=>{
    if(p.runId!==active.current||p.type!=='result')return;
    const r=p.run as GardenRun;setRun(r);setBusy(false);setTick(r.initial.tick);setPlaying(true);
    const f=p.lessonFeedback as LessonFeedback|undefined;
    if(f){setFeedback(f);if(f.pass)setProgress(v=>({...v,completed:{...v.completed,[f.id]:{runId:r.runId,at:new Date().toISOString()}}}));}
    else setError('本次记录没有练习反馈，请重新执行。');
    if(p.historyWarning||p.storageError)setError(p.historyWarning??p.storageError);
  }),[]);
  useEffect(()=>{if(!playing||!run)return;let last=performance.now(),clock=tick,id=0;const frame=(now:number)=>{clock=Math.min(run.result.state.tick,clock+Math.min(100,now-last)/1000*48);last=now;setTick(clock);if(clock>=run.result.state.tick)setPlaying(false);else id=requestAnimationFrame(frame);};id=requestAnimationFrame(frame);return()=>cancelAnimationFrame(id);},[playing,run]);
  const choose=(i:number)=>{setIndex(i);setRun(null);setFeedback(null);setHint(0);setPlaying(false);setTick(0);setSelected(0);setError('');};
  const start=async()=>{setBusy(true);setPlaying(false);setRun(null);setTick(world.initial.tick);setFeedback(null);setError('');try{active.current=await window.farm.gardenStart({lesson:lesson.id,source:code});}catch(e){setError(String(e));setBusy(false);}};
  const changeCode=(source:string)=>setProgress(p=>({...p,drafts:{...p.drafts,[lesson.id]:source}}));
  return <div className="lesson-workspace" data-lesson={lesson.id} data-lesson-result={feedback?feedback.pass?'pass':'retry':''} data-lesson-busy={busy}>
    <header className="lesson-header"><div><strong>从第一行代码开始</strong><span>12 节练习 · 已完成 {Object.keys(progress.completed).length} 节</span></div><label>当前练习<select aria-label="选择引导练习" disabled={busy} value={index} onChange={e=>choose(Number(e.target.value))}>{LESSONS.map((l,i)=><option key={l.id} value={i}>{progress.completed[l.id]?'✓ ':''}{i+1}. {l.title}</option>)}</select></label><button disabled={busy} onClick={onExit}>返回我的农场</button></header>
    {error&&<div role="alert" className="garden-alert">{error}<button onClick={()=>setError('')}>关闭</button></div>}
    <main className="lesson-columns"><section className="lesson-observe"><div className="lesson-world"><strong>独立练习田</strong><p>{lesson.world} 每次执行重新开始；你的农场保留在原处。</p><GardenView state={state} event={event} nextEvent={next} events={run?.events} clock={run?tick:state.tick} follow={false} grid selected={selected} onSelect={setSelected} resetKey={index}/><div className="lesson-inspect">位置 ({state.x},{state.y}) · 粮食 {state.inventory.grain} · 选中 ({selected%state.size},{Math.floor(selected/state.size)})：{state.cells[selected].crop??'空地'}{ready(state.cells[selected])?' · 已成熟':''}</div><div className="lesson-playback"><button disabled={!run||busy} onClick={()=>{if(run&&tick>=run.result.state.tick)setTick(run.initial.tick);setPlaying(!playing);}}>{playing?'暂停回放':'播放回放'}</button><input aria-label="练习回放进度" type="range" disabled={!run||busy} min={run?.initial.tick??0} max={run?.result.state.tick??1} value={run?tick:0} onChange={e=>{setPlaying(false);setTick(+e.target.value);}}/><span>{seq} / {run?.events.length??0} 动作</span></div></div>
      <div className="lesson-feedback" aria-live="polite"><h2>{feedback?(feedback.pass?'本课目标已达成':'还有几处需要调整'):'执行后，在这里逐项检查结果'}</h2>{feedback?<><ul>{feedback.checks.map(c=><li key={c.label} className={c.pass?'met':'unmet'}><strong>{c.pass?'✓':'○'} {c.label}</strong><span>{c.detail}</span></li>)}</ul><p>检查实际动作和结果；允许不同的代码写法。完成记录保存到本机。</p>{feedback.pass&&index<LESSONS.length-1&&<button className="primary" disabled={busy} onClick={()=>choose(index+1)}>进入下一课</button>}</>:<p>先预测无人机会做什么，再执行。未通过时对照提示修改；回放可以定位动作发生的顺序。</p>}{run&&<details><summary>程序输出与结束原因</summary><pre>{run.result.message+'\n'+run.logs.join('\n')}</pre></details>}</div>
    </section><section className="lesson-write"><div className="lesson-instruction"><span className="eyebrow">第 {index+1} 课 · {lesson.concept}</span><h1>{lesson.title}</h1><p className="lesson-goal">{lesson.goal}</p><p>{lesson.explanation}</p><button disabled={hint>=lesson.hints.length} onClick={()=>setHint(h=>h+1)}>展开一条提示（{hint}/{lesson.hints.length}）</button>{lesson.hints.slice(0,hint).map(h=><p className="lesson-hint" key={h}>{h}</p>)}</div><div className="lesson-code-tools"><span>lesson.js · 草稿自动保留</span><button disabled={busy} onClick={()=>changeCode(lesson.starter)}>恢复本课起步代码</button></div><Editor code={code} onChange={changeCode} readOnly={busy}/><div className="lesson-run"><button className="primary" disabled={busy||!code.trim()} onClick={()=>void start()}>执行并检查</button><button disabled={!busy} onClick={()=>void window.farm.gardenCancel().catch(e=>setError(String(e)))}>中止</button><span>{busy?'真实脚本执行中…':'每次从本课初态开始'}</span></div></section></main>
  </div>;
}

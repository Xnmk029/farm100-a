import {challengeEfficiency} from '../../../../packages/garden/scoring';
import {useEffect,useMemo,useRef,useState} from 'react';
import {GardenView} from '../../../../packages/garden-view';
import {gardenAt,gardenSequence,type GardenRun} from '../../../../packages/garden/core';
import {CHALLENGE_BY_ID,evaluateChallenge} from '../../../../packages/garden/challenges';
export function ChallengeComparison({runs,onClose}:{runs:[GardenRun,GardenRun];onClose:()=>void}){
  const [tick,setTick]=useState(0),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(24);const time=useRef(0);
  const efficiency=useMemo(()=>challengeEfficiency(runs[0],runs[1]),[runs]);
  const end=Math.max(...runs.map(r=>r.result.state.tick));
  time.current=tick;
  useEffect(()=>{if(!playing)return;let last=performance.now(),id=0;const frame=(now:number)=>{const next=Math.min(end,time.current+Math.min(100,now-last)*speed/1000);last=now;time.current=next;setTick(next);if(next>=end)setPlaying(false);else id=requestAnimationFrame(frame);};id=requestAnimationFrame(frame);return()=>cancelAnimationFrame(id);},[playing,speed,end]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[onClose]);
  return <div className="challenge-comparison" role="dialog" aria-label="同输入挑战对比"><header><div><strong>{CHALLENGE_BY_ID[runs[0].config.challenge!].name} · 同种子并排回放</strong><small>种子 {runs[0].config.seed} · 同一模拟时间 · 结束的一侧保留终态</small><small>{efficiency?`B 相对 A 的${efficiency.primary==='tick'?'时间':'成本'}节省 ${efficiency.savingPercent}%（负数表示增加）`:'效率评分不可比：需同配置且双方通关'}</small></div><button onClick={onClose}>关闭对比</button></header><div className="comparison-fields">{runs.map((run,i)=><ComparisonField key={run.runId} run={run} tick={tick} index={i}/>)}</div><div className="comparison-controls"><button onClick={()=>{if(tick>=end)setTick(0);setPlaying(!playing);}}>{playing?'暂停对比':'播放对比'}</button><input aria-label="对比模拟时间" type="range" min={0} max={end} value={tick} onChange={e=>{setPlaying(false);setTick(Number(e.target.value));}}/><select aria-label="对比速度" value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[24,48,96,240].map(s=><option key={s} value={s}>{s/24}×</option>)}</select><span>{Math.floor(tick)} / {end} tick</span></div></div>;
}
function ComparisonField({run,tick,index}:{run:GardenRun;tick:number;index:number}){
  const seq=gardenSequence(run,tick),state=useMemo(()=>gardenAt(run,seq),[run,seq]),score=useMemo(()=>evaluateChallenge(run)!,[run]);
  return <section><div className="comparison-label"><strong>{index===0?'A':'B'} · {run.source.split('\n')[0].replace(/^\/\/\s*/,'').slice(0,65)}</strong><span>{score.passed?'通过':'未通过'} · {run.config.drones??1} 台 · {score.tick} tick · 成本 {score.cost}</span></div><GardenView state={state} event={run.events[seq-1]} nextEvent={run.events[seq]} events={run.events} clock={tick} follow={false} grid={false} selected={-1} onSelect={()=>{}} resetKey={0}/><div className="comparison-label"><span>{Math.floor(Math.min(tick,run.result.state.tick))} tick · 动作 {seq}/{run.events.length}</span><span>{state.maze?'遗物 '+state.maze.collected+'/'+state.maze.required:'收获 '+state.harvests+' 次'}</span></div></section>;
}

import {useEffect,useMemo,useRef,useState,type ComponentType} from 'react';
import {GardenView} from '../../../../packages/garden-view';
import {FarmAudio} from '../../../../packages/garden-view/audio';
import {CROPS,copyGarden,freshGarden,gardenDefault,gardenAt,gardenSequence,ready,type GardenConfig,type GardenState,type GardenRun} from '../../../../packages/garden/core';
import './garden.css';
import {EconomyPanel,type EconomyTab} from './economy';

export type GardenAPI={gardenExamples:()=>Promise<{source:string;run?:GardenRun;preferSort:boolean}>;gardenViewReady:()=>Promise<boolean>;gardenFrameReady:(frame:number)=>Promise<boolean>;gardenStart:(req:unknown)=>Promise<string>;gardenCancel:()=>Promise<boolean>;gardenSave:(req:unknown)=>Promise<boolean>;gardenOpen:()=>Promise<{run?:GardenRun;config?:GardenConfig;state?:GardenState;source?:string}|null>;gardenExport:(run:GardenRun)=>Promise<boolean>;onGardenProgress:(fn:(p:any)=>void)=>()=>void;onGardenPlayback:(fn:(p:{tick:number;speed:number;cinema:boolean;playing:boolean;frameId?:number})=>void)=>()=>void};
type Editor=ComponentType<{code:string;onChange:(v:string)=>void;readOnly:boolean}>;
const actionName:Record<string,string>={move:'飞往下一块田',till:'翻整土壤',plant:'播种',water:'浇水',harvest:'收获',inspect:'检查作物',wait:'等待生长',refill:'补充水箱',get_size:'读取田地尺寸',get_position:'定位',get_inventory:'读取库存',get_progress:'读取研究进度',research:'完成研究',craft:'加工资源',fertilize:'养护土壤',water_area:'分区灌溉',till_area:'区域整地',inspect_neighbors:'观察邻域',swap:'交换作物',clear:'清理作物',repair:'修复裂隙',expand:'扩建土地',harvest_area:'区域收获'};
const resultName:Record<string,string>={finished:'执行完毕',cancelled:'已中止',budget_exceeded:'预算耗尽',runtime_error:'脚本错误',api_error:'API 参数错误',memory_limit:'内存超限',wall_timeout:'执行超时',recording_limit:'记录上限',runner_crash:'运行器退出'};

export function GardenWorkspace({Editor,onSort}:{Editor:Editor;onSort:()=>void}){
  const [config,setConfig]=useState<GardenConfig>(gardenDefault),[base,setBase]=useState(()=>freshGarden(gardenDefault));
  const [code,setCode]=useState(''),[example,setExample]=useState(''),[run,setRun]=useState<GardenRun|null>(null);
  const [busy,setBusy]=useState(false),[phase,setPhase]=useState('准备播种'),[error,setError]=useState('');
  const [tick,setTick]=useState(0),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(24);
  const [follow,setFollow]=useState(false),[grid,setGrid]=useState(false),[selected,setSelected]=useState(0),[resetKey,setResetKey]=useState(0),[cinema,setCinema]=useState(false),[tab,setTab]=useState<EconomyTab>('code');
  const [audioOn,setAudioOn]=useState(false),[ambient,setAmbient]=useState(.2),[effects,setEffects]=useState(.25);
  const [frameId,setFrameId]=useState<number|undefined>(undefined);
  const directAction=useRef(false);
  const audio=useRef(new FarmAudio()),active=useRef(''),lastSound=useRef(-1),playingRef=useRef(false),tickRef=useRef(0);
  playingRef.current=playing;tickRef.current=tick;
  const seq=run?gardenSequence(run,tick):0;
  const state=useMemo(()=>run?gardenAt(run,seq):base,[run,seq,base]);
  const event=run?.events[seq-1],nextEvent=run?.events[seq];
  const locked=selected%config.size>=(state.economy?.extent??config.size)||Math.floor(selected/config.size)>=(state.economy?.extent??config.size);
  const mature=state.cells.filter(ready).length,growing=state.cells.filter(c=>c.crop&&!ready(c)).length,cell=state.cells[selected];
  const safely=async(fn:()=>Promise<unknown>)=>{setError('');try{await fn();}catch(e){setError(String(e));}};
  useEffect(()=>{
    let mounted=true;
    window.farm.gardenExamples().then(data=>{
      if(!mounted)return;setCode(data.source);setExample(data.source);
      if(data.run){const r=data.run;setCode(r.source);setRun(r);setBase(r.initial);setConfig(r.config);const middle=r.events.find(e=>e.harvests>=r.config.size*r.config.size+12);setTick(r.config.rule?r.result.state.tick:middle?.tick??0);setPhase('真实示例 · 回放暂停');}
    }).catch(e=>setError(String(e)));
    const unsub=window.farm.onGardenProgress(p=>{
      if(p.runId!==active.current)return;
      if(p.type==='ready')setPhase('脚本执行中');
      if(p.type==='events')setPhase(`记录动作 ${p.events.at(-1)?.seq??0}`);
      if(p.type==='result'){
        const r=p.run as GardenRun;setRun(r);setBase(r.initial);setTick(directAction.current?r.result.state.tick:r.initial.tick);setPlaying(!directAction.current);setBusy(false);setPhase(resultName[r.result.reason]??r.result.reason);
        if(p.storageError)setError('运行结束，但自动保存失败：'+p.storageError);
      }
    });return()=>{mounted=false;unsub();audio.current.dispose();};
  },[]);
  useEffect(()=>window.farm.onGardenPlayback(p=>{setTick(p.tick);tickRef.current=p.tick;setSpeed(p.speed);setCinema(p.cinema);setPlaying(p.playing);setFrameId(p.frameId);}),[]);
  useEffect(()=>{if(frameId===undefined)return;const id=requestAnimationFrame(()=>requestAnimationFrame(()=>{void window.farm.gardenFrameReady(frameId);}));return()=>cancelAnimationFrame(id);},[frameId]);
  useEffect(()=>{
    if(!playing||!run)return;
    let last=performance.now(),id=0;
    const frame=(now:number)=>{const delta=Math.min(100,now-last)/1000;last=now;const end=run.result.state.tick;const next=Math.min(end,tickRef.current+delta*speed);tickRef.current=next;setTick(next);if(next>=end)setPlaying(false);else id=requestAnimationFrame(frame);};
    id=requestAnimationFrame(frame);return()=>cancelAnimationFrame(id);
  },[playing,run,speed]);
  useEffect(()=>{
    if(event&&playing&&lastSound.current+1===seq)audio.current.event(event);lastSound.current=seq;
  },[seq,playing]);
  useEffect(()=>{audio.current.volume(audioOn?ambient:0,audioOn?effects:0);},[audioOn,ambient,effects]);
  const start=async(override?:string)=>{
    directAction.current=override!==undefined;
    setPlaying(false);setBusy(true);setPhase('正在创建运行器');
    try{active.current=await window.farm.gardenStart({config,source:override??code,initial:copyGarden(state)});}catch(e){setBusy(false);throw e;}
  };
  const reset=()=>{setRun(null);const s=freshGarden(gardenDefault);setConfig(gardenDefault);setCode(example);setBase(s);setTick(0);setPlaying(false);setSelected(0);setResetKey(k=>k+1);setPhase('新农场准备就绪');};
  const open=async()=>{const data=await window.farm.gardenOpen();if(!data)return;setPlaying(false);setSelected(0);setResetKey(k=>k+1);
    if(data.run){const r=data.run;setCode(r.source);setRun(r);setConfig(r.config);setCode(r.source);setBase(r.initial);setTick(r.initial.tick);setPhase('运行记录已打开');}
    else{setRun(null);setConfig(data.config!);setBase(data.state!);setCode(data.source!);setTick(data.state!.tick);setPhase('农场已恢复');}
  };
  useEffect(()=>{const handler=(e:KeyboardEvent)=>{if(e.key==='Escape')setCinema(false);if(e.ctrlKey&&e.key==='Enter'){e.preventDefault();document.getElementById('garden-execute')?.click();}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[]);
  return <div className={'garden-shell'+(cinema?' cinema':'')}>
    <header className="garden-header"><div className="garden-brand"><span className="garden-mark">F</span><div>FARM<span>100</span><small>把想法，种成一座农场</small></div></div>
      <nav><span className="current">自由农场</span><button disabled={busy} onClick={onSort}>算法测评 ↗</button></nav>
      <div className="garden-header-right"><span className="local-dot"/> 本地农场 <span className="version">0.3 开发中</span></div>
    </header>
    <div className="garden-toolbar"><div><span className="eyebrow">HOME FIELD</span><strong>晨光农庄</strong><span>{state.economy?.extent??config.size} × {state.economy?.extent??config.size} · 研究 {state.economy?.unlocks.length??0}/20</span></div>
      <button disabled={busy} onClick={()=>safely(open)}>打开农场</button><button disabled={busy} onClick={()=>safely(async()=>{if(await window.farm.gardenSave({config,state,source:code}))setPhase('当前农场与代码已保存');})}>保存农场</button>
      <button disabled={busy} onClick={reset}>新农场</button><button className={cinema?'active':''} onClick={()=>setCinema(!cinema)}>{cinema?'退出观赏 Esc':'⛶ 观赏模式'}</button>
    </div>
    {error&&<div className="garden-alert" role="alert">{error}<button onClick={()=>setError('')}>关闭</button></div>}
    <div className="garden-workspace">
      <section className="garden-stage">
        <div className="garden-sky"/>
        <div className="garden-status"><span className="sun-icon">☀</span><div><strong>让农场自己运转起来。</strong><span>{frameId!==undefined?'真实脚本记录 · 按模拟时间回放':busy?phase:playing?'正在回放真实生产过程':phase}</span></div><span className="stage-badge">{frameId!==undefined?'事件回放输出':playing?'▶ 回放中':'Ⅱ 已暂停'}</span></div>
        <div className="garden-stock"><div><img src="./assets/farm-v1/wheat-3.png"/><span>粮食<strong>{state.inventory.grain}</strong></span></div><div><img src="./assets/farm-v1/carrot-3.png"/><span>根菜<strong>{state.inventory.roots}</strong></span></div><div><img src="./assets/farm-v1/tank.png"/><span>储水<strong>{state.inventory.water}</strong></span></div></div>
        <GardenView state={state} event={event} nextEvent={nextEvent} clock={tick} cinematicClock={frameId===undefined?undefined:tick/24} follow={follow} grid={grid} selected={selected} onSelect={setSelected} resetKey={resetKey} onReady={()=>{void window.farm.gardenViewReady();}}/>
        <div className="garden-camera"><button className={follow?'active':''} onClick={()=>setFollow(!follow)}>◎ 跟随无人机</button><button className={grid?'active':''} onClick={()=>setGrid(!grid)}>田块网格</button><button onClick={()=>{setFollow(false);setResetKey(k=>k+1);}}>复位镜头</button><span>滚轮缩放 · 拖动平移 · 点击检查</span></div>
        <div className="garden-caption"><span className="drone-dot"/><strong>{event?(actionName[event.action]??event.action):'无人机待命'}{event?.value===false?' · 条件不满足':''}</strong><span>({state.x}, {state.y})</span><span className="caption-end">{growing} 块生长中 · {mature} 块成熟</span></div>
        <div className="garden-timeline"><button disabled={!run||busy} className="primary" onClick={()=>{if(run&&tick>=run.result.state.tick)setTick(run.initial.tick);setPlaying(!playing);}}>{playing?'Ⅱ 暂停':'▶ 播放'}</button>
          <button disabled={!nextEvent||busy} onClick={()=>{setPlaying(false);if(nextEvent)setTick(nextEvent.tick);}}>单步</button>
          <input aria-label="农场回放进度" type="range" min={run?.initial.tick??0} max={run?.result.state.tick??1} value={tick} disabled={!run||busy} onChange={e=>{setPlaying(false);setTick(+e.target.value);}}/>
          <select aria-label="农场回放速度" value={speed} onChange={e=>setSpeed(+e.target.value)}>{[12,24,48,96,240].map(s=><option key={s} value={s}>{s/24}×</option>)}</select><span>{Math.floor(tick)} / {run?.result.state.tick??0} tick</span>
        </div>
      </section>
      <aside className="garden-sidebar"><div className="garden-tabs">{([['code','程序'],['research','研究'],['craft','加工'],['quests','任务'],['guide','手册']] as const).map(([id,label])=><button key={id} className={tab===id?'selected':''} onClick={()=>setTab(id)}>{label}</button>)}</div>
        {tab==='code'?<><div className="garden-code-tools"><span>garden.js</span><button disabled={busy} onClick={()=>setCode(example)}>载入生产示例</button><button disabled={busy} onClick={()=>safely(async()=>{const s=await window.farm.openCode();if(s!==null)setCode(s);})}>导入</button></div><Editor code={code} readOnly={busy} onChange={setCode}/>
          <div className="garden-execute"><button id="garden-execute" className="primary" disabled={busy||!code} onClick={()=>safely(()=>start())}>▶ 从当前农场执行</button><button disabled={!busy} onClick={()=>safely(()=>window.farm.gardenCancel())}>中止</button><small>Ctrl+Enter · 原始操作被记录，播放倍率不影响产出</small></div></>:
          <EconomyPanel tab={tab} state={state} busy={busy} act={source=>{void safely(()=>start(source));}}/>}
        <div className="garden-inspector"><span className="eyebrow">田块观察 · ({selected%config.size}, {Math.floor(selected/config.size)})</span><strong>{locked?'待扩建土地':cell?.crop?CROPS[cell.crop].name:cell?.soil?'已翻整的土壤':'草地'}</strong><span>{locked?'研究农场扩建并投入材料后开放':cell?.crop?`${ready(cell)?'已成熟':'生长中'} · ${Math.round(cell.growth/CROPS[cell.crop].growth*100)}%`:'可以在这里开始新的生产周期'}</span><div className="growth-meter"><i style={{width:(cell?.crop?cell.growth/CROPS[cell.crop].growth*100:0)+'%'}}/></div><small>{cell?.damaged?'裂隙待修复 · ':''}{cell?.trait!==undefined?'性状 '+cell.trait+' · ':''}土壤含水 {cell?.water??0} · 已收获 {cell?.cycles??0} 轮</small></div>
        <details className="garden-audio"><summary>声音与记录</summary><label><input type="checkbox" checked={audioOn} onChange={e=>{const enabled=e.target.checked;safely(async()=>{if(enabled)await audio.current.enable();setAudioOn(enabled);});}}/>启用农场声音</label><label>环境<input type="range" min="0" max="1" step=".05" value={ambient} onChange={e=>setAmbient(+e.target.value)}/></label><label>动作<input type="range" min="0" max="1" step=".05" value={effects} onChange={e=>setEffects(+e.target.value)}/></label>{run&&<><button onClick={()=>safely(()=>window.farm.gardenExport(run))}>导出完整运行</button><pre>{run.result.message+'\n'+run.logs.slice(-8).join('\n')}</pre></>}</details>
      </aside>
    </div>
    <footer className="garden-footer"><span>原创农场资产 · 确定性生长</span><span>累计播种 {state.planted} · 累计收获 {state.harvests} · 操作成本 {state.cost}</span><span>执行 {busy?'进行中':'空闲'} / 回放 {playing?'播放':'暂停'}</span></footer>
  </div>;
}

import {BenchmarkWorkspace,type BenchmarkAPI} from './benchmark-v2';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import {FarmView} from '../../../../packages/farm-view';
import {defaultConfig,copyState,type Config,type Run,type State,type Event,type Progress,type Generation} from '../../../../packages/protocol';
import {Simulation,violations} from '../../../../packages/simulation';
import {applyEvent,stateAt,sequenceAtCost} from '../../../../packages/recording/replay';
import './style.css';
import {GardenWorkspace,type GardenAPI} from './garden';

type FarmAPI={examples:()=>Promise<{reference:string;improved:string;runs?:Run[]}>;start:(r:unknown)=>Promise<string>;cancel:()=>Promise<void>;openCode:()=>Promise<string|null>;
  saveWorkspace:(r:unknown)=>Promise<boolean>;openWorkspace:()=>Promise<any>;openRun:()=>Promise<Run|null>;export:(arg:unknown)=>Promise<boolean>;onProgress:(fn:(p:Progress&{storageError?:string})=>void)=>()=>void};
declare global {interface Window{farm:FarmAPI&GardenAPI&BenchmarkAPI;MonacoEnvironment:any}}
window.MonacoEnvironment={getWorker:()=>new EditorWorker()};
const statusText:Record<string,string>={succeeded:'已通关',incomplete:'未完成收获',budget_exceeded:'预算耗尽',api_error:'接口调用错误',syntax_error:'语法错误',runtime_error:'程序异常',memory_limit:'内存超限',wall_timeout:'执行超时',recording_limit:'记录超限',cancelled:'已中止',runner_crash:'运行器异常'};
function CodeEditor({code,onChange,readOnly}:{code:string;onChange:(s:string)=>void;readOnly:boolean}){
  const container=useRef<HTMLDivElement>(null),editor=useRef<monaco.editor.IStandaloneCodeEditor>(undefined);const change=useRef(onChange);change.current=onChange;
  useEffect(()=>{
    monaco.editor.defineTheme('farm',{base:'vs-dark',inherit:true,rules:[],colors:{'editor.background':'#18231e','editorLineNumber.foreground':'#627466','editor.lineHighlightBackground':'#233028','editor.selectionBackground':'#45633d'}});
    editor.current=monaco.editor.create(container.current!,{value:code,language:'javascript',theme:'farm',fontSize:13,fontFamily:'Cascadia Code, Consolas, monospace',automaticLayout:true,minimap:{enabled:false},scrollBeyondLastLine:false,tabSize:2,padding:{top:16},wordWrap:'on',ariaLabel:'参赛代码'});
    const sub=editor.current.onDidChangeModelContent(()=>change.current(editor.current!.getValue()));return()=>{sub.dispose();editor.current?.dispose();};
  },[]);
  useEffect(()=>{if(editor.current&&editor.current.getValue()!==code)editor.current.setValue(code);},[code]);
  useEffect(()=>{editor.current?.updateOptions({readOnly});},[readOnly]);
  return <div className="editor" ref={container}/>;
}
function App({onGarden}:{onGarden:()=>void}){
  useEffect(()=>{const handler=(e:KeyboardEvent)=>{if(e.ctrlKey&&e.key==='Enter'){e.preventDefault();document.getElementById('run-code')?.click();}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[]);
  const [config,setConfig]=useState<Config>(defaultConfig),[code,setCode]=useState('// 载入参考解，开始第一次运行。'),[label,setLabel]=useState('人工参考解'),[attempt,setAttempt]=useState(1);
  const [generation,setGeneration]=useState<Generation>({source:''});
  const [examples,setExamples]=useState({reference:'',improved:''}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [run,setRun]=useState<Run|null>(null),[history,setHistory]=useState<Run[]>([]),[live,setLive]=useState<State>(new Simulation(defaultConfig).initial);
  const [alignedCost,setAlignedCost]=useState(0);
  const [seq,setSeq]=useState(0),[playing,setPlaying]=useState(false),[rate,setRate]=useState(40),[otherId,setOtherId]=useState(''),[tab,setTab]=useState('code'),[trailOn,setTrailOn]=useState(false),[batch,setBatch]=useState('');
  const activeId=useRef(''),activeRequest=useRef({config,source:code,label,attempt,generation:undefined as Generation|undefined}),batchStop=useRef(false),waitResult=useRef<((r:Run)=>void)|undefined>(undefined);
  activeRequest.current={config,source:code,label,attempt,generation:generation.source||generation.durationMs!==undefined||generation.inputTokens!==undefined||generation.outputTokens!==undefined?generation:undefined};
  useEffect(()=>{
    if(!window.farm){setError('请使用 FARM100 桌面客户端打开。');return;}
    window.farm.examples().then(x=>{setExamples(x);setCode(x.reference);if(x.runs?.length===2){const primary=x.runs[1],at=primary.events.findIndex(e=>e.action==='swap')+1;setHistory(x.runs);setRun(primary);setOtherId(x.runs[0].runId);setConfig(primary.config);setCode(primary.source);setLabel(primary.label);setSeq(at);setAlignedCost(primary.events[at-1].cost);}}).catch(e=>setError(String(e)));
    return window.farm.onProgress(p=>{
      if(p.runId!==activeId.current)return;
      if(p.type==='events'&&p.events)setLive(s=>p.events!.reduce(applyEvent,s));
      if(p.type==='result'&&p.run){const r=p.run;setBusy(false);setRun(r);setHistory(h=>[r,...h].slice(0,100));setSeq(0);setPlaying(!waitResult.current);setNotice(p.storageError?'运行结束，但自动保存失败：'+p.storageError:'运行已保存，可回放或导出。');waitResult.current?.(r);waitResult.current=undefined;}
    });
  },[]);
  useEffect(()=>{if(!busy&&!run)setLive(new Simulation(config).initial);},[config]);
  useEffect(()=>{
    if(!playing||!run)return;const compared=history.find(r=>r.runId===otherId&&r.configHash===run.configHash);let playbackCost=compared?alignedCost:run.events[seq-1]?.cost??0;const limit=Math.max(run.result.state.cost,compared?.result.state.cost??0);const id=setInterval(()=>{playbackCost=Math.min(limit,playbackCost+rate/10);setAlignedCost(playbackCost);setSeq(sequenceAtCost(run.events,playbackCost));if(playbackCost>=limit)setPlaying(false);},100);return()=>clearInterval(id);
  },[playing,run,rate,otherId]);
  const state=run&&!busy?stateAt(run,seq):live;const actualConfig=run&&!busy?run.config:config;const event=run?.events[seq-1];
  const other=history.find(r=>r.runId===otherId&&r.configHash===run?.configHash);const cost=state.cost;
  const otherSeq=other?sequenceAtCost(other.events,alignedCost):0;const otherState=other?stateAt(other,otherSeq):undefined;
  const trail=useMemo(()=>trailOn&&run?run.events.slice(Math.max(0,seq-50),seq).filter(e=>e.action==='move').map(e=>e.position):[],[run,seq,trailOn]);
  const guarded=async(fn:()=>Promise<unknown>)=>{setError('');try{await fn();}catch(e){setError(String(e));}};
  const start=async(c=config)=>{
    setError('');setNotice('');setRun(null);setOtherId('');setPlaying(false);setLive(new Simulation(c).initial);setBusy(true);
    try{activeId.current=await window.farm.start({...activeRequest.current,config:c});}catch(e){setBusy(false);throw e;}
  };
  const runBatch=async()=>{
    batchStop.current=false;
    try{for(const [i,seed]of [0,1,7,42,99,1234,65535,4294967295].entries()){
      if(batchStop.current)break;setBatch(`测试集 ${i+1}/8 · 随机种子 ${seed}`);
      const done=new Promise<Run>(resolve=>{waitResult.current=resolve;});await start({...config,seed});await done;
    }}finally{setBatch('');waitResult.current=undefined;}
  };
  const loadExample=(which:'reference'|'improved')=>{setRun(null);setPlaying(false);setLive(new Simulation(config).initial);setCode(examples[which]);setLabel(which==='reference'?'人工参考解':'缓存插入排序');setAttempt(1);setGeneration({source:''});};
  return <div className="shell">
    <header><div className="brand"><span className="brand-icon">▥</span><div>FARM<span>100</span><small>算法农场 · 本地测评工作台</small></div></div><nav><span className="nav-active">排序与收获</span><button disabled={busy} onClick={onGarden}>自由农场 ↗</button></nav><div className="offline"><i/>本地运行 <span>规则 1.0</span></div></header>
    <section className="toolbar">
      <label>地图<select disabled={busy||!!batch} value={config.size} onChange={e=>{const size=+e.target.value as 4|8|16;setConfig({...config,size,budget:size===4?2000:size===8?20000:200000});setRun(null);}}>{[4,8,16].map(n=><option key={n} value={n}>{n} × {n}</option>)}</select></label>
      <label>种子<input aria-label="种子" type="number" min="0" max="4294967295" disabled={busy||!!batch} value={config.seed} onChange={e=>{setConfig({...config,seed:Math.max(0,Math.min(4294967295,Math.floor(+e.target.value)||0))});setRun(null);}}/></label>
      <label>操作预算<input aria-label="操作预算" type="number" min="0" max="1000000" disabled={busy||!!batch} value={config.budget} onChange={e=>{setConfig({...config,budget:Math.max(0,Math.min(1000000,Math.floor(+e.target.value)||0))});setRun(null);}}/></label>
      <span className="toolbar-gap"/>
      <button disabled={busy} onClick={()=>guarded(async()=>{const r=await window.farm.openWorkspace();if(r){setConfig(r.config);setCode(r.source);setLabel(r.label);setAttempt(r.attempt);setGeneration(r.generation??{source:''});setRun(null);}})}>打开工作区</button>
      <button onClick={()=>guarded(()=>window.farm.saveWorkspace(activeRequest.current))}>保存工作区</button>
      <button onClick={()=>guarded(async()=>{const r=await window.farm.openRun();if(r){setRun(r);setConfig(r.config);setCode(r.source);setLabel(r.label);setAttempt(r.attempt);setGeneration(r.generation??{source:''});setSeq(0);setPlaying(false);setHistory(h=>[r,...h]);setOtherId('');}})} disabled={busy}>导入回放</button>
    </section>
    {error&&<div className="alert" role="alert">{error}<button onClick={()=>setError('')}>关闭</button></div>}
    <main>
      <section className="field-panel">
        <div className="panel-head"><div><span className="eyebrow">排序田区 / 01</span><h1>让每一株，都在合适的位置。</h1><p>行向右、列向下非递减，然后执行整田收获。</p></div><span className={'badge '+(busy?'working':run?.result.reason==='succeeded'?'success':'')}>{busy?'执行中':run?'结果 · '+statusText[run.result.reason]:'准备就绪'}</span></div>
        <div className={'fields '+(other?'split':'')}>
          <div className="field"><div className="field-caption"><strong>{run?.label??label}{run?` · 最终 ${run.result.state.cost}`:''}</strong><span>{actualConfig.size}×{actualConfig.size} · 随机种子 {actualConfig.seed}</span></div><FarmView state={state} size={actualConfig.size} event={event} trail={trail}/><div className="field-legend"><span><i className="legend-drone"/>无人机 ({state.x}, {state.y})</span><span><i className="legend-edge"/>尚未有序的相邻边</span><label><input type="checkbox" checked={trailOn} onChange={e=>setTrailOn(e.target.checked)}/>最近 50 步轨迹</label></div></div>
          {other&&otherState&&<div className="field"><div className="field-caption"><strong>{other.label}</strong><span>相同逻辑成本对齐</span></div><FarmView state={otherState} size={other.config.size} event={other.events[otherSeq-1]}/><div className="field-legend">已用 {otherState.cost} · 最终 {other.result.state.cost} · {statusText[other.result.reason]}</div></div>}
        </div>
        <div className="metrics"><div><small>逻辑成本（{busy?'执行':run?'回放':'准备'}）</small><strong>{cost.toLocaleString()}<em> / {actualConfig.budget.toLocaleString()}</em></strong></div><div><small>移动</small><strong>{state.counts.move}</strong></div><div><small>测量</small><strong>{state.counts.measure}</strong></div><div><small>交换</small><strong>{state.counts.swap}</strong></div><div><small>未满足约束</small><strong>{violations(state.grid,actualConfig.size)}</strong></div></div>
        <div className="playback"><button disabled={!run||busy} onClick={()=>{if((other?alignedCost>=Math.max(run!.result.state.cost,other.result.state.cost):seq>=run!.events.length)){setSeq(0);setAlignedCost(0);}setPlaying(!playing);}}>{playing?'Ⅱ 暂停':'▶ 播放'}</button><button aria-label="单步" disabled={!run||busy} onClick={()=>{setPlaying(false);const nextCost=other?Math.min(run!.events[seq]?.cost??Infinity,other.events[otherSeq]?.cost??Infinity):run!.events[seq]?.cost;if(Number.isFinite(nextCost)){setAlignedCost(nextCost!);setSeq(sequenceAtCost(run!.events,nextCost!));}}}>步进 →</button><input aria-label="回放进度" type="range" min="0" max={other?Math.max(run!.result.state.cost,other.result.state.cost):run?.events.length??1} value={other?alignedCost:seq} disabled={!run||busy} onChange={e=>{setPlaying(false);if(other){setAlignedCost(+e.target.value);setSeq(sequenceAtCost(run!.events,+e.target.value));}else setSeq(+e.target.value);}}/><select aria-label="播放速度" value={rate} onChange={e=>setRate(+e.target.value)}>{[10,40,160,640].map(v=><option key={v} value={v}>{v} 成本/秒</option>)}</select><span>{seq} / {run?.events.length??0}</span></div>
        <div className="compare-bar"><span>对比解法</span><select disabled={!run||busy} value={other?.runId??''} onChange={e=>{setPlaying(false);setAlignedCost(state.cost);setOtherId(e.target.value);}}><option value="">选择同配置运行记录</option>{history.filter(r=>r.runId!==run?.runId).map(r=><option key={r.runId} value={r.runId} disabled={r.configHash!==run?.configHash}>{r.label} · {r.result.state.cost} {r.configHash!==run?.configHash?'（配置不同）':''}</option>)}</select><span>成功优先 · 成本越低越好</span></div>
      </section>
      <aside className="code-panel"><div className="tabs">{[['code','解法代码'],['runs','运行记录'],['rules','规则与接口']].map(([id,name])=><button key={id} className={tab===id?'selected':''} onClick={()=>setTab(id)}>{name}</button>)}</div>
        {tab==='code'?<><div className="code-tools"><button disabled={busy} onClick={()=>loadExample('reference')}>参考解</button><button disabled={busy} onClick={()=>loadExample('improved')}>改进解</button><button disabled={busy} onClick={()=>guarded(async()=>{const s=await window.farm.openCode();if(s!==null)setCode(s);})}>导入 .js</button><span>解法程序.js</span></div><CodeEditor code={code} readOnly={busy||!!batch} onChange={setCode}/><div className="model-meta"><label>模型 / 解法标签<input disabled={busy||!!batch} value={label} maxLength={120} onChange={e=>setLabel(e.target.value)}/></label><label>尝试<input disabled={busy||!!batch} type="number" min="1" value={attempt} onChange={e=>setAttempt(Math.max(1,Math.floor(+e.target.value)||1))}/></label></div><details className="generation"><summary>模型生成记录（选填，独立于程序耗时）</summary><div>{[['durationMs','生成毫秒'],['inputTokens','输入词元'],['outputTokens','输出词元']].map(([key,name])=><label key={key}>{name}<input disabled={busy||!!batch} type="number" min="0" value={generation[key as keyof Generation]??''} onChange={e=>setGeneration({...generation,[key]:e.target.value===''?undefined:Math.max(0,Math.floor(+e.target.value))})}/></label>)}</div><label>记录来源<input disabled={busy||!!batch} value={generation.source} maxLength={500} placeholder="例如：平台用量记录，人工抄录" onChange={e=>setGeneration({...generation,source:e.target.value})}/></label></details><div className="run-controls"><button id="run-code" title="Ctrl+Enter" className="primary" disabled={busy||!!batch} onClick={()=>guarded(()=>start())}>▶ 执行代码</button><button disabled={!busy} onClick={()=>{batchStop.current=true;guarded(()=>window.farm.cancel());}}>中止</button><button disabled={busy||!!batch} onClick={()=>guarded(runBatch)}>运行 8 个随机种子</button></div></>:
        tab==='runs'?<div className="runs-list"><h2>本次工作台记录</h2><p>运行自动保存到本机用户数据目录。可导出完整记录，之后重新导入。</p>{history.map(r=><button className="run-item" key={r.runId} onClick={()=>{setRun(r);setConfig(r.config);setCode(r.source);setLabel(r.label);setAttempt(r.attempt);setGeneration(r.generation??{source:''});setSeq(0);setPlaying(false);setOtherId('');}}><strong>{r.label}</strong><span>{statusText[r.result.reason]} · {r.config.size}×{r.config.size} · 随机种子 {r.config.seed}</span><b>{r.result.state.cost} 成本</b></button>)}</div>:
        <div className="rules"><h2>先排序，再收获</h2><p>无人机从左上角 (0,0) 出发。格值为 0–9，边界不环绕。行向右、列向下均非递减才可整田收获。</p><table><thead><tr><th>接口</th><th>成本</th></tr></thead><tbody>{[['get_size()',1],['get_position()',1],['move(direction)',1],['measure(direction?)',1],['swap(direction)',3],['harvest()',1]].map(([n,c])=><tr key={n}><td><code>{n}</code></td><td>{c}</td></tr>)}</tbody></table><p>方向参数：North（北）、South（南）、East（东）、West（西）。越界移动或交换返回 false，越界测量返回 null，仍然计费。参数错误终止运行。</p><p>可使用 JavaScript 标准能力 Array.sort()。运行环境不提供文件、网络、Date 对象或随机数函数。计算耗时单独记录，播放倍率不参与计分。</p><p>预算不足时动作不执行。程序结束但没有成功 harvest()，属于未完成。模型标签由用户填写，不代表已验证的模型调用来源。</p></div>}
        <div className="event-inspector"><span className="eyebrow">{busy?'运行事件':'回放事件'}</span><code>{event?`${event.action}(${event.args.join(', ')}) → ${JSON.stringify(event.value)}`:'等待第一条动作'}</code><small>{batch||notice||'执行与回放独立。每次动作都有可追溯记录。'}</small>{run&&<><small>{run.result.message} · 机器耗时 {run.result.elapsedMs} ms</small><details className="console-log"><summary>控制台日志 {run.logs.length} 条{run.logsTruncated?'（已截断）':''}</summary><pre>{run.logs.slice(-50).join('\n')||'没有 console.log 输出'}</pre></details><div><button onClick={()=>guarded(()=>window.farm.export({format:'run',run}))}>导出完整记录</button><button onClick={()=>guarded(()=>window.farm.export({format:'csv',run}))}>导出 CSV</button></div></>}</div>
      </aside>
    </main><footer><span><i/>确定性引擎 · JavaScript / QuickJS</span><span>排序约束由引擎验证 · 回放来自真实事件</span><span>执行 {busy?'运行中':'空闲'} / 回放 {playing?'播放中':'暂停'}</span></footer>
  </div>;
}
function Root(){
  const [mode,setMode]=useState<'garden'|'sort'>('garden');
  const [scoring,setScoring]=useState(false);
  useEffect(()=>{window.farm?.gardenExamples().then(data=>{if(data.preferSort)setMode('sort');});},[]);
  return <><div style={{display:scoring?'none':undefined}}>{mode==='garden'?<GardenWorkspace Editor={CodeEditor} onSort={()=>setMode('sort')}/>:<App onGarden={()=>setMode('garden')}/>}</div>{scoring?<BenchmarkWorkspace onClose={()=>setScoring(false)}/>:<button className="score-launch" onClick={()=>setScoring(true)}>评分工作台 v2</button>}</>;
}
createRoot(document.getElementById('root')!).render(<Root/>);

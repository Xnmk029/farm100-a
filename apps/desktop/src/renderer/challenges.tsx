import {rankChallengeRuns,scoreChallenge} from '../../../../packages/garden/scoring';
import {FleetGuide} from './fleet-guide';
import {useMemo,useState} from 'react';
import {CHALLENGES,CHALLENGE_BY_ID,challengeProgress,evaluateChallenge} from '../../../../packages/garden/challenges';
import {RESOURCE_NAMES} from '../../../../packages/garden/content';
import type {GardenConfig,GardenRun,GardenState} from '../../../../packages/garden/core';
const goalName=(id:string)=>(RESOURCE_NAMES as Record<string,string>)[id]??({relics:'遗物',home:'返回起点'} as Record<string,string>)[id]??id;
export function ChallengePicker({busy,choose,attempts,replay,compare}:{busy:boolean;choose:(id:string,seed:number)=>void;attempts:GardenRun[];replay:(run:GardenRun)=>void;compare:(runs:[GardenRun,GardenRun])=>void}){
  const ranking=useMemo(()=>new Map(rankChallengeRuns(attempts).map(row=>[row.run.runId,row])),[attempts]);
  const scores=useMemo(()=>new Map(attempts.map(r=>[r.runId,evaluateChallenge(r)!])),[attempts]);
  const [selected,setSelected]=useState<string[]>([]);const pair=selected.map(id=>attempts.find(r=>r.runId===id)).filter((r):r is GardenRun=>!!r);const comparable=pair.length===2&&pair[0].config.challenge===pair[1].config.challenge&&pair[0].config.seed===pair[1].config.seed&&pair[0].version===pair[1].version;
  const [seed,setSeed]=useState('42');const valid=/^\d+$/.test(seed)&&Number(seed)<=0xffffffff;
  return <div className="garden-guide economy-panel"><h2>把规则写成策略</h2><p>每次从关卡规定的世界重新开始。自由农场的库存、研究和时间不会带入。目标完成度按各项目标等权计算，超额产出不加分。通关后按主指标升序排名，同分依次比较另一指标和失败动作；仍相同则并列。</p><label className="challenge-seed">测试种子<input aria-label="挑战种子" value={seed} onChange={e=>setSeed(e.target.value)} inputMode="numeric"/></label>{!valid&&<p role="alert">种子须为 0 至 4294967295 的整数。</p>}
    {(['自动耕作','空间布局','时间与资源','排序与合生','迷宫探索'] as const).map(f=><section key={f}><h3>{f}</h3>{CHALLENGES.filter(c=>c.family===f).map(c=><article key={c.id} data-challenge-id={c.id}><header><strong>{c.tier} · {c.name}</strong><span>{c.size}×{c.size}</span></header><p>{c.description}</p><small>主指标：{c.primary==='tick'?'模拟完成时间':'操作成本'} · 预算 {c.budget}</small><button disabled={busy||!valid} onClick={()=>choose(c.id,Number(seed))}>开始挑战</button></article>)}</section>)}
    {attempts.length>0&&<section><h3>本次会话的挑战记录</h3><button disabled={busy||!comparable} onClick={()=>compare(pair as [GardenRun,GardenRun])}>并排对比所选记录</button><p>名次仅在同规则、同题、同种子、同部署及同初始世界的本次会话记录内计算。不同部署可回放观察，但不混入同一排名。</p>{attempts.map(r=>{const score=scores.get(r.runId)!;const ranked=ranking.get(r.runId);return <article key={r.runId}><label><input type="checkbox" aria-label={"选择对比记录 "+r.runId} checked={selected.includes(r.runId)} onChange={event=>setSelected(ids=>event.target.checked?[...ids.slice(-1),r.runId]:ids.filter(id=>id!==r.runId))}/> 选择对比</label><header><strong>{CHALLENGE_BY_ID[r.config.challenge!].name}</strong><span>{score.passed?'通过':'未通过'}</span></header><small>种子 {r.config.seed} · {r.config.drones??1} 台 · {score.tick} 时步 · 成本 {score.cost}</small><p data-score-run={r.runId}>目标完成度 {ranked?.score?.completion??"—"}/100 · {ranked?.rank?"同配置第 "+ranked.rank+" 名":"不参与排名"}</p><button disabled={busy} onClick={()=>replay(r)}>查看这次回放</button></article>;})}</section>}
  </div>;
}
export function ChallengeStatus({config,state,run}:{config:GardenConfig;state:GardenState;run:GardenRun|null}){
  const result=useMemo(()=>run?evaluateChallenge(run):null,[run]);
  const score=useMemo(()=>run?scoreChallenge(run):null,[run]);
  const c=config.challenge?CHALLENGE_BY_ID[config.challenge]:undefined;if(!c)return null;
  const p=challengeProgress(config,state)!;
  return <div className="challenge-status"><div><strong>{c.name}</strong><span>{result?(result.passed?'本次通过':'本次未通过'):'等待执行'} · 主指标 {c.primary==='tick'?'时间':'成本'}</span></div><div className="challenge-goals">{p.goals.map(g=><span key={g.id} className={g.value>=g.target?'met':''}>{goalName(g.id)} {g.value}/{g.target}</span>)}</div>{score&&<small data-challenge-score={score.completion}>目标完成度 {score.completion}/100 · {score.passed?"具备效率排名资格":"未通关，不参与效率排名"} · 有效作业 {score.participation.productive}/{score.participation.deployed} 台 · 通信调用 {score.participation.communicationCalls}</small>}{result&&<small>终态 {result.tick} 时步 · 成本 {result.cost} · 失败动作 {result.failedActions}{run?.result.reason!=='finished'?' · '+run?.result.message:''}</small>}</div>;
}
export function ChallengeGuide({config}:{config:GardenConfig}){
  const c=CHALLENGE_BY_ID[config.challenge!];return <div className="garden-guide"><h2>{c.name}</h2><p>{c.description}</p><p>从固定初始状态执行。暂停或跳转只影响观看，下一次执行始终重新开局。保存可以保留当前画面和代码，挑战成绩来自完整运行记录。</p><p>所有 接口均为同步调用。不要使用 async / await；脚本返回的 Promise 不会被等待。</p><pre>{"const n = get_size();\nfor (let i = 0; i < n - 1; i++) move('East');"}</pre><p>目标完成度满分 100：每项目标等权，超额不加分。必须完整执行且正常结束并达成全部目标，才参与效率排名。作业参与与通信次数仅供观察，不是额外通关条件。</p><FleetGuide/><h3>允许的耕作接口</h3><pre>{c.allowed.join('\n')}</pre>{c.fixture==='maze'?<><p>sense() 返回 exits、loot、keys、collected、required。exits 的四向值表示目前能否通过；不会返回整个迷宫。</p><p>collect() 收集脚下的 key 或 relic。钥匙打开全部锁门；move 被墙或锁门阻挡会返回 false，也消耗时间。用坐标和已探索集合避免重复探路。</p></>:<p>inspect() 读取 ready、trait、damaged 等状态。采收与加工材料会真实增减。选择“基线 / 改进 / 失败”可观察不同策略，再修改自己的程序。</p>}</div>;
}

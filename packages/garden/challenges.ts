import {CROP_CONTENT,TECH_BY_ID,type Costs} from './content';
import type {GardenConfig,GardenState,GardenRun,Crop} from './economy-core';
export const CHALLENGE_RULE='garden-v0.5.0';
export type Challenge={id:string;family:'自动耕作'|'空间布局'|'时间与资源'|'排序与合生'|'迷宫探索';tier:1|2|3;name:string;description:string;size:4|6|8;budget:number;target:Costs;primary:'tick'|'cost';fixture:string;allowed:string[];relics?:number;returnHome?:boolean;growthDivisor?:number};
const observe=['get_size','get_position','inspect','get_inventory','get_progress','wait','move'];
const farming=[...observe,'till','plant','water','harvest','refill','fertilize','craft','repair','clear'];
const sorting=[...observe,'swap','harvest'];
const exploring=['get_size','get_position','sense','collect','move','wait'];
export const CHALLENGES:Challenge[]=[
  {id:'fleet-harvest',family:'自动耕作',tier:3,name:'八行麦田的分工',description:'8×8 成熟麦田，交付 192 粮食。比较单机全包与按行分工，部署数可选 1/2/4/8。',size:8,budget:12000,target:{grain:192},primary:'tick',fixture:'fleet-harvest',allowed:observe.concat('harvest')},
  {id:'fleet-repair',family:'时间与资源',tier:3,name:'协同维修与装配',description:'八株裂隙矿晶，共享 24 木板、8 绳索和8 油。交付 16 零件及 16 矿晶，维修采收后同步装配。',size:8,budget:12000,target:{parts:16,crystal:16},primary:'tick',fixture:'fleet-repair',allowed:farming},
  {id:'fleet-overhead',family:'自动耕作',tier:1,name:'一株小麦需要几台机',description:'仅起点一株成熟小麦，交付 3 粮食。比较直接采收与全队通信集合，观察小任务的协调开销。',size:4,budget:2000,target:{grain:3},primary:'tick',fixture:'fleet-overhead',allowed:observe.concat('harvest')},
  {id:'farm-1',family:'自动耕作',tier:1,name:'第一片麦田',description:'4×4 空田，产出 48 粮食。比较逐格等熟与整田轮巡。',size:4,budget:12000,target:{grain:48},primary:'tick',fixture:'wheat',allowed:farming},
  {id:'farm-2',family:'自动耕作',tier:2,name:'双季轮作',description:'6×6 从零开始，保留 72 粮食并产出 72 根菜。播种也消耗粮食。',size:6,budget:18000,target:{grain:72,roots:72},primary:'tick',fixture:'rotation',allowed:farming},
  {id:'farm-3',family:'自动耕作',tier:3,name:'闭环堆肥',description:'8×8 从零生产，最终保留 48 堆肥。必须先为根菜与加工分配粮食。',size:8,budget:45000,target:{compost:48},primary:'cost',fixture:'compost',allowed:farming},
  {id:'layout-1',family:'空间布局',tier:1,name:'给树留一点距离',description:'相邻树木生长变慢。使用 16 粮食取得 32 木材。',size:4,budget:18000,target:{timber:32},primary:'tick',fixture:'orchard',allowed:farming},
  {id:'layout-2',family:'空间布局',tier:2,name:'林间藤豆',description:'产出 32 木材与 40 豆荚。让豆靠近树，又避免树林过密。',size:4,budget:25000,target:{timber:32,beans:40},primary:'tick',fixture:'symbiosis',allowed:farming},
  {id:'layout-3',family:'空间布局',tier:3,name:'三块田的取舍',description:'同时保留 32 木材、40 豆荚和 12 矿晶。安排共生布局、裂隙维修与水分。',size:6,budget:30000,target:{timber:32,beans:40,crystal:12},primary:'tick',fixture:'mixed-layout',allowed:farming},
  {id:'schedule-1',family:'时间与资源',tier:1,name:'只有四桶水',description:'16 株已播小麦，只有 4 储水，禁止补水。收获 48 粮食，减少空等与重复巡查。',size:4,budget:10000,target:{grain:48},primary:'tick',fixture:'dry-wheat',allowed:observe.concat('water','harvest')},
  {id:'schedule-2',family:'时间与资源',tier:2,name:'追着花盘走',description:'收集 128 油籽。优先收最高瓣数成熟株能翻倍，补种会消耗有限粮食。',size:4,budget:18000,target:{seeds:128},primary:'cost',fixture:'sunflowers',allowed:farming},
  {id:'schedule-3',family:'时间与资源',tier:3,name:'维修材料刚刚好',description:'四株裂隙矿晶，12 木板、4 绳索、4 油；最后交付 8 零件和 8 矿晶。',size:4,budget:12000,target:{parts:8,crystal:8},primary:'tick',fixture:'repair-chain',allowed:farming},
  {id:'sort-1',family:'排序与合生',tier:1,name:'晶节方阵',description:'4×4 成熟仙人掌，仅可观察、移动、交换与收获。整片有序可获得 64 纤维。',size:4,budget:10000,target:{fiber:64},primary:'cost',fixture:'cactus',allowed:sorting},
  {id:'sort-2',family:'排序与合生',tier:2,name:'扩大的排序田',description:'6×6 随机晶节，同时满足所有行列约束。获得 144 纤维并优化路径。',size:6,budget:24000,target:{fiber:144},primary:'cost',fixture:'cactus',allowed:sorting},
  {id:'sort-3',family:'排序与合生',tier:3,name:'收获窗口',description:'6×6 田中，4×4 仙人掌须排序，2×2 南瓜须等齐成熟。凉夜成长减半，只有 4 储水；交付 64 纤维和 16 南瓜。',size:6,budget:18000,target:{fiber:64,pumpkins:16},primary:'tick',fixture:'mixed-sort',allowed:sorting.concat('water'),growthDivisor:2},
  {id:'maze-1',family:'迷宫探索',tier:1,name:'篱墙里的信标',description:'只可感知脚下四向通路。探索 4×4 篱墙迷宫，收集一个遗物。',size:4,budget:2000,target:{},primary:'cost',fixture:'maze',allowed:exploring,relics:1},
  {id:'maze-2',family:'迷宫探索',tier:2,name:'记住来过的路',description:'6×6 有环迷宫，收集三个遗物。用坐标记忆避免重复探索。',size:6,budget:5000,target:{},primary:'cost',fixture:'maze',allowed:exploring,relics:3},
  {id:'maze-3',family:'迷宫探索',tier:3,name:'带着钥匙回家',description:'8×8 迷宫有锁门；找钥匙、收齐三个遗物，再回起点。门打开后须重新考虑通路。',size:8,budget:10000,target:{},primary:'tick',fixture:'maze',allowed:exploring,relics:3,returnHome:true},
];
export const CHALLENGE_BY_ID=Object.fromEntries(CHALLENGES.map(c=>[c.id,c])) as Record<string,Challenge>;
export type Maze={walls:number[];gates:number[];seen:boolean[];loot:('key'|'relic'|null)[];keys:number;collected:number;required:number};
export const mazeDirections={North:{dx:0,dy:-1,bit:1,opposite:2},South:{dx:0,dy:1,bit:2,opposite:1},East:{dx:1,dy:0,bit:4,opposite:8},West:{dx:-1,dy:0,bit:8,opposite:4}} as const;
export const copyMaze=(m:Maze):Maze=>({...m,walls:[...m.walls],gates:[...m.gates],seen:[...m.seen],loot:[...m.loot]});
export function challengeConfig(id:string,seed=42,drones?:1|2|4|8):GardenConfig{const c=CHALLENGE_BY_ID[id];if(!c)throw Error('未知挑战');return {rule:CHALLENGE_RULE,challenge:id,size:c.size,budget:c.budget,seed,...(drones||c.fixture.startsWith('fleet-')?{drones:drones??1}:{})};}
function rng(seed:number){let n=seed>>>0;return ()=>{n=(n+0x6d2b79f5)|0;let t=Math.imul(n^(n>>>15),1|n);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};}
export function makeMaze(size:number,seed:number,tier:number,required:number):Maze{
  const random=rng(seed),count=size*size,m:Maze={walls:Array(count).fill(15),gates:Array(count).fill(0),seen:Array(count).fill(false),loot:Array(count).fill(null),keys:0,collected:0,required};
  const visited=new Set([0]),stack=[0];
  const neighbors=(i:number)=>Object.values(mazeDirections).map(d=>({i:(Math.floor(i/size)+d.dy)*size+i%size+d.dx,d})).filter(n=>iWithin(n.i,size)&&Math.abs(n.i%size-i%size)+Math.abs(Math.floor(n.i/size)-Math.floor(i/size))===1);
  while(stack.length){const i=stack.at(-1)!,options=neighbors(i).filter(n=>!visited.has(n.i));if(!options.length){stack.pop();continue;}const n=options[Math.floor(random()*options.length)];m.walls[i]&=~n.d.bit;m.walls[n.i]&=~n.d.opposite;visited.add(n.i);stack.push(n.i);}
  if(tier>=2)for(let i=0;i<count;i++)if(random()<.18){const options=neighbors(i);const n=options[Math.floor(random()*options.length)];m.walls[i]&=~n.d.bit;m.walls[n.i]&=~n.d.opposite;}
  const distance=Array(count).fill(-1),queue=[0];distance[0]=0;for(let k=0;k<queue.length;k++)for(const n of neighbors(queue[k]))if(!(m.walls[queue[k]]&n.d.bit)&&distance[n.i]===-1){distance[n.i]=distance[queue[k]]+1;queue.push(n.i);}
  const candidates=Array.from({length:count-1},(_,i)=>i+1).sort((a,b)=>distance[b]-distance[a]||a-b);
  for(const i of candidates.slice(0,required))m.loot[i]='relic';
  if(tier===3){const key=queue[1];m.loot[key]='key';for(let i=0;i<count;i++)if(distance[i]>3&&random()<.18)for(const n of neighbors(i))if(!(m.walls[i]&n.d.bit)&&distance[n.i]>3){m.gates[i]|=n.d.bit;m.gates[n.i]|=n.d.opposite;}}
  m.seen[0]=true;return m;
}
function iWithin(i:number,size:number){return i>=0&&i<size*size;}
export function setupChallenge(s:GardenState,c:Challenge){
  const e=s.economy!;e.extent=s.size;s.inventory={grain:0,roots:0,water:48};
  const unlock=(id:string)=>{if(e.unlocks.includes(id))return;TECH_BY_ID[id].requires.forEach(unlock);e.unlocks.push(id);};
  const plant=(i:number,crop:Crop,growth=CROP_CONTENT[crop].growth)=>Object.assign(s.cells[i],{soil:true,crop,growth,trait:Math.floor(random()*10),damaged:false,repaired:false});
  const random=rng(s.seed);
  for(const id of ['waterworks','carrot','composting','soilcare'])unlock(id);
  if(c.fixture==='fleet-harvest')s.cells.forEach((_,i)=>plant(i,'wheat'));
  if(c.fixture==='fleet-overhead')plant(0,'wheat');
  if(c.fixture==='fleet-repair'){unlock('workshop');for(let i=0;i<8;i++){plant(i,'crystal',130);s.cells[i].damaged=true;}e.stock.boards=24;e.stock.rope=8;e.stock.oil=8;}
  if(c.fixture==='orchard'||c.fixture==='symbiosis'||c.fixture==='mixed-layout'){
    unlock('trellis');s.inventory.grain=c.fixture==='orchard'?16:64;e.stock.boards=24;
    if(c.fixture==='mixed-layout'){unlock('crystals');e.stock.preserves=4;e.stock.compost=4;e.stock.rope=4;e.stock.boards=28;}
  }
  if(c.fixture==='dry-wheat'){s.cells.forEach((_,i)=>plant(i,'wheat',Math.floor(random()*35)));s.inventory.water=4;}
  if(c.fixture==='sunflowers'){unlock('sunflowers');s.cells.forEach((_,i)=>plant(i,'sunflower'));s.inventory.grain=32;}
  if(c.fixture==='repair-chain'){unlock('workshop');for(let i=0;i<4;i++){plant(i,'crystal',130);s.cells[i].damaged=true;}e.stock.boards=12;e.stock.rope=4;e.stock.oil=4;}
  if(c.fixture==='cactus'||c.fixture==='mixed-sort'){
    unlock('cacti');const n=c.fixture==='cactus'?s.size:4;for(let y=0;y<n;y++)for(let x=0;x<n;x++)plant(y*s.size+x,'cactus');
    if(c.fixture==='mixed-sort'){unlock('pumpkins');s.inventory.water=4;for(const i of [4,5,4+s.size,5+s.size])plant(i,'pumpkin',0);}
  }
  if(c.fixture==='maze'){e.unlocks=[];s.inventory.water=0;s.maze=makeMaze(s.size,s.seed,c.tier,c.relics!);}
}
export function challengeProgress(config:GardenConfig,state:GardenState){
  const c=config.challenge?CHALLENGE_BY_ID[config.challenge]:undefined;if(!c)return null;
  const stock={...state.inventory,...state.economy?.stock};
  const goals=Object.entries(c.target).map(([resource,target])=>({id:resource,value:stock[resource as keyof typeof stock]??0,target:target!}));
  if(c.relics)goals.push({id:'relics',value:state.maze?.collected??0,target:c.relics});
  if(c.returnHome)goals.push({id:'home',value:(state.fleet?state.fleet.drones.every(d=>d.x===0&&d.y===0):state.x===0&&state.y===0)?1:0,target:1});
  return {goals,passed:goals.length>0&&goals.every(g=>g.value>=g.target)};
}
export function evaluateChallenge(run:GardenRun){
  const c=run.config.challenge?CHALLENGE_BY_ID[run.config.challenge]:undefined;if(!c)return null;
  const progress=challengeProgress(run.config,run.result.state)!;
  const spent:Record<string,number>={},produced:Record<string,number>={};let previous={...run.initial.inventory,...run.initial.economy?.stock};
  for(const event of run.events){const stock={...event.inventory,...event.economy?.stock};for(const [key,value]of Object.entries(stock)){const delta=value-(previous[key as keyof typeof previous]??0);if(delta<0)spent[key]=(spent[key]??0)-delta;else if(delta>0)produced[key]=(produced[key]??0)+delta;}previous=stock;}
  return {...progress,spent,produced,passed:run.complete&&run.result.reason==='finished'&&progress.passed,primary:c.primary,tick:run.result.state.tick,cost:run.result.state.cost,harvests:run.result.state.harvests,failedActions:run.events.filter(e=>e.value===false).length,reason:run.result.reason};
}

import {z} from 'zod';
import {canonical,directions} from '../protocol';
import * as Legacy from './legacy-v02';
import {CROP_CONTENT,TECH_BY_ID,RECIPE_BY_ID,QUESTS,RESOURCE_NAMES,type Costs,type Resource} from './content-v03';
import {GardenStop} from './legacy-v02';
export {GardenStop};
export const GARDEN_VERSION='garden-v0.3.0';
export const CROPS=CROP_CONTENT;
export type Crop=keyof typeof CROPS;
export type Cell={soil:boolean;crop:Crop|null;growth:number;water:number;cycles:number;fertility?:number;lastCrop?:Crop|null;trait?:number;damaged?:boolean;repaired?:boolean};
export type Economy={stock:Record<string,number>;unlocks:string[];quests:string[];counters:Record<string,number>;extent:number};
export type GardenState=Omit<Legacy.GardenState,'cells'> & {cells:Cell[];economy?:Economy};
export const GardenConfigSchema=Legacy.GardenConfigSchema.extend({rule:z.literal(GARDEN_VERSION).optional()});
export type GardenConfig=z.infer<typeof GardenConfigSchema>;
export const gardenDefault:GardenConfig={rule:GARDEN_VERSION,size:8,seed:42,budget:100000};
export const legacyGardenDefault:GardenConfig={size:6,seed:42,budget:30000};
export const ACTIONS=[...Legacy.ACTIONS,'get_inventory','get_progress','research','craft','fertilize','water_area','till_area','inspect_neighbors','swap','repair','expand','harvest_area','clear'] as const;
export type GardenAction=typeof ACTIONS[number];
export type GardenEvent=Omit<Legacy.GardenEvent,'action'|'changes'> & {action:GardenAction;changes:[number,Cell][];economy?:Economy};
export type GardenOutcome=Legacy.GardenOutcome;
export type GardenRequest={runId:string;config:GardenConfig;source:string;initial?:GardenState};
export type GardenRun={format:'farm100-garden';version:typeof GARDEN_VERSION|'garden-v0.2.0';runId:string;source:string;config:GardenConfig;initial:GardenState;events:GardenEvent[];snapshots:{seq:number;state:GardenState}[];result:{reason:GardenOutcome;message:string;state:GardenState};logs:string[];complete:boolean};
export const copyEconomy=(e:Economy):Economy=>({...e,stock:{...e.stock},unlocks:[...e.unlocks],quests:[...e.quests],counters:{...e.counters}});
export const copyGarden=(s:GardenState):GardenState=>({...s,cells:s.cells.map(c=>({...c})),inventory:{...s.inventory},...(s.economy?{economy:copyEconomy(s.economy)}:{})});
export const stageOf=(c:Cell)=>c.crop===null?-1:Math.min(3,Math.floor(c.growth/CROPS[c.crop].growth*3));
export const ready=(c:Cell)=>!!c.crop&&!c.damaged&&c.growth>=CROPS[c.crop].growth;
export const stockOf=(s:GardenState):Record<Resource,number>=>Object.fromEntries(Object.keys(RESOURCE_NAMES).map(k=>[k,Object.hasOwn(s.inventory,k)?s.inventory[k as keyof typeof s.inventory]:s.economy?.stock[k]??0])) as Record<Resource,number>;
export const canAfford=(s:GardenState,cost:Costs,amount=1)=>Object.entries(cost).every(([k,v])=>stockOf(s)[k as Resource]>=v!*amount);
export function freshGarden(c:GardenConfig):GardenState{
  const s=Legacy.freshGarden({size:c.size,seed:c.seed,budget:c.budget}) as GardenState;
  if(c.rule)s.economy={stock:Object.fromEntries(Object.keys(RESOURCE_NAMES).filter(k=>!Object.hasOwn(s.inventory,k)).map(k=>[k,0])),unlocks:[],quests:[],counters:{},extent:Math.min(4,c.size)};
  return s;
}
const CropSchema=z.enum(['wheat','carrot','tree','sunflower','pumpkin','cactus','bean','crystal']);
const CellSchema=z.object({soil:z.boolean(),crop:CropSchema.nullable(),growth:z.number().int().min(0).max(280),water:z.number().int().min(0).max(400),cycles:z.number().int().min(0),fertility:z.number().int().min(0).max(1).optional(),lastCrop:CropSchema.nullable().optional(),trait:z.number().int().min(0).max(9).optional(),damaged:z.boolean().optional(),repaired:z.boolean().optional()}).strict();
const countMap=z.record(z.string().max(100),z.number().int().min(0));
const StateSchema=z.object({size:z.number().int().min(4).max(32),seed:z.number().int().min(0).max(0xffffffff),tick:z.number().int().min(0),cost:z.number().int().min(0),x:z.number().int().min(0),y:z.number().int().min(0),facing:z.enum(['North','South','East','West']),cells:z.array(CellSchema).max(1024),inventory:z.object({grain:z.number().int().min(0),roots:z.number().int().min(0),water:z.number().int().min(0)}).strict(),harvests:z.number().int().min(0),planted:z.number().int().min(0),economy:z.object({stock:countMap,unlocks:z.array(z.string()).max(20),quests:z.array(z.string()).max(12),counters:countMap,extent:z.number().int().min(4).max(32)}).strict()}).strict();
export function validateGardenState(raw:unknown,c:GardenConfig):GardenState{
  if(!c.rule)return Legacy.validateGardenState(raw,c);
  const s=StateSchema.parse(raw),e=s.economy;
  if(s.size!==c.size||s.seed!==c.seed||s.cells.length!==s.size*s.size||e.extent>s.size||s.x>=e.extent||s.y>=e.extent)throw Error('农场存档范围不一致');
  if(new Set(e.unlocks).size!==e.unlocks.length||e.unlocks.some(id=>!Object.hasOwn(TECH_BY_ID,id)||TECH_BY_ID[id].requires.some(p=>!e.unlocks.includes(p))))throw Error('研究依赖无效');
  if(new Set(e.quests).size!==e.quests.length||e.quests.some(id=>!QUESTS.some(q=>q.id===id)))throw Error('任务记录无效');
  if(Object.keys(e.stock).some(k=>!Object.hasOwn(RESOURCE_NAMES,k)||Object.hasOwn(s.inventory,k)))throw Error('未知库存资源');
  for(const cell of s.cells)if((cell.crop&&!cell.soil)||(!cell.crop&&cell.growth!==0)||(cell.crop&&cell.growth>CROPS[cell.crop].growth)||(cell.damaged&&(cell.crop!=='crystal'||cell.repaired)))throw Error('作物状态无效');
  return s;
}
export class Garden {
  state:GardenState;initial:GardenState;events:GardenEvent[]=[];terminal:GardenStop|undefined;private legacy:Legacy.Garden|undefined;
  constructor(public config:GardenConfig,initial?:GardenState){
    this.config=GardenConfigSchema.parse(config);
    if(!config.rule){this.legacy=new Legacy.Garden(config,initial as Legacy.GardenState|undefined);this.initial=this.legacy.initial;this.state=this.legacy.state;this.events=this.legacy.events;}
    else{this.initial=initial?validateGardenState(initial,config):freshGarden(config);this.state=copyGarden(this.initial);}
  }
  private neighbors(index:number){const s=this.state,x=index%s.size,y=Math.floor(index/s.size),n=s.economy!.extent;return Object.values(directions).map(([dx,dy])=>[x+dx,y+dy]).filter(([x,y])=>x>=0&&y>=0&&x<n&&y<n).map(([x,y])=>y*s.size+x);}
  private add(resource:Resource,amount:number){const s=this.state;if(Object.hasOwn(s.inventory,resource))s.inventory[resource as keyof typeof s.inventory]+=amount;else s.economy!.stock[resource]=(s.economy!.stock[resource]??0)+amount;}
  private pay(cost:Costs,amount=1){if(!canAfford(this.state,cost,amount))return false;for(const [k,v]of Object.entries(cost))this.add(k as Resource,-v!*amount);return true;}
  private count(key:string,amount=1){const c=this.state.economy!.counters;c[key]=(c[key]??0)+amount;}
  private harvest(index:number):number{
    const s=this.state,c=s.cells[index];if(!ready(c))return 0;
    const crop=c.crop!,def=CROPS[crop];let group=[index],multiplier=1;
    if(crop==='pumpkin'){
      const x=Math.floor((index%s.size)/2)*2,y=Math.floor(Math.floor(index/s.size)/2)*2;
      const patch=[y*s.size+x,y*s.size+x+1,(y+1)*s.size+x,(y+1)*s.size+x+1];
      if(x+1<s.economy!.extent&&y+1<s.economy!.extent&&patch.every(i=>s.cells[i].crop==='pumpkin'&&ready(s.cells[i]))){group=patch;multiplier=2;}
    }
    if(crop==='cactus'){
      const found=new Set([index]),queue=[index];
      for(let k=0;k<queue.length;k++)for(const next of this.neighbors(queue[k]))if(!found.has(next)&&s.cells[next].crop==='cactus'&&ready(s.cells[next])){found.add(next);queue.push(next);}
      const sorted=queue.every(i=>[i%s.size+1<s.economy!.extent?i+1:-1,Math.floor(i/s.size)+1<s.economy!.extent?i+s.size:-1].every(j=>!found.has(j)||(s.cells[i].trait??0)<=(s.cells[j].trait??0)));
      if(sorted&&queue.length>1){group=queue;multiplier=2;}
    }
    let total=0;
    for(const i of group){
      const cell=s.cells[i];let yieldCount=def.yield*multiplier+(cell.fertility??0);
      if(crop==='carrot'&&cell.lastCrop==='carrot'&&!cell.fertility)yieldCount=1;
      if(crop==='bean'&&this.neighbors(i).some(j=>s.cells[j].crop==='tree'))yieldCount+=2;
      if(crop==='sunflower'&&!s.cells.some(other=>other.crop==='sunflower'&&ready(other)&&(other.trait??0)>(cell.trait??0)))yieldCount+=4;
      this.add(def.resource,yieldCount);total+=yieldCount;this.count('harvest:'+crop);s.harvests++;
      Object.assign(cell,{crop:null,growth:0,cycles:cell.cycles+1,fertility:0,lastCrop:crop,damaged:false,repaired:false});
    }
    if(group.length>1)this.count('group_harvest',group.length);return total;
  }
  act(action:GardenAction,args:unknown[]):unknown{
    if(this.legacy){try{return this.legacy.act(action as Legacy.GardenAction,args);}finally{this.state=this.legacy.state;}}
    if(this.terminal)throw this.terminal;
    const fail=(m:string):never=>{this.terminal=new GardenStop('api_error',m);throw this.terminal;};
    if(!ACTIONS.includes(action))fail('未知 API');
    if(!['plant','move','swap','wait','research','craft'].includes(action)&&args.length!==0)fail(`${action} 不接受参数`);
    if((action==='move'||action==='swap')&&(args.length!==1||typeof args[0]!=='string'||!Object.hasOwn(directions,args[0])))fail('方向必须为 North / South / East / West');
    if(action==='plant'&&(args.length!==1||typeof args[0]!=='string'||!Object.hasOwn(CROPS,args[0])))fail('未知作物');
    if(action==='wait'&&(args.length!==1||!Number.isInteger(args[0])||(args[0] as number)<1||(args[0] as number)>100))fail('wait 需要 1 至 100 整数 tick');
    if(action==='research'&&(args.length!==1||typeof args[0]!=='string'||!Object.hasOwn(TECH_BY_ID,args[0])))fail('未知研究项目');
    if(action==='craft'&&(args.length<1||args.length>2||typeof args[0]!=='string'||!Object.hasOwn(RECIPE_BY_ID,args[0])||(args.length===2&&(!Number.isInteger(args[1])||(args[1] as number)<1||(args[1] as number)>20))))fail('craft 需要配方名和可选的 1 至 20 整数数量');
    const amount=action==='craft'?(args[1] as number??1):1;
    const duration=action==='wait'?args[0] as number:action==='craft'?RECIPE_BY_ID[args[0] as string].ticks*amount:({move:4,till:8,plant:6,water:4,harvest:6,refill:12,clear:8,research:12,fertilize:6,water_area:12,till_area:20,swap:6,repair:16,expand:50,harvest_area:16} as Partial<Record<GardenAction,number>>)[action]??1;
    const cost=action==='wait'?duration:action==='craft'?amount:action.endsWith('_area')?6:action==='swap'?3:1;
    if(this.state.cost-this.initial.cost+cost>this.config.budget){this.terminal=new GardenStop('budget_exceeded','操作预算不足，动作未执行');throw this.terminal;}
    const s=this.state,e=s.economy!,before=s.cells.map(c=>({...c})),fromTick=s.tick,index=s.y*s.size+s.x,cell=s.cells[index];let value:unknown=true;
    const has=(id:string)=>e.unlocks.includes(id);
    for(let t=0;t<duration;t++){
      s.tick++;
      for(let i=0;i<s.cells.length;i++){
        const c=s.cells[i];
        if(c.crop&&!c.damaged&&c.growth<CROPS[c.crop].growth){
          let period=c.water>0?1:2;
          if(c.crop==='tree')period+=this.neighbors(i).filter(j=>s.cells[j].crop==='tree').length*2;
          if(c.crop==='bean'&&!this.neighbors(i).some(j=>s.cells[j].crop==='tree'))period*=2;
          if((s.tick+i+s.seed)%period===0)c.growth++;
          if(c.crop==='crystal'&&!c.repaired&&c.growth>=CROPS.crystal.growth/2)c.damaged=true;
        }
        if(c.water>0)c.water--;
      }
    }
    s.cost+=cost;
    const area:number[]=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const x=s.x+dx,y=s.y+dy;if(x>=0&&y>=0&&x<e.extent&&y<e.extent)area.push(y*s.size+x);}
    const inspect=(i:number)=>{const c=s.cells[i];return {crop:c.crop,stage:stageOf(c),ready:ready(c),growth:c.growth,water:c.water,soil:c.soil,trait:c.trait??0,fertility:c.fertility??0,damaged:c.damaged??false};};
    switch(action){
      case 'get_size':value=e.extent;break;
      case 'get_position':value={x:s.x,y:s.y};break;
      case 'get_inventory':value=stockOf(s);break;
      case 'get_progress':value={unlocks:[...e.unlocks],quests:[...e.quests],extent:e.extent,counters:{...e.counters}};break;
      case 'inspect':value=inspect(index);break;
      case 'inspect_neighbors':value=has('survey')?Object.fromEntries(Object.entries(directions).map(([d,[dx,dy]])=>[d,s.x+dx>=0&&s.y+dy>=0&&s.x+dx<e.extent&&s.y+dy<e.extent?inspect((s.y+dy)*s.size+s.x+dx):null])):false;break;
      case 'move':{s.facing=args[0] as string;const [dx,dy]=directions[s.facing as keyof typeof directions];if(s.x+dx<0||s.y+dy<0||s.x+dx>=e.extent||s.y+dy>=e.extent)value=false;else{s.x+=dx;s.y+=dy;}break;}
      case 'clear':if(!cell.crop)value=false;else{Object.assign(cell,{crop:null,growth:0,trait:0,damaged:false,repaired:false});this.count('cleared');}break;
      case 'till':if(cell.crop)value=false;else{if(!cell.soil)this.count('tilled');cell.soil=true;}break;
      case 'plant':{
        const crop=args[0] as Crop,def=CROPS[crop];
        if(!cell.soil||cell.crop||(def.unlock&&!has(def.unlock))||!this.pay(def.cost))value=false;
        else{Object.assign(cell,{crop,growth:0,trait:(s.seed+index*7+cell.cycles*3)%10,damaged:false,repaired:false});s.planted++;this.count('plant:'+crop);}break;
      }
      case 'water':if(!cell.soil||!this.pay({water:1}))value=false;else{cell.water=Math.min(400,cell.water+240);this.count('watered');}break;
      case 'refill':if(!has('waterworks')||!this.pay({grain:1}))value=false;else this.add('water',24);break;
      case 'harvest':value=this.harvest(index)||false;break;
      case 'wait':value=duration;break;
      case 'research':{const tech=TECH_BY_ID[args[0] as string];if(has(tech.id))value=true;else if(tech.requires.some(id=>!has(id))||!this.pay(tech.cost))value=false;else{e.unlocks.push(tech.id);this.count('research:'+tech.id);}break;}
      case 'craft':{const r=RECIPE_BY_ID[args[0] as string];if(!has(r.unlock)||!this.pay(r.input,amount))value=false;else{for(const [k,v]of Object.entries(r.output))this.add(k as Resource,v!*amount);this.count('craft:'+r.id,amount);value=amount;}break;}
      case 'fertilize':if(!has('soilcare')||!cell.soil||cell.fertility===1||!this.pay({compost:1}))value=false;else cell.fertility=1;break;
      case 'repair':if(!has('crystals')||!cell.damaged||!this.pay({boards:1,rope:1}))value=false;else{cell.damaged=false;cell.repaired=true;}break;
      case 'swap':{
        const [dx,dy]=directions[args[0] as keyof typeof directions],x=s.x+dx,y=s.y+dy,j=y*s.size+x;
        if(!has('cacti')||x<0||y<0||x>=e.extent||y>=e.extent||cell.crop!=='cactus'||s.cells[j].crop!=='cactus')value=false;
        else for(const key of ['crop','growth','trait','damaged','repaired'] as const){const old=cell[key];(cell as any)[key]=s.cells[j][key];(s.cells[j] as any)[key]=old;}break;
      }
      case 'water_area':{const land=area.filter(i=>s.cells[i].soil);if(!has('irrigation')||!land.length||!this.pay({water:land.length}))value=false;else{land.forEach(i=>s.cells[i].water=Math.min(400,s.cells[i].water+240));this.count('watered',land.length);value=land.length;}break;}
      case 'till_area':if(!has('fieldtools'))value=false;else{let count=0;area.forEach(i=>{if(!s.cells[i].crop&&!s.cells[i].soil){s.cells[i].soil=true;count++;}});this.count('tilled',count);value=count;}break;
      case 'harvest_area':if(!has('harvester')||!area.some(i=>ready(s.cells[i]))||!this.pay({oil:1}))value=false;else value=area.reduce((sum,i)=>sum+this.harvest(i),0);break;
      case 'expand':if(!has('expansion')||e.extent>=s.size||!this.pay({boards:12,rope:6,preserves:4}))value=false;else{e.extent=Math.min(s.size,e.extent===4?6:e.extent===6?8:e.extent*2);value=e.extent;}break;
    }
    if(value!==false)this.count(action);
    for(const q of QUESTS)if(!e.quests.includes(q.id)&&(e.counters[q.counter]??0)>=q.target)e.quests.push(q.id);
    const changes:[number,Cell][]=[];s.cells.forEach((c,i)=>{if(canonical(c)!==canonical(before[i]))changes.push([i,{...c}]);});
    this.events.push({seq:this.events.length+1,action,args:[...args],value,fromTick,tick:s.tick,cost:s.cost,x:s.x,y:s.y,facing:s.facing,changes,inventory:{...s.inventory},harvests:s.harvests,planted:s.planted,economy:copyEconomy(e)});return value;
  }
}
export function applyGardenEvent(state:GardenState,event:GardenEvent):GardenState{const s=copyGarden(state);Object.assign(s,{tick:event.tick,cost:event.cost,x:event.x,y:event.y,facing:event.facing,inventory:{...event.inventory},harvests:event.harvests,planted:event.planted});for(const [i,c]of event.changes)s.cells[i]={...c};if(event.economy)s.economy=copyEconomy(event.economy);return s;}
export function gardenRun(req:GardenRequest,sim:Garden,reason:GardenOutcome,message:string,logs:string[]=[],complete=true):GardenRun{
  const snapshots=[{seq:0,state:copyGarden(sim.initial)}];let state=sim.initial;for(const event of sim.events){state=applyGardenEvent(state,event);if(event.seq%128===0)snapshots.push({seq:event.seq,state});}
  return {format:'farm100-garden',version:req.config.rule??'garden-v0.2.0',runId:req.runId,source:req.source,config:req.config,initial:copyGarden(sim.initial),events:sim.events,snapshots,result:{reason,message,state:copyGarden(sim.state)},logs,complete};
}
export function gardenAt(run:GardenRun,seq:number):GardenState{const n=Math.max(0,Math.min(run.events.length,Math.floor(seq)));let snap=run.snapshots[0];for(const s of run.snapshots){if(s.seq>n)break;snap=s;}let state=snap.state;for(let i=snap.seq;i<n;i++)state=applyGardenEvent(state,run.events[i]);return state;}
export function gardenSequence(run:GardenRun,tick:number){let lo=0,hi=run.events.length;while(lo<hi){const m=(lo+hi)>>1;if(run.events[m].tick<=tick)lo=m+1;else hi=m;}return lo;}
export function validateGardenRun(raw:unknown):GardenRun{
  const r=raw as GardenRun;if(r?.version==='garden-v0.2.0')return Legacy.validateGardenRun(raw);
  if(!r||r.format!=='farm100-garden'||r.version!==GARDEN_VERSION||typeof r.source!=='string'||r.source.length>1048576||!Array.isArray(r.events)||r.events.length>50000||!Array.isArray(r.snapshots))throw Error('不支持的农场运行记录');
  z.object({runId:z.string().uuid(),logs:z.array(z.string().max(4096)).max(65536),complete:z.boolean(),result:z.object({reason:z.enum(['finished','budget_exceeded','api_error','runtime_error','memory_limit','wall_timeout','cancelled','recording_limit','runner_crash']),message:z.string().max(4000)})}).parse(r);
  const config=GardenConfigSchema.parse(r.config);if(config.rule!==GARDEN_VERSION)throw Error('运行与规则版本不一致');const sim=new Garden(config,r.initial);
  for(const event of r.events){if(!event||!ACTIONS.includes(event.action)||!Array.isArray(event.args))throw Error('事件格式错误');sim.act(event.action,event.args);if(canonical(sim.events.at(-1))!==canonical(event))throw Error(`事件 ${event.seq} 与引擎不一致`);}
  if(canonical(sim.state)!==canonical(r.result?.state))throw Error('终态不一致');const rebuilt=gardenRun({runId:r.runId,config,source:r.source},sim,r.result.reason,r.result.message,r.logs,r.complete);if(canonical(rebuilt.snapshots)!==canonical(r.snapshots))throw Error('快照不一致');return rebuilt;
}

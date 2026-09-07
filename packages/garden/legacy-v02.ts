import {z} from 'zod';
import {canonical, directions} from '../protocol';

export const GARDEN_VERSION = 'garden-v0.2.0';
export const CROPS = {
  wheat: {name:'金穗麦',growth:120,yield:3,resource:'grain',seedCost:0},
  carrot: {name:'胡萝卜',growth:160,yield:2,resource:'roots',seedCost:1},
} as const;
export type Crop = keyof typeof CROPS;
export type Cell = {soil:boolean;crop:Crop|null;growth:number;water:number;cycles:number};
export type GardenState = {size:number;seed:number;tick:number;cost:number;x:number;y:number;
  facing:string;cells:Cell[];inventory:{grain:number;roots:number;water:number};harvests:number;planted:number};
export const GardenConfigSchema=z.object({size:z.union([z.literal(4),z.literal(6),z.literal(8),z.literal(16),z.literal(32)]),seed:z.number().int().min(0).max(0xffffffff),budget:z.number().int().min(1).max(200000)}).strict();
export type GardenConfig=z.infer<typeof GardenConfigSchema>;
export const gardenDefault:GardenConfig={size:6,seed:42,budget:30000};
export const ACTIONS=['get_size','get_position','inspect','move','till','plant','water','harvest','wait','refill'] as const;
export type GardenAction=typeof ACTIONS[number];
export type GardenEvent={seq:number;action:GardenAction;args:unknown[];value:unknown;fromTick:number;tick:number;cost:number;
  x:number;y:number;facing:string;changes:[number,Cell][];inventory:GardenState['inventory'];harvests:number;planted:number};
export type GardenOutcome='finished'|'budget_exceeded'|'api_error'|'runtime_error'|'memory_limit'|'wall_timeout'|'cancelled'|'recording_limit'|'runner_crash';
export type GardenRequest={runId:string;config:GardenConfig;source:string;initial?:GardenState};
export type GardenRun={format:'farm100-garden';version:typeof GARDEN_VERSION;runId:string;source:string;config:GardenConfig;initial:GardenState;
  events:GardenEvent[];snapshots:{seq:number;state:GardenState}[];result:{reason:GardenOutcome;message:string;state:GardenState};logs:string[];complete:boolean};
export const copyGarden=(s:GardenState):GardenState=>({...s,cells:s.cells.map(c=>({...c})),inventory:{...s.inventory}});
export const stageOf=(c:Cell)=>c.crop===null?-1:Math.min(3,Math.floor(c.growth/CROPS[c.crop].growth*3));
export const ready=(c:Cell)=>c.crop!==null&&c.growth>=CROPS[c.crop].growth;
export function freshGarden(c:GardenConfig):GardenState {
  return {size:c.size,seed:c.seed,tick:0,cost:0,x:0,y:0,facing:'South',cells:Array.from({length:c.size*c.size},()=>({soil:false,crop:null,growth:0,water:0,cycles:0})),inventory:{grain:0,roots:0,water:48},harvests:0,planted:0};
}
export class GardenStop extends Error {constructor(public reason:GardenOutcome,message:string){super(message);}}
const CellSchema=z.object({soil:z.boolean(),crop:z.enum(['wheat','carrot']).nullable(),growth:z.number().int().min(0).max(160),water:z.number().int().min(0).max(400),cycles:z.number().int().min(0)}).strict();
const StateSchema=z.object({size:z.number().int().min(4).max(32),seed:z.number().int().min(0).max(0xffffffff),tick:z.number().int().min(0),cost:z.number().int().min(0),x:z.number().int().min(0),y:z.number().int().min(0),facing:z.enum(['North','South','East','West']),cells:z.array(CellSchema).max(1024),inventory:z.object({grain:z.number().int().min(0),roots:z.number().int().min(0),water:z.number().int().min(0)}).strict(),harvests:z.number().int().min(0),planted:z.number().int().min(0)}).strict();
export function validateGardenState(raw:unknown,config:GardenConfig):GardenState{
  const s=StateSchema.parse(raw);
  if(s.size!==config.size||s.seed!==config.seed||s.x>=s.size||s.y>=s.size||s.cells.length!==s.size*s.size)throw Error('农场存档尺寸或坐标不匹配');
  for(const c of s.cells)if((c.crop&&!c.soil)||(!c.crop&&c.growth!==0)||(c.crop&&c.growth>CROPS[c.crop].growth))throw Error('农场作物状态无效');
  return s;
}
export class Garden {
  state:GardenState;initial:GardenState;events:GardenEvent[]=[];terminal:GardenStop|undefined;
  constructor(public config:GardenConfig,initial?:GardenState){
    this.config=GardenConfigSchema.parse(config);this.initial=initial?validateGardenState(initial,config):freshGarden(config);this.state=copyGarden(this.initial);
  }
  act(action:GardenAction,args:unknown[]):unknown{
    if(this.terminal)throw this.terminal;
    const fail=(message:string):never=>{this.terminal=new GardenStop('api_error',message);throw this.terminal;};
    const noArgs=['get_size','get_position','inspect','till','water','harvest','refill'];
    if(noArgs.includes(action)&&args.length!==0)fail(`${action} 不接受参数`);
    if(action==='move'&&(args.length!==1||typeof args[0]!=='string'||!Object.hasOwn(directions,args[0])))fail('move 需要 North / South / East / West');
    if(action==='plant'&&(args.length!==1||(args[0]!=='wheat'&&args[0]!=='carrot')))fail('plant 需要 Wheat 或 Carrot');
    if(action==='wait'&&(args.length!==1||!Number.isInteger(args[0])||(args[0] as number)<1||(args[0] as number)>100))fail('wait 需要 1 到 100 的整数 tick');
    if(!ACTIONS.includes(action))fail('未知 API');
    const duration={get_size:1,get_position:1,inspect:1,move:4,till:8,plant:6,water:4,harvest:6,wait:args[0] as number,refill:12}[action];
    const cost=action==='wait'?duration:1;
    if(this.state.cost-this.initial.cost+cost>this.config.budget){this.terminal=new GardenStop('budget_exceeded','操作预算不足，动作未执行');throw this.terminal;}
    const s=this.state,before=s.cells.map(c=>({...c})),fromTick=s.tick,cell=s.cells[s.y*s.size+s.x];let value:unknown=true;
    // Actions commit at their end. Existing plants grow during the duration; newly planted crops start at zero.
    for(let t=0;t<duration;t++){
      s.tick++;
      for(let i=0;i<s.cells.length;i++){
        const c=s.cells[i];
        if(c.crop&&c.growth<CROPS[c.crop].growth&&(c.water>0||(s.tick+i+s.seed)%2===0))c.growth++;
        if(c.water>0)c.water--;
      }
    }
    s.cost+=cost;
    switch(action){
      case 'get_size':value=s.size;break;
      case 'get_position':value={x:s.x,y:s.y};break;
      case 'inspect':value={crop:cell.crop,stage:stageOf(cell),ready:ready(cell),water:cell.water,soil:cell.soil};break;
      case 'move':{
        s.facing=args[0] as string;const [dx,dy]=directions[s.facing as keyof typeof directions];
        if(s.x+dx<0||s.x+dx>=s.size||s.y+dy<0||s.y+dy>=s.size)value=false;else{s.x+=dx;s.y+=dy;}break;
      }
      case 'till':if(cell.crop)value=false;else cell.soil=true;break;
      case 'plant':{
        const crop=args[0] as Crop;
        if(!cell.soil||cell.crop||s.inventory.grain<CROPS[crop].seedCost)value=false;
        else{s.inventory.grain-=CROPS[crop].seedCost;cell.crop=crop;cell.growth=0;s.planted++;}break;
      }
      case 'water':if(!cell.soil||s.inventory.water<1)value=false;else{s.inventory.water--;cell.water=Math.min(400,cell.water+240);}break;
      case 'refill':if(s.inventory.grain<1)value=false;else{s.inventory.grain--;s.inventory.water+=24;}break;
      case 'harvest':
        if(!ready(cell))value=false;
        else{const crop=cell.crop!;s.inventory[CROPS[crop].resource]+=CROPS[crop].yield;cell.crop=null;cell.growth=0;cell.cycles++;s.harvests++;value=CROPS[crop].yield;}break;
      case 'wait':value=duration;break;
    }
    const changes:[number,Cell][]=[];
    s.cells.forEach((c,i)=>{const p=before[i];if(c.soil!==p.soil||c.crop!==p.crop||c.growth!==p.growth||c.water!==p.water||c.cycles!==p.cycles)changes.push([i,{...c}]);});
    this.events.push({seq:this.events.length+1,action,args:[...args],value,fromTick,tick:s.tick,cost:s.cost,x:s.x,y:s.y,facing:s.facing,changes,inventory:{...s.inventory},harvests:s.harvests,planted:s.planted});
    return value;
  }
}
export function applyGardenEvent(state:GardenState,e:GardenEvent):GardenState{
  const s=copyGarden(state);Object.assign(s,{tick:e.tick,cost:e.cost,x:e.x,y:e.y,facing:e.facing,inventory:{...e.inventory},harvests:e.harvests,planted:e.planted});
  for(const [i,c]of e.changes)s.cells[i]={...c};return s;
}
export function gardenRun(req:GardenRequest,sim:Garden,reason:GardenOutcome,message:string,logs:string[]=[],complete=true):GardenRun{
  const snapshots=[{seq:0,state:copyGarden(sim.initial)}];let state=sim.initial;
  for(const e of sim.events){state=applyGardenEvent(state,e);if(e.seq%128===0)snapshots.push({seq:e.seq,state});}
  return {format:'farm100-garden',version:GARDEN_VERSION,runId:req.runId,source:req.source,config:req.config,initial:copyGarden(sim.initial),events:sim.events,snapshots,result:{reason,message,state:copyGarden(sim.state)},logs,complete};
}
export function gardenAt(run:GardenRun,seq:number):GardenState{
  const n=Math.max(0,Math.min(run.events.length,Math.floor(seq)));let snap=run.snapshots[0];
  for(const s of run.snapshots){if(s.seq>n)break;snap=s;}
  let state=snap.state;for(let i=snap.seq;i<n;i++)state=applyGardenEvent(state,run.events[i]);return state;
}
export function gardenSequence(run:GardenRun,tick:number){let lo=0,hi=run.events.length;while(lo<hi){const m=(lo+hi)>>1;if(run.events[m].tick<=tick)lo=m+1;else hi=m;}return lo;}
export function validateGardenRun(raw:unknown):GardenRun{
  const r=raw as GardenRun;
  if(!r||r.format!=='farm100-garden'||r.version!==GARDEN_VERSION||typeof r.source!=='string'||r.source.length>1048576||!Array.isArray(r.events)||r.events.length>50000||!Array.isArray(r.snapshots))throw Error('不支持的农场运行记录');
  z.object({runId:z.string().uuid(),logs:z.array(z.string().max(4096)).max(65536),complete:z.boolean(),result:z.object({reason:z.enum(['finished','budget_exceeded','api_error','runtime_error','memory_limit','wall_timeout','cancelled','recording_limit','runner_crash']),message:z.string().max(4000)})}).parse(r);
  const config=GardenConfigSchema.parse(r.config),sim=new Garden(config,r.initial);
  for(const event of r.events){if(!event||!ACTIONS.includes(event.action)||!Array.isArray(event.args))throw Error('事件格式错误');sim.act(event.action,event.args);if(canonical(sim.events.at(-1))!==canonical(event))throw Error(`事件 ${event.seq} 与引擎不一致`);}
  if(canonical(sim.state)!==canonical(r.result?.state))throw Error('终态不一致');
  const rebuilt=gardenRun({runId:r.runId,config,source:r.source},sim,r.result.reason,r.result.message,r.logs,r.complete);
  if(canonical(rebuilt.snapshots)!==canonical(r.snapshots))throw Error('快照不一致');return rebuilt;
}

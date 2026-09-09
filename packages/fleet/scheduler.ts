import {Garden,copyGarden,copyEconomy,gardenRun,applyGardenEvent,type GardenAction,type GardenRequest,type GardenRun,type GardenOutcome,type GardenEvent,type GardenState} from '../garden/core';
import {canonical} from '../protocol';
import {copyMaze} from '../garden/challenges';
import {FLEET_APIS,copyFleet,type Pending,type SharedValue} from './protocol';
export class FleetStop extends Error{constructor(public reason:GardenOutcome,message:string){super(message);}}
export class FleetScheduler{
  world:Garden;private previous:GardenState;stopped=false;
  constructor(public req:GardenRequest,private eventLimit=24000){
    if(!req.config.drones)throw Error('缺少部署数量');this.world=new Garden(req.config,req.initial);
    this.previous=copyGarden(this.world.state);
  }
  get fleet(){return this.world.state.fleet!;}
  get events(){return this.world.events;}
  get idle(){return this.fleet.drones.filter(d=>d.status==='idle').map(d=>d.id);}
  get done(){return this.fleet.drones.every(d=>d.status==='done');}
  checkpoint(){return {state:copyGarden(this.world.state),previous:copyGarden(this.previous),stopped:this.stopped};}
  restore(saved:ReturnType<FleetScheduler['checkpoint']>){this.world.state=copyGarden(saved.state);this.previous=copyGarden(saved.previous);this.stopped=saved.stopped;}
  private ready(actor:number){if(this.stopped||this.idle[0]!==actor)throw new FleetStop('api_error','无人机未按调度顺序到达 API');}
  private describe(action:GardenAction,args:unknown[]){
    if(!(FLEET_APIS as readonly string[]).includes(action))return this.world.describe(action,args);
    const fail=():never=>{throw new FleetStop('api_error','协作 API 参数无效');};
    const valid=(v:unknown)=>v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&v.length<=1024;
    const key=args[0];
    if(['get_drone_id','get_drone_count','get_time'].includes(action)){if(args.length)fail();return {cost:1,duration:1};}
    if(typeof key!=='string'||!key.length||key.length>64||['__proto__','constructor','prototype'].includes(key))fail();
    const count=action==='write_shared'?2:action==='compare_exchange'?3:1;if(args.length!==count||args.slice(1).some(v=>!valid(v)))fail();
    return {cost:1,duration:action==='barrier'?1:2};
  }
  submit(actor:number,action:GardenAction,args:unknown[]){
    this.ready(actor);const {cost,duration}=this.describe(action,args),s=this.world.state;
    const reserved=this.fleet.pending.reduce((a,p)=>a+p.cost,0);
    if(s.cost-this.world.initial.cost+reserved+cost>this.req.config.budget)throw new FleetStop('budget_exceeded','整组操作预算不足，动作未发起');
    if(this.events.length>=this.eventLimit)throw new FleetStop('recording_limit','调度记录达到事件上限');
    this.fleet.drones[actor].status='waiting';this.fleet.pending.push({actor,action,args:[...args],start:s.tick,end:action==='barrier'?null:s.tick+duration,cost});
    this.record('dispatch',actor,action,args,null,s.tick);
  }
  finish(actor:number){this.ready(actor);this.fleet.drones[actor].status='done';this.record('finish',actor,'worker_done',[],true,this.world.state.tick);}
  abort(reason:GardenOutcome){if(this.stopped)return;this.stopped=true;this.fleet.pending=[];this.fleet.drones.forEach(d=>d.status='done');this.record('abort',-1,'fleet_abort',[reason],false,this.world.state.tick);}
  step(){
    if(this.stopped||this.idle.length)throw new FleetStop('api_error','调度前仍有未挂起的程序');
    let pending=this.fleet.pending;if(!pending.length)return [];
    if(pending.every(p=>p.end===null)){
      if(pending.length!==this.fleet.drones.length||new Set(pending.map(p=>p.args[0])).size!==1)throw new FleetStop('deadlock','屏障未满足：部分无人机已结束或等待不同标签');
      pending.forEach(p=>p.end=this.world.state.tick+1);
    }
    const end=Math.min(...pending.filter(p=>p.end!==null).map(p=>p.end!));
    this.world.advance(end-this.world.state.tick);
    const due=pending.filter(p=>p.end===end).sort((a,b)=>a.actor-b.actor),results:{actor:number;value:unknown}[]=[];
    for(const p of due){
      this.fleet.pending=this.fleet.pending.filter(q=>q.actor!==p.actor);
      const s=this.world.state,d=this.fleet.drones[p.actor];s.x=d.x;s.y=d.y;s.facing=d.facing;
      const value=this.commit(p);d.x=s.x;d.y=s.y;d.facing=s.facing as typeof d.facing;d.cost+=p.cost;d.actions++;d.status='idle';
      this.record('complete',p.actor,p.action as GardenAction,p.args,value,p.start);results.push({actor:p.actor,value});
    }
    return results;
  }
  private commit(p:Pending){
    const s=this.world.state,f=this.fleet,key=p.args[0] as string;
    if(!(FLEET_APIS as readonly string[]).includes(p.action)){const value=this.world.act(p.action as GardenAction,p.args,p.start);this.world.events.pop();return value;}
    s.cost+=p.cost;const old=Object.hasOwn(f.shared,key)?f.shared[key]:null;
    const room=Object.hasOwn(f.shared,key)||Object.keys(f.shared).length<128;
    switch(p.action){
      case 'get_drone_id':return p.actor;
      case 'get_drone_count':return f.drones.length;
      case 'get_time':return s.tick;
      case 'read_shared':return old;
      case 'write_shared':if(!room)return false;f.shared[key]=p.args[1] as SharedValue;return true;
      case 'compare_exchange':{const exchanged=old===p.args[1]&&room;if(exchanged)f.shared[key]=p.args[2] as SharedValue;return {exchanged,value:old};}
      case 'barrier':return true;
    }
  }
  private record(kind:NonNullable<GardenEvent['kind']>,actor:number,action:GardenAction,args:unknown[],value:unknown,fromTick:number){
    const s=this.world.state,changes:GardenEvent['changes']=[];s.cells.forEach((c,i)=>{if(canonical(c)!==canonical(this.previous.cells[i]))changes.push([i,{...c}]);});
    this.events.push({kind,actor,seq:this.events.length+1,action,args:[...args],value,fromTick,tick:s.tick,cost:s.cost,x:s.x,y:s.y,facing:s.facing,changes,inventory:{...s.inventory},planted:s.planted,harvests:s.harvests,economy:copyEconomy(s.economy!),fleet:copyFleet(this.fleet),...(s.maze?{maze:copyMaze(s.maze)}:{})});this.previous=copyGarden(s);
  }
}
export function validateFleetTrace(r:GardenRun):GardenRun{
  const scheduler=new FleetScheduler({runId:r.runId,config:r.config,source:r.source,initial:r.initial});
  if(canonical(scheduler.world.initial)!==canonical(r.initial))throw Error('调度初态不一致');
  let expected:GardenEvent[]=[],state=copyGarden(r.initial);
  for(const e of r.events){
    if(!e||!Array.isArray(e.args)||!Number.isInteger(e.actor))throw Error('无效调度事件');
    if(!expected.length){const before=scheduler.events.length;
      if(e.kind==='dispatch')scheduler.submit(e.actor!,e.action,e.args);
      else if(e.kind==='finish')scheduler.finish(e.actor!);
      else if(e.kind==='abort'){if(e.actor!==-1||e.args.length!==1||e.args[0]!==r.result.reason||r.result.reason==='finished')throw Error('无效调度中止');scheduler.abort(r.result.reason);}
      else if(e.kind==='complete')scheduler.step();else throw Error('缺少调度阶段');
      expected=scheduler.events.slice(before);
    }
    if(canonical(expected.shift())!==canonical(e))throw Error(`调度事件 ${e.seq} 与引擎不一致`);state=applyGardenEvent(state,e);
  }
  if(r.complete&&r.result.reason==='finished'&&(!scheduler.done||expected.length||scheduler.stopped))throw Error('程序未全部结束');
  if(r.complete&&r.result.reason!=='finished'&&!scheduler.stopped)throw Error('缺少整组终止事件');
  if(canonical(state)!==canonical(r.result.state))throw Error('调度终态不一致');
  const rebuilt=gardenRun({runId:r.runId,config:r.config,source:r.source},{initial:r.initial,events:r.events,state},r.result.reason,r.result.message,r.logs,r.complete);
  if(canonical(rebuilt.snapshots)!==canonical(r.snapshots))throw Error('调度快照不一致');return rebuilt;
}

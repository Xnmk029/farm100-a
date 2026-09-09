import {z} from 'zod';
import {canonical} from '../protocol';
import {FleetScheduler} from '../fleet/scheduler';
import {ACTIONS,GARDEN_VERSION,Garden,copyGarden,applyGardenEvent,type GardenRequest,type GardenState,type GardenEvent,type GardenOutcome} from './core';
import {EventBuffer,type GardenReceipt} from './stream';

export const OutcomeSchema=z.enum(['finished','budget_exceeded','api_error','runtime_error','memory_limit','wall_timeout','cancelled','recording_limit','runner_crash','deadlock','instruction_limit']);
const ReceiptSchema=z.object({format:z.literal('farm100-garden-receipt'),runId:z.string().uuid(),version:z.literal(GARDEN_VERSION),source:z.string().max(1048576),eventCount:z.number().int().min(0).max(400016),peakBufferedEvents:z.number().int().min(0),complete:z.boolean(),logs:z.array(z.string().max(4096)).max(65536),result:z.object({reason:OutcomeSchema,message:z.string().max(4000)})});

/** Replays the authoritative rules; at most one tied completion group is queued. */
export class GardenTraceVerifier{
  readonly world:Garden;private fleet?:FleetScheduler;private buffer=new EventBuffer();
  private observed:GardenState;private count=0;private aborted?:GardenOutcome;
  constructor(readonly request:GardenRequest){
    z.object({runId:z.string().uuid(),source:z.string().max(1048576)}).parse(request);
    if(Buffer.byteLength(request.source)>1048576)throw Error('代码不能超过 1 MiB');
    if(request.config.rule!==GARDEN_VERSION)throw Error('增量校验仅支持当前规则');
    this.fleet=request.config.drones?new FleetScheduler(request,Infinity):undefined;
    this.world=this.fleet?.world??new Garden(request.config,request.initial);this.world.events=this.buffer;this.observed=copyGarden(this.world.initial);
    if(request.initial&&canonical(request.initial)!==canonical(this.world.initial))throw Error('记录初态无效');
  }
  get state(){return copyGarden(this.observed);}
  get eventCount(){return this.count;}
  get peakBufferedEvents(){return this.buffer.peak;}
  get abortReason(){return this.aborted;}
  private accept(event:GardenEvent){
    if(!event||event.seq!==this.count+1||!Array.isArray(event.args))throw Error('事件序号或格式无效');
    if(!this.buffer.length){
      if(this.fleet){
        if(!Number.isInteger(event.actor))throw Error('无效调度事件');
        if(event.kind==='dispatch')this.fleet.submit(event.actor!,event.action,event.args);
        else if(event.kind==='finish')this.fleet.finish(event.actor!);
        else if(event.kind==='complete')this.fleet.step();
        else if(event.kind==='abort'){
          const reason=OutcomeSchema.parse(event.args[0]);if(event.actor!==-1||event.args.length!==1||reason==='finished'||this.aborted)throw Error('无效调度中止');
          this.fleet.abort(reason);this.aborted=reason;
        }else throw Error('缺少调度阶段');
      }else{
        if(!ACTIONS.includes(event.action as typeof ACTIONS[number]))throw Error('事件动作无效');this.world.act(event.action,event.args);
      }
    }
    if(canonical(this.buffer[0])!==canonical(event))throw Error(`事件 ${event.seq} 与引擎不一致`);
    this.observed=applyGardenEvent(this.observed,event);this.count++;this.buffer.release(1);
  }
  /** A corrupt chunk never partly advances the accepted prefix. */
  append(events:GardenEvent[]){
    if(!Array.isArray(events)||!events.length||events.length>64)throw Error('校验批次无效');
    const saved={fleet:this.fleet?.checkpoint(),state:copyGarden(this.world.state),terminal:this.world.terminal,observed:this.observed,count:this.count,aborted:this.aborted,offset:this.buffer.offset,peak:this.buffer.peak,events:this.buffer.slice()};
    try{for(const e of events)this.accept(e);}catch(e){
      if(this.fleet)this.fleet.restore(saved.fleet!);else this.world.state=saved.state;
      this.world.terminal=saved.terminal;this.observed=saved.observed;this.count=saved.count;this.aborted=saved.aborted;
      this.buffer.length=0;this.buffer.offset=saved.offset;this.buffer.push(...saved.events);this.buffer.peak=saved.peak;throw e;
    }
  }
  finish(receipt:GardenReceipt){
    ReceiptSchema.parse(receipt);
    if(receipt.logs.reduce((n,s)=>n+Buffer.byteLength(s),0)>262144)throw Error('日志超出记录配额');
    if(receipt.runId!==this.request.runId||receipt.source!==this.request.source||canonical(receipt.config)!==canonical(this.request.config)||canonical(receipt.initial)!==canonical(this.world.initial)||receipt.eventCount!==this.count||canonical(receipt.result.state)!==canonical(this.observed))throw Error('记录结束状态不一致');
    if(this.aborted&&receipt.result.reason!==this.aborted)throw Error('终止原因与事件不一致');
    if(this.fleet&&receipt.complete){
      if(receipt.result.reason==='finished'&&(!this.fleet.done||this.buffer.length||this.fleet.stopped))throw Error('程序未全部结束');
      if(receipt.result.reason!=='finished'&&!this.fleet.stopped)throw Error('缺少整组终止事件');
    }
    return receipt;
  }
}

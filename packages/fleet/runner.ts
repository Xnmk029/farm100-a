import {newAsyncContext,type QuickJSHandle} from 'quickjs-emscripten';
import {ACTIONS,GARDEN_VERSION,GardenStop,gardenRun,type GardenRun,type GardenAction,type GardenRequest,type GardenEvent,type GardenOutcome} from '../garden/core';
import {EventBuffer,gardenReceipt,type GardenReceipt} from '../garden/stream';
import {directions} from '../protocol';
import {FLEET_APIS} from './protocol';
import {FleetScheduler,FleetStop} from './scheduler';
export type FleetOptions={wallMs?:number;memoryBytes?:number;interruptLimit?:number;cancelled?:()=>boolean;onBatch?:(events:GardenEvent[])=>Promise<void>};
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};}
export function executeFleet(req:GardenRequest,options:FleetOptions&{stream:true}):Promise<GardenReceipt>;
export function executeFleet(req:GardenRequest,options?:FleetOptions&{stream?:false}):Promise<GardenRun>;
export async function executeFleet(req:GardenRequest,options:FleetOptions&{stream?:boolean}={}){
  if(options.stream&&(!options.onBatch||req.config.rule!==GARDEN_VERSION))throw Error('流式执行需要当前规则与持久化消费者');
  const scheduler=new FleetScheduler(req,options.stream?Infinity:24000),logs:string[]=[],lanes:Lane[]=[];let outcome:{reason:GardenOutcome;message:string}|undefined,sent=0,logBytes=0;
  const buffer=options.stream?new EventBuffer():undefined;if(buffer)scheduler.world.events=buffer;
  const deadline=performance.now()+(options.wallMs??(options.stream?7200000:30000));let sinkFailed=false,sinkError:unknown;
  type VM=Awaited<ReturnType<typeof newAsyncContext>>;
  type Lane={id:number;vm:VM;box:QuickJSHandle;boundary:ReturnType<typeof deferred<void>>;answer?:ReturnType<typeof deferred<unknown>>;task?:Promise<void>;done:boolean;interrupts:number;diagnosing:boolean;diagnosticDeadline:number};
  const stop=(reason:GardenOutcome,message:string)=>outcome??={reason,message};
  const check=()=>{if(options.cancelled?.())stop('cancelled','用户中止整个编组');if(performance.now()>deadline)stop('wall_timeout','编组执行超过宿主时限');};
  const flush=async()=>{if(sinkFailed)throw sinkError;try{if(buffer){while(buffer.length){const events=buffer.slice(0,64);await options.onBatch!(events);buffer.release(events.length);}}else while(sent<scheduler.events.length){const events=scheduler.events.slice(sent,sent+64);sent+=events.length;await options.onBatch?.(events);}}catch(e){sinkFailed=true;sinkError=e;throw e;}};
  const boxValue=(vm:VM,v:unknown):QuickJSHandle=>{if(v===null)return vm.null;if(v===undefined)return vm.undefined;if(typeof v==='boolean')return v?vm.true:vm.false;if(typeof v==='number')return vm.newNumber(v);if(typeof v==='string')return vm.newString(v);const h=Array.isArray(v)?vm.newArray():vm.newObject();for(const [k,x]of Object.entries(v as object)){const child=boxValue(vm,x);vm.setProp(h,k,child);child.dispose();}return h;};
  const resume=async(lane:Lane,value?:unknown,start=false)=>{
    lane.boundary=deferred<void>();lane.interrupts=0;
    if(start){
      lane.task=(async()=>{
        const result=await lane.vm.evalCodeAsync(req.source,`drone-${lane.id}.js`,{type:'global'});
        if(result.error){
          if(!outcome){
            stop('runtime_error',`无人机 ${lane.id} 脚本异常`);lane.diagnosing=true;lane.diagnosticDeadline=performance.now()+100;
            try{lane.vm.setProp(lane.box,'error',result.error);const info=await lane.vm.evalCodeAsync('__fleetDiagnostic.read()');if(info.error)info.error.dispose();else{const d=JSON.parse(lane.vm.getString(info.value));info.value.dispose();outcome={reason:/out of memory|allocation/i.test(d.message)?'memory_limit':'runtime_error',message:(`无人机 ${lane.id}: `+d.name+': '+d.message).slice(0,4000)};}}catch{}finally{lane.diagnosing=false;}
          }result.error.dispose();
        }else{result.value.dispose();if(!outcome)scheduler.finish(lane.id);}
        lane.done=true;lane.boundary.resolve();
      })().catch(e=>{stop('runtime_error',String(e).slice(0,4000));lane.done=true;lane.boundary.resolve();});
    }else{const answer=lane.answer;lane.answer=undefined;answer!.resolve(value);}
    await lane.boundary.promise;
  };
  try{
    for(let id=0;id<req.config.drones!;id++){
      const vm=await newAsyncContext();vm.runtime.setMemoryLimit(Math.floor((options.memoryBytes??128*1024*1024)/req.config.drones!));vm.runtime.setMaxStackSize(512*1024);vm.runtime.setModuleLoader(()=>{throw Error('Module loading disabled');});
      const box=vm.unwrapResult(vm.evalCode(`(()=>{const stringify=JSON.stringify,box=Object.create(null);Object.defineProperties(box,{error:{value:null,writable:true},read:{value:()=>{const e=box.error,n=e?.name,m=e?.message;return stringify({name:typeof n==='string'?n:'Error',message:typeof m==='string'?m:'Script threw a value'});}}});Object.preventExtensions(box);Object.defineProperty(globalThis,'__fleetDiagnostic',{value:box});return box;})()`));
      const lane:Lane={id,vm,box,boundary:deferred<void>(),done:false,interrupts:0,diagnosing:false,diagnosticDeadline:0};lanes.push(lane);
      vm.runtime.setInterruptHandler(()=>{if(lane.diagnosing)return performance.now()>lane.diagnosticDeadline;check();if(++lane.interrupts>(options.interruptLimit??2048))stop('instruction_limit',`无人机 ${id} 在两次 API 之间计算超限`);return !!outcome;});
      for(const action of [...ACTIONS,...FLEET_APIS]){
        const fn=vm.newAsyncifiedFunction(action,async(...handles)=>{
          if(outcome||lane.diagnosing)throw Error('编组已停止');check();if(outcome)throw Error('编组已停止');
          const args=handles.map(h=>{const t=vm.typeof(h);return t==='string'?vm.getString(h):t==='number'?vm.getNumber(h):t==='boolean'?vm.sameValue(h,vm.true):vm.sameValue(h,vm.null)?null:undefined;});
          try{scheduler.submit(id,action as GardenAction,args);}catch(e){stop(e instanceof FleetStop||e instanceof GardenStop?e.reason:'api_error',String(e).slice(0,4000));throw e;}
          lane.answer=deferred<unknown>();lane.boundary.resolve();const value=await lane.answer.promise;if(outcome)throw Error('编组已停止');return boxValue(vm,value);
        });vm.setProp(vm.global,action,fn);fn.dispose();
      }
      for(const [name,v]of Object.entries({...Object.fromEntries(Object.keys(directions).map(k=>[k,k])),Wheat:'wheat',Carrot:'carrot',Tree:'tree',Sunflower:'sunflower',Pumpkin:'pumpkin',Cactus:'cactus',Bean:'bean',Crystal:'crystal'})){const h=vm.newString(v);vm.setProp(vm.global,name,h);h.dispose();}
      const console=vm.newObject(),log=vm.newFunction('log',(...args)=>{if(outcome||logBytes>=262144)return;const text=`[${scheduler.world.state.tick} · #${id}] `+args.map(h=>vm.typeof(h)==='string'?vm.getString(h).slice(0,2048):vm.typeof(h)==='number'?String(vm.getNumber(h)):'['+vm.typeof(h)+']').join(' ').slice(0,3900);logBytes+=Buffer.byteLength(text);if(logBytes<=262144)logs.push(text);});vm.setProp(console,'log',log);vm.setProp(vm.global,'console',console);log.dispose();console.dispose();
      vm.evalCode('delete globalThis.Date; Math.random=undefined; Object.freeze(Math);').dispose();
    }
    for(const lane of lanes){check();if(outcome)break;await resume(lane,undefined,true);}
    while(!outcome&&!scheduler.done){
      check();if(outcome)break;const ready=scheduler.step();
      for(const r of ready){if(outcome)break;await resume(lanes[r.actor],r.value);}
      if(scheduler.events.length-sent>=64)await flush();
    }
  }catch(e){stop(e instanceof FleetStop||e instanceof GardenStop?e.reason:'runtime_error',String(e).slice(0,4000));}
  finally{
    if(outcome)scheduler.abort(outcome.reason);
    for(const lane of lanes)lane.answer?.resolve(undefined);
    await Promise.allSettled(lanes.flatMap(l=>l.task?[l.task]:[]));
    for(const lane of lanes){lane.box.dispose();lane.vm.dispose();}
  }
  await flush();return buffer?gardenReceipt(req,scheduler.world,buffer.total,outcome?.reason??'finished',outcome?.message??'全部无人机程序结束',logs,true,buffer.peak):gardenRun(req,scheduler.world,outcome?.reason??'finished',outcome?.message??'全部无人机程序结束',logs);
}

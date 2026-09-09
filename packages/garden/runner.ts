import {executeFleet} from '../fleet/runner';
import {newAsyncContext,type QuickJSHandle} from 'quickjs-emscripten';
import {directions} from '../protocol';
import {ACTIONS,GARDEN_VERSION,Garden,GardenStop,gardenRun,type GardenRun,type GardenRequest,type GardenEvent,type GardenOutcome} from './core';
import {EventBuffer,gardenReceipt,type GardenReceipt} from './stream';

export type GardenOptions={wallMs?:number;memoryBytes?:number;cancelled?:()=>boolean;onBatch?:(events:GardenEvent[])=>Promise<void>};
export function executeGarden(req:GardenRequest,options:GardenOptions&{stream:true}):Promise<GardenReceipt>;
export function executeGarden(req:GardenRequest,options?:GardenOptions&{stream?:false}):Promise<GardenRun>;
export async function executeGarden(req:GardenRequest,options:GardenOptions&{stream?:boolean}={}){
  if(typeof req.source!=='string'||Buffer.byteLength(req.source)>1048576)throw Error('代码不能超过 1 MiB');
  if(req.config.drones)return options.stream?executeFleet(req,{...options,stream:true}):executeFleet(req,{...options,stream:false});
  if(options.stream&&(!options.onBatch||req.config.rule!==GARDEN_VERSION))throw Error('流式执行需要当前规则与持久化消费者');
  const sim=new Garden(req.config,req.initial),logs:string[]=[];
  const buffer=options.stream?new EventBuffer():undefined;if(buffer)sim.events=buffer;
  const vm=await newAsyncContext();let outcome:{reason:GardenOutcome;message:string}|undefined,diagnosing=false,diagnosticDeadline=0;
  const deadline=performance.now()+(options.wallMs??(options.stream?7200000:30000));let sent=0,logBytes=0,interrupts=0,sinkError:unknown,sinkFailed=false;
  let box:QuickJSHandle|undefined;
  const check=()=>{
    if(options.cancelled?.())outcome??={reason:'cancelled',message:'用户中止'};
    if(performance.now()>deadline)outcome??={reason:'wall_timeout',message:'执行超过时限'};
  };
  function value(v:unknown):QuickJSHandle{
    if(v===null)return vm.null;if(v===undefined)return vm.undefined;
    if(typeof v==='boolean')return v?vm.true:vm.false;
    if(typeof v==='number')return vm.newNumber(v);
    if(typeof v==='string')return vm.newString(v);
    const h=Array.isArray(v)?vm.newArray():vm.newObject();for(const [k,x]of Object.entries(v as object)){const n=value(x);vm.setProp(h,k,n);n.dispose();}return h;
  }
  const flush=async()=>{if(sinkFailed)throw sinkError;try{if(buffer){while(buffer.length){const events=buffer.slice(0,64);await options.onBatch!(events);buffer.release(events.length);}}else if(sent<sim.events.length){const events=sim.events.slice(sent);sent=sim.events.length;await options.onBatch?.(events);}}catch(e){sinkFailed=true;sinkError=e;outcome??={reason:'runner_crash',message:'事件消费者失败'};throw e;}};
  try{
    vm.runtime.setMemoryLimit(options.memoryBytes??128*1024*1024);vm.runtime.setMaxStackSize(512*1024);
    vm.runtime.setModuleLoader(()=>{throw Error('Module loading disabled');});
    // Trusted bootstrap must finish before guest interruption is enabled. The
    // original deadline still includes setup, and all handles are cleaned up.
    box=vm.unwrapResult(vm.evalCode(`(()=>{const stringify=JSON.stringify,box=Object.create(null);Object.defineProperties(box,{error:{value:null,writable:true},read:{value:()=>{const e=box.error,n=e?.name,m=e?.message;return stringify({name:typeof n==='string'?n:'Error',message:typeof m==='string'?m:'Script threw a value'});}}});Object.preventExtensions(box);Object.defineProperty(globalThis,'__farmDiagnostic',{value:box});return box;})()`));
    for(const name of ACTIONS){
      const fn=vm.newAsyncifiedFunction(name,async(...handles)=>{
        if(options.cancelled?.())outcome??={reason:'cancelled',message:'用户中止'};
        if(performance.now()>deadline)outcome??={reason:'wall_timeout',message:'执行超过时限'};
        if(outcome||diagnosing)throw Error('运行已结束');
        interrupts=0;
        if(sim.events.length>=10000){outcome={reason:'recording_limit',message:'首期农场记录达到 10,000 动作上限'};throw Error(outcome.message);}
        try{
          const args=handles.map(h=>{const t=vm.typeof(h);return t==='string'?vm.getString(h):t==='number'?vm.getNumber(h):t==='undefined'?undefined:null;});
          const result=sim.act(name,args);if(sim.events.length-sent>=64)await flush();return value(result);
        }catch(e){if(e instanceof GardenStop)outcome={reason:e.reason,message:e.message};throw e;}
      });vm.setProp(vm.global,name,fn);fn.dispose();
    }
    for(const [name,v]of Object.entries({...Object.fromEntries(Object.keys(directions).map(k=>[k,k])),Wheat:'wheat',Carrot:'carrot',Tree:'tree',Sunflower:'sunflower',Pumpkin:'pumpkin',Cactus:'cactus',Bean:'bean',Crystal:'crystal'})){
      const h=vm.newString(v);vm.setProp(vm.global,name,h);h.dispose();
    }
    const consoleHandle=vm.newObject(),log=vm.newFunction('log',(...args)=>{
      if(logBytes>=262144)return;
      const text=args.map(h=>vm.typeof(h)==='string'?vm.getString(h).slice(0,2048):vm.typeof(h)==='number'?String(vm.getNumber(h)):'['+vm.typeof(h)+']').join(' ').slice(0,4096);
      logBytes+=Buffer.byteLength(text);if(logBytes<=262144)logs.push(text);
    });vm.setProp(consoleHandle,'log',log);vm.setProp(vm.global,'console',consoleHandle);log.dispose();consoleHandle.dispose();
    vm.unwrapResult(vm.evalCode('delete globalThis.Date; Math.random=undefined; Object.freeze(Math);')).dispose();
    check();if(outcome)throw Error('运行已结束');
    vm.runtime.setInterruptHandler(()=>{
      if(diagnosing)return performance.now()>diagnosticDeadline;
      check();
      if(options.stream&&++interrupts>2048)outcome??={reason:'instruction_limit',message:'两次 API 之间计算超限'};
      return !!outcome;
    });
    const result=await vm.evalCodeAsync(req.source,'garden.js',{type:'global'});
    if(result.error){
      if(!outcome){
        outcome={reason:'runtime_error',message:'脚本异常'};diagnosing=true;diagnosticDeadline=performance.now()+100;
        try{
          vm.setProp(box,'error',result.error);const info=await vm.evalCodeAsync('__farmDiagnostic.read()');
          if(info.error)info.error.dispose();
          else{const details=JSON.parse(vm.getString(info.value));info.value.dispose();outcome={reason:/out of memory|allocation/i.test(details.message)?'memory_limit':'runtime_error',message:(details.name+': '+details.message).slice(0,4000)};}
        }catch{}finally{diagnosing=false;}
      }result.error.dispose();
    }else result.value.dispose();
  }catch(e){outcome??={reason:'runtime_error',message:String(e).slice(0,4000)};}
  finally{box?.dispose();vm.dispose();}
  await flush();return buffer?gardenReceipt(req,sim,buffer.total,outcome?.reason??'finished',outcome?.message??'程序执行结束',logs,true,buffer.peak):gardenRun(req,sim,outcome?.reason??'finished',outcome?.message??'程序执行结束',logs);
}

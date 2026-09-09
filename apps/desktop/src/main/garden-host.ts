import {utilityProcess} from 'electron';
import {Garden,GARDEN_VERSION,applyGardenEvent,gardenRun,type GardenRequest,type GardenRun,type GardenOutcome} from '../../../../packages/garden/core';
import type {GardenJournal} from '../../../../packages/garden-storage/journal';
import {gardenReceipt,type GardenReceipt} from '../../../../packages/garden/stream';
import {GardenTraceVerifier} from '../../../../packages/garden/trace';

type Handle<T>={promise:Promise<T>;terminate:()=>boolean;cancel:()=>void};
export function launchGarden(req:GardenRequest,workerPath:string,onProgress:(p:any)=>void,options:{journal:GardenJournal;stream:true;watchRate?:number}):Handle<GardenReceipt>;
export function launchGarden(req:GardenRequest,workerPath:string,onProgress:(p:any)=>void,options?:{journal?:GardenJournal;stream?:false}):Handle<GardenRun>;
export function launchGarden(req:GardenRequest,workerPath:string,onProgress:(p:any)=>void,options:{journal?:GardenJournal;stream?:boolean;watchRate?:number}={}){
  if(options.stream&&!options.journal)throw Error('流式运行必须持久化');
  const sim=new Garden(req.config,req.initial);
  const started=performance.now();let releasePace:(()=>void)|undefined;
  const pace=async(tick:number)=>{if(!options.watchRate||cancelled)return;const delay=(tick-sim.initial.tick)/options.watchRate*1000-(performance.now()-started);if(delay<=0)return;await new Promise<void>(resolve=>{const timer=setTimeout(()=>{releasePace=undefined;resolve();},delay);releasePace=()=>{clearTimeout(timer);releasePace=undefined;resolve();};});};
  const verifier=options.stream?new GardenTraceVerifier({...req,initial:sim.initial}):undefined;let eventCount=0;
  const child=utilityProcess.fork(workerPath,[],{serviceName:'FARM100 garden runner',stdio:'pipe'});
  let finished=false,cancelled=false,spawned=false,sequence=0,killTimer:NodeJS.Timeout|undefined,queue=Promise.resolve();
  let resolve!:(run:GardenRun|GardenReceipt)=>void;const promise=new Promise<GardenRun|GardenReceipt>(r=>resolve=r);
  const end=async(run:GardenRun|GardenReceipt)=>{
    if(finished)return;finished=true;releasePace?.();clearTimeout(hardTimer);clearTimeout(killTimer);child.kill();
    try{await options.journal?.finish(run);}catch(e){onProgress({runId:req.runId,type:'storage-error',message:String(e)});}
    resolve(run);
  };
  const emergency=(reason:GardenOutcome,message:string)=>end(options.stream?gardenReceipt(req,sim,eventCount,reason,message.slice(0,4000),[],false,verifier!.peakBufferedEvents):gardenRun(req,sim,reason,message,[],false));
  const enqueue=(fn:()=>Promise<void>)=>{queue=queue.then(fn).catch(e=>emergency('runner_crash',String(e)));};
  const hardTimer=setTimeout(()=>{releasePace?.();enqueue(()=>emergency('wall_timeout','宿主执行超时'));},options.stream?7205000:35000);
  child.on('spawn',()=>{spawned=true;child.postMessage({type:'start',request:req,stream:!!options.stream});if(cancelled)child.postMessage({type:'cancel',runId:req.runId});});
  child.on('message',msg=>enqueue(async()=>{
    if(finished||!msg||msg.runId!==req.runId||msg.version!==GARDEN_VERSION)return;
    if(msg.type==='ready'&&msg.sequence===0){onProgress(msg);return;}
    if(msg.sequence!==sequence+1){await emergency('runner_crash','消息顺序无效');return;}sequence=msg.sequence;
    if(msg.type==='events'){
      if(!Array.isArray(msg.events)||!msg.events.length||msg.events.length>64){await emergency('runner_crash','农场批次无效');return;}
      let state=sim.state;
      if(verifier){verifier.append(msg.events);state=verifier.state;}
      else for(let i=0;i<msg.events.length;i++){const e=msg.events[i];if(e.seq!==sim.events.length+i+1)throw Error('事件序号无效');state=applyGardenEvent(state,e);}
      // Backpressure extends through disk flush. A crash cannot lose an acknowledged batch.
      try{await options.journal?.append(msg.events);}catch(e){onProgress({runId:req.runId,type:'storage-error',message:String(e)});throw Error('持久化失败，执行已停止：'+String(e));}
      sim.state=state;eventCount+=msg.events.length;if(!options.stream)sim.events.push(...msg.events);onProgress({...msg,recordedBytes:options.journal?.metrics.bytes});
      await pace(state.tick);
      if(!finished)child.postMessage({type:'ack',runId:req.runId,sequence});
    }else if(msg.type==='result'){if(verifier)verifier.finish(msg.run);else if(msg.run?.format!=='farm100-garden')throw Error('运行结果格式无效');await end(msg.run);}
    else if(msg.type==='error')await emergency(cancelled?'cancelled':'runner_crash',String(msg.message));
  }));
  child.on('exit',code=>{releasePace?.();enqueue(async()=>{if(!finished)await emergency(cancelled?'cancelled':'runner_crash',`运行器退出 ${code}`);});});
  return {promise,terminate:()=>{releasePace?.();return child.kill();},cancel:()=>{if(finished)return;cancelled=true;releasePace?.();if(spawned)child.postMessage({type:'cancel',runId:req.runId});killTimer??=setTimeout(()=>enqueue(()=>emergency('cancelled','用户中止农场执行')),1000);}};
}

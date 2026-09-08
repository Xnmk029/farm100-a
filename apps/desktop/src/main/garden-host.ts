import {utilityProcess} from 'electron';
import {Garden,GARDEN_VERSION,applyGardenEvent,gardenRun,type GardenRequest,type GardenRun,type GardenOutcome} from '../../../../packages/garden/core';
import type {GardenJournal} from '../../../../packages/garden-storage/journal';

export function launchGarden(req:GardenRequest,workerPath:string,onProgress:(p:any)=>void,options:{journal?:GardenJournal}={}){
  const sim=new Garden(req.config,req.initial);
  const child=utilityProcess.fork(workerPath,[],{serviceName:'FARM100 garden runner',stdio:'pipe'});
  let finished=false,cancelled=false,spawned=false,sequence=0,killTimer:NodeJS.Timeout|undefined,queue=Promise.resolve();
  let resolve!:(run:GardenRun)=>void;const promise=new Promise<GardenRun>(r=>resolve=r);
  const end=async(run:GardenRun)=>{
    if(finished)return;finished=true;clearTimeout(hardTimer);clearTimeout(killTimer);child.kill();
    try{await options.journal?.finish(run);}catch(e){onProgress({runId:req.runId,type:'storage-error',message:String(e)});}
    resolve(run);
  };
  const emergency=(reason:GardenOutcome,message:string)=>end(gardenRun(req,sim,reason,message,[],false));
  const enqueue=(fn:()=>Promise<void>)=>{queue=queue.then(fn).catch(e=>emergency('runner_crash',String(e)));};
  const hardTimer=setTimeout(()=>enqueue(()=>emergency('wall_timeout','宿主执行超时')),35000);
  child.on('spawn',()=>{spawned=true;child.postMessage({type:'start',request:req});if(cancelled)child.postMessage({type:'cancel',runId:req.runId});});
  child.on('message',msg=>enqueue(async()=>{
    if(finished||!msg||msg.runId!==req.runId||msg.version!==GARDEN_VERSION)return;
    if(msg.type==='ready'&&msg.sequence===0){onProgress(msg);return;}
    if(msg.sequence!==sequence+1){await emergency('runner_crash','消息顺序无效');return;}sequence=msg.sequence;
    if(msg.type==='events'){
      if(!Array.isArray(msg.events)||msg.events.length>64){await emergency('runner_crash','农场批次无效');return;}
      let state=sim.state;for(let i=0;i<msg.events.length;i++){const e=msg.events[i];if(e.seq!==sim.events.length+i+1)throw Error('事件序号无效');state=applyGardenEvent(state,e);}
      // Backpressure extends through disk flush. A crash cannot lose an acknowledged batch.
      try{await options.journal?.append(msg.events);}catch(e){onProgress({runId:req.runId,type:'storage-error',message:String(e)});throw Error('持久化失败，执行已停止：'+String(e));}
      sim.state=state;sim.events.push(...msg.events);onProgress(msg);
      if(!finished)child.postMessage({type:'ack',runId:req.runId,sequence});
    }else if(msg.type==='result')await end(msg.run);
    else if(msg.type==='error')await emergency(cancelled?'cancelled':'runner_crash',String(msg.message));
  }));
  child.on('exit',code=>enqueue(async()=>{if(!finished)await emergency(cancelled?'cancelled':'runner_crash',`运行器退出 ${code}`);}));
  return {promise,terminate:()=>child.kill(),cancel:()=>{if(finished)return;cancelled=true;if(spawned)child.postMessage({type:'cancel',runId:req.runId});killTimer??=setTimeout(()=>enqueue(()=>emergency('cancelled','用户中止农场执行')),1000);}};
}

import {utilityProcess} from 'electron';
import {Garden,GARDEN_VERSION,applyGardenEvent,gardenRun,type GardenRequest,type GardenRun,type GardenOutcome} from '../../../../packages/garden/core';

export function launchGarden(req:GardenRequest,workerPath:string,onProgress:(p:any)=>void){
  const sim=new Garden(req.config,req.initial);
  const child=utilityProcess.fork(workerPath,[],{serviceName:'FARM100 garden runner',stdio:'pipe'});
  let finished=false,cancelled=false,sequence=0,killTimer:NodeJS.Timeout|undefined;
  let resolve!:(run:GardenRun)=>void;const promise=new Promise<GardenRun>(r=>resolve=r);
  const end=(run:GardenRun)=>{if(finished)return;finished=true;clearTimeout(hardTimer);clearTimeout(killTimer);child.kill();resolve(run);};
  const emergency=(reason:GardenOutcome,message:string)=>end(gardenRun(req,sim,reason,message,[],false));
  const hardTimer=setTimeout(()=>emergency('wall_timeout','宿主执行超时'),35000);
  child.on('spawn',()=>child.postMessage({type:'start',request:req}));
  child.on('message',msg=>{
    if(finished||!msg||msg.runId!==req.runId||msg.version!==GARDEN_VERSION)return;
    if(msg.type==='ready'&&msg.sequence===0){onProgress(msg);return;}
    if(msg.sequence!==sequence+1){emergency('runner_crash','消息顺序无效');return;}sequence=msg.sequence;
    if(msg.type==='events'){
      if(!Array.isArray(msg.events)||msg.events.length>64){emergency('runner_crash','农场批次无效');return;}
      try{for(const e of msg.events){if(e.seq!==sim.events.length+1)throw Error('事件序号无效');sim.state=applyGardenEvent(sim.state,e);sim.events.push(e);}}catch(e){emergency('runner_crash',String(e));return;}
      onProgress(msg);child.postMessage({type:'ack',runId:req.runId,sequence});
    }else if(msg.type==='result')end(msg.run);
    else if(msg.type==='error')emergency(cancelled?'cancelled':'runner_crash',String(msg.message));
  });
  child.on('exit',code=>{if(!finished)emergency(cancelled?'cancelled':'runner_crash',`运行器退出 ${code}`);});
  return {promise,cancel:()=>{if(finished)return;cancelled=true;child.postMessage({type:'cancel',runId:req.runId});killTimer??=setTimeout(()=>emergency('cancelled','用户中止农场执行'),1000);}};
}

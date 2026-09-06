import {utilityProcess,type UtilityProcess} from 'electron';
import path from 'node:path';
import {copyState,VERSION,type Request,type Progress,type Event,type Reason,type Run} from '../../../../packages/protocol';
import {makeRun,applyEvent} from '../../../../packages/recording';
import {Simulation,violations} from '../../../../packages/simulation';
export function launchRun(req:Request,workerPath:string,onProgress:(p:Progress)=>void,manualAck=false){
  const child:UtilityProcess=utilityProcess.fork(workerPath,[],{serviceName:'FARM100 isolated runner',stdio:'pipe'});
  const events:Event[]=[];let sequence=0,finished=false,cancelRequested=false,forceTimer:NodeJS.Timeout|undefined;
  const begin=performance.now();let resolve!:(r:Run)=>void;let state=new Simulation(req.config).initial;
  const promise=new Promise<Run>(r=>resolve=r);
  const end=(run:Run)=>{if(finished)return;finished=true;clearTimeout(hardTimer);clearTimeout(forceTimer);child.kill();resolve(run);};
  const emergency=(reason:Reason,message:string)=>end(makeRun(req,events,{reason,message,state:copyState(state),violations:violations(state.grid,req.config.size),elapsedMs:performance.now()-begin},[],false,false));
  const hardTimer=setTimeout(()=>emergency('wall_timeout','Host terminated runner after hard deadline'),35000);
  child.on('spawn',()=>child.postMessage({type:'start',request:req}));
  child.on('message',(msg)=>{
    if(finished||!msg||msg.protocolVersion!==VERSION||msg.runId!==req.runId)return;
    if(msg.type==='ready'&&msg.sequence===0){onProgress(msg);return;}
    if(msg.sequence!==sequence+1){emergency('runner_crash','Message sequence mismatch');return;}
    sequence=msg.sequence;
    if(msg.type==='events'){
      if(!Array.isArray(msg.events)||msg.events.length>256){emergency('runner_crash','Invalid batch');return;}
      for(const event of msg.events){if(event.seq!==events.length+1){emergency('runner_crash','Event sequence mismatch');return;}events.push(event);state=applyEvent(state,event);}
      onProgress(msg);if(!manualAck)child.postMessage({type:'ack',runId:req.runId,sequence});
    }else if(msg.type==='result'){end(msg.run);}
    else if(msg.type==='error')emergency(cancelRequested?'cancelled':'runner_crash',String(msg.message));
  });
  child.on('exit',(code)=>{if(!finished)emergency(cancelRequested?'cancelled':'runner_crash','Runner exited: '+code);});
  return {promise,ack:(seq:number)=>{if(!finished&&seq===sequence)child.postMessage({type:'ack',runId:req.runId,sequence:seq});},
    cancel:()=>{if(finished)return;cancelRequested=true;child.postMessage({type:'cancel',runId:req.runId});forceTimer=setTimeout(()=>emergency('cancelled','Host terminated user-cancelled runner'),1000);},
    get pid(){return child.pid;}};
}

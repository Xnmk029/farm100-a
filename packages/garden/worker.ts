import {executeGarden} from './runner';
import {GARDEN_VERSION,type GardenRequest,type GardenEvent} from './core';
const port=(process as any).parentPort;
let started=false,cancelled=false,currentId='',sequence=0,ack:(()=>void)|undefined;
port.on('message',async({data:msg}:any)=>{
  if(msg.type==='cancel'&&msg.runId===currentId){cancelled=true;return;}
  if(msg.type==='ack'&&msg.runId===currentId&&msg.sequence===sequence){ack?.();ack=undefined;return;}
  if(msg.type!=='start'||started)return;started=true;
  const req=msg.request as GardenRequest;currentId=req.runId;
  try{
    port.postMessage({version:GARDEN_VERSION,type:'ready',runId:currentId,sequence:0});
    const options={cancelled:()=>cancelled,onBatch:(events:GardenEvent[])=>new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>{ack=undefined;reject(Error('农场事件确认超时'));},10000);
      ack=()=>{clearTimeout(timer);resolve();};
      port.postMessage({version:GARDEN_VERSION,type:'events',runId:currentId,sequence:++sequence,events});
    })};
    const run=msg.stream?await executeGarden(req,{...options,stream:true}):await executeGarden(req,options);
    port.postMessage({version:GARDEN_VERSION,type:'result',runId:currentId,sequence:++sequence,run});
  }catch(e){port.postMessage({version:GARDEN_VERSION,type:'error',runId:currentId,sequence:++sequence,message:String(e)});}
});

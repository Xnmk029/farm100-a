import {execute} from './index';
import {RequestSchema,VERSION,type Request} from '../protocol';
const port=(process as unknown as {parentPort:{on:(e:string,fn:(event:{data:unknown})=>void)=>void;postMessage:(data:unknown)=>void}}).parentPort;
let cancelled=false,started=false,sequence=0;let ack:(()=>void)|undefined;let currentId='';
port.on('message',async({data})=>{
  const msg=data as {type:string;runId:string;sequence:number;request:Request};
  if(msg.type==='ack'&&msg.runId===currentId&&msg.sequence===sequence){ack?.();ack=undefined;return;}
  if(msg.type==='cancel'&&msg.runId===currentId){cancelled=true;ack?.();ack=undefined;return;}
  if(msg.type!=='start'||started)return;
  started=true;
  try{
    const request=RequestSchema.parse(msg.request);currentId=request.runId;
    port.postMessage({protocolVersion:VERSION,type:'ready',runId:currentId,sequence:0});
    const run=await execute(request,{cancelled:()=>cancelled,onBatch:events=>new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>{ack=undefined;reject(Error('Event consumer acknowledgement timeout'));},10000);
      ack=()=>{clearTimeout(timer);resolve();};
      port.postMessage({protocolVersion:VERSION,type:'events',runId:currentId,sequence:++sequence,events});
    })});
    port.postMessage({protocolVersion:VERSION,type:'result',runId:currentId,sequence:++sequence,run});
  }catch(e){port.postMessage({protocolVersion:VERSION,type:'error',runId:currentId,sequence:++sequence,message:String(e)});}
});

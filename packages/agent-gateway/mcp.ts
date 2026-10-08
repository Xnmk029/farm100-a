import {Gateway,instructions,GATEWAY_VERSION} from './gateway';

// Dependency-free MCP stdio transport. One UTF-8 JSON-RPC message per line.
// No HTTP listener, credentials, telemetry, or model-provider dependency.
const string={type:'string'};
const object=(properties:Record<string,unknown>,required:string[])=>({type:'object',properties,required,additionalProperties:false});
const session={sessionId:{...string,description:'The saved session UUID returned by farm100_start.'}};
const tools=[
 {name:'farm100_start',description:'Start FARM100 using this Agent as the participant. Save sessionId, then follow next/submit/status until complete and export. Identity is self-declared, never inferred. Omit tasks for the full 31 tasks and 93 cases.',inputSchema:object({agent:{...string,description:'Agent application/name; required'},model:{...string,description:'Exact model only if known; otherwise omit'},reasoning:string,tasks:{type:'array',items:string,description:'Optional practice subset; excluded from full-suite completion'}},['agent'])},
 {name:'farm100_next',description:'Get the pending question or the only permitted revision. Repeated calls return the same ticket. Never inspect repository solutions. Returns complete when done.',inputSchema:object(session,['sessionId'])},
 {name:'farm100_submit',description:'Submit raw JSON text with string fields source,strategy,correctness,complexity,boundaries. Receipt is durable; grading runs in a background sandbox worker. Invalid JSON consumes this attempt. Retry the same ticket with identical text safely; never change a submitted answer.',inputSchema:object({...session,ticketId:string,submission:{...string,description:'Raw JSON answer text, up to 256 KiB; source is synchronous JavaScript.'}},['sessionId','ticketId','submission'])},
 {name:'farm100_status',description:'Poll grading (about every 5 seconds), inspect allowed feedback and completion. If workerAlive=false with a pending job, call resume. No model calls are made.',inputSchema:object(session,['sessionId'])},
 {name:'farm100_resume',description:'Resume grading the exact already-submitted answer after an interruption/infrastructure error; does not grant another attempt.',inputSchema:object(session,['sessionId'])},
 {name:'farm100_export',description:'Revalidate and export scores, raw evidence and replay records. Call after next returns complete. Design review remains separate; partial coverage is not a completed benchmark.',inputSchema:object(session,['sessionId'])},
];

export async function serve(gateway:Gateway){
 let initialized=false;
 const send=(x:unknown)=>process.stdout.write(JSON.stringify(x)+'\n');
 async function dispatch(m:any){
  const id=m?.id;
  const error=(code:number,message:string)=>send({jsonrpc:'2.0',id:id??null,error:{code,message}});
  if(m?.jsonrpc!=='2.0'||typeof m.method!=='string'||(id!==undefined&&typeof id!=='string'&&typeof id!=='number')){error(-32600,'Invalid Request');return;}
  if(id===undefined){return;} // initialized/cancelled notifications have no response.
  try{
   let result:unknown;
   if(m.method==='initialize'){
    const versions=['2024-11-05','2025-03-26','2025-06-18','2025-11-25'];
    const requested=m.params?.protocolVersion;
    result={protocolVersion:versions.includes(requested)?requested:'2025-11-25',capabilities:{tools:{},prompts:{}},serverInfo:{name:'farm100',version:'1.0.0'},instructions};initialized=true;
   }else if(m.method==='ping')result={};
   else if(!initialized){error(-32000,'Initialize first');return;}
   else if(m.method==='tools/list')result={tools};
   else if(m.method==='prompts/list')result={prompts:[{name:'farm100_test',description:'Use this Agent to complete FARM100, resume safely, then export evidence.'}]};
   else if(m.method==='prompts/get'){
    if(m.params?.name!=='farm100_test'){error(-32602,'Unknown prompt');return;}
    result={description:GATEWAY_VERSION,messages:[{role:'user',content:{type:'text',text:instructions}}]};
   }else if(m.method==='tools/call'){
    const name=m.params?.name,tool=tools.find(t=>t.name===name),a=m.params?.arguments??{};
    if(!tool){error(-32602,'Unknown tool');return;}
    const schema=tool.inputSchema;
    if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!(k in schema.properties))||schema.required.some(k=>!(k in a))||Object.entries(a).some(([k,v])=>k==='tasks'?(!Array.isArray(v)||v.some(x=>typeof x!=='string')):typeof v!=='string')){error(-32602,'Invalid tool arguments');return;}
    try{
     let value:unknown;
     switch(name){
      case 'farm100_start':value=await gateway.start(a);break;
      case 'farm100_next':value=await gateway.next(a.sessionId);break;
      case 'farm100_submit':value=await gateway.submit(a.sessionId,a.ticketId,a.submission);break;
      case 'farm100_status':value=await gateway.status(a.sessionId);break;
      case 'farm100_resume':value=await gateway.resume(a.sessionId);break;
      case 'farm100_export':value=await gateway.export(a.sessionId);break;
     }
     result={content:[{type:'text',text:JSON.stringify(value)}]};
    }catch(e){result={isError:true,content:[{type:'text',text:String(e)}]};}
   }else{error(-32601,'Method not found');return;}
   send({jsonrpc:'2.0',id,result});
  }catch(e){error(-32603,String(e));}
 }
 let buffer='',queue=Promise.resolve();
 process.stdin.setEncoding('utf8');
 process.stdin.on('data',(chunk:string)=>{
  buffer+=chunk;
  if(Buffer.byteLength(buffer)>1024*1024){process.stderr.write('MCP input exceeds 1 MiB\n');process.exitCode=1;process.stdin.destroy();return;}
  let index:number;
  while((index=buffer.indexOf('\n'))>=0){
   const line=buffer.slice(0,index);buffer=buffer.slice(index+1);if(!line.trim())continue;
   queue=queue.then(async()=>{let m:unknown;try{m=JSON.parse(line);}catch{send({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}});return;}await dispatch(m);});
  }
 });
 await new Promise<void>(resolve=>{process.stdin.once('end',resolve);process.stdin.once('close',resolve);});
 await queue;
}

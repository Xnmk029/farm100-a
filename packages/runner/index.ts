import {newAsyncContext,type QuickJSHandle} from 'quickjs-emscripten';
import {RequestSchema,COST,directions,type Request,type Event,type Reason,type Run} from '../protocol';
import {Simulation,Stop,violations} from '../simulation';
import {makeRun} from '../recording';
export type Limits={memoryBytes?:number;wallMs?:number;maxEvents?:number;logBytes?:number;cancelled?:()=>boolean;onBatch?:(events:Event[])=>Promise<void>};
export async function execute(input:Request,limits:Limits={}):Promise<Run>{
  const req=RequestSchema.parse(input);
  if(Buffer.byteLength(req.source)>1_048_576)throw Error('Code exceeds 1 MiB');
  const started=performance.now();const events:Event[]=[];let pending:Event[]=[];
  const logs:string[]=[];let logBytes=0,logsTruncated=false;let terminal:{reason:Reason;message:string}|undefined;
  let diagnosing=false,diagnosticDeadline=0;
  const sim=new Simulation(req.config,e=>{events.push(e);pending.push(e);});
  const vm=await newAsyncContext();
  const runtime=vm.runtime;
  runtime.setMemoryLimit(limits.memoryBytes??128*1024*1024);runtime.setMaxStackSize(512*1024);
  const deadline=performance.now()+(limits.wallMs??30000);
  runtime.setInterruptHandler(()=>{
    if(diagnosing)return performance.now()>diagnosticDeadline;
    if(terminal)return true;
    if(limits.cancelled?.()){terminal={reason:'cancelled',message:'User cancelled'};return true;}
    if(performance.now()>deadline){terminal={reason:'wall_timeout',message:'VM wall-clock limit'};return true;}
    return false;
  });
  runtime.setModuleLoader(()=>{throw Error('Module loading is disabled');});
  const flush=async()=>{if(pending.length){const batch=pending;pending=[];await limits.onBatch?.(batch);}};
  const valueHandle=(value:unknown):QuickJSHandle=>{
    if(value===null)return vm.null;
    if(typeof value==='boolean')return value?vm.true:vm.false;
    if(typeof value==='number')return vm.newNumber(value);
    const h=vm.newObject();for(const [k,v]of Object.entries(value as object)){const n=vm.newNumber(v);vm.setProp(h,k,n);n.dispose();}return h;
  };
  // Locked guest-only box permits asyncified error inspection without synchronous getter calls.
  const diagnosticResult=vm.evalCode(`(() => {
    const stringify=JSON.stringify, box=Object.create(null);
    Object.defineProperties(box,{
      error:{value:null,writable:true},
      read:{value:() => { const e=box.error; const n=e?.name,m=e?.message;
        return stringify({name:typeof n==='string'?n:'Error',message:typeof m==='string'?m:'Script threw a value'}); }}
    });
    Object.preventExtensions(box);Object.defineProperty(globalThis,'__farmDiagnostic',{value:box});return box;
  })()`);
  const diagnostic=vm.unwrapResult(diagnosticResult);
  try{
    for(const action of Object.keys(COST) as (keyof typeof COST)[]){
      const fn=vm.newAsyncifiedFunction(action,async(...handles)=>{
        if(terminal)throw Error('Run has terminated');
        if(events.length >= (limits.maxEvents??250000)){terminal={reason:'recording_limit',message:'Event count limit'};throw Error(terminal.message);}
        try{
          const args=handles.map(h=>{const type=vm.typeof(h);if(type==='string')return vm.getString(h);if(type==='undefined')return undefined;return null;});
          const v=sim.act(action,args);
          if(pending.length>=256)return flush().then(()=>valueHandle(v));
          return valueHandle(v);
        }catch(e){
          if(e instanceof Stop){terminal={reason:e.reason,message:e.message};throw Error(e.message);}
          throw e;
        }
      });vm.setProp(vm.global,action,fn);fn.dispose();
    }
    for(const d of Object.keys(directions)){const h=vm.newString(d);vm.setProp(vm.global,d,h);h.dispose();}
    const consoleHandle=vm.newObject();
    const log=vm.newFunction('log',(...args)=>{
      if(logsTruncated)return;
      const text=args.map(h=>{const t=vm.typeof(h);return t==='string'?vm.getString(h).slice(0,2048):t==='number'?String(vm.getNumber(h)):'['+t+']';}).join(' ').slice(0,4096);
      const size=Buffer.byteLength(text)+1;
      if(logBytes+size>(limits.logBytes??262144)){logsTruncated=true;return;}
      logs.push(text);logBytes+=size;
    });vm.setProp(consoleHandle,'log',log);vm.setProp(vm.global,'console',consoleHandle);log.dispose();consoleHandle.dispose();
    const setup=vm.evalCode('delete globalThis.Date; Math.random = undefined; Object.freeze(Math);');
    setup.dispose();
    const result=await vm.evalCodeAsync(req.source,'solution.js',{type:'global'});
    if(result.error){
      // Accessors may execute code: inspect only through the async VM, with APIs already locked.
      if(!terminal){
        terminal={reason:'runtime_error',message:'Script threw an exception'};
        let name='Error',message='Script threw a value';
        diagnosing=true;diagnosticDeadline=performance.now()+100;
        try{
          vm.setProp(diagnostic,'error',result.error);
          const details=await vm.evalCodeAsync('__farmDiagnostic.read()','diagnostic.js',{type:'global'});
          if(details.error)details.error.dispose();
          else {if(vm.typeof(details.value)==='string'){const data=JSON.parse(vm.getString(details.value));name=String(data.name).slice(0,100);message=String(data.message).slice(0,4000);}details.value.dispose();}
        }catch{}finally{diagnosing=false;}
        const reason:Reason=/out of memory|allocation/i.test(message)?'memory_limit':name==='SyntaxError'?'syntax_error':'runtime_error';
        terminal={reason,message:name+': '+message};
      }result.error.dispose();
    }else result.value.dispose();
  }catch(e){terminal??={reason:'runtime_error',message:String(e).slice(0,4000)};}
  finally{diagnostic.dispose();vm.dispose();}
  await flush();
  const outcome=terminal??{reason:'incomplete' as const,message:'Program ended before successful harvest'};
  return makeRun(req,events,{...outcome,state:sim.state,violations:violations(sim.state.grid,req.config.size),elapsedMs:Math.round(performance.now()-started)},logs,logsTruncated);
}

import {createHash} from 'node:crypto';
import {canonical,VERSION,ConfigSchema,RequestSchema,copyState,type Run,type State,type Event,type Request,type Result,type Snapshot} from '../protocol';
import {Simulation,Stop,violations} from '../simulation';
export const sha=(x:unknown)=>createHash('sha256').update(typeof x==='string'?x:canonical(x)).digest('hex');
export const configFingerprint=(config:Run['config'])=>sha({config,initial:new Simulation(config).initial.grid,engine:VERSION,prng:'mulberry32-v1'});
import {applyEvent} from './replay';
export {applyEvent,stateAt,sequenceAtCost} from './replay';
export const logicalHash=(run:Pick<Run,'initial'|'events'|'result'>)=>sha({initial:run.initial,events:run.events,state:run.result.state,reason:run.result.reason});
export function makeRun(req:Request,events:Event[],result:Result,logs:string[]=[],logsTruncated=false,complete=true):Run{
  const initial=new Simulation(req.config).initial;let s=copyState(initial);
  const snapshots:Snapshot[]=[{seq:0,state:copyState(s)}];
  for(const e of events){s=applyEvent(s,e);if(e.seq%256===0)snapshots.push({seq:e.seq,state:copyState(s)});}
  if(snapshots.at(-1)!.seq!==events.length)snapshots.push({seq:events.length,state:copyState(s)});
  const run:Run={format:'farm100-run',version:VERSION,runId:req.runId,createdAt:new Date().toISOString(),
    engineVersion:VERSION,runtimeVersion:'quickjs-emscripten@0.32.0',prngVersion:'mulberry32-v1',
    config:req.config,source:req.source,sourceHash:sha(req.source),configHash:configFingerprint(req.config),
    label:req.label,attempt:req.attempt,generation:req.generation,initial,events,snapshots,result,logs,logsTruncated,complete,logicalHash:''};
  run.logicalHash=logicalHash(run);return run;
}
export function validateRun(input:unknown):Run{
  if(!input||typeof input!=='object')throw Error('Invalid run document');
  const r=input as Run;
  if(r.format!=='farm100-run'||r.version!==VERSION||r.engineVersion!==VERSION||r.prngVersion!=='mulberry32-v1')throw Error('Unsupported run version');
  ConfigSchema.parse(r.config);
  RequestSchema.parse({protocolVersion:VERSION,runId:r.runId,source:r.source,config:r.config,label:r.label,attempt:r.attempt,generation:r.generation});
  if(r.runtimeVersion!=='quickjs-emscripten@0.32.0')throw Error('Unsupported runtime version');
  if(typeof r.source!=='string'||Buffer.byteLength(r.source)>1048576||typeof r.label!=='string'||r.label.length>120||!Number.isInteger(r.attempt)||r.attempt<1)throw Error('Invalid source or metadata');
  if(!Array.isArray(r.events)||r.events.length>1_000_000||!Array.isArray(r.snapshots)||r.snapshots.length>4000)throw Error('Invalid event/snapshot limit');
  if(!Array.isArray(r.logs)||r.logs.some(x=>typeof x!=='string')||Buffer.byteLength(r.logs.join('\n'))>262144)throw Error('Invalid logs');
  const reasons=['succeeded','incomplete','budget_exceeded','api_error','syntax_error','runtime_error','memory_limit','wall_timeout','recording_limit','cancelled','runner_crash'];
  if(!r.result||!reasons.includes(r.result.reason)||typeof r.result.message!=='string'||!Number.isFinite(r.result.elapsedMs))throw Error('Invalid result');
  if(r.sourceHash!==sha(r.source)||r.configHash!==configFingerprint(r.config))throw Error('Input checksum mismatch');
  let observed:Event|undefined;const sim=new Simulation(r.config,e=>{observed=e;});
  if(canonical(sim.initial)!==canonical(r.initial))throw Error('Initial state mismatch');
  const snapshotMap=new Map(r.snapshots.map(s=>[s.seq,s.state]));
  if(snapshotMap.size!==r.snapshots.length||canonical(snapshotMap.get(0))!==canonical(sim.initial))throw Error('Invalid initial snapshot');
  for(const e of r.events){
    observed=undefined;
    if(!Array.isArray(e.args))throw Error('Invalid action arguments');
    try{sim.act(e.action,e.args);}catch(error){if(!(error instanceof Stop&&error.reason==='succeeded'))throw Error('Invalid replay action');}
    if(!observed||canonical(e)!==canonical(observed))throw Error('Event replay mismatch at '+e.seq);
    if(snapshotMap.has(e.seq)&&canonical(snapshotMap.get(e.seq))!==canonical(sim.state))throw Error('Snapshot mismatch');
  }
  if(r.snapshots.some(s=>!Number.isInteger(s.seq)||s.seq<0||s.seq>r.events.length))throw Error('Invalid snapshot sequence');
  if(canonical(sim.state)!==canonical(r.result.state)||r.result.violations!==violations(sim.state.grid,r.config.size))throw Error('Final state mismatch');
  if((r.result.reason==='succeeded')!==sim.state.harvested)throw Error('Success state mismatch');
  if(r.logicalHash!==logicalHash(r))throw Error('Logical checksum mismatch');
  return r;
}

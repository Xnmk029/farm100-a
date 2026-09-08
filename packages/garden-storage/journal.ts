import {open,mkdir,readFile,readdir,rename,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {canonical} from '../protocol';
import {Garden,copyGarden,applyGardenEvent,gardenRun,validateGardenRun,type GardenRequest,type GardenRun,type GardenState,type GardenEvent} from '../garden/core';
import type {HistoryEntry,HistoryQuery,HistoryPage} from './types';

const FORMAT='farm100-journal-v1',ZERO='0'.repeat(64);
const digest=(v:unknown)=>createHash('sha256').update(canonical(JSON.parse(JSON.stringify(v)))).digest('hex');
const uuid=(v:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const name=(n:number)=>String(n).padStart(8,'0')+'.json';
type Header={format:typeof FORMAT;request:GardenRequest;initial:GardenState;startedAt:string;hash:string};
type Chunk={index:number;previous:string;before:GardenState;events:GardenEvent[];hash:string};
type Entry={index:number;first:number;last:number;fromTick:number;tick:number;hash:string};
type Terminal={hash:string;events:number;result:GardenRun['result'];logs:string[];complete:boolean};
export async function durableJSON(file:string,value:unknown){
  await mkdir(path.dirname(file),{recursive:true});const tmp=file+'.tmp-'+randomUUID();
  const h=await open(tmp,'wx');try{await h.writeFile(JSON.stringify(value),'utf8');await h.sync();}finally{await h.close();}
  await rename(tmp,file);
}
async function json(file:string,max=16*1024*1024){if((await stat(file)).size>max)throw Error('记录片段超出大小限制');return JSON.parse(await readFile(file,'utf8'));}
export class GardenJournal{
  private entries:Entry[]=[];private state:GardenState;private count=0;private hash=ZERO;private closed=false;
  private constructor(readonly dir:string,readonly header:Header){this.state=copyGarden(header.initial);}
  static async create(root:string,request:GardenRequest){
    if(!uuid(request.runId))throw Error('无效记录编号');
    const sim=new Garden(request.config,request.initial),initial=copyGarden(sim.initial);
    const body={format:FORMAT,request:{...request,initial:undefined},initial,startedAt:new Date().toISOString()};
    const header={...body,hash:digest(body)} as Header,dir=path.join(root,request.runId);
    await mkdir(root,{recursive:true});await mkdir(dir);await mkdir(path.join(dir,'chunks'));
    const journal=new GardenJournal(dir,header);await durableJSON(path.join(dir,'header.json'),header);await journal.index();return journal;
  }
  private summary(status:HistoryEntry['status'],terminal?:Terminal):HistoryEntry{
    const r=this.header.request;return {id:r.runId,startedAt:this.header.startedAt,title:r.source.split('\n')[0].replace(/^\/\/\s*/, '').slice(0,140)||'未命名程序',version:r.config.rule??'garden-v0.2.0',challenge:r.config.challenge,size:r.config.size,drones:r.config.drones??1,events:this.count,tick:this.state.tick,cost:this.state.cost,status,reason:terminal?.result.reason,message:terminal?.result.message};
  }
  private async index(){
    await durableJSON(path.join(this.dir,'index.json'),{format:FORMAT,header:this.header.hash,entries:this.entries});
    await durableJSON(path.join(this.dir,'summary.json'),this.summary('recording'));
  }
  async append(events:GardenEvent[]){
    if(this.closed||!events.length||events.length>64)throw Error('记录批次无效');
    let next=copyGarden(this.state);for(let i=0;i<events.length;i++){const e=events[i];if(e.seq!==this.count+i+1||e.tick<next.tick)throw Error('记录事件不连续');next=applyGardenEvent(next,e);}
    const body={index:this.entries.length,previous:this.hash,before:this.state,events},chunk:Chunk={...body,hash:digest(body)};
    // An immutable, flushed chunk is the durable commit. The replaceable index is a cache.
    await durableJSON(path.join(this.dir,'chunks',name(chunk.index)),chunk);
    this.hash=chunk.hash;this.count+=events.length;this.state=next;
    this.entries.push({index:chunk.index,first:events[0].seq,last:this.count,fromTick:chunk.before.tick,tick:next.tick,hash:chunk.hash});
    await this.index();
  }
  async finish(run:GardenRun){
    if(this.closed||run.runId!==this.header.request.runId||run.events.length!==this.count||canonical(run.initial)!==canonical(this.header.initial)||canonical(run.result.state)!==canonical(this.state))throw Error('记录结束状态与已落盘事件不一致');
    const terminal:Terminal={hash:this.hash,events:this.count,result:run.result,logs:run.logs,complete:run.complete};
    await durableJSON(path.join(this.dir,'end.json'),terminal);this.closed=true;
    await durableJSON(path.join(this.dir,'summary.json'),this.summary(run.complete?'finished':'interrupted',terminal));
  }
}

export class GardenHistory{
  constructor(readonly root:string,readonly legacyRoot?:string){}
  private dir(id:string){if(!uuid(id))throw Error('无效记录编号');return path.join(this.root,id);}
  async list(query:HistoryQuery={},activeId?:string):Promise<HistoryPage>{
    const offset=Math.max(0,Math.floor(query.offset??0)),limit=Math.max(1,Math.min(50,Math.floor(query.limit??20))),needle=(query.query??'').trim().toLowerCase();
    let dirs:string[]=[];try{dirs=(await readdir(this.root,{withFileTypes:true})).filter(d=>d.isDirectory()&&uuid(d.name)).map(d=>d.name);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    const rows:HistoryEntry[]=[];
    for(let i=0;i<dirs.length;i+=16){const batch=await Promise.allSettled(dirs.slice(i,i+16).map(async id=>{const s=await json(path.join(this.dir(id),'summary.json'),65536) as HistoryEntry;if(s.id!==id)throw Error('记录索引编号不一致');if(s.status==='recording'&&id!==activeId)s.status='interrupted';return s;}));for(let j=0;j<batch.length;j++){const b=batch[j];if(b.status==='fulfilled')rows.push(b.value);else rows.push({id:dirs[i+j],startedAt:'',title:'记录索引不完整 · 尝试恢复',version:'unknown',size:0,drones:0,events:0,tick:0,cost:0,status:'damaged',message:String(b.reason)});}}
    if(this.legacyRoot){
      let files:string[]=[];try{files=await readdir(this.legacyRoot);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
      for(const file of files){const id=file.replace(/\.farmgarden$/,'');if(!file.endsWith('.farmgarden')||!uuid(id)||dirs.includes(id))continue;
        try{const r=await json(path.join(this.legacyRoot,file),64*1024*1024) as GardenRun;if(r.format!=='farm100-garden'||r.runId!==id)continue;
          rows.push({id,origin:'legacy',startedAt:(await stat(path.join(this.legacyRoot,file))).mtime.toISOString(),title:r.source.split('\n')[0].replace(/^\/\/\s*/,'').slice(0,140),version:r.version,challenge:r.config.challenge,size:r.config.size,drones:r.config.drones??1,events:r.events.length,tick:r.result.state.tick,cost:r.result.state.cost,status:r.complete?'legacy':'interrupted',reason:r.result.reason});
        }catch{rows.push({id,origin:'legacy',startedAt:'',title:'旧记录无法读取',version:'unknown',size:0,drones:0,events:0,tick:0,cost:0,status:'damaged'});}
      }
    }
    const filtered=rows.filter(r=>(!needle||[r.title,r.challenge,r.id,r.reason].join(' ').toLowerCase().includes(needle))&&(query.mode!=='farm'||!r.challenge)&&(query.mode!=='challenge'||!!r.challenge)&&(query.status!=='finished'||r.status==='finished'||r.status==='legacy')&&(query.status!=='interrupted'||['interrupted','damaged'].includes(r.status))).sort((a,b)=>b.startedAt.localeCompare(a.startedAt)||a.id.localeCompare(b.id));
    return {items:filtered.slice(offset,offset+limit),total:filtered.length,offset,limit};
  }
  async open(id:string,origin:'journal'|'legacy'='journal'){
    this.dir(id);if(origin==='journal')return this.recover(id);
    if(!this.legacyRoot)throw Error('未配置旧记录目录');const run=validateGardenRun(await json(path.join(this.legacyRoot,id+'.farmgarden'),64*1024*1024));if(run.runId!==id)throw Error('旧记录编号不一致');return {run,warning:'',chunks:0};
  }
  async recover(id:string):Promise<{run:GardenRun;warning:string;chunks:number}>{
    const dir=this.dir(id),header=await json(path.join(dir,'header.json'),2*1024*1024) as Header;
    const {hash:headerHash,...body}=header;if(header.format!==FORMAT||header.request.runId!==id||headerHash!==digest(body))throw Error('记录头损坏');
    const sim=new Garden(header.request.config,header.initial);if(canonical(sim.initial)!==canonical(header.initial))throw Error('记录初态无效');
    let hash=ZERO,index=0,warning='';const events:GardenEvent[]=[],rebuilt:Entry[]=[];
    const files=(await readdir(path.join(dir,'chunks'))).filter(f=>/^\d{8}\.json$/.test(f)).sort();
    for(const file of files){try{
      if(file!==name(index))throw Error('记录片段缺失');const chunk=await json(path.join(dir,'chunks',file)) as Chunk;
      const {hash:claimed,...payload}=chunk;if(chunk.index!==index||chunk.previous!==hash||digest(payload)!==claimed||canonical(chunk.before)!==canonical(sim.state)||!Array.isArray(chunk.events)||!chunk.events.length||chunk.events.length>64)throw Error('片段哈希或前态不一致');
      let state=sim.state;for(let i=0;i<chunk.events.length;i++){const e=chunk.events[i];if(e.seq!==events.length+i+1||e.tick<state.tick)throw Error('事件不连续');state=applyGardenEvent(state,e);}events.push(...chunk.events);sim.state=state;hash=claimed;rebuilt.push({index,first:chunk.events[0].seq,last:events.length,fromTick:chunk.before.tick,tick:state.tick,hash});index++;
    }catch(e){warning=`在第 ${index+1} 个片段停止恢复：${String(e)}`;break;}}
    sim.events=events;
    let terminal:Terminal|undefined;try{terminal=await json(path.join(dir,'end.json'));if(terminal!.hash!==hash||terminal!.events!==events.length||canonical(terminal!.result.state)!==canonical(sim.state))throw Error('终止记录与前缀不一致');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')warning||=String(e);terminal=undefined;}
    const complete=!!terminal&&!warning&&terminal.complete;
    const run=gardenRun(header.request,sim,terminal&&!warning?terminal.result.reason:'runner_crash',terminal&&!warning?terminal.result.message:'恢复最后完整持久化前缀；程序调用栈未恢复',terminal?.logs??[],complete);
    // Checksums detect damaged storage; only replay through the frozen rule engine authorizes use.
    validateGardenRun(run);
    try{
      await durableJSON(path.join(dir,'index.json'),{format:FORMAT,header:headerHash,entries:rebuilt});
      const summary:HistoryEntry={id,startedAt:header.startedAt,title:run.source.split('\n')[0].replace(/^\/\/\s*/,'').slice(0,140)||'未命名程序',version:run.version,challenge:run.config.challenge,size:run.config.size,drones:run.config.drones??1,events:events.length,tick:run.result.state.tick,cost:run.result.state.cost,status:warning?'damaged':run.complete?'finished':'interrupted',reason:run.result.reason,message:run.result.message};
      await durableJSON(path.join(dir,'summary.json'),summary);
    }catch(e){warning+=(warning?'；':'')+'世界已恢复，但索引无法更新：'+String(e);}
    return {run,warning:warning||(!terminal?'上次执行未正常结束，已恢复完整落盘事件。':''),chunks:index};
  }
  async frame(id:string,seq:number){
    if(!Number.isInteger(seq)||seq<0)throw Error('无效跳转位置');const dir=this.dir(id),header=await json(path.join(dir,'header.json'),2*1024*1024) as Header;
    const index=await json(path.join(dir,'index.json')) as {header:string;entries:Entry[]};
    if(index.header!==header.hash||!Array.isArray(index.entries))throw Error('跳转索引无效，请重新恢复');
    const n=Math.min(seq,index.entries.at(-1)?.last??0),entry=index.entries.find(e=>e.last>=n);
    if(!entry)return {seq:0,state:copyGarden(header.initial),events:[]};
    const chunk=await json(path.join(dir,'chunks',name(entry.index))) as Chunk,{hash,...payload}=chunk;
    if(hash!==entry.hash||digest(payload)!==hash||chunk.index!==entry.index||chunk.events[0]?.seq!==entry.first||chunk.events.at(-1)?.seq!==entry.last)throw Error('跳转片段损坏');
    let state=chunk.before;for(const e of chunk.events){if(e.seq>n)break;state=applyGardenEvent(state,e);}return {seq:n,state,events:chunk.events};
  }
}

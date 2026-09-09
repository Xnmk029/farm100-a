import {open,mkdir,readFile,readdir,rename,stat,rm,unlink} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {canonical} from '../protocol';
import {Garden,copyGarden,applyGardenEvent,gardenRun,validateGardenRun,type GardenRequest,type GardenRun,type GardenState,type GardenEvent} from '../garden/core';
import type {HistoryEntry,HistoryQuery,HistoryPage} from './types';
import {GARDEN_VERSION} from '../garden/core';
import {gardenReceipt,type GardenReceipt} from '../garden/stream';
import {GardenTraceVerifier} from '../garden/trace';

const FORMAT='farm100-journal-v1',ZERO='0'.repeat(64);
export const JOURNAL_MAX_EVENTS=400016,JOURNAL_MAX_BYTES=1024*1024*1024,JOURNAL_MAX_CHUNKS=16384;
const digest=(v:unknown)=>createHash('sha256').update(canonical(JSON.parse(JSON.stringify(v)))).digest('hex');
const uuid=(v:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const name=(n:number,gzip=false)=>String(n).padStart(8,'0')+(gzip?'.json.gz':'.json');
const validEncoding=(h:Header)=>h.compression===undefined||h.compression==='gzip';
const decodeChunk=(text:string)=>{if(typeof text!=='string'||text.length>24*1024*1024)throw Error('压缩片段长度无效');const data=Buffer.from(text,'base64');if(data.toString('base64')!==text)throw Error('压缩片段编码无效');return JSON.parse(gunzipSync(data,{maxOutputLength:16*1024*1024}).toString('utf8'));};
type Header={format:typeof FORMAT;compression?:'gzip';request:GardenRequest;initial:GardenState;startedAt:string;hash:string};
type Chunk={index:number;previous:string;before:GardenState;events:GardenEvent[];hash:string};
type Entry={index:number;first:number;last:number;fromTick:number;tick:number;hash:string};
type Terminal={hash:string;events:number;result:GardenRun['result'];logs:string[];complete:boolean};
async function durableBytes(file:string,value:string|Buffer){
  await mkdir(path.dirname(file),{recursive:true});const tmp=file+'.tmp-'+randomUUID();
  const h=await open(tmp,'wx');try{await h.writeFile(value);await h.sync();}finally{await h.close();}
  await rename(tmp,file);
}
export async function durableJSON(file:string,value:unknown){return durableBytes(file,JSON.stringify(value));}
async function json(file:string,max=16*1024*1024){if((await stat(file)).size>max)throw Error('记录片段超出大小限制');const raw=await readFile(file);return JSON.parse((file.endsWith('.gz')?gunzipSync(raw,{maxOutputLength:max}):raw).toString('utf8'));}
export class GardenJournal{
  private entries:Entry[]=[];private state:GardenState;private count=0;private hash=ZERO;private closed=false;private bytes=0;
  get metrics(){return {events:this.count,chunks:this.entries.length,bytes:this.bytes};}
  private constructor(readonly dir:string,readonly header:Header){this.state=copyGarden(header.initial);}
  static async create(root:string,request:GardenRequest){
    if(!uuid(request.runId))throw Error('无效记录编号');
    const sim=new Garden(request.config,request.initial),initial=copyGarden(sim.initial);
    const body={format:FORMAT,...(request.config.size>=16?{compression:'gzip' as const}:{}),request:{...request,initial:undefined},initial,startedAt:new Date().toISOString()};
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
    if(this.count+events.length>JOURNAL_MAX_EVENTS||this.entries.length>=JOURNAL_MAX_CHUNKS)throw Error('记录达到事件或片段总量上限');
    let next=copyGarden(this.state);for(let i=0;i<events.length;i++){const e=events[i];if(e.seq!==this.count+i+1||e.tick<next.tick)throw Error('记录事件不连续');next=applyGardenEvent(next,e);}
    const body={index:this.entries.length,previous:this.hash,before:this.state,events},chunk:Chunk={...body,hash:digest(body)};
    const raw=Buffer.from(JSON.stringify(chunk));if(raw.length>16*1024*1024)throw Error('记录片段达到大小上限');const data=this.header.compression?gzipSync(raw,{level:1}):raw,bytes=data.length;if(this.bytes+bytes>JOURNAL_MAX_BYTES)throw Error('记录达到磁盘配额上限');
    // An immutable, flushed chunk is the durable commit. The replaceable index is a cache.
    await durableBytes(path.join(this.dir,'chunks',name(chunk.index,!!this.header.compression)),data);
    this.hash=chunk.hash;this.count+=events.length;this.state=next;this.bytes+=bytes;
    this.entries.push({index:chunk.index,first:events[0].seq,last:this.count,fromTick:chunk.before.tick,tick:next.tick,hash:chunk.hash});
    if(this.entries.length%16===0)await this.index();else await durableJSON(path.join(this.dir,'summary.json'),this.summary('recording'));
  }
  async finish(run:GardenRun|GardenReceipt){
    const count=run.format==='farm100-garden-receipt'?run.eventCount:run.events.length;
    if(this.closed||run.runId!==this.header.request.runId||count!==this.count||canonical(run.initial)!==canonical(this.header.initial)||canonical(run.result.state)!==canonical(this.state))throw Error('记录结束状态与已落盘事件不一致');
    const terminal:Terminal={hash:this.hash,events:this.count,result:run.result,logs:run.logs,complete:run.complete};
    await durableJSON(path.join(this.dir,'end.json'),terminal);this.closed=true;
    await durableJSON(path.join(this.dir,'index.json'),{format:FORMAT,header:this.header.hash,entries:this.entries});
    await durableJSON(path.join(this.dir,'summary.json'),this.summary(run.complete?'finished':'interrupted',terminal));
  }
  descriptor(receipt:GardenReceipt){
    if(!this.closed||receipt.runId!==this.header.request.runId||receipt.eventCount!==this.count||canonical(receipt.result.state)!==canonical(this.state))throw Error('记录尚未完成提交');
    return {header:this.header,entries:this.entries.map(e=>({...e})),receipt};
  }
}

export class GardenHistory{
  private opened=new Map<string,{header:Header;entries:Entry[];receipt:GardenReceipt}>();
  constructor(readonly root:string,readonly legacyRoot?:string){}
  private dir(id:string){if(!uuid(id))throw Error('无效记录编号');return path.join(this.root,id);}
  adopt(journal:GardenJournal,receipt:GardenReceipt){
    if(path.resolve(journal.dir)!==path.resolve(this.dir(receipt.runId)))throw Error('运行不属于当前历史目录');
    const descriptor=journal.descriptor(receipt);
    if(this.opened.size>=4)this.opened.delete(this.opened.keys().next().value!);
    this.opened.set(receipt.runId,descriptor);
    return {receipt,warning:'',chunks:descriptor.entries.length};
  }
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
    const {hash:headerHash,...body}=header;if(!validEncoding(header)||header.format!==FORMAT||header.request.runId!==id||headerHash!==digest(body))throw Error('记录头损坏');
    const sim=new Garden(header.request.config,header.initial);if(canonical(sim.initial)!==canonical(header.initial))throw Error('记录初态无效');
    let hash=ZERO,index=0,warning='';const events:GardenEvent[]=[],rebuilt:Entry[]=[];
    const files=(await readdir(path.join(dir,'chunks'))).filter(f=>/^\d{8}\.json(?:\.gz)?$/.test(f)).sort();
    for(const file of files){try{
      if(file!==name(index,!!header.compression))throw Error('记录片段缺失');const chunk=await json(path.join(dir,'chunks',file)) as Chunk;
      const {hash:claimed,...payload}=chunk;if(chunk.index!==index||chunk.previous!==hash||digest(payload)!==claimed||canonical(chunk.before)!==canonical(sim.state)||!Array.isArray(chunk.events)||!chunk.events.length||chunk.events.length>64)throw Error('片段哈希或前态不一致');
      if(events.length+chunk.events.length>50000)throw Error('完整读取达到上限，请使用分页回放');
      let state=sim.state;for(let i=0;i<chunk.events.length;i++){const e=chunk.events[i];if(e.seq!==events.length+i+1||e.tick<state.tick)throw Error('事件不连续');state=applyGardenEvent(state,e);}events.push(...chunk.events);sim.state=state;hash=claimed;rebuilt.push({index,first:chunk.events[0].seq,last:events.length,fromTick:chunk.before.tick,tick:state.tick,hash});index++;
    }catch(e){if(e instanceof Error&&e.message.startsWith('完整读取达到上限'))throw e;warning=`在第 ${index+1} 个片段停止恢复：${String(e)}`;break;}}
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
  /** Sequential rule validation without retaining the full trace or snapshots. */
  async openPaged(id:string):Promise<{receipt:GardenReceipt;warning:string;chunks:number}>{
    this.opened.delete(id);
    const dir=this.dir(id),header=await json(path.join(dir,'header.json'),2*1024*1024) as Header;
    const {hash:headerHash,...body}=header;
    if(!validEncoding(header)||header.format!==FORMAT||header.request.runId!==id||headerHash!==digest(body)||header.request.config.rule!==GARDEN_VERSION)throw Error('记录头损坏或不支持分页的旧规则');
    const req={...header.request,initial:header.initial},verifier=new GardenTraceVerifier(req),entries:Entry[]=[];
    let hash=ZERO,warning='',bytes=0;
    const files=(await readdir(path.join(dir,'chunks'))).filter(f=>/^\d{8}\.json(?:\.gz)?$/.test(f)).sort();
    for(const file of files){try{
      const index=entries.length;if(index>=JOURNAL_MAX_CHUNKS)throw Error('记录片段超出配额');if(file!==name(index,!!header.compression))throw Error('记录片段缺失');
      bytes+=(await stat(path.join(dir,'chunks',file))).size;if(bytes>JOURNAL_MAX_BYTES||verifier.eventCount>=JOURNAL_MAX_EVENTS)throw Error('记录超出配额');
      const chunk=await json(path.join(dir,'chunks',file)) as Chunk,{hash:claimed,...payload}=chunk;
      if(chunk.index!==index||chunk.previous!==hash||claimed!==digest(payload)||canonical(chunk.before)!==canonical(verifier.state))throw Error('片段哈希或前态不一致');
      if(!Array.isArray(chunk.events)||verifier.eventCount+chunk.events.length>JOURNAL_MAX_EVENTS)throw Error('记录超出事件配额');
      verifier.append(chunk.events);hash=claimed;
      entries.push({index,first:chunk.events[0].seq,last:verifier.eventCount,fromTick:chunk.before.tick,tick:verifier.state.tick,hash});
    }catch(e){warning=`在第 ${entries.length+1} 个片段停止恢复：${String(e)}`;break;}}
    const world={initial:header.initial,state:verifier.state};
    let receipt=gardenReceipt(header.request,world,verifier.eventCount,verifier.abortReason??'runner_crash','恢复最后完整持久化前缀；程序调用栈未恢复',[],false,verifier.peakBufferedEvents),terminal:Terminal|undefined;
    try{
      terminal=await json(path.join(dir,'end.json')) as Terminal;
      if(warning||terminal.hash!==hash||terminal.events!==verifier.eventCount)throw Error('终止记录与前缀不一致');
      const candidate={...receipt,result:terminal.result,logs:terminal.logs,complete:terminal.complete};verifier.finish(candidate);receipt=candidate;
    }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')warning||=String(e);terminal=undefined;}
    try{
      await durableJSON(path.join(dir,'index.json'),{format:FORMAT,header:headerHash,entries});
      const summary:HistoryEntry={id,startedAt:header.startedAt,title:receipt.source.split('\n')[0].replace(/^\/\/\s*/,'').slice(0,140)||'未命名程序',version:receipt.version,challenge:receipt.config.challenge,size:receipt.config.size,drones:receipt.config.drones??1,events:receipt.eventCount,tick:receipt.result.state.tick,cost:receipt.result.state.cost,status:warning?'damaged':receipt.complete?'finished':'interrupted',reason:receipt.result.reason,message:receipt.result.message};
      await durableJSON(path.join(dir,'summary.json'),summary);
    }catch(e){warning+=(warning?'；':'')+'世界已恢复，但索引无法更新：'+String(e);}
    // Bound opened descriptors; callers reopen an evicted history before seeking.
    if(this.opened.size>=4)this.opened.delete(this.opened.keys().next().value!);
    this.opened.set(id,{header,entries,receipt});return {receipt,warning:warning||(!terminal?'上次执行未正常结束，已恢复完整落盘事件。':''),chunks:entries.length};
  }
  async window(id:string,position:{seq:number}|{tick:number}){
    this.dir(id);const opened=this.opened.get(id);if(!opened)throw Error('请先校验并打开分页记录');
    const {header,entries,receipt}=opened,loaded=new Map<number,Chunk>();
    const read=async(i:number)=>{
      if(loaded.has(i))return loaded.get(i)!;const entry=entries[i],chunk=await json(path.join(this.dir(id),'chunks',name(i,!!header.compression))) as Chunk,{hash,...payload}=chunk;
      if(hash!==entry.hash||digest(payload)!==hash||chunk.index!==i||chunk.previous!==(i?entries[i-1].hash:ZERO)||chunk.events[0]?.seq!==entry.first||chunk.events.at(-1)?.seq!==entry.last)throw Error('分页片段已改变，请重新打开记录');loaded.set(i,chunk);return chunk;
    };
    const find=(test:(e:Entry)=>boolean)=>{let lo=0,hi=entries.length;while(lo<hi){const mid=(lo+hi)>>1;if(test(entries[mid]))hi=mid;else lo=mid+1;}return lo;};
    let seq:number;
    if('seq' in position){if(!Number.isSafeInteger(position.seq)||position.seq<0)throw Error('无效事件位置');seq=Math.min(position.seq,receipt.eventCount);}
    else{
      if(!Number.isFinite(position.tick)||position.tick<0)throw Error('无效播放时间');
      const i=find(e=>e.tick>position.tick);seq=i?entries[i-1].last:0;
      if(i<entries.length){const chunk=await read(i);for(const e of chunk.events){if(e.tick>position.tick)break;seq=e.seq;}}
    }
    const first=find(e=>e.last>=Math.max(1,seq-64)),last=find(e=>e.last>=Math.min(receipt.eventCount,seq+128));
    let before=copyGarden(header.initial),events:GardenEvent[]=[];
    if(first<entries.length){before=copyGarden((await read(first)).before);for(let i=first;i<=last&&i<entries.length;i++)events.push(...(await read(i)).events);}
    let state=copyGarden(before);for(const e of events){if(e.seq>seq)break;state=applyGardenEvent(state,e);}
    // Movements can complete beyond the adjacent window while other drones work.
    const future:GardenEvent[]=[];
    const movements=new Map<string,NonNullable<GardenState['fleet']>['pending'][number]>();
    for(const p of [...(state.fleet?.pending??[]),...(events.at(-1)?.fleet?.pending??[])])if(p.action==='move'&&p.end!==null)movements.set(`${p.actor}:${p.start}:${p.end}`,p);
    for(const p of movements.values()){
      let i=find(e=>e.tick>=p.end!);
      for(;i<entries.length&&entries[i].fromTick<=p.end!;i++){
        const found=(await read(i)).events.find(e=>e.seq>seq&&e.kind==='complete'&&e.actor===p.actor&&e.fromTick===p.start&&e.tick===p.end);
        if(found){future.push(found);break;}
      }
    }
    return {runId:id,seq,state,before,events,future,eventCount:receipt.eventCount};
  }
  hasOpened(id:string){return this.opened.has(id);}
  async exportPaged(id:string,file:string){
    if(!this.opened.has(id))await this.openPaged(id);const {header,entries,receipt}=this.opened.get(id)!;
    const tmp=file+'.tmp-'+randomUUID(),handle=await open(tmp,'wx');
    let written=false;try{
      await handle.writeFile(JSON.stringify({format:header.compression?'farm100-journal-export-v2':'farm100-journal-export-v1',header})+'\n');
      for(const entry of entries){
        const chunk=await json(path.join(this.dir(id),'chunks',name(entry.index,!!header.compression))) as Chunk,{hash,...payload}=chunk;
        if(hash!==entry.hash||digest(payload)!==hash)throw Error('导出期间片段已改变');
        await handle.writeFile(JSON.stringify(header.compression?{chunkGzip:gzipSync(Buffer.from(JSON.stringify(chunk)),{level:1}).toString('base64')}:{chunk})+'\n');
      }
      await handle.writeFile(JSON.stringify({receipt})+'\n');await handle.sync();written=true;
    }finally{await handle.close();if(!written)await unlink(tmp).catch(()=>{});}
    await rename(tmp,file);
  }
  async importPaged(file:string){
    if((await stat(file)).size>Math.ceil(JOURNAL_MAX_BYTES*4/3)+4*1024*1024)throw Error('导入记录超出配额');
    const id=randomUUID(),staging=path.join(this.root,'.imports',id);
    let archiveV2=false;
    let verifier:GardenTraceVerifier|undefined,journal:GardenJournal|undefined,header:Header|undefined,hash=ZERO,index=0,done=false,receipt:GardenReceipt|undefined;
    const line=async(text:string)=>{
      if(!text.length||Buffer.byteLength(text)>(archiveV2?24:16)*1024*1024+1024)throw Error('导入片段长度无效');
      const doc=JSON.parse(text);if(done)throw Error('终止记录后仍有数据');
      if(!header){
        header=doc.header;const {hash:claimed,...payload}=header!;
        archiveV2=doc.format==='farm100-journal-export-v2';
        if(!['farm100-journal-export-v1','farm100-journal-export-v2'].includes(doc.format)||!validEncoding(header!)||header!.format!==FORMAT||claimed!==digest(payload))throw Error('导入记录头无效');
        verifier=new GardenTraceVerifier({...header!.request,initial:header!.initial});
        journal=await GardenJournal.create(staging,{...header!.request,runId:id,initial:header!.initial});return;
      }
      if(archiveV2?doc.chunkGzip!==undefined:doc.chunk){
        const chunk=(archiveV2?decodeChunk(doc.chunkGzip):doc.chunk) as Chunk,{hash:claimed,...payload}=chunk;
        if(index>JOURNAL_MAX_EVENTS||chunk.index!==index||chunk.previous!==hash||claimed!==digest(payload)||canonical(chunk.before)!==canonical(verifier!.state))throw Error('导入片段无效');
        verifier!.append(chunk.events);await journal!.append(chunk.events);hash=claimed;index++;return;
      }
      verifier!.finish(doc.receipt);receipt={...doc.receipt,runId:id,peakBufferedEvents:verifier!.peakBufferedEvents};await journal!.finish(receipt!);done=true;
    };
    let pending='';try{
    for await(const block of createReadStream(file,{encoding:'utf8',highWaterMark:65536})){
      pending+=block;let end:number;while((end=pending.indexOf('\n'))!==-1){await line(pending.slice(0,end));pending=pending.slice(end+1);}
      if(Buffer.byteLength(pending)>(archiveV2?24:16)*1024*1024+1024)throw Error('导入片段超出限制');
    }
    if(pending.length)await line(pending);if(!done||!journal)throw Error('导入文件不完整');
    // Publish only the validated complete archive; failed staging is never listed as history.
    await rename(journal.dir,this.dir(id));
    if(this.opened.size>=4)this.opened.delete(this.opened.keys().next().value!);
    this.opened.set(id,journal.descriptor(receipt!));return {receipt:receipt!,warning:'',chunks:index};
    }finally{
      const resolved=path.resolve(staging),importsRoot=path.resolve(this.root,'.imports');
      if(path.dirname(resolved)!==importsRoot||path.basename(resolved)!==id)throw Error('导入临时目录范围无效');
      await rm(resolved,{recursive:true,force:true});
    }
  }
  async frame(id:string,seq:number){
    if(!Number.isInteger(seq)||seq<0)throw Error('无效跳转位置');const dir=this.dir(id),header=await json(path.join(dir,'header.json'),2*1024*1024) as Header;
    const index=await json(path.join(dir,'index.json')) as {header:string;entries:Entry[]};
    if(index.header!==header.hash||!Array.isArray(index.entries))throw Error('跳转索引无效，请重新恢复');
    const n=Math.min(seq,index.entries.at(-1)?.last??0),entry=index.entries.find(e=>e.last>=n);
    if(!entry)return {seq:0,state:copyGarden(header.initial),events:[]};
    const chunk=await json(path.join(dir,'chunks',name(entry.index,!!header.compression))) as Chunk,{hash,...payload}=chunk;
    if(hash!==entry.hash||digest(payload)!==hash||chunk.index!==entry.index||chunk.events[0]?.seq!==entry.first||chunk.events.at(-1)?.seq!==entry.last)throw Error('跳转片段损坏');
    let state=chunk.before;for(const e of chunk.events){if(e.seq>n)break;state=applyGardenEvent(state,e);}return {seq:n,state,events:chunk.events};
  }
}

import {useEffect,useRef,useState} from 'react';
import {applyGardenEvent,gardenAt,gardenSequence,type GardenRun,type GardenState,type GardenEvent} from '../../../../packages/garden/core';
import type {GardenReceipt} from '../../../../packages/garden/stream';
import type {GardenWindow} from '../../../../packages/garden-storage/types';
export type GardenReplay=GardenRun|GardenReceipt;
type Playback={seq:number;state?:GardenState;event?:GardenEvent;nextEvent?:GardenEvent;events:GardenEvent[];future?:GardenEvent[];loading:boolean;clock:number};
export function useGardenReplay(run:GardenReplay|null,tick:number,onError:(message:string)=>void):Playback{
  const [page,setPage]=useState<GardenWindow|null>(null),[pending,setPending]=useState(false),[failed,setFailed]=useState('');
  const current=useRef(run?.runId);current.current=run?.runId;
  const displayed=useRef<{id:string;seq:number;state:GardenState;event?:GardenEvent;nextEvent?:GardenEvent;events:GardenEvent[];future?:GardenEvent[];clock:number}|undefined>(undefined);
  const paged=run?.format==='farm100-garden-receipt',valid=page?.runId===run?.runId;
  const available=!!(paged&&valid&&page&&tick>=page.before.tick&&(page.events.at(-1)?.seq===page.eventCount||!page.eventCount||tick<(page.events.at(-1)?.tick??0)));
  useEffect(()=>{setFailed('');},[run?.runId]);
  useEffect(()=>{
    if(!paged||available||pending||failed===run.runId)return;
    const id=run.runId;setPending(true);
    void window.farm.gardenHistoryWindow({id,tick}).then(p=>{if(current.current===id)setPage(p);}).catch(e=>{if(current.current===id){setFailed(id);onError('回放读取失败：'+String(e));}}).finally(()=>setPending(false));
  },[run?.runId,paged,available,pending,tick,failed]);
  if(!run)return {seq:0,events:[],loading:false,clock:tick};
  if(run.format==='farm100-garden'){const seq=gardenSequence(run,tick);return {seq,state:gardenAt(run,seq),event:run.events[seq-1],nextEvent:run.events[seq],events:run.events,loading:false,clock:tick};}
  if(!available||!page){const previous=displayed.current;return previous?.id===run.runId?{...previous,loading:true}:{seq:0,state:run.initial,events:[],loading:true,clock:run.initial.tick};}
  let seq=(page.events[0]?.seq??1)-1;for(const e of page.events){if(e.tick>tick)break;seq=e.seq;}
  const previous=displayed.current,from=previous?.id===run.runId&&previous.seq<=seq&&previous.seq>=(page.events[0]?.seq??1)-1?previous:undefined;
  let state=from?.state??page.before;for(const e of page.events){if(e.seq>seq)break;if(e.seq>(from?.seq??0))state=applyGardenEvent(state,e);}
  const result={id:run.runId,seq,state,event:page.events.find(e=>e.seq===seq),nextEvent:page.events.find(e=>e.seq===seq+1),events:page.events,future:page.future,clock:tick};displayed.current=result;return {...result,loading:false};
}

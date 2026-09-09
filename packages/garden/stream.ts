import {copyGarden,type GardenEvent,type GardenRun,type GardenRequest,type GardenState,type GardenOutcome} from './core';

/** Kept separate from a full run: a receipt cannot masquerade as an empty replay. */
export type GardenReceipt=Omit<GardenRun,'format'|'events'|'snapshots'> & {format:'farm100-garden-receipt';eventCount:number;peakBufferedEvents:number};
export class EventBuffer extends Array<GardenEvent>{
  static get [Symbol.species](){return Array;}
  offset=0;peak=0;
  get total(){return this.offset+this.length;}
  push(...events:GardenEvent[]){for(const e of events){e.seq=this.total+1;super.push(e);}this.peak=Math.max(this.peak,this.length);return this.length;}
  release(n=this.length){if(!Number.isInteger(n)||n<0||n>this.length)throw Error('无效事件释放范围');super.splice(0,n);this.offset+=n;}
}
export function gardenReceipt(req:GardenRequest,world:{initial:GardenState;state:GardenState},count:number,reason:GardenOutcome,message:string,logs:string[]=[],complete=true,peakBufferedEvents=0):GardenReceipt{
  return {format:'farm100-garden-receipt',version:req.config.rule??'garden-v0.2.0',runId:req.runId,source:req.source,config:req.config,initial:copyGarden(world.initial),eventCount:count,peakBufferedEvents,result:{reason,message,state:copyGarden(world.state)},logs,complete};
}

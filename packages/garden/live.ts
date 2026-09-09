import {applyGardenEvent,copyGarden,type GardenEvent,type GardenState} from './core';

/** A bounded viewing window; the journal remains the complete record. */
export class LiveGardenWindow {
  before:GardenState;events:GardenEvent[]=[];count=0;peak=0;
  private displayed?:{seq:number;state:GardenState};
  constructor(initial:GardenState){this.before=copyGarden(initial);}
  get tick(){return this.events.at(-1)?.tick??this.before.tick;}
  append(batch:GardenEvent[]){
    if(!batch.length||batch.length>64||batch.some((e,i)=>e.seq!==this.count+i+1))throw Error('实时事件顺序无效');
    this.events.push(...batch);this.count+=batch.length;
    while(this.events.length>192)this.before=applyGardenEvent(this.before,this.events.shift()!);
    this.peak=Math.max(this.peak,this.events.length);
  }
  at(requested:number){
    const clock=Math.max(this.before.tick,Math.min(this.tick,requested));
    let seq=(this.events[0]?.seq??1)-1;for(const e of this.events){if(e.tick>clock)break;seq=e.seq;}
    const saved=this.displayed,usable=saved&&saved.seq<=seq&&saved.seq>=(this.events[0]?.seq??1)-1;
    let state=usable?saved.state:this.before;
    for(const e of this.events){if(e.seq>seq)break;if(e.seq>(usable?saved.seq:0))state=applyGardenEvent(state,e);}
    this.displayed={seq,state};
    return {seq,state,clock,event:this.events.find(e=>e.seq===seq),nextEvent:this.events.find(e=>e.seq===seq+1),events:this.events,future:undefined,loading:false};
  }
}

import type {GardenEvent} from '../garden/core';

export type SoundChannel='actions'|'harvest';
export type SoundCue={channel:SoundChannel;frequency:number;endFrequency:number;duration:number;gain:number;wave:OscillatorType;success:boolean};
/** Only completed, audible actions produce feedback. Legacy empty harvests return zero. */
export function soundForEvent(e:Pick<GardenEvent,'kind'|'action'|'value'>):SoundCue|null{
  if(e.kind&&e.kind!=='complete')return null;
  const pitches:Record<string,number>={move:100,till:65,plant:490,water:760,harvest:660,refill:240,fertilize:380,water_area:760,till_area:65,swap:330,repair:280,craft:220,harvest_area:660,clear:90,collect:880};
  if(!Object.hasOwn(pitches,e.action))return null;
  const harvesting=['harvest','harvest_area','collect'].includes(e.action),success=e.value!==false&&!(harvesting&&e.value===0);
  const reward=harvesting&&success,wet=['water','water_area','refill'].includes(e.action),frequency=success?pitches[e.action]:145;
  return {channel:reward?'harvest':'actions',frequency,endFrequency:frequency*(reward?1.5:.45),duration:reward?.32:wet?.2:.08,gain:e.action==='move'&&success?.10:.21,wave:['till','till_area','repair'].includes(e.action)?'triangle':'sine',success};
}

/** Separate real-time gates prevent fast playback and simultaneous drones flooding audio. */
export class SoundDensity {
  private last:Record<SoundChannel,number>={actions:-Infinity,harvest:-Infinity};
  accept(channel:SoundChannel,time:number){
    if(!Number.isFinite(time)||time-this.last[channel]<(channel==='harvest'?.14:.10))return false;
    this.last[channel]=time;return true;
  }
}

/** Original synthesized foley with independent environment, action and harvest buses. */
export class FarmAudio {
  private context:BaseAudioContext|undefined;
  private ambient:GainNode|undefined;
  private buses:Partial<Record<SoundChannel,GainNode>>={};
  private sources:AudioScheduledSourceNode[]=[];
  private levels={ambient:0,actions:0,harvest:0};
  private density=new SoundDensity();
  // Supplying an OfflineAudioContext lets QA render the exact synthesis code.
  constructor(private suppliedContext?:BaseAudioContext){}
  async enable(){
    this.context??=this.suppliedContext??new AudioContext();
    const c=this.context;if(c instanceof AudioContext)await c.resume();
    if(this.ambient)return;
    for(const channel of ['actions','harvest'] as const){const g=c.createGain();g.gain.value=this.levels[channel];g.connect(c.destination);this.buses[channel]=g;}
    const g=c.createGain();g.gain.value=this.levels.ambient*.7;g.connect(c.destination);this.ambient=g;
    const buffer=c.createBuffer(1,c.sampleRate*3,c.sampleRate),data=buffer.getChannelData(0);let seed=19,v=0;
    for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;v=.985*v+.015*(seed/0xffffffff*2-1);data[i]=v;}
    const wind=c.createBufferSource();wind.buffer=buffer;wind.loop=true;const low=c.createBiquadFilter();low.type='lowpass';low.frequency.value=900;wind.connect(low).connect(g);wind.start();this.sources.push(wind);
  }
  volume(ambient:number,actions:number,harvest:number){
    const clamp=(n:number)=>Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;
    this.levels={ambient:clamp(ambient),actions:clamp(actions),harvest:clamp(harvest)};
    if(!this.context)return;
    const set=(node:GainNode|undefined,value:number)=>node?.gain.setTargetAtTime(value,this.context!.currentTime,value===0?.008:.05);
    set(this.ambient,this.levels.ambient*.7);set(this.buses.actions,this.levels.actions);set(this.buses.harvest,this.levels.harvest);
  }
  event(e:Pick<GardenEvent,'kind'|'action'|'value'>):SoundCue|null{
    const c=this.context,cue=soundForEvent(e);
    if(!c||c.state==='closed'||(!this.suppliedContext&&c.state!=='running')||!cue||!this.levels[cue.channel]||!this.buses[cue.channel]||!this.density.accept(cue.channel,c.currentTime))return null;
    const o=c.createOscillator(),g=c.createGain(),now=c.currentTime;o.type=cue.wave;
    o.frequency.setValueAtTime(cue.frequency,now);o.frequency.exponentialRampToValueAtTime(cue.endFrequency,now+cue.duration);
    g.gain.setValueAtTime(0,now);g.gain.linearRampToValueAtTime(cue.gain,now+.008);g.gain.exponentialRampToValueAtTime(.0001,now+cue.duration);
    o.connect(g).connect(this.buses[cue.channel]!);o.start();o.stop(now+cue.duration+.02);o.onended=()=>{o.disconnect();g.disconnect();};return cue;
  }
  dispose(){
    this.sources.forEach(s=>s.stop());this.sources=[];
    if(this.context instanceof AudioContext)void this.context.close();
    this.context=undefined;this.ambient=undefined;this.buses={};this.density=new SoundDensity();
  }
}

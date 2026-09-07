import type {GardenEvent} from '../garden/core';

/** Event-synchronized synthesized foley. All sound is authored locally; no remote samples. */
export class FarmAudio {
  private context:AudioContext|undefined;
  private ambient:GainNode|undefined;
  private sources:AudioScheduledSourceNode[]=[];
  private last=0;
  private effects=.3;
  async enable(){
    this.context??=new AudioContext();await this.context.resume();
    if(this.ambient)return;
    const c=this.context,g=c.createGain();g.gain.value=0;g.connect(c.destination);this.ambient=g;
    const buffer=c.createBuffer(1,c.sampleRate*3,c.sampleRate),data=buffer.getChannelData(0);let seed=19,v=0;
    for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;v=.985*v+.015*(seed/0xffffffff*2-1);data[i]=v;}
    const wind=c.createBufferSource();wind.buffer=buffer;wind.loop=true;const low=c.createBiquadFilter();low.type='lowpass';low.frequency.value=900;wind.connect(low).connect(g);wind.start();this.sources.push(wind);
  }
  volume(ambient:number,effects:number){this.effects=effects;if(this.ambient&&this.context)this.ambient.gain.setTargetAtTime(ambient*.7,this.context.currentTime,.2);}
  event(e:GardenEvent){
    const c=this.context;if(!c||c.state!=='running'||this.effects===0||c.currentTime-this.last<.07)return;
    if(!['move','till','plant','water','harvest','refill'].includes(e.action))return;this.last=c.currentTime;
    const success=e.value!==false,freq=success?{move:100,till:65,plant:490,water:760,harvest:660,refill:240}[e.action as 'move']:145;
    const duration=e.action==='harvest'?.32:e.action==='water'?.2:.08;
    const o=c.createOscillator(),g=c.createGain();o.type=e.action==='water'?'sine':e.action==='till'?'triangle':'sine';
    o.frequency.setValueAtTime(freq,c.currentTime);o.frequency.exponentialRampToValueAtTime(freq*(e.action==='harvest'?1.5:.45),c.currentTime+duration);
    g.gain.setValueAtTime(0,c.currentTime);g.gain.linearRampToValueAtTime(this.effects*(e.action==='move'?.10:.21),c.currentTime+.008);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+duration);
    o.connect(g).connect(c.destination);o.start();o.stop(c.currentTime+duration+.02);o.onended=()=>{o.disconnect();g.disconnect();};
  }
  dispose(){this.sources.forEach(s=>s.stop());this.sources=[];void this.context?.close();this.context=undefined;this.ambient=undefined;}
}

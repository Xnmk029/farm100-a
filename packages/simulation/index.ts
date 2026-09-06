import { ConfigSchema,COST,directions,emptyCounts,copyState,type Config,type State,type Action,type Event,type Direction,type Reason } from '../protocol';

export class Stop extends Error { constructor(public reason:Reason,message:string=reason){super(message);} }
export function generate(c:Config):number[] {
  if(c.initial) return [...c.initial];
  let a=c.seed>>>0;
  return Array.from({length:c.size*c.size},()=>{
    a=(a+0x6d2b79f5)>>>0;
    let t=Math.imul(a^(a>>>15),1|a); t=(t+Math.imul(t^(t>>>7),61|t))^t;
    return Math.floor(((t^(t>>>14))>>>0)/4294967296*10);
  });
}
export function violations(grid:number[],size:number):number {
  let n=0;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=y*size+x;
    if(x+1<size && grid[i]>grid[i+1])n++;
    if(y+1<size && grid[i]>grid[i+size])n++;
  }return n;
}
export class Simulation {
  readonly config:Config; readonly initial:State; private current:State;
  private histogram:number[]; private seq=0;
  constructor(config:Config,private emit:(event:Event)=>void=()=>{}){
    this.config=ConfigSchema.parse(config);
    this.current={grid:generate(this.config),x:0,y:0,cost:0,counts:emptyCounts(),harvested:false};
    this.initial=copyState(this.current);
    this.histogram=this.hist(this.current.grid);
  }
  get state(){return copyState(this.current);}
  private hist(g:number[]){const h=Array(10).fill(0);for(const v of g)h[v]++;return h;}
  act(action:Action,args:unknown[]):unknown {
    if(this.current.harvested)throw new Stop('succeeded');
    if(!Object.hasOwn(COST,action))throw new Stop('api_error','Unknown action');
    const needsDirection=action==='move'||action==='swap';
    const maxArgs=needsDirection||action==='measure'?1:0;
    if(args.length>maxArgs || (needsDirection&&args.length!==1))throw new Stop('api_error','Invalid argument count: '+action);
    const d=args[0];
    if(args.length && (typeof d!=='string'||!Object.hasOwn(directions,d)))throw new Stop('api_error','Invalid direction: '+action);
    if(this.current.cost+COST[action]>this.config.budget)throw new Stop('budget_exceeded');
    const s=this.current; s.cost+=COST[action];s.counts[action]++;
    let nx=s.x,ny=s.y;
    if(d!==undefined){const offset=directions[d as Direction];nx+=offset[0];ny+=offset[1];}
    const inside=nx>=0&&ny>=0&&nx<this.config.size&&ny<this.config.size;
    const i=s.y*this.config.size+s.x,j=ny*this.config.size+nx;
    let value:unknown;const changes:[number,number][]=[];
    switch(action){
      case 'get_size':value=this.config.size;break;
      case 'get_position':value={x:s.x,y:s.y};break;
      case 'measure':value=inside?s.grid[j]:null;break;
      case 'move':value=inside;if(inside){s.x=nx;s.y=ny;}break;
      case 'swap':value=inside;if(inside){[s.grid[i],s.grid[j]]=[s.grid[j],s.grid[i]];changes.push([i,s.grid[i]],[j,s.grid[j]]);}break;
      case 'harvest':value=violations(s.grid,this.config.size)===0&&this.hist(s.grid).every((n,i)=>n===this.histogram[i]);s.harvested=!!value;break;
    }
    this.emit({seq:++this.seq,cost:s.cost,action,args:[...args],value,position:[s.x,s.y],changes,harvested:s.harvested});
    if(s.harvested)throw new Stop('succeeded');
    return value;
  }
}

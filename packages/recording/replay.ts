import {copyState,type Run,type State,type Event} from '../protocol';
export function applyEvent(state:State,e:Event):State {
  const next=copyState(state);next.x=e.position[0];next.y=e.position[1];next.cost=e.cost;
  next.counts[e.action]++;next.harvested=e.harvested;
  for(const [i,v]of e.changes)next.grid[i]=v;
  return next;
}
export function stateAt(run:Pick<Run,'initial'|'events'|'snapshots'>,seq:number):State{
  seq=Math.max(0,Math.min(run.events.length,Math.floor(seq)));
  const snapshot=run.snapshots.findLast(s=>s.seq<=seq);
  let state=copyState(snapshot?.state??run.initial);
  for(let i=snapshot?.seq??0;i<seq;i++)state=applyEvent(state,run.events[i]);
  return state;
}
export function sequenceAtCost(events:Event[],cost:number){
  let lo=0,hi=events.length;while(lo<hi){const mid=(lo+hi)>>>1;if(events[mid].cost<=cost)lo=mid+1;else hi=mid;}return lo;
}

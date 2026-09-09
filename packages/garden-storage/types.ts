export type HistoryEntry={id:string;origin?:'journal'|'legacy';startedAt:string;title:string;version:string;challenge?:string;size:number;drones:number;events:number;tick:number;cost:number;status:'recording'|'finished'|'interrupted'|'damaged'|'legacy';reason?:string;message?:string};
export type HistoryQuery={query?:string;mode?:'all'|'farm'|'challenge';status?:'all'|'finished'|'interrupted';offset?:number;limit?:number};
export type HistoryPage={items:HistoryEntry[];total:number;offset:number;limit:number};
export type GardenWindow={runId:string;seq:number;state:import('../garden/core').GardenState;before:import('../garden/core').GardenState;events:import('../garden/core').GardenEvent[];future:import('../garden/core').GardenEvent[];eventCount:number};

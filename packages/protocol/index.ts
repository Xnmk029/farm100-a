import { z } from 'zod';

export const VERSION = '0.1.0';
export const RULE = 'sort-field-v1.0';
export const COST = { get_size: 1, get_position: 1, move: 1, measure: 1, swap: 3, harvest: 1 } as const;
export type Action = keyof typeof COST;
export const directions = { North: [0,-1], South: [0,1], East: [1,0], West: [-1,0] } as const;
export type Direction = keyof typeof directions;
export const ConfigSchema = z.object({
  rule: z.literal(RULE).default(RULE),
  size: z.union([z.literal(4), z.literal(8), z.literal(16)]),
  seed: z.number().int().min(0).max(0xffffffff),
  budget: z.number().int().min(0).max(1_000_000),
  initial: z.array(z.number().int().min(0).max(9)).optional(),
}).strict().superRefine((c,ctx) => {
  if(c.initial && c.initial.length !== c.size*c.size) ctx.addIssue({code:'custom',message:'initial map length mismatch'});
});
export type Config = z.infer<typeof ConfigSchema>;
export type Counts = Record<Action,number>;
export type State = { grid:number[]; x:number; y:number; cost:number; counts:Counts; harvested:boolean };
export type Event = { seq:number; cost:number; action:Action; args:unknown[]; value:unknown;
  position:[number,number]; changes:[number,number][]; harvested:boolean };
export type Reason = 'succeeded'|'incomplete'|'budget_exceeded'|'api_error'|'syntax_error'|'runtime_error'|
  'memory_limit'|'wall_timeout'|'recording_limit'|'cancelled'|'runner_crash';
export type Snapshot = {seq:number;state:State};
export type Result = { reason:Reason; message:string; state:State; violations:number; elapsedMs:number };
export const GenerationSchema=z.object({durationMs:z.number().int().min(0).optional(),inputTokens:z.number().int().min(0).optional(),outputTokens:z.number().int().min(0).optional(),source:z.string().min(1).max(500)}).strict();
export type Generation=z.infer<typeof GenerationSchema>;
export type Run = { format:'farm100-run'; version:typeof VERSION; runId:string; createdAt:string;
  engineVersion:string; runtimeVersion:string; prngVersion:'mulberry32-v1';
  config:Config; source:string; sourceHash:string; configHash:string; label:string; attempt:number;
  initial:State; events:Event[]; snapshots:Snapshot[]; result:Result;
  logs:string[]; logsTruncated:boolean; complete:boolean; logicalHash:string; generation?:Generation };
export const RequestSchema = z.object({
  protocolVersion:z.literal(VERSION), runId:z.string().uuid(),
  source:z.string().max(1_048_576), config:ConfigSchema,
  label:z.string().max(120),attempt:z.number().int().min(1).max(100000),
  generation:GenerationSchema.optional(),
}).strict();
export type Request = z.infer<typeof RequestSchema>;
export type Progress = {runId:string;type:'ready'|'events'|'result'; sequence:number; events?:Event[];run?:Run};
export const emptyCounts = ():Counts => ({get_size:0,get_position:0,move:0,measure:0,swap:0,harvest:0});
export const copyState = (s:State):State => ({...s,grid:[...s.grid],counts:{...s.counts}});
export function canonical(value:unknown):string {
  if(value === null || typeof value !== 'object') return JSON.stringify(value);
  if(Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';
}
export const defaultConfig:Config = {rule:RULE,size:4,seed:42,budget:2000};

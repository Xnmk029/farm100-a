import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {TASKS,BENCHMARK_VERSION,type Task} from '../packages/benchmark-v2/catalog';
import {AnswerSchema,type Bundle,type Attempt} from '../packages/benchmark-v2/scoring';
import {CROP_CONTENT,TECH_BY_ID,RECIPE_BY_ID} from '../packages/garden/content';
import {CHALLENGE_BY_ID} from '../packages/garden/challenges';
import {freshGarden} from '../packages/garden/core';
import {freezeManifest,runCase,assess,writeJSON,sha} from './benchmark-v2-engine';
import {callModel,CANDIDATES,providerInventory} from './benchmark-v2-providers';
const outputInstruction='Return ONLY one JSON object with string fields source, strategy, correctness, complexity, boundaries. source is executable synchronous JavaScript, no async/await, no imports, no external tools. The other fields are concise algorithm summaries, not private chain-of-thought. Do not use tools or read files.';
const LESSON_LIMITS:Record<string,string>={
 'lesson-condition':'Hard check: finish within 50 ticks.',
 'lesson-wait':'Hard check: finish within 180 ticks.',
 'lesson-memory':'Hard check: harvest exactly two mature crops, print 2 as the final log, and finish within 60 ticks.',
 'lesson-path':'Hard check: use no more than 15 move calls.',
 'lesson-schedule':'Hard check: harvest all 16 crops with no wait() calls and finish within 560 ticks.'
};
export async function promptFor(task:Task){
  let guide='';
  if(task.module==='sort'){guide=(await readFile('docs/RULES_API.md','utf8')).split('人工参考解')[0];}
  else{
   const spec=task.cases[0],initial=spec.initial??freshGarden(spec.config);
   guide=`get_size() gives open extent, get_position() returns {x,y}; move(North/South/East/West) returns boolean, no wrapping. till(), plant(crop), water(), harvest(), clear(), repair(), refill(), fertilize(), wait(ticks:1..100), craft(recipe,amount), research(id), inspect(), get_inventory(), get_progress(). Crop names are lowercase strings. inspect() returns crop,ready,trait,damaged,growth,water. get_inventory() returns direct resource fields. All calls synchronous.\n`;
   guide+=`Fleet: every drone runs same program, independent variables, shared inventory/time. get_drone_id(), get_drone_count(), get_time(), read_shared(key), write_shared(key,value), compare_exchange(key,expected,value) returns {exchanged,value}, barrier(name) must be reached by all deployed drones. Legacy directions are constants; crops can use strings.\n`;
   guide+='Starting resources: '+JSON.stringify({...initial.inventory,...initial.economy?.stock})+'; unlocked research: '+JSON.stringify(initial.economy?.unlocks)+'\n';
   guide+='Crop rules: '+JSON.stringify(CROP_CONTENT)+'\nRecipes: '+JSON.stringify(RECIPE_BY_ID)+'\nResearch: '+JSON.stringify(TECH_BY_ID)+'\n';
   if(task.module==='challenge')guide+='Allowed APIs (plus fleet APIs when deployed): '+CHALLENGE_BY_ID[task.id].allowed.join(',')+'\nsense() reveals local exits and loot only, collect() takes key/relic; key unlocks gates. swap(direction) exchanges adjacent crop traits. Cactus harvest succeeds as an entire connected mature component only when all rows/columns are nondecreasing; pumpkin at even x,y merges mature 2x2.\n';
  }
  return outputInstruction+'\nTask: '+task.name+'\n'+task.description+'\n'+(LESSON_LIMITS[task.id]??'')+'\n'+guide+'\nEvaluation: same source tested on fixed undisclosed seeds; do not hardcode the map. Configurations: '+JSON.stringify(task.cases.map(c=>({size:c.config.size,budget:c.config.budget,drones:c.config.drones??1})))+'\nSupply a self-contained solution and concise design explanation.';
 }

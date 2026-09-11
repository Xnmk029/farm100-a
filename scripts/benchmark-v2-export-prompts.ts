import {TASKS} from '../packages/benchmark-v2/catalog';
import {promptFor} from './benchmark-v2-prompts';
import {writeJSON} from './benchmark-v2-engine';
const rows=Object.fromEntries(await Promise.all(TASKS.map(async t=>[t.id,await promptFor(t)])));await writeJSON('artifacts/scoring-v2/prompts.json',rows);console.log(Object.keys(rows).length);

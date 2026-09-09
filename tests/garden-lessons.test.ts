import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {LESSONS,lessonWorld,gradeLesson} from '../packages/garden/lessons';
import {LESSON_SOLUTIONS} from '../scripts/lesson-solutions';
import {executeGarden} from '../packages/garden/runner';
import {copyGarden,validateGardenRun,type GardenRun} from '../packages/garden/core';

test('12 lessons have real passing programs, incomplete starters, feedback and replayable results',async()=>{
  assert.equal(LESSONS.length,12);assert.equal(new Set(LESSONS.map(l=>l.id)).size,12);
  await mkdir('artifacts/lessons/unit',{recursive:true});const rows=[];
  for(const lesson of LESSONS){
    const req={runId:randomUUID(),...lessonWorld(lesson.id),source:LESSON_SOLUTIONS[lesson.id]};
    const run=await executeGarden(req),feedback=gradeLesson(lesson.id,run);
    assert.equal(feedback.pass,true,lesson.id+': '+JSON.stringify(feedback.checks.filter(c=>!c.pass)));
    assert.deepEqual(validateGardenRun(JSON.parse(JSON.stringify(run))).result.state,run.result.state);
    const starter=await executeGarden({...req,runId:randomUUID(),source:lesson.starter});
    const needsWork=gradeLesson(lesson.id,starter);assert.equal(needsWork.pass,false,lesson.id+' starter must need an edit');
    assert.ok(needsWork.checks.some(c=>!c.pass&&c.detail.length>0));
    await writeFile(`artifacts/lessons/unit/${lesson.id}.farmgarden`,JSON.stringify(run));
    rows.push({id:lesson.id,pass:true,events:run.events.length,ticks:run.result.state.tick-run.initial.tick,feedback,starterReason:starter.result.reason,starterFailures:needsWork.checks.filter(c=>!c.pass)});
  }
  await writeFile('artifacts/lessons/unit/lessons-qa.json',JSON.stringify({pass:true,rows},null,2));
});

test('lesson feedback rejects inherited achievements and diagnoses failed behavior',async()=>{
  assert.throws(()=>lessonWorld('toString'),/未知/);
  const id='capstone',req={runId:randomUUID(),...lessonWorld(id),source:LESSON_SOLUTIONS[id]},run=await executeGarden(req);
  assert.equal(gradeLesson(id,run).pass,true);
  const inherited:GardenRun={...run,initial:copyGarden(run.result.state),events:[],result:{...run.result,state:copyGarden(run.result.state)}};
  const feedback=gradeLesson(id,inherited);assert.equal(feedback.pass,false);assert.equal(feedback.checks[0].pass,false);
  const early=await executeGarden({runId:randomUUID(),...lessonWorld('wait'),source:'harvest();'});
  const fail=gradeLesson('wait',early);assert.equal(fail.pass,false);assert.ok(fail.checks.some(c=>!c.pass&&c.detail.includes('harvest')));
  const bad=await executeGarden({...req,runId:randomUUID(),source:'move("Nowhere");'});assert.equal(gradeLesson(id,bad).pass,false);
});

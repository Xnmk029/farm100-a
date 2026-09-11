import {canonical} from '../protocol';
import type {GardenRun} from './economy-core';
import {CHALLENGE_RULE,CHALLENGE_BY_ID,evaluateChallenge} from './challenges';

export const SCORING_VERSION='challenge-score-v1';
/** Input must have passed validateGardenRun at the import/execution boundary. */
export function scoreChallenge(run:GardenRun){
  if(run.version!==CHALLENGE_RULE||run.config.rule!==CHALLENGE_RULE)return null;
  const evaluation=evaluateChallenge(run);
  if(!evaluation)return null;
  const completed=run.events.filter(e=>!e.kind||e.kind==='complete');
  const work=new Set(['till','plant','water','harvest','repair','craft','swap','collect','fertilize','refill','clear']);
  const communication=new Set(['read_shared','write_shared','compare_exchange','barrier']);
  const participants=new Set<number>();
  let communicationCalls=0,successfulWork=0;
  for(const e of completed){
    if(communication.has(e.action))communicationCalls++;
    if(work.has(e.action)&&e.value!==false&&e.value!==null&&e.value!==0){successfulWork++;participants.add(e.actor??0);}
  }
  const completion=100*evaluation.goals.reduce((sum,g)=>sum+Math.min(1,Math.max(0,g.value/g.target)),0)/evaluation.goals.length;
  return {
    scoringVersion:SCORING_VERSION,challenge:run.config.challenge!,family:CHALLENGE_BY_ID[run.config.challenge!].family,
    runId:run.runId,passed:evaluation.passed,completion:Math.round(completion*100)/100,
    primary:evaluation.primary,primaryValue:evaluation[evaluation.primary],
    secondaryValue:evaluation[evaluation.primary==='tick'?'cost':'tick'],
    tick:evaluation.tick,cost:evaluation.cost,failedActions:evaluation.failedActions,reason:evaluation.reason,
    goals:evaluation.goals,
    // Diagnostic observations do not silently introduce new pass conditions.
    participation:{deployed:run.config.drones??1,productive:participants.size,successfulWork,communicationCalls},
  };
}
export type ChallengeScore=NonNullable<ReturnType<typeof scoreChallenge>>;
export function scoringCohort(run:GardenRun){
  return canonical({scoringVersion:SCORING_VERSION,version:run.version,config:{...run.config,drones:run.config.drones??1},initial:run.initial});
}
export function compareChallengeScores(a:ChallengeScore,b:ChallengeScore){
  return a.primaryValue-b.primaryValue||a.secondaryValue-b.secondaryValue||a.failedActions-b.failedActions;
}
/** Competition ranks: 1,1,3. Failures and unsupported historical rules are unranked. */
export function rankChallengeRuns(runs:GardenRun[]){
  const rows=runs.map(run=>({run,score:scoreChallenge(run),rank:null as number|null}));
  const groups=new Map<string,typeof rows>();
  for(const row of rows)if(row.score?.passed){const key=scoringCohort(row.run);const group=groups.get(key)??[];group.push(row);groups.set(key,group);}
  for(const group of groups.values()){
    group.sort((a,b)=>compareChallengeScores(a.score!,b.score!));
    group.forEach((row,i)=>{row.rank=i&&compareChallengeScores(group[i-1].score!,row.score!)===0?group[i-1].rank:i+1;});
  }
  return rows;
}
/** Positive means the candidate uses less of the primary metric. Not an overall quality score. */
export function challengeEfficiency(reference:GardenRun,candidate:GardenRun){
  const a=scoreChallenge(reference),b=scoreChallenge(candidate);
  if(!a?.passed||!b?.passed||scoringCohort(reference)!==scoringCohort(candidate)||a.primaryValue<=0)return null;
  return {primary:a.primary,referenceRunId:reference.runId,savingPercent:Math.round((1-b.primaryValue/a.primaryValue)*10000)/100};
}

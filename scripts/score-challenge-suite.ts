import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {CHALLENGES} from '../packages/garden/challenges';
import {validateGardenRun,type GardenRun} from '../packages/garden/core';
import {executeGarden} from '../packages/garden/runner';
import {canonical} from '../packages/protocol';
import {SCORING_VERSION,scoreChallenge,challengeEfficiency} from '../packages/garden/scoring';
import {challengeSource} from '../packages/garden/challenge-examples';

const positional=process.argv.slice(2).filter(arg=>!arg.startsWith('--'));
const input=path.resolve(positional[0]??'artifacts/difficulty-luna-20260910');
const output=path.resolve(positional[1]??'artifacts/scoring/luna-20260910');
const rerun=process.argv.includes('--rerun');
const baseline=process.argv.includes('--baseline');
const stages=['round-1-syntax-entry','round-1','round-2','round-3'];
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const records:Record<string,Record<string,{run?:GardenRun;score:ReturnType<typeof scoreChallenge>;file:string;sha256?:string;error?:string;reportedPassMatches?:boolean}>>={};
await mkdir(output,{recursive:true});
for(const stage of stages){
  records[stage]={};
  for(const challenge of CHALLENGES){
    const file=path.join(input,'raw',stage,challenge.id+'.json');
    let data:string;
    try{data=await readFile(file,'utf8');}catch(e){
      if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;
      const errorFile=file.replace(/\.json$/,'.error.json');
      try{const failed=await readFile(errorFile,'utf8');records[stage][challenge.id]={score:null,file:errorFile,sha256:hash(failed),error:'Runner error record; no validated run'};}
      catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
      continue;
    }
    try{
      const raw=JSON.parse(data),run=validateGardenRun(raw.run);
      if(run.config.challenge!==challenge.id)throw Error('题号与文件不一致');
      const score=scoreChallenge(run);if(!score)throw Error('不支持的评分规则');
      records[stage][challenge.id]={run,score,file,sha256:hash(data),reportedPassMatches:raw.evaluation?.passed===score.passed};
    }catch(error){records[stage][challenge.id]={score:null,file,sha256:hash(data),error:String(error)};}
  }
  console.log(stage+' verified');
}
type Attempt=Omit<(typeof records)[string][string],'run'>&{stage:string;sourceSHA256:string|null};
type Reference={score?:ReturnType<typeof scoreChallenge>;efficiency?:ReturnType<typeof challengeEfficiency>;file?:string;sha256?:string;sourceSHA256?:string;error?:string};
const cases:{id:string;name:string;family:string;tier:number;firstSubmissionPassed:boolean;firstExecutablePassed:boolean;finalPassed:boolean;finalScore:ReturnType<typeof scoreChallenge>;attempts:Attempt[];reproduction:{pass:boolean;error?:string}|null;reference:Reference|null}[]=[];
for(const challenge of CHALLENGES){
  const attempts=stages.flatMap(stage=>records[stage][challenge.id]?[{stage,...records[stage][challenge.id]}]:[]);
  const last=attempts.at(-1);
  const first=records[stages[0]][challenge.id];
  const executable=records['round-2'][challenge.id];
  let reproduction:{pass:boolean;error?:string}|null=null;
  if(rerun&&last?.run){
    try{
      const r=validateGardenRun(await executeGarden({runId:randomUUID(),config:last.run.config,source:last.run.source},{wallMs:120000}));
      if(canonical(r.events)!==canonical(last.run.events)||canonical(r.result.state)!==canonical(last.run.result.state)||r.result.reason!==last.run.result.reason||r.complete!==last.run.complete)throw Error('重新执行与原始记录不一致');
      reproduction={pass:true};
    }catch(error){reproduction={pass:false,error:String(error)};}
    console.log(challenge.id+' reproduction '+reproduction.pass);
  }
  let reference:Reference|null=null;
  if(baseline&&last?.run){
    try{
      const source=challengeSource(challenge.id,'baseline');
      const r=validateGardenRun(await executeGarden({runId:randomUUID(),config:last.run.config,source},{wallMs:120000}));
      const file=path.join(output,'references',challenge.id+'.json'),data=JSON.stringify(r);
      await mkdir(path.dirname(file),{recursive:true});await writeFile(file,data);
      reference={score:scoreChallenge(r),efficiency:challengeEfficiency(r,last.run),file,sha256:hash(data),sourceSHA256:hash(source)};
    }catch(error){reference={error:String(error)};}
  }
  cases.push({id:challenge.id,name:challenge.name,family:challenge.family,tier:challenge.tier,
    firstSubmissionPassed:first?.score?.passed??false,firstExecutablePassed:executable?.score?.passed??false,
    finalPassed:last?.score?.passed??false,finalScore:last?.score??null,attempts:attempts.map(({run,...a})=>({...a,sourceSHA256:run?hash(run.source):null})),reproduction,reference});
}
const rate=(passed:number,total:number)=>({passed,total,percent:Math.round(passed/total*10000)/100});
const families=[...new Set(CHALLENGES.map(c=>c.family))].map(family=>{const rows=cases.filter(c=>c.family===family);return {family,...rate(rows.filter(c=>c.finalPassed).length,rows.length)};});
const report={scoringVersion:SCORING_VERSION,createdAt:new Date().toISOString(),input,
  attribution:{model:'gpt-5.6-luna',reasoning:'max',source:'委派配置与原报告；记录本身不证明模型身份'},
  scope:{expectedChallenges:CHALLENGES.length,seedCoverage:[...new Set(Object.values(records).flatMap(stage=>Object.values(stage).flatMap(row=>row.run?[row.run.config.seed]:[])))],lessons:'not tested'},
  firstSubmission:{...rate(cases.filter(c=>c.firstSubmissionPassed).length,cases.length),recorded:Object.keys(records[stages[0]]).length,missingIds:CHALLENGES.filter(c=>!records[stages[0]][c.id]).map(c=>c.id)},
  firstExecutable:rate(cases.filter(c=>c.firstExecutablePassed).length,cases.length),
  final:rate(cases.filter(c=>c.finalPassed).length,cases.length),families,
  familyMacroPassPercent:families.reduce((sum,f)=>sum+f.percent,0)/families.length,
  evidenceValid:cases.every(c=>c.attempts.length>0&&c.attempts.every(a=>!a.error&&a.reportedPassMatches!==false)),
  reproduction:rerun?{pass:cases.every(c=>c.reproduction?.pass),cases:cases.filter(c=>c.reproduction?.pass).length}:null,
  limits:['单模型单种子、允许修订；不是 pass@1、泛化成绩或新手通过率','round-2 为原报告标注的入口修订后阶段，不等同首次提交','缺失或无效记录不计通过，旧规则不套用新评分','目标完成度不是通关率；同配置通关者才参与效率排名'],cases};
await writeFile(path.join(output,'score-report.json'),JSON.stringify(report,null,2));
const csv=(v:unknown)=>'"'+String(v??'').replaceAll('"','""')+'"';
const columns=['id','family','tier','firstSubmissionPassed','firstExecutablePassed','finalPassed','completion','primary','primaryValue','tick','cost','failedActions','reproduced','baselinePrimaryValue','savingPercent'];
await writeFile(path.join(output,'scores.csv'),'\ufeff'+[columns,...cases.map(c=>[c.id,c.family,c.tier,c.firstSubmissionPassed,c.firstExecutablePassed,c.finalPassed,c.finalScore?.completion,c.finalScore?.primary,c.finalScore?.primaryValue,c.finalScore?.tick,c.finalScore?.cost,c.finalScore?.failedActions,c.reproduction?.pass,c.reference?.score?.primaryValue,c.reference?.efficiency?.savingPercent])].map(row=>row.map(csv).join(',')).join('\n'));
if(!report.evidenceValid||(rerun&&!report.reproduction?.pass))process.exitCode=1;
console.log(JSON.stringify({evidenceValid:report.evidenceValid,firstSubmission:report.firstSubmission,firstExecutable:report.firstExecutable,final:report.final,reproduction:report.reproduction}));

import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {Gateway,instructions} from '../packages/agent-gateway/gateway';
import {serve} from '../packages/agent-gateway/mcp';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const callerCwd=process.cwd();
process.chdir(repo);
const [command='help',...args]=process.argv.slice(2),flags:Record<string,string>={};
for(let i=0;i<args.length;i++){
 const match=/^--([a-z-]+)(?:=(.*))?$/.exec(args[i]);
 if(!match)throw Error('未知参数 '+args[i]);
 const value=match[2]??args[++i];if(value===undefined||value.startsWith('--'))throw Error('参数缺少值 '+match[1]);
 if(flags[match[1]]!==undefined)throw Error('重复参数 '+match[1]);flags[match[1]]=value;
}
const gateway=new Gateway(repo,flags.root?path.resolve(callerCwd,flags.root):undefined);
const inputPath=(name:string)=>path.resolve(callerCwd,required(name));
const required=(name:string)=>{if(!flags[name])throw Error('缺少 --'+name);return flags[name];};
const output=(value:unknown)=>process.stdout.write(JSON.stringify(value,null,2)+'\n');
try{
 switch(command){
  case 'prepare':output(await gateway.prepare());break;
  case 'start':output(await gateway.start({agent:required('agent'),...(flags.model?{model:flags.model}:{}),...(flags.reasoning?{reasoning:flags.reasoning}:{}),...(flags.tasks?{tasks:flags.tasks.split(',')}:{} )}));break;
  case 'next':output(await gateway.next(required('session')));break;
  case 'submit':output(await gateway.submit(required('session'),required('ticket'),await readFile(inputPath('file'),'utf8')));break;
  case 'status':output(await gateway.status(required('session')));break;
  case 'resume':output(await gateway.resume(required('session')));break;
  case 'export':output(await gateway.export(required('session')));break;
  case 'archive':output(await gateway.archive(required('session')));break;
  case 'review':output(await gateway.review(required('session'),JSON.parse(await readFile(inputPath('file'),'utf8'))));break;
  case 'worker':await gateway.work(required('session'));break;
  case 'mcp':await serve(gateway);break;
  case 'guide':output({instructions,cli:'node '+path.join(repo,'scripts/farm100-agent.mjs'),commands:['start --agent NAME [--model NAME] [--reasoning LEVEL]','next --session ID','submit --session ID --ticket ID --file ABSOLUTE_ANSWER_PATH','status --session ID','resume --session ID','export --session ID']});break;
  case 'config':{
   const config={mcpServers:{farm100:{command:process.execPath,args:[path.join(repo,'scripts/farm100-agent.mjs'),'mcp','--root',gateway.root]}}};
   const destination=flags.file?path.resolve(callerCwd,flags.file):path.join(gateway.root,'mcp.json');await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,JSON.stringify(config,null,2));output({file:destination,config});break;
  }
  case 'help':output({name:'FARM100 Agent gateway',instructions,commands:['prepare','config [--file PATH]','guide','start --agent NAME [--model NAME] [--reasoning LEVEL] [--tasks ID,ID]','next --session ID','submit --session ID --ticket ID --file PATH','status --session ID','resume --session ID','export --session ID','archive --session ID (host only)','review --session ID --file PATH (independent reviewer only)','mcp'],root:gateway.root,notes:['Use --root PATH to isolate suites. Omit --tasks for the full 31 tasks / 93 cases.','Model metadata is self-declared; missing usage and costs remain unknown.','No paid model calls are made. No external host settings are changed.']});break;
  default:throw Error('未知命令 '+command);
 }
}catch(e){process.stderr.write(JSON.stringify({error:String(e)})+'\n');process.exitCode=1;}

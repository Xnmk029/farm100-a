import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';
import path from 'node:path';
const root=path.resolve('video/evidence-stories-v1'),pub=path.join(root,'public'),plan=JSON.parse(await readFile(path.join(root,'plan.json'),'utf8'));
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(r.stderr);return r.stdout;};
const stamp=t=>{const ms=Math.round(t*1000);return [Math.floor(ms/3600000),Math.floor(ms/60000)%60,Math.floor(ms/1000)%60].map(n=>String(n).padStart(2,'0')).join(':')+','+String(ms%1000).padStart(3,'0');};
for(const story of plan.stories){
 let cursor=0;const filters=[],inputs=[],edl=['# '+story.title,'','旁白：Microsoft Huihui Desktop，本机临时合成。字幕按完整语义段显示，不冒称逐字强制对齐。','', '| IN | OUT | 镜头 | 旁白时长 | 旁白 |','| --- | --- | --- | --- | --- |'];
 for(const [i,ch] of story.chapters.entries()){
  const file=path.join(pub,'audio',story.id+'-'+ch.id+'.wav'),probe=JSON.parse(run('ffprobe',['-v','error','-show_format','-of','json',file]));
  ch.audioSeconds=Number(probe.format.duration);ch.seconds=Math.max(ch.seconds,Math.ceil(ch.audioSeconds+1.6));ch.startFrame=cursor;ch.durationFrames=ch.seconds*plan.fps;ch.audioStart=cursor/plan.fps+.6;
  inputs.push('-i',file);filters.push(`[${i}:a]adelay=${Math.round(ch.audioStart*1000)}:all=1[a${i}]`);
  edl.push(`| ${(cursor/30).toFixed(1)} | ${(cursor/30+ch.seconds).toFixed(1)} | ${ch.id}：${ch.title} | ${ch.audioSeconds.toFixed(2)} s | ${ch.narration} |`);
  cursor+=ch.durationFrames;
 }
 story.totalFrames=cursor;story.seconds=cursor/plan.fps;
 filters.push(story.chapters.map((_,i)=>`[a${i}]`).join('')+`amix=inputs=7:normalize=0,apad,atrim=duration=${story.seconds}[out]`);
 run('ffmpeg',['-y','-v','error',...inputs,'-filter_complex',filters.join(';'),'-map','[out]','-ar','48000','-ac','1',path.join(pub,'audio',story.id+'.wav')]);
 await writeFile(path.join(root,story.id+'-EDL.md'),edl.join('\n'));
 await writeFile(path.join(pub,story.id+'.srt'),story.chapters.map((c,i)=>`${i+1}\n${stamp(c.startFrame/30+.3)} --> ${stamp((c.startFrame+c.durationFrames)/30-.1)}\n${c.narration.match(/.{1,28}/gu).join('\n')}\n`).join('\n'));
 await writeFile(path.join(pub,story.id+'-timeline.json'),JSON.stringify({fps:30,width:1920,height:1080,totalFrames:cursor,chapters:story.chapters.map(c=>({id:c.id,title:c.title,startFrame:c.startFrame,durationFrames:c.durationFrames}))},null,2));
}
await writeFile(path.join(pub,'plan.json'),JSON.stringify(plan,null,2));
await copyFile(path.resolve('video/visual-system-v2-opart/opart.js'),path.join(pub,'opart.js'));
await build({entryPoints:[path.join(root,'film.ts')],bundle:true,outfile:path.join(pub,'app.js'),sourcemap:true,target:'chrome120'});
console.log(plan.stories.map(s=>({id:s.id,seconds:s.seconds,frames:s.totalFrames,audio:s.chapters.map(c=>({id:c.id,seconds:c.audioSeconds,slot:c.seconds}))})));

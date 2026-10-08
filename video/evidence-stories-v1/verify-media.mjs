import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=path.resolve('video/evidence-stories-v1'),plan=JSON.parse(await fs.readFile(path.join(root,'public/plan.json'),'utf8'));
const target=process.argv.find(s=>s.startsWith('--story='))?.split('=')[1];
function cmd(name,args,encoding='utf8'){const r=spawnSync(name,args,{encoding,windowsHide:true,maxBuffer:100*1024*1024});if(r.status!==0)throw Error(name+' '+r.stderr);return r;}
const results=[];
for(const story of plan.stories.filter(s=>!target||s.id===target)){
 const dir=path.join(root,'output',story.id),file=path.join(dir,story.id+'.mp4'),probe=JSON.parse(cmd('ffprobe',['-v','error','-count_frames','-show_format','-show_streams','-of','json',file]).stdout);
 const v=probe.streams.find(s=>s.codec_type==='video'),a=probe.streams.find(s=>s.codec_type==='audio');assert.equal(v.width,1920);assert.equal(v.height,1080);assert.equal(v.r_frame_rate,'30/1');assert.equal(Number(v.nb_read_frames),story.totalFrames);assert.equal(v.codec_name,'h264');assert.equal(v.pix_fmt,'yuv420p');assert.equal(a.codec_name,'aac');assert(Math.abs(Number(probe.format.duration)-story.seconds)<.1);
 cmd('ffmpeg',['-v','error','-xerror','-i',file,'-c:v','rawvideo','-c:a','pcm_s16le','-f','null','-']);
 const wav=cmd('ffmpeg',['-v','error','-i',file,'-vn','-c:a','pcm_s16le','-ar','48000','-ac','1','-f','wav','-'],null).stdout;let offset=12;while(wav.toString('ascii',offset,offset+4)!=='data'){const size=wav.readUInt32LE(offset+4);offset+=8+size+(size%2);assert(offset<wav.length,'missing WAV data chunk')}const pcm=wav.subarray(offset+8);let maxSample=0,sumSquares=0;for(let n=0;n+1<pcm.length;n+=2){const sample=pcm.readInt16LE(n)/32768;maxSample=Math.max(maxSample,Math.abs(sample));sumSquares+=sample*sample}const peak=20*Math.log10(maxSample),rms=20*Math.log10(Math.sqrt(sumSquares/(pcm.length/2)));assert(peak<0&&peak>-35,'audio peak unexpectedly clipped or quiet');
 const decoded=path.join(dir,'decoded');await fs.mkdir(decoded,{recursive:true});
 const frames=story.chapters.map(c=>c.startFrame+Math.floor(c.durationFrames/2));
 for(const [i,n] of frames.entries())cmd('ffmpeg',['-y','-v','error','-ss',String(n/30),'-i',file,'-frames:v','1',path.join(decoded,`scene-${i}.png`)]);
 for(const c of story.chapters)for(const f of [c.startFrame, c.startFrame+c.durationFrames-1])cmd('ffmpeg',['-y','-v','error','-ss',String(f/30),'-i',file,'-frames:v','1',path.join(decoded,`boundary-${String(f).padStart(4,'0')}.png`)]);
 cmd('powershell',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'contact-sheet.ps1'),'-Directory',dir,'-Mode','normal']);
 const low=path.join(dir,story.id+'-stress-crf35.mp4');cmd('ffmpeg',['-y','-v','error','-i',file,'-c:v','libx264','-preset','fast','-crf','35','-maxrate','800k','-bufsize','1600k','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-movflags','+faststart',low]);
 for(const i of [0,2,4])cmd('ffmpeg',['-y','-v','error','-ss',String(frames[i]/30),'-i',low,'-frames:v','1',path.join(decoded,`stress-${i}.png`)]);
 cmd('powershell',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'contact-sheet.ps1'),'-Directory',dir,'-Mode','stress']);
 // Coarse full-frame temporal luminance-change statistic, not a photosensitivity certification.
 const gray=cmd('ffmpeg',['-v','error','-i',file,'-an','-vf','scale=160:90,format=gray','-c:v','rawvideo','-f','image2pipe','-'],null).stdout,N=160*90;let max=0;
 for(let j=N;j<gray.length;j+=N){let changed=0;for(let k=0;k<N;k++)if(Math.abs(gray[j+k]-gray[j-N+k])>50)changed++;max=Math.max(max,changed/N);}
 const bytes=await fs.readFile(file),result={pass:true,id:story.id,seconds:Number(probe.format.duration),width:v.width,height:v.height,fps:30,frames:Number(v.nb_read_frames),video:v.codec_name,audio:a.codec_name,audioPeakDb:peak,audioRmsDb:rms,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),fullDecode:true,decodedMidpoints:frames,boundaryFrames:14,lowBitrateStress:{crf:35,maxrate:'800k',nativeCanvas:true,file:path.basename(low),notPlatformUpload:true},coarseTemporalCheck:{maxFrameAreaChangingOver50of255:max,notFormalFlashSafetyTest:true}};
 await fs.writeFile(path.join(dir,'ffprobe.json'),JSON.stringify(probe,null,2));await fs.writeFile(path.join(dir,'media-qa.json'),JSON.stringify(result,null,2));results.push(result);console.log(JSON.stringify(result,null,2));
}
if(!target)await fs.writeFile(path.join(root,'output/media-qa.json'),JSON.stringify(results,null,2));

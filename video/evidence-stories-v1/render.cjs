const {app,BrowserWindow}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{once}=require('node:events'),{start}=require('./server.cjs');
const out=path.join(__dirname,'output'),samples=process.argv.includes('--samples'),target=process.argv.find(a=>a.startsWith('--story='))?.split('=')[1];
app.setPath('userData',path.join(out,'electron-profile'));app.commandLine.appendSwitch('disable-gpu');app.commandLine.appendSwitch('force-device-scale-factor','1');
async function main(){await fs.mkdir(out,{recursive:true});const server=await start();await app.whenReady();const win=new BrowserWindow({width:1920,height:1080,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false}});
 win.webContents.on('console-message',(_e,level,message)=>{if(level>=2)console.error(message)});
 await win.loadURL(`http://127.0.0.1:${server.address().port}/?render=1`);const js=s=>win.webContents.executeJavaScript(s),sleep=ms=>new Promise(r=>setTimeout(r,ms));
 for(let i=0;!await js('Boolean(window.filmReady)');i++){assert(i<200,'renderer timeout');await sleep(100)}
 const plan=await js('window.getPlan()');const material=await js('window.opartCheck()');assert(material.phaseLoop&&material.stableMask&&material.phaseChanges);
 for(const story of plan.stories.filter(s=>!target||s.id===target)){
  await js(`window.selectStory('${story.id}')`);const dir=path.join(out,story.id);await fs.mkdir(path.join(dir,'stills'),{recursive:true});
  const frames=[...new Set(story.chapters.flatMap(c=>[c.startFrame,c.startFrame+15,c.startFrame+60,c.startFrame+Math.floor(c.durationFrames/2),c.startFrame+c.durationFrames-1]))];const checks=[];
  for(const f of frames){const q=await js(`window.renderFrame(${f})`);assert.equal(q.overflow.length,0,JSON.stringify(q.overflow));checks.push(q);await fs.writeFile(path.join(dir,'stills',String(f).padStart(4,'0')+'.png'),Buffer.from(await js('window.getPng()'),'base64'))}
  const cf=story.chapters[2].startFrame+120;await js(`window.renderFrame(${cf})`);const a=await js('window.getPng()');await js(`window.renderFrame(${story.totalFrames-1});window.renderFrame(${cf})`);assert.equal(a,await js('window.getPng()'),'seek not deterministic');
  const comparison=await js(`window.renderFrame(${cf})`);assert.equal(comparison.ticks[0],comparison.ticks[1],'clock mismatch');
  await js('window.renderFrame(0);document.querySelector("#play").click()');await sleep(450);await js('document.querySelector("#play").click()');const played=await js('+document.querySelector("#seek").value');assert(played>0);await sleep(150);assert.equal(played,await js('+document.querySelector("#seek").value'));
  const seekValue=cf;await js(`document.querySelector('#seek').value=${seekValue};document.querySelector('#seek').dispatchEvent(new Event('input'))`);assert.equal(seekValue,await js('+document.querySelector("#seek").value'));
  await fs.writeFile(path.join(dir,'layout-qa.json'),JSON.stringify({pass:true,material,frames:checks,deterministicSeek:true,sharedClock:true,playPauseSeek:true,audioMode:'local SAPI temporary narration; no background music'},null,2));
  console.log('PASS layout/controls '+story.id+' ('+frames.length+' frames)');
  if(samples)continue;
  const args=['-y','-v','warning','-f','image2pipe','-vcodec','png','-framerate','30','-i','pipe:0','-i',path.join(__dirname,'public/audio',story.id+'.wav'),'-map','0:v','-map','1:a','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart','-t',String(story.seconds),path.join(dir,story.id+'.mp4')];
  const ff=spawn('ffmpeg',args,{windowsHide:true});let log='';ff.stderr.on('data',b=>log+=b);const done=once(ff,'close');ff.stdin.on('error',e=>console.error(e.message));
  for(let f=0;f<story.totalFrames;f++){await js(`window.renderFrame(${f})`);if(!ff.stdin.write(Buffer.from(await js('window.getPng()'),'base64')))await once(ff.stdin,'drain');if(f%300===0)console.log(story.id+' '+f+'/'+story.totalFrames)}
  ff.stdin.end();const [code]=await done;await fs.writeFile(path.join(dir,'encode.log'),log);assert.equal(code,0,log);console.log('ENCODE COMPLETE '+story.id);
 }
 win.destroy();server.close();app.quit();
}
main().catch(e=>{console.error(e.stack);app.exit(1)});

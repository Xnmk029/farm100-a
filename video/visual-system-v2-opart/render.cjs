const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{once}=require('node:events');
const {start}=require('./server.cjs'),out=path.join(__dirname,'output'),sampleOnly=process.argv.includes('--samples');
app.setPath('userData',path.join(out,'electron-profile'));app.commandLine.appendSwitch('disable-gpu');app.commandLine.appendSwitch('force-device-scale-factor','1');
const frames=[0,80,125,156,220,384,410,438,520,600,630,654,696,750,850,888,920,950,1020,1079];
async function main(){
 await fs.mkdir(out,{recursive:true});const server=await start();await app.whenReady();const win=new BrowserWindow({width:1920,height:1080,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false}});
 await win.loadURL('http://127.0.0.1:'+server.address().port+'/?render=1');const js=s=>win.webContents.executeJavaScript(s),sleep=ms=>new Promise(r=>setTimeout(r,ms));
 for(let i=0;!await js('Boolean(window.filmReady)');i++){assert(i<100,'fonts/renderer unavailable');await sleep(100)}
 await js('window.setReduced(false)');const checks=[];
 const material=await js('window.opartCheck()');assert(material.maskCells>0);assert(material.phaseLoop,'material must loop at 12 seconds');assert(material.phaseChanges,'material must animate');assert(material.stableMask);
 for(const portrait of [false,true]){
  await js(`window.setAspect(${portrait})`);const dir=path.join(out,portrait?'portrait':'landscape');await fs.mkdir(dir,{recursive:true});
  for(const f of frames){const q=await js(`window.renderFrame(${f})`);assert.equal(q.overflow.length,0,JSON.stringify(q.overflow));checks.push(q);await fs.writeFile(path.join(dir,String(f).padStart(4,'0')+'.png'),Buffer.from(await js('window.getPng()'),'base64'))}
  const swept=await js('Array.from({length:1080},(_,i)=>window.renderFrame(i)).filter(q=>q.camera.projectedTop<q.camera.stageTop-.001||q.camera.projectedBottom>q.camera.stageBottom+.001).map(q=>q.frame)');assert.equal(swept.length,0,'world overlaps reserved reading area: '+swept);
 }
 await js('window.setAspect(false);window.renderFrame(520)');const a=await js('window.getPng()');await js('window.renderFrame(1020);window.renderFrame(520)');assert.equal(a,await js('window.getPng()'));
 const flat=await js('window.renderFrame(520)');assert.equal(flat.camera.tiltDegrees,0);assert.equal(flat.camera.yawDegrees,0);
 await js('window.setReduced(true);window.renderFrame(750)');const reduced=await js('window.renderFrame(750)');assert.equal(reduced.camera.explosionCells,0,'reduced motion must not explode');
 await js('window.setReduced(false);window.renderFrame(0);document.querySelector("#play").click()');await sleep(500);await js('document.querySelector("#play").click()');const played=await js('+document.querySelector("#seek").value');assert(played>0);await sleep(200);assert.equal(played,await js('+document.querySelector("#seek").value'));
 await fs.writeFile(path.join(out,'layout-qa.json'),JSON.stringify({pass:true,sampleCount:checks.length,worldBoundsFramesChecked:2160,deterministicSeek:true,flattenEndsAtZero:true,reducedMotionNoExplosion:true,playPause:true,material,frames:checks},null,2));console.log('PASS: 40 layout frames, 2160 world bounds, flatten, deterministic seek, reduced motion, play/pause, material phase.');
 if(!sampleOnly){
  const ff=spawn('ffmpeg',['-y','-v','warning','-f','image2pipe','-vcodec','png','-framerate','60','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',path.join(out,'farm100-pixel-opart-v21.mp4')],{windowsHide:true});let log='';ff.stderr.on('data',b=>log+=b);const done=once(ff,'close');
  for(let f=0;f<1080;f++){await js(`window.renderFrame(${f})`);if(!ff.stdin.write(Buffer.from(await js('window.getPng()'),'base64')))await once(ff.stdin,'drain');if(f%180===0)console.log('Rendered '+f+'/1080')}
  ff.stdin.end();const [code]=await done;await fs.writeFile(path.join(out,'encode.log'),log);assert.equal(code,0,log);console.log('COMPLETE: farm100-pixel-opart-v21.mp4');
 }
 win.destroy();server.close();app.quit();
}
main().catch(e=>{console.error(e);app.exit(1)});

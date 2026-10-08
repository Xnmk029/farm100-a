const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),{spawn}=require('node:child_process'),{once}=require('node:events'),assert=require('node:assert/strict');
const root=__dirname,output=path.join(root,'output'),pub=path.join(root,'public');
app.setPath('userData',path.join(output,'electron-profile'));
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('force-device-scale-factor','1');
const samplesOnly=process.argv.includes('--samples');
const sampleFrames=[0,36,120,179,180,192,270,420,509,510,525,630,719,720,738,810,990,1170,1350,1439,1440,1455,1560,1739,1740,1755,1860,1949,1950,1965,2070,2159];
async function main(){
 await fs.mkdir(output,{recursive:true});await fs.mkdir(path.join(output,'stills'),{recursive:true});
 const server=http.createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';if(!['index.html','app.js','app.js.map','data.json','timeline.json'].includes(name)){res.writeHead(404);res.end();return;}const b=await fs.readFile(path.join(pub,name));res.setHeader('Content-Type',name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.js')?'text/javascript':name.endsWith('.json')?'application/json':'application/octet-stream');res.end(b);}catch(e){res.writeHead(500);res.end(String(e));}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
 await app.whenReady();const win=new BrowserWindow({width:1920,height:1080,show:false,webPreferences:{offscreen:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 win.webContents.on('console-message',(_e,level,message)=>{if(level>=2)console.error(message);});
 await win.loadURL(`http://127.0.0.1:${port}/?render=1`);
 for(let i=0;i<200;i++){if(await win.webContents.executeJavaScript('Boolean(window.filmReady)'))break;if(i===199)throw Error('renderer not ready');await new Promise(r=>setTimeout(r,50));}
 const qa=[];
 for(const f of sampleFrames){const result=await win.webContents.executeJavaScript(`window.qaFrame(${f})`);qa.push(result);assert.equal(result.overflow.length,0,JSON.stringify(result.overflow));const png=await win.webContents.executeJavaScript('window.getPng()');await fs.writeFile(path.join(output,'stills',String(f).padStart(4,'0')+'.png'),Buffer.from(png,'base64'));}
 // Rendering a seek backwards produces identical pixels; metrics must not depend on playback history.
 await win.webContents.executeJavaScript('window.renderFrame(990)');const a=await win.webContents.executeJavaScript('window.getPng()');
 await win.webContents.executeJavaScript('window.renderFrame(1500);window.renderFrame(990)');const b=await win.webContents.executeJavaScript('window.getPng()');assert.equal(a,b,'non-deterministic seek');
 const first=await win.webContents.executeJavaScript('window.renderFrame(720)');const end=await win.webContents.executeJavaScript('window.renderFrame(1439)');assert.equal(first.tick,0);assert.equal(end.tick,919);
 const textsAt=(f)=>qa.find(q=>q.frame===f).texts.map(t=>t.text).join('\n');
 assert(textsAt(420).includes('77.10'));assert(textsAt(420).includes('49.38 / 60'));assert(textsAt(420).includes('27.72 / 40'));
 assert(textsAt(630).includes('90 / 93'));assert(textsAt(1560).includes('0 tick'));assert(textsAt(1860).includes('初始位置已经满足'));
 await fs.writeFile(path.join(output,'layout-qa.json'),JSON.stringify({pass:true,width:1920,height:1080,sampledFrames:sampleFrames,deterministicSeek:true,replayStart:first.tick,replayEnd:end.tick,checks:['all sampled text inside canvas','score fields match archived results','case coverage distinct from passes','error shows zero tick','home-goal explanation visible','seek invariant'],frames:qa},null,2));
 console.log('PASS: sampled layout, metrics, deterministic seeking; '+sampleFrames.length+' stills written.');
 if(!samplesOnly){
  const file=path.join(output,'glm53-director-v1.mp4');
  const ff=spawn('ffmpeg',['-y','-hide_banner','-loglevel','warning','-f','image2pipe','-vcodec','png','-framerate','30','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',file],{windowsHide:true});
  let err='';ff.stderr.on('data',b=>err+=b.toString());ff.stdin.on('error',e=>console.error('encoder stdin',e.message));
  const done=once(ff,'close');
  for(let f=0;f<2160;f++){
   await win.webContents.executeJavaScript(`window.renderFrame(${f})`);const png=await win.webContents.executeJavaScript('window.getPng()');if(!ff.stdin.write(Buffer.from(png,'base64')))await once(ff.stdin,'drain');
   if(f%180===0)console.log('Rendered '+f+'/2160 frames');
  }
  ff.stdin.end();const [code]=await done;await fs.writeFile(path.join(output,'encode.log'),err);if(code!==0)throw Error('ffmpeg failed '+code+': '+err);console.log('VIDEO COMPLETE '+file);
 }
 win.destroy();server.close();app.quit();
}
main().catch(e=>{console.error(e.stack);app.exit(1);});

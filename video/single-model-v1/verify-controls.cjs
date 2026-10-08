const {app,BrowserWindow}=require('electron');
const {spawn}=require('node:child_process'),path=require('node:path'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
app.setPath('userData',path.join(__dirname,'output','controls-profile'));
const server=spawn(process.execPath,[path.join(__dirname,'serve.cjs')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 const url=await new Promise((resolve,reject)=>{server.stdout.on('data',b=>{const m=String(b).match(/http:\/\/127\.0\.0\.1:\d+/);if(m)resolve(m[0]);});server.on('error',reject);});
 await app.whenReady();const win=new BrowserWindow({show:false,webPreferences:{offscreen:true,backgroundThrottling:false}});
 await win.loadURL(url);const js=s=>win.webContents.executeJavaScript(s);
 for(let i=0;!await js('Boolean(window.filmReady)');i++){assert(i<100);await delay(50);}
 await js("document.querySelector('#play').click()");await delay(650);
 const advanced=await js("+document.querySelector('#seek').value");assert(advanced>0,'play did not advance');
 await js("document.querySelector('#play').click()");const paused=await js("+document.querySelector('#seek').value");await delay(300);assert.equal(await js("+document.querySelector('#seek').value"),paused);
 await js("document.querySelector('#seek').value='1560';document.querySelector('#seek').dispatchEvent(new Event('input'))");assert.equal(await js("document.querySelector('#time').textContent"),'52.0 / 72s');
 await js("document.querySelector('#seek').value='2159';document.querySelector('#seek').dispatchEvent(new Event('input'));document.querySelector('#play').click()");await delay(300);
 let restarted=0;for(let i=0;i<30;i++){restarted=await js("+document.querySelector('#seek').value");if(restarted>0)break;await delay(100);}assert(restarted>0&&restarted<150,'restart frame: '+restarted);
 const result={pass:true,playAdvancedFrames:advanced,pauseStable:true,seekFrame:1560,restartFromEnd:true};await fs.writeFile(path.join(__dirname,'output','controls-qa.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));win.destroy();server.kill();app.quit();
}
main().catch(e=>{console.error(e);server.kill();app.exit(1);});

import {contextBridge,ipcRenderer} from 'electron';
contextBridge.exposeInMainWorld('farm',{
  examples:()=>ipcRenderer.invoke('examples'),start:(r:unknown)=>ipcRenderer.invoke('start',r),cancel:()=>ipcRenderer.invoke('cancel'),
  openCode:()=>ipcRenderer.invoke('openCode'),saveWorkspace:(r:unknown)=>ipcRenderer.invoke('saveWorkspace',r),openWorkspace:()=>ipcRenderer.invoke('openWorkspace'),
  openRun:()=>ipcRenderer.invoke('openRun'),export:(r:unknown)=>ipcRenderer.invoke('export',r),
  onProgress:(callback:(p:unknown)=>void)=>{const listener=(_event:unknown,p:any)=>{callback(p);if(p.type==='events')ipcRenderer.send('ack',{runId:p.runId,sequence:p.sequence});};ipcRenderer.on('progress',listener);return()=>ipcRenderer.removeListener('progress',listener);}
});

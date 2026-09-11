import {contextBridge,ipcRenderer} from 'electron';
contextBridge.exposeInMainWorld('farm',{
  benchmarkV2Get:()=>ipcRenderer.invoke('benchmarkV2:get'),benchmarkV2Import:()=>ipcRenderer.invoke('benchmarkV2:import'),benchmarkV2Review:(r:unknown)=>ipcRenderer.invoke('benchmarkV2:review',r),benchmarkV2Evidence:(r:unknown)=>ipcRenderer.invoke('benchmarkV2:evidence',r),benchmarkV2Export:(format:string)=>ipcRenderer.invoke('benchmarkV2:export',format),
  gardenExamples:()=>ipcRenderer.invoke('gardenExamples'),gardenViewReady:()=>ipcRenderer.invoke('gardenViewReady'),gardenStart:(r:unknown)=>ipcRenderer.invoke('gardenStart',r),gardenCancel:()=>ipcRenderer.invoke('gardenCancel'),
  gardenSave:(r:unknown)=>ipcRenderer.invoke('gardenSave',r),gardenOpen:()=>ipcRenderer.invoke('gardenOpen'),gardenExport:(r:unknown)=>ipcRenderer.invoke('gardenExport',r),
  gardenHistory:(query:unknown)=>ipcRenderer.invoke('gardenHistory',query),gardenHistoryOpen:(request:unknown)=>ipcRenderer.invoke('gardenHistoryOpen',request),
  gardenHistoryPaged:(id:string)=>ipcRenderer.invoke('gardenHistoryPaged',id),gardenHistoryWindow:(request:unknown)=>ipcRenderer.invoke('gardenHistoryWindow',request),
  onGardenProgress:(callback:(p:unknown)=>void)=>{const fn=(_event:unknown,p:any)=>callback(p);ipcRenderer.on('gardenProgress',fn);return()=>ipcRenderer.removeListener('gardenProgress',fn);},
  onGardenPlayback:(callback:(p:unknown)=>void)=>{const fn=(_event:unknown,p:any)=>callback(p);ipcRenderer.on('gardenPlayback',fn);return()=>ipcRenderer.removeListener('gardenPlayback',fn);},
  gardenFrameReady:(frame:number)=>ipcRenderer.invoke('gardenFrameReady',frame),
  examples:()=>ipcRenderer.invoke('examples'),start:(r:unknown)=>ipcRenderer.invoke('start',r),cancel:()=>ipcRenderer.invoke('cancel'),
  openCode:()=>ipcRenderer.invoke('openCode'),saveWorkspace:(r:unknown)=>ipcRenderer.invoke('saveWorkspace',r),openWorkspace:()=>ipcRenderer.invoke('openWorkspace'),
  openRun:()=>ipcRenderer.invoke('openRun'),export:(r:unknown)=>ipcRenderer.invoke('export',r),
  onProgress:(callback:(p:unknown)=>void)=>{const listener=(_event:unknown,p:any)=>{callback(p);if(p.type==='events')ipcRenderer.send('ack',{runId:p.runId,sequence:p.sequence});};ipcRenderer.on('progress',listener);return()=>ipcRenderer.removeListener('progress',listener);}
});

declare const OpArt:any;
const canvas=document.querySelector<HTMLCanvasElement>('#film')!,g=canvas.getContext('2d')!;
const W=1920,H=1080,C={paper:'#f6f5f1',ink:'#13141a',blue:'#0017f7',cyan:'#00dbec',muted:'#626874',line:'#d6d9df',red:'#bc353b',soft:'#e6eafa',white:'#ffffff'};
let data:any,plan:any,story:any,runs:any[],frame=0,playing=false,cursor=0,last=0,texts:any[]=[],audio:HTMLAudioElement,qa:any={};
const clamp=(n:number)=>Math.max(0,Math.min(1,n)),ease=(n:number)=>1-Math.pow(1-clamp(n),3);
function box(x:number,y:number,w:number,h:number,c:string=C.white){g.fillStyle=c;g.fillRect(x,y,w,h)}
function line(x:number,y:number,xx:number,yy:number,c:string=C.line,w=2){g.strokeStyle=c;g.lineWidth=w;g.beginPath();g.moveTo(x,y);g.lineTo(xx,yy);g.stroke()}
function txt(s:string,x:number,y:number,size=28,c:string=C.ink,font='Sans',align:CanvasTextAlign='left'){
 g.font=`${size}px ${font}`;g.fillStyle=c;g.textAlign=align;g.textBaseline='alphabetic';g.fillText(s,x,y);
 const w=g.measureText(s).width,p=g.getTransform().transformPoint({x:x-(align==='right'?w:align==='center'?w/2:0),y:y-size});texts.push({s,x:p.x,y:p.y,w,size});
}
function paragraph(s:string,x:number,y:number,width:number,size=28,c:string=C.muted,lh=42){g.font=`${size}px Sans`;let row='',n=0;for(const a of s){if(g.measureText(row+a).width>width&&row){txt(row,x,y+n*lh,size,c);row='';n++}row+=a}if(row)txt(row,x,y+n*lh,size,c);return y+(n+1)*lh}
function label(s:string,x:number,y:number,w:number){box(x,y,w,40,C.soft);txt(s,x+14,y+28,21,C.blue)}
function symbol(x:number,y:number,which:number,size=14){g.lineWidth=3;g.strokeStyle=C.ink;g.fillStyle=C.ink;if(which===0){g.beginPath();g.arc(x,y,size,0,Math.PI*2);g.fill()}else{g.strokeRect(x-size,y-size,size*2,size*2)}}
function at(r:any,tick:number){let lo=0,hi=r.trace.length;while(lo<hi){const m=(lo+hi)>>1;if(r.trace[m].tick<=tick)lo=m+1;else hi=m}return r.trace[Math.max(0,lo-1)]}
function interp(r:any,actor:number,tick:number,p:any){const m=r.moves.find((m:any)=>m.actor===actor&&m.start<=tick&&m.end>tick);if(!m)return p;const u=(tick-m.start)/(m.end-m.start);return {x:m.from.x+(m.to.x-m.from.x)*u,y:m.from.y+(m.to.y-m.from.y)*u}}
function board(r:any,tick:number,x:number,y:number,size:number,mode:number,depth=0,heat=false){
 const st=at(r,tick),n=r.initial.size,cs=size/n,maze=!!r.initial.maze;
 // A single affine shallow plane; at depth=0 all data use exact flat grid coordinates.
 g.save();g.translate(x,y);g.transform(1,-depth*.1,depth*.25,1-depth*.23,0,depth*size*.1);
 if(depth){box(0,size,size,depth*24,C.ink);box(size,0,depth*18,size,C.blue)}
 const pos=(xx:number,yy:number)=>({x:(xx+.5)*cs,y:(yy+.5)*cs});
 for(let j=0;j<n;j++)for(let i=0;i<n;i++){
  const k=j*n+i,known=!maze||st.maze.seen[k];let color=maze?(known?'#e4e8ff':'#f1f1ef'):(st.crops[k]?'#dce2fb':'#f8f8f5');
  if(heat&&st.visits[k]>1)color=`rgb(${Math.max(110,230-st.visits[k]*4)},${Math.max(130,234-st.visits[k]*3)},248)`;
  box(i*cs,j*cs,cs,cs,color);g.strokeStyle='#fff';g.lineWidth=1;g.strokeRect(i*cs,j*cs,cs,cs);
  if(!maze&&st.crops[k]){line(i*cs+cs*.45,j*cs+cs*.7,i*cs+cs*.45,j*cs+cs*.28,C.ink,2);line(i*cs+cs*.45,j*cs+cs*.5,i*cs+cs*.63,j*cs+cs*.32,C.ink,2)}
  if(maze){
   const walls=r.initial.maze.walls[k],gates=r.initial.maze.gates[k],edges=[[i*cs,j*cs,(i+1)*cs,j*cs],[i*cs+cs,j*cs,i*cs+cs,j*cs+cs],[i*cs,j*cs+cs,i*cs+cs,j*cs+cs],[i*cs,j*cs,i*cs,j*cs+cs]];
   edges.forEach((v,b)=>{const bit=[1,4,2,8][b];if(walls&bit)line(v[0],v[1],v[2],v[3],known?'#333945':'#b6bbc5',known?3:2);else if(gates&bit){g.save();g.setLineDash(st.maze.keys?[3,8]:[7,3]);line(v[0],v[1],v[2],v[3],C.blue,2);g.restore()}});
   const loot=st.maze.loot[k];if(loot){const p=pos(i,j);g.globalAlpha=known?1:.35;if(loot==='key'){g.strokeStyle=C.ink;g.lineWidth=3;g.beginPath();g.arc(p.x-4,p.y,6,0,Math.PI*2);g.stroke();line(p.x+2,p.y,p.x+13,p.y,C.ink,3)}else{g.fillStyle=C.ink;g.beginPath();g.moveTo(p.x,p.y-10);g.lineTo(p.x+9,p.y);g.lineTo(p.x,p.y+10);g.lineTo(p.x-9,p.y);g.fill()}g.globalAlpha=1}
  }
 }
 const recent=r.moves.filter((m:any)=>m.end<=tick).slice(-22);
 g.save();g.globalAlpha=.32;for(const m of recent){const a=pos(m.from.x,m.from.y),b=pos(m.to.x,m.to.y);line(a.x,a.y,b.x,b.y,C.blue,3)}g.restore();
 if(maze){const p=pos(.0,.0);g.strokeStyle=C.blue;g.lineWidth=2;g.strokeRect(p.x-cs*.25,p.y-cs*.25,cs*.5,cs*.5);}
 const actors=st.actors??[{id:0,x:st.x,y:st.y}],groups=new Map<string,any[]>();
 for(const a of actors){const p=interp(r,a.id,tick,a),k=`${p.x.toFixed(2)},${p.y.toFixed(2)}`;const group=groups.get(k)??[];group.push({...p,id:a.id});groups.set(k,group)}
 for(const group of groups.values())for(const [i,a] of group.entries()){
  const p=pos(a.x,a.y);if(group.length>1){p.x+=(i%3-1)*cs*.25;p.y+=(Math.floor(i/3)-.5)*cs*.25}
  const radius=maze?cs*.19:cs*.145;g.fillStyle=mode===0?C.ink:C.white;g.strokeStyle=C.ink;g.lineWidth=2;
  if(mode===0){g.beginPath();g.arc(p.x,p.y,radius,0,Math.PI*2);g.fill()}else{g.fillRect(p.x-radius,p.y-radius,radius*2,radius*2);g.strokeRect(p.x-radius,p.y-radius,radius*2,radius*2)}
  if(!maze){g.font=`${Math.max(11,cs*.18)}px Code`;g.textAlign='center';g.textBaseline='middle';g.fillStyle=mode===0?C.white:C.ink;g.fillText(String(a.id),p.x,p.y)}
 }
 g.restore();return st;
}
function base(index:number,t:number){
 box(0,0,W,H,C.paper);line(64,92,1856,92,C.ink,2);txt('FARM100',64,58,31,C.ink,'Code');txt('程序行为档案',254,57,24,C.muted);txt('GPT-6.1 Sol / high  ·  Codex 子代理',1856,56,25,C.ink,'Sans','right');
 txt(story.eyebrow,66,145,23,C.blue,'Code');txt(story.chapters[index].title,64,220,56,C.ink,'Tone');
 // A small static optical identity remains visible without putting texture behind evidence.
 OpArt.glyph(g,'FARM',1730,119,.69,index===0?t:0);
 ['问题','任务','执行','定位','修订','结果','结论'].forEach((s,i)=>{txt(s,70+i*92,911,20,i===index?C.blue:C.muted);if(i===index)box(70+i*92,923,40,3,C.blue)});
 txt('种子 7 · 原始提交记录重建 · 身份自报',1850,911,20,C.muted,'Sans','right');
 box(64,950,1792,91,C.ink);paragraph(story.chapters[index].narration,88,987,1738,29,C.white,39);
 box(64,1060,1792,4,C.line);box(64,1060,1792*frame/(story.totalFrames-1),4,C.blue);
}
function hook(t:number){
 const u=ease(t/1.0);g.save();g.translate(-40*(1-u),0);g.globalAlpha=u;OpArt.glyph(g,'FARM',75,304,3.25,t);g.restore();
 const maze=story.id==='maze-3';label('真实首答 → 唯一一次修订',890,298,367);
 txt(maze?'3 件遗物':'8 台无人机',888,435,84,C.ink,'Tone');txt(maze?'收齐 ≠ 正常结束':'分工 ≠ 正确执行',890,528,53,C.blue,'Tone');
 line(895,576,1810,576,C.ink,2);paragraph(maze?'不是漏掉宝物，而是“有变化”的条件再也关不掉。':'设计了各管一行，却在去往目标行时走反方向。',897,642,855,32,C.ink,50);
 label('一份会话中的一个案例',899,788,343);txt('保留首答失败，展示修订效果',1271,816,25,C.muted);
}
function rules(t:number){
 const maze=story.id==='maze-3';board(runs[0],0,122,306,505,0,1-ease((t-1)/2));
 label(maze?'全知地图 / 观众视角':'成熟麦田 / 初始状态',105,831,340);
 txt(story.goal,825,333,42,C.ink,'Tone');
 const items=maze?[['01','拿钥匙','钥匙解锁部分通道'],['02','收集 3 件遗物','菱形是遗物，圆环是钥匙'],['03','回到左上起点','方框是起点；浅色表示尚未访问']]:[['01','各按编号分行','编号 0—7 对应目标行'],['02','采收 64 株小麦','每株产 3 粮；目标库存 192'],['03','南方 y 增加','初始都在 (0,0)，先移动再采收']];
 items.forEach(([n,heading,note],i)=>{const y=421+i*132;txt(n,826,y,30,C.blue,'Code');txt(heading,900,y,35);txt(note,900,y+44,26,C.muted);line(826,y+71,1778,y+71)});
 txt(maze?'完整地图不等于程序已经知道；强调层使用引擎访问记录。':'动作按原并发时间呈现；同位置编号略作排布以便区分。',826,863,23,C.muted);
}
function side(r:any,i:number,tick:number,terminal=false){
 const x=64+i*916;box(x,274,876,604);symbol(x+35,315,i,11);txt(i===0?'A / 首次提交':'B / 唯一修订',x+61,327,30);txt(`tick ${Math.floor(Math.min(tick,r.endTick))}`,x+841,325,24,C.blue,'Code','right');
 const st=board(r,Math.min(tick,r.endTick),x+29,357,467,i,0,terminal&&story.id==='maze-3'),mx=x+526;
 const maze=story.id==='maze-3';txt(maze?'遗物收集':'收获株数',mx,400,25,C.muted);txt(maze?`${st.maze.collected} / 3`:`${st.harvests} / 64`,mx,462,45,C.ink,'Code');
 txt(maze?'无效收集':'失败移动',mx,534,25,C.muted);txt(String(maze?st.counts.failedCollect:st.counts.failedMove),mx,595,51,st.counts.failed?C.red:C.ink,'Code');
 if(maze){txt(`钥匙 ${st.maze.keys}`,mx,665,27);txt(`位置 (${st.x},${st.y})`,mx,713,25,C.muted,'Code')}else{st.counts.byActor.forEach((a:any,k:number)=>{const yy=640+k*24;txt(String(k),mx,yy+15,16,C.muted,'Code');box(mx+25,yy+1,174,12,C.line);box(mx+25,yy+1,174*a.harvest/8,12,C.blue)});txt('各编号采收量 / 每行 8 株',mx,861,20,C.muted)}
 txt(terminal?(r.case.passed?'完成 · 原判题通过':r.reason==='recording_limit'?'终止 · 记录上限':'终止 · 超出预算'):(tick>=r.endTick&&r.case.passed?'已结束，保持真实终态':'归档事件重建'),x+29,856,23,terminal&&!r.case.passed?C.red:C.muted);
 return st;
}
function compare(local:number,duration:number){
 const max=runs[1].endTick,tick=Math.min(max,Math.max(0,(local-.8)/(duration-1.6))*max);const maze=story.id==='maze-3';
 side(runs[0],0,tick);side(runs[1],1,tick);qa.ticks=[Math.min(tick,runs[0].endTick),Math.min(tick,runs[1].endTick)];
 txt(`共享时钟 0 → ${max} tick / ${(duration-1.6).toFixed(1)} s · 均匀压缩`,956,263,21,C.muted,'Sans','center');
}
function codeBlock(lines:string[],x:number,y:number,w:number,highlight:number[]=[]){box(x,y,w,lines.length*44+53,C.ink);lines.forEach((s,i)=>txt(s,x+22,y+37+i*44,24,highlight.includes(i)?'#59f0ff':'#f0f0ed','Code'));}
function diagnose(local:number){
 const maze=story.id==='maze-3',tick=maze?32:8;label('冻结在首次失败附近 · 记录证据',68,269,466);board(runs[0],tick,99,337,452,0);
 txt(`首答 tick ${tick}`,100,839,31,C.blue,'Code');
 label('相关实现 / 原始源码第 1 行摘录',707,269,463);
 if(maze){
  txt('本地为空，全局却已有钥匙',708,358,37,C.ink,'Tone');
  codeBlock(['sense(): { loot: null, keys: 1, ... }','if (loot(s)) {','  collect();','  changed = true;','}'],708,390,1098,[0,1,3]);
  txt('接口值摘录 + 源码摘录（分行排版，省略其余字段）',729,688,22,C.muted);
  ['全局 keys=1','判断有物品','失败仍 changed=true'].forEach((s,i)=>{box(708+i*368,731,343,69,i===2?C.soft:C.white);txt(s,728+i*368,775,25,i===2?C.blue:C.ink)});
  txt('判断函数递归检索整个 sense 对象，也匹配字段 keys。',710,853,27,C.muted);
 }else{
  txt('y 需要增加，却调用向北移动',708,358,37,C.ink,'Tone');
  codeBlock(['while (p.y < y) {','  move(North);','  p = get_position();','}'],708,390,1098,[0,1]);
  txt('North: y − 1      South: y + 1',730,659,32,C.blue,'Code');
  paragraph('越界返回 false → 坐标仍为 0 → p.y < y 仍成立。',710,733,1050,34,C.ink,50);
  txt('首答代码摘录；此处没有“当前执行行”追踪。',710,853,26,C.muted);
 }
}
function fix(local:number){
 const maze=story.id==='maze-3';label('代码分析 / 原始两份答卷摘录',66,269,427);
 const left=maze?['if (loot(s)) {','  collect();','  changed = true;','}']:['while (p.y < y) {','  move(North);','  p = get_position();','}'];
 const right=maze?['const local = s.loot !== undefined','  ? s.loot : {key:s.key,relic:s.relic};','if (loot(local) && !collected.has(k)) {','  collect(); collected.add(k);','  changed = true; s = sense();','}']:['while (p.y < y) {','  move(South);','  p = get_position();','}'];
 txt('A / 首答',86,366,34);txt('B / 修订',1003,366,34);codeBlock(left,65,393,870,[maze?0:1]);codeBlock(right,981,393,872,maze?[0,2,3]:[1]);
 const items=maze?[['限定对象','只判断当前位置 loot'],['限制重复','已收坐标加入集合'],['允许退出','无新物品时 changed 保持 false']]:[['方向一致','目标 y 增加时向 South'],['保留策略','仍按编号分行、蛇形访问'],['落实分工','每台在自己的目标行采收']];
 items.forEach(([h,s],i)=>{const x=65+i*608;box(x,749,574,126,C.white);txt(h,x+23,792,30,C.blue,'Tone');txt(s,x+23,839,24,C.muted)});
}
function terminal(){side(runs[0],0,runs[0].endTick,true);side(runs[1],1,runs[1].endTick,true);txt(story.id==='maze-3'?'终态跳时 / 两边并非同一 tick / 底色越深＝成功到访次数越多':'终态跳时 / 两边并非同一 tick / 柱形表示各编号已收获株数',960,263,22,C.muted,'Sans','center');qa.ticks=runs.map(r=>r.endTick)}
function result(){
 const maze=story.id==='maze-3';
 label('全部规定种子 / 原始判题结果',66,269,430);
 const x=65,w=1000;box(x,341,w,355,C.white);txt('SEED',99,389,25,C.muted,'Code');txt('首答',409,389,27);txt('修订',751,389,27);
 [7,19,99].forEach((seed,i)=>{const y=465+i*81;txt(String(seed),101,y,36,C.ink,'Code');txt('未通过',408,y,31,C.red);txt('通过',749,y,31,C.blue);line(95,y+24,1034,y+24)});
 const avg=(r:any)=>r.allCases.reduce((s:number,c:any)=>s+c.objective,0)/r.allCases.length;
 txt('本题客观分 /60',96,751,29,C.muted);txt(`${avg(runs[0]).toFixed(2)} → ${avg(runs[1]).toFixed(2)}`,97,834,62,C.ink,'Code');
 txt('本次案例说明',1164,377,36,C.ink,'Tone');paragraph(maze?'终止条件修复后，三种子通关。重复遍历仍有成本，通关不等于最短路线。':'分工思路不变，纠正方向即可完成。失败归因应落在实现细节。',1166,443,633,34,C.ink,56);
 line(1166,629,1811,629,C.line,2);txt('全套背景',1166,685,28,C.muted);txt('首答 29 → 修订后 31 / 31 题',1166,741,33);paragraph('本片展示 seed 7；总表保留全部案例。设计评审未混入本页客观分。',1166,797,633,25,C.muted,38);
}
function render(f:number){frame=Math.max(0,Math.min(story.totalFrames-1,Math.round(f)));texts=[];qa={};
 const index=story.chapters.findIndex((c:any)=>frame>=c.startFrame&&frame<c.startFrame+c.durationFrames),ch=story.chapters[index],local=(frame-ch.startFrame)/30;
 base(index,frame/30);g.save();const enter=ease(local/.45);g.globalAlpha=enter;g.translate(22*(1-enter),0);
 if(index===0)hook(local);if(index===1)rules(local);if(index===2)compare(local,ch.seconds);if(index===3)diagnose(local);if(index===4)fix(local);if(index===5)terminal();if(index===6)result();g.restore();
 const seek=document.querySelector<HTMLInputElement>('#seek')!;seek.value=String(frame);document.querySelector('#time')!.textContent=`${(frame/30).toFixed(1)} / ${story.seconds}s`;
 const overflow=texts.filter(t=>t.x<0||t.y<0||t.x+t.w>W||t.y+t.size+10>H);
 return {frame,chapter:ch.id,overflow,texts,...qa};
}
function select(id:string){story=plan.stories.find((s:any)=>s.id===id);runs=data.stories[id].runs;playing=false;cursor=0;audio?.pause();audio=new Audio('/audio/'+id+'.wav');document.querySelector<HTMLSelectElement>('#story')!.value=id;document.querySelector<HTMLInputElement>('#seek')!.max=String(story.totalFrames-1);document.querySelector('#play')!.textContent='播放';render(0);return {id,frames:story.totalFrames,chapters:story.chapters};}
function animate(now:number){if(playing){cursor+=Math.min(.1,(now-last)/1000)*30;if(cursor>=story.totalFrames-1){cursor=story.totalFrames-1;playing=false;audio.pause();document.querySelector('#play')!.textContent='播放'}render(cursor)}last=now;requestAnimationFrame(animate)}
(async()=>{[data,plan]=await Promise.all([fetch('/data.json').then(r=>r.json()),fetch('/plan.json').then(r=>r.json())]);await Promise.all(['36px Tone','30px Sans','26px Code'].map(s=>document.fonts.load(s)));await document.fonts.ready;
 select(new URLSearchParams(location.search).get('story')||'maze-3');
 document.querySelector('#story')!.addEventListener('change',e=>select((e.target as HTMLSelectElement).value));
 document.querySelector('#play')!.addEventListener('click',()=>{playing=!playing;cursor=frame;audio.currentTime=frame/30;if(playing)audio.play().catch(()=>{});else audio.pause();document.querySelector('#play')!.textContent=playing?'暂停':'播放'});
 document.querySelector('#seek')!.addEventListener('input',e=>{cursor=Number((e.target as HTMLInputElement).value);audio.currentTime=cursor/30;render(cursor)});
 Object.assign(window,{filmReady:true,renderFrame:render,selectStory:select,getPng:()=>canvas.toDataURL('image/png').split(',')[1],getPlan:()=>plan,opartCheck:()=>OpArt.check()});requestAnimationFrame(animate);
})();

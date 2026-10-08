import {gardenAt,gardenSequence} from '../../packages/garden/core';
const W=1920,H=1080,FPS=30,END=2160;
const canvas=document.querySelector<HTMLCanvasElement>('#film')!,ctx=canvas.getContext('2d')!;
const C={paper:'#f3f0e7',ink:'#163b36',muted:'#62746a',line:'#d4d9cc',green:'#25876d',mint:'#d8e7da',orange:'#df603e',red:'#c5483d',sand:'#e8dfc7',white:'#fffdf7',navy:'#1e353b'};
const actorColors=['#d8673e','#388e85','#6388bb','#946ea5'];
let d:any,frame=0,playing=false,last=0,playCursor=0,active=0;
let texts:{text:string,x:number,y:number,w:number,size:number}[]=[];
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const ease=(v:number)=>1-Math.pow(1-clamp(v),3);
function box(x:number,y:number,w:number,h:number,fill=C.white,r=20){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function line(x:number,y:number,x2:number,y2:number,color=C.line,width=2){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke();}
function text(s:string,x:number,y:number,size=28,color=C.ink,weight=400,align:CanvasTextAlign='left'){
 ctx.font=`${weight} ${size}px "Microsoft YaHei", sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='alphabetic';ctx.fillText(s,x,y);
 const w=ctx.measureText(s).width,p=ctx.getTransform().transformPoint({x:align==='right'?x-w:align==='center'?x-w/2:x,y:y-size});texts.push({text:s,x:p.x,y:p.y,w,size});
}
function para(s:string,x:number,y:number,width:number,size=28,color=C.muted,spacing=44){
 ctx.font=`400 ${size}px "Microsoft YaHei", sans-serif`;let row='',n=0;
 for(const c of s){if(ctx.measureText(row+c).width>width&&row){text(row,x,y+n*spacing,size,color);row='';n++;}row+=c;}if(row)text(row,x,y+n*spacing,size,color);return y+(n+1)*spacing;
}
function pill(s:string,x:number,y:number,w:number,color=C.green,bg=C.mint){box(x,y,w,44,bg,22);text(s,x+w/2,y+30,22,color,600,'center');}
function circle(x:number,y:number,r:number,color:string){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
function check(x:number,y:number,ok=true){circle(x,y,16,ok?C.green:C.red);text(ok?'✓':'×',x,y+8,24,C.white,700,'center');}
function enter(t:number,delay:number,fn:()=>void){const u=ease((t-delay)/.55);ctx.save();ctx.globalAlpha*=u;ctx.translate(32*(1-u),0);fn();ctx.restore();}
function title(kicker:string,heading:string,sub:string,t:number){enter(t,0,()=>{text(kicker,76,147,23,C.orange,700);text(heading,72,232,58,C.ink,700);text(sub,76,286,27,C.muted);});}
function footer(s:string){text(s,76,977,23,C.muted);}
function metric(label:string,value:string,x:number,y:number,w:number,color=C.ink){box(x,y,w,190);text(label,x+30,y+45,25,C.muted);text(value,x+28,y+130,66,color,700);}
function background(t:number,scene:number){
 ctx.fillStyle=C.paper;ctx.fillRect(0,0,W,H);
 ctx.strokeStyle='#e6e7dc';ctx.lineWidth=1;for(let x=32;x<W;x+=48){ctx.beginPath();ctx.moveTo(x,104);ctx.lineTo(x,997);ctx.stroke();}
 ctx.fillStyle=C.paper;ctx.fillRect(0,0,W,102);ctx.fillRect(0,998,W,82);
 text('FARM100',74,65,33,C.ink,800);text('模型实测档案',291,64,24,C.muted);
 text(`${d.model}  /  ${d.agent}`,1846,63,27,C.ink,600,'right');
 line(74,94,1846,94,C.ink,2);
 const names=['定位','成绩','覆盖','能力','错题','解释','结论'];
 names.forEach((n,i)=>{circle(86+i*130,1033,5,i===scene?C.orange:C.line);text(n,104+i*130,1041,22,i===scene?C.ink:C.muted,i===scene?700:400);});
 text('Agent 会话赛道 · 模型身份自报',1844,1040,21,C.muted,400,'right');
 box(74,1066,1772,4,C.line,0);box(74,1066,1772*t/72,4,C.orange,0);
}
function opening(t:number){
 enter(t,.05,()=>{text('单模型 · 实测结果',77,191,28,C.orange,700);text(d.model,70,367,146,C.ink,800);text('让每一分，都有出处。',78,470,58,C.ink,700);para('从真实答卷出发，观看执行、核对成绩，再定位失败。',80,546,980,31);});
 enter(t,.35,()=>{pill('最高推理档（自报）',80,629,270);pill('一次失败修订机会',366,629,260);});
 const u=ease((t-.5)/1.3),cx=1460,cy=445;
 ctx.strokeStyle=C.line;ctx.lineWidth=30;ctx.beginPath();ctx.arc(cx,cy,207,0,Math.PI*2);ctx.stroke();
 ctx.strokeStyle=C.green;ctx.beginPath();ctx.arc(cx,cy,207,-Math.PI/2,-Math.PI/2+u*(30/31)*Math.PI*2);ctx.stroke();
 text('30',cx-10,cy+40,135,C.ink,800,'center');text('/ 31 题通过',cx,cy+101,29,C.muted,400,'center');
 enter(t,.8,()=>{text('1 题未通关',cx,cy+280,31,C.red,600,'center');});
 line(80,754,1840,754);text('本片展示',80,810,24,C.muted);['具体跑分','运行能力','错题解析'].forEach((s,i)=>{text(`0${i+1}`,80+i*574,892,29,C.orange,700);text(s,145+i*574,893,38,C.ink,600);});
}
function scores(t:number){
 title('01 / SCORECARD',`${d.total.toFixed(2)} 分，如何构成？`,'一次修订后 · 沿用冻结权重 · 设计分为独立 AI 评审',t);
 enter(t,.15,()=>{box(76,339,645,544,C.ink);text('综合得分 / 100',116,400,28,C.mint);text(d.total.toFixed(2),111,588,154,C.white,800);text('客观成绩 + 设计评审',118,667,29,C.mint);line(116,710,678,710,'#446159');text('首答覆盖不足，未发布首答总分',118,783,27,C.white);});
 [{label:'客观成绩',v:d.objective,max:60,note:'执行正确性 · 操作规范 · 效率',color:C.green},{label:'设计评审',v:d.manual,max:40,note:'策略 · 论证 · 复杂度 · 边界',color:C.orange}].forEach((r,i)=>enter(t,.3+i*.17,()=>{
 const x=767,y=339+i*285;box(x,y,1075,259);text(r.label,x+34,y+57,35,C.ink,700);text(`${r.v.toFixed(2)} / ${r.max}`,x+1040,y+65,49,r.color,700,'right');text(r.note,x+35,y+114,26,C.muted);box(x+36,y+156,995,28,C.line,14);box(x+36,y+156,995*r.v/r.max*ease((t-.65-i*.2)/1.1),28,r.color,14);text(i===0?'规则计算，保留真实失败记录':'评阅原始答卷，含主观判断',x+36,y+222,24,C.muted);
 }));
 footer('挑战 70%  ·  教学 10%  ·  标准排序 20%  ｜  模块内按题目权重合成');
}
function coverage(t:number){
 title('02 / COVERAGE','完成测试，不等于全部通关。','覆盖、通关与满分，分别呈现。',t);
 [ ['已覆盖案例','93 / 93',C.ink],['通过案例','90 / 93',C.green],['通过题目','30 / 31',C.green] ].forEach(([a,b,c],i)=>enter(t,.12+i*.1,()=>metric(a,b,76+i*596,332,576,c)));
 d.groups.forEach((g:any,i:number)=>enter(t,.45+i*.055,()=>{
 const x=76+(i%4)*448,y=553+Math.floor(i/4)*154;box(x,y,426,135);text(g.name,x+24,y+43,27,C.ink,600);text(`${g.passed} / ${g.total}`,x+398,y+43,28,g.passed===g.total?C.green:C.red,700,'right');
 for(let j=0;j<g.total;j++){box(x+24+j*31,y+76,23,23,j<g.passed?C.green:C.red,5);}
 }));
 footer('唯一未通关：maze-3「带钥匙回家」 · 对应 3 个种子案例');
}
const completed=()=>d.run.events.filter((e:any)=>e.kind==='complete');
function diamond(x:number,y:number,w:number,h:number,fill:string,stroke='#c4cfbc'){
 ctx.beginPath();ctx.moveTo(x,y-h/2);ctx.lineTo(x+w/2,y);ctx.lineTo(x,y+h/2);ctx.lineTo(x-w/2,y);ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=1.4;ctx.stroke();
}
function farm(state:any,tick:number,t:number){
 const n=state.size,tw=110,th=57,ox=606,oy=469;
 const pos=(x:number,y:number)=>({x:ox+(x-y)*tw/2,y:oy+(x+y)*th/2});
 // Distinct row bands annotate actual static ownership. Crop and actor state is replayed.
 for(let s=0;s<=2*n-2;s++)for(let y=0;y<n;y++){const x=s-y;if(x<0||x>=n)continue;const c=state.cells[y*n+x],p=pos(x,y);
 diamond(p.x,p.y,tw-3,th-2,c.soil?'#d8c7a3':(y%2?'#dde5d3':'#e4ead9'));
 if(x===0){text(String(y),p.x-72,p.y+7,20,C.muted,500);}
 if(c.crop){const height=c.ready?50:36;ctx.fillStyle=c.damaged?C.orange:'#5a8ca4';ctx.beginPath();ctx.moveTo(p.x-14,p.y-5);ctx.lineTo(p.x-10,p.y-height);ctx.lineTo(p.x,p.y-height-13);ctx.lineTo(p.x+14,p.y-height+4);ctx.lineTo(p.x+15,p.y-5);ctx.closePath();ctx.fill();line(p.x,p.y-height+2,p.x,p.y-8,'#cae1e6',2);
 if(c.damaged)text('!',p.x+21,p.y-30,26,C.red,700);else if(c.repaired)circle(p.x+21,p.y-24,5,C.green);
 }
 }
 const ev=completed();
 for(let id=0;id<4;id++){
 const moves=ev.filter((e:any)=>e.actor===id&&e.action==='move'&&e.value===true&&e.tick<=tick).slice(-11);
 ctx.strokeStyle=actorColors[id];ctx.lineWidth=3;ctx.globalAlpha=.35;ctx.beginPath();moves.forEach((e:any,i:number)=>{const a=e.fleet.drones[id],p=pos(a.x,a.y);if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});ctx.stroke();ctx.globalAlpha=1;
 const a=state.fleet.drones[id];let x=a.x,y=a.y;
 const next=ev.find((e:any)=>e.actor===id&&e.action==='move'&&e.value===true&&e.fromTick<=tick&&e.tick>tick);
 if(next){const target=next.fleet.drones[id],u=clamp((tick-next.fromTick)/(next.tick-next.fromTick));x+=(target.x-x)*u;y+=(target.y-y)*u;}
 const p=pos(x,y),peer=state.fleet.drones.filter((a2:any)=>a2.x===a.x&&a2.y===a.y),off=peer.length>1?(peer.findIndex((q:any)=>q.id===id)-(peer.length-1)/2)*26:0;
 ctx.save();ctx.translate(p.x+off,p.y-24-Math.abs(off)*.2);ctx.fillStyle='#163b3625';ctx.beginPath();ctx.ellipse(0,26,24,9,0,0,Math.PI*2);ctx.fill();line(-25,-12,25,12,actorColors[id],5);line(-25,12,25,-12,actorColors[id],5);for(const [xx,yy]of [[-25,-12],[25,-12],[-25,12],[25,12]]){ctx.strokeStyle=actorColors[id];ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(xx,yy,12,5,0,0,Math.PI*2);ctx.stroke();}circle(0,0,17,actorColors[id]);text(String(id+1),0,8,23,C.white,700,'center');ctx.restore();
 }
 text('按原始事件重绘 · 路径仅显示最近移动',130,898,23,C.muted);
}
function ability(t:number){
 title('03 / ABILITY','维修、巡检，再批量制造。','fleet-repair · 种子 7 · 部署 4 台 · 3 个种子均通过',t);
 const tick=Math.min(919,t/(24-1/FPS)*919),seq=gardenSequence(d.run,tick),s=gardenAt(d.run,seq),ee=completed().filter((e:any)=>e.tick<=tick);
 box(76,328,1079,600,'#e6e9dc');farm(s,tick,t);
 const stock=s.economy!.stock,counters=s.economy!.counters;
 box(1180,328,662,284);text('交付目标',1210,376,28,C.ink,700);
 text('矿晶',1210,442,25,C.muted);text(`${stock.crystal} / 16`,1795,447,43,stock.crystal>=16?C.green:C.ink,700,'right');
 text('零件',1210,511,25,C.muted);text(`${stock.parts} / 16`,1795,516,43,stock.parts>=16?C.green:C.ink,700,'right');
 text(`已修复 ${counters.repair??0} 株  ·  收获 ${counters.harvest??0} 株`,1210,570,25,C.muted);
 box(1180,632,662,296);text('当前动作 / 已完成维修',1210,678,27,C.ink,700);
 const map:Record<string,string>={move:'移动',repair:'维修',wait:'等待',inspect:'观察',water:'浇水',harvest:'收获',craft:'制造',get_inventory:'查库存',get_position:'定位',get_size:'读田宽',get_drone_count:'读机数',get_drone_id:'读编号'};
 for(let id=0;id<4;id++){const pending=s.fleet!.pending.find((p:any)=>p.actor===id),n=ee.filter((e:any)=>e.actor===id&&e.action==='repair'&&e.value===true).length,y=726+id*51;circle(1218,y-8,10,actorColors[id]);text(`${id+1}号`,1241,y,24,C.ink,600);text(pending?(map[pending.action]??pending.action):s.fleet!.drones[id].status==='done'?'结束':'待命',1310,y,24,C.muted);text(`${n} 株`,1790,y,26,actorColors[id],700,'right');}
 const progress=t/24;box(106,368,1017,5,C.line,0);box(106,368,1017*progress,5,C.green,0);text(`${Math.floor(tick)} / 919 tick`,1115,419,26,C.ink,600,'right');
 text('真实记录连续回放 · 1.60×（基准24 tick/s）',108,418,23,C.muted);
 footer(t<10?'读图提示：矿晶集中在第0行，按行分工使1号机承担实际维修。':t<19?'能力与局限同时保留：目标可完成，但当前布局下负载并不均衡。':`本例 ${d.failures} 次动作返回 false · 客观 ${d.case.correctness+d.case.operations+d.case.efficiency}/60 · 通关不等于满分`);
}
function fault(t:number){
 title('04 / ERROR ANALYSIS','程序还没开始，就停下了。','maze-3 · 唯一修订版 · 3 个种子均为同一语法错误',t);
 enter(t,.12,()=>{box(76,338,1075,576,C.navy);text('原始源码摘录 / 保留行号，长行省略',112,392,25,'#a7c5c2',600);text('…',122,455,33,'#a7c5c2');
 const lines=d.error.source.split('\n');for(let i=80;i<84;i++){const y=520+(i-80)*67;if(i===83)box(103,y-45,1020,64,'#643c38',9);text(String(i+1),123,y,26,'#a7c5c2');const str=lines[i]??'';text(str.length>58?str.slice(0,55)+'…':str,206,y,29,i===83?'#ffc4ad':C.white,500);}
 line(240,735,240,784,C.orange,3);text('多余的闭括号',270,791,32,'#ffc4ad',700);text('SyntaxError: unexpected token in expression: \'}\'',113,868,25,'#ffc4ad');});
 enter(t,.3,()=>{metric('执行动作','0',1176,338,666,C.red);metric('模拟时间','0 tick',1176,548,666,C.red);box(1176,758,666,156,C.white);text('钥匙与遗物',1207,806,26,C.muted);text('均未收集',1207,867,44,C.ink,700);});
 footer('原始源码第 84 行 · 错误定位来自原始运行记录与静态解析 · 未补写或重跑答卷');
}
function explain(t:number){
 title('05 / METRIC CHECK','为什么记录仍显示 0.5？','完成度字段需要结合子目标阅读，不能当作探索进度。',t);
 enter(t,.1,()=>{box(76,339,585,531,C.ink);text('原始 completion',115,405,30,C.mint);text('0.5',112,589,156,C.white,800);text('保留冻结规则原分',117,690,32,C.mint);text('不追溯改分',117,755,26,C.mint);});
 const rows=[{title:'回到起点',sub:'初始位置已经满足',n:'满足',ok:true},{title:'收集遗物',sub:'没有执行探索，收集数为 0',n:'未满足',ok:false}];
 rows.forEach((r,i)=>enter(t,.3+i*.18,()=>{const x=707,y=339+i*275;box(x,y,1135,256);check(x+50,y+60,r.ok);text(r.title,x+85,y+70,39,C.ink,700);text(r.n,x+1086,y+70,32,r.ok?C.green:C.red,700,'right');text(r.sub,x+36,y+134,29,C.muted);box(x+36,y+185,1063,24,C.line,12);if(r.ok)box(x+36,y+185,1063*ease((t-.5)/.8),24,C.green,12);}));
 footer('结论：半数子目标已满足 ≠ 完成一半探索 · 客户端“已收齐后返程失败”的自述与证据不符');
}
function ending(t:number){
 title('06 / FINDINGS','成绩之外，留下可复核的结论。','单次会话观察 · 不外推为所有任务上的模型能力',t);
 const cards=[{n:'30 / 31',title:'多数题目完成',body:'修订后通过90个案例；迷宫第3题保留失败记录。',color:C.green},{n:'919 tick',title:'生产链可以跑通',body:'本例维修与制造目标达成；负载集中、失败动作一并展示。',color:C.ink},{n:'第84行',title:'提交可靠性缺口',body:'语法错误阻断执行；文字说明不能替代真实运行。',color:C.red}];
 cards.forEach((r,i)=>enter(t,.1+i*.13,()=>{const x=76+i*596;box(x,343,576,403);text(r.n,x+29,452,64,r.color,800);text(r.title,x+29,526,35,C.ink,700);para(r.body,x+30,590,511,27,C.muted,44);}));
 enter(t,.55,()=>{box(76,774,1766,140,C.ink);text('可追溯证据',111,831,28,C.mint,700);text('原始答卷 → 执行记录 → 分项成绩 → 独立评审',111,882,32,C.white,600);text(d.total.toFixed(2)+' / 100',1805,865,50,C.white,700,'right');});
 footer(`${d.model} / ${d.agent}（自报） · Token与费用未知 · 完整证据见随片清单`);
}
const starts=[0,6,17,24,48,58,65],ends=[6,17,24,48,58,65,72];
const funcs=[opening,scores,coverage,ability,fault,explain,ending];
function sceneAt(t:number){let i=0;while(i<6&&t>=ends[i])i++;return i;}
function render(f:number){
 frame=Math.max(0,Math.min(END-1,Math.floor(f)));const t=frame/FPS,i=sceneAt(t);active=i;texts=[];ctx.globalAlpha=1;ctx.setTransform(1,0,0,1,0,0);background(t,i);
 // Each change of section grows from the same coral rail. No time warp within evidence.
 funcs[i](t-starts[i]);const local=t-starts[i];if(i>0&&local<.32){const u=ease(local/.32);box(0,103,W*(1-u),895,C.orange,0);}
 (document.querySelector('#seek') as HTMLInputElement).value=String(frame);document.querySelector('#time')!.textContent=`${(frame/FPS).toFixed(1)} / 72s`;
 return {frame,scene:i,texts,overflow:texts.filter(x=>x.x<0||x.x+x.w>1920||x.y<0||x.y+x.size>1080),tick:i===3?Math.min(919,local/(24-1/FPS)*919):null};
}
(window as any).renderFrame=(f:number)=>render(f);
(window as any).getPng=()=>canvas.toDataURL('image/png').split(',')[1];
(window as any).qaFrame=(f:number)=>render(f);
Promise.all([fetch('data.json').then(r=>r.json()),document.fonts.ready]).then(([data])=>{d=data;render(0);(window as any).filmReady=true;});
if(new URLSearchParams(location.search).has('render'))document.body.classList.add('render');
document.querySelector('#play')!.addEventListener('click',()=>{if(frame>=END-1)frame=0;playing=!playing;playCursor=frame;last=performance.now();document.querySelector('#play')!.textContent=playing?'暂停':'播放';});
document.querySelector('#seek')!.addEventListener('input',e=>{playing=false;render(+(e.target as HTMLInputElement).value);document.querySelector('#play')!.textContent='播放';});
function animate(now:number){if(playing&&d){const delta=(now-last)/1000;last=now;playCursor+=delta*FPS;render(playCursor);if(frame>=END-1){playing=false;document.querySelector('#play')!.textContent='播放';}}requestAnimationFrame(animate);}requestAnimationFrame(animate);

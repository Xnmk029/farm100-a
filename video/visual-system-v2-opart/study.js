const canvas=document.querySelector('#stage'),ctx=canvas.getContext('2d');
const FPS=60,DURATION=18,END=FPS*DURATION;
const C={paper:'#FDFEFD',ink:'#171827',muted:'#697184',blue:'#0017F7',black:'#020102',white:'#FAFEFD',cyan:'#00FCFA',line:'#DCE0EA',side:'#C4CAD7'};
let portrait=false,reduced=false,current=0,playing=false,cursor=0,last=0,texts=[],ready=false,materialTime=0;
const clamp=t=>Math.max(0,Math.min(1,t)),smooth=t=>{t=clamp(t);return t*t*t*(t*(t*6-15)+10)},mix=(a,b,t)=>a+(b-a)*t;
const phase=(t,a,b)=>smooth((t-a)/(b-a));
function line(x1,y1,x2,y2,color=C.line,width=1){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(x,y,w,h)}
function text(str,x,y,size=28,color=C.ink,weight=400,font='ToneSans',align='left'){
 if(font==='ToneCode')weight=400;
 ctx.font=`${weight} ${size}px ${font}`;ctx.textBaseline='top';ctx.textAlign=align;ctx.fillStyle=color;ctx.fillText(str,x,y);
 const m=ctx.measureText(str),left=align==='right'?x-m.width:align==='center'?x-m.width/2:x;texts.push({text:str,x:left,y,w:m.width,h:size*1.25});
}
function poly(points,fill,stroke=C.ink,width=1.25){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke()}}
function cross(x,y,color){line(x-8,y,x+8,y,color,1);line(x,y-8,x,y+8,color,1)}
function projector(alpha,yaw,cx,cy,unit){const a=alpha*Math.PI/180,r=yaw*Math.PI/180;return(x,y,z=0)=>({x:cx+unit*(x*Math.cos(r)-y*Math.sin(r)),y:cy+unit*((x*Math.sin(r)+y*Math.cos(r))*Math.cos(a)-z*Math.sin(a))});}
function slab(p,x,y,w,h,z,thickness,top=C.paper,side=C.side,surface=false){
 const a=p(x,y,z),b=p(x+w,y,z),c=p(x+w,y+h,z),d=p(x,y+h,z),bb=p(x+w,y,z-thickness),cc=p(x+w,y+h,z-thickness),dd=p(x,y+h,z-thickness);
 poly([d,c,cc,dd],side);poly([b,c,cc,bb],side);poly([a,b,c,d],top);
 if(surface)OpArt.plane(ctx,[a,b,c,d],materialTime);
}
const plants=[[-2.5,-2.5],[-1.5,-2.5],[-.5,-2.5],[.5,-2.5],[1.5,-2.5],[2.5,-2.5],[-2.5,-.5],[-1.5,-.5],[-.5,-.5],[.5,-.5],[1.5,-.5],[2.5,-.5]];
function world(t,{flat,explode,end}){
 const W=canvas.width,H=canvas.height;
 const layer=explode*.95;
 const alpha=mix(48,0,flat),yaw=mix(38,0,flat),aRad=alpha*Math.PI/180,rRad=yaw*Math.PI/180;
 const extent=3*(Math.sin(rRad)+Math.cos(rRad))*Math.cos(aRad),minY=-extent-Math.max(.65,layer+.48)*Math.sin(aRad),maxY=extent+.07*Math.sin(aRad);
 // Fit every intermediate projection, including side faces, to an explicit stage.
 const stageTop=portrait?500:340,stageBottom=portrait?1180:880;
 const unit=Math.min(portrait?96:100,(stageBottom-stageTop)/(maxY-minY));
 const cy=(stageTop+stageBottom)/2-unit*(minY+maxY)/2;
 const p=projector(alpha,yaw,portrait?540:mix(690,670,end),cy,unit);
 slab(p,-3,-3,6,6,0,.07,C.paper);
 // The back edge stays a readable registration band at this small projected height.
 for(let i=0;i<6;i++)poly([p(-3+i,-3,.005),p(-2+i,-3,.005),p(-2+i,-2.95,.005),p(-3+i,-2.95,.005)],i%2?C.cyan:C.blue,null);
 for(let i=0;i<=6;i++){const a=p(-3+i,-3,0),b=p(-3+i,3,0),c=p(-3,-3+i,0),d=p(3,-3+i,0);line(a.x,a.y,b.x,b.y,C.line);line(c.x,c.y,d.x,d.y,C.line)}
 // Optional analytical layer carries only illustrative paths. It is not a model run.
 if(explode>.001){
  for(const [x,y] of [[-3,-3],[3,-3],[3,3],[-3,3]]){const a=p(x,y,0),b=p(x,y,layer);ctx.setLineDash([4,6]);line(a.x,a.y,b.x,b.y,'#9EA8BF');ctx.setLineDash([])}
  poly([p(-3,-3,layer),p(3,-3,layer),p(3,3,layer),p(-3,3,layer)],null,C.blue,1.5);
 }
 const route=[[-2.5,1.5],[-1.5,1.5],[-.5,1.5],[.5,1.5],[1.5,1.5],[1.5,.5],[1.5,-.5]];
 ctx.beginPath();route.forEach(([x,y],i)=>{const q=p(x,y,layer+.018);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)});ctx.lineWidth=3;ctx.strokeStyle=C.blue;ctx.stroke();
 for(const [x,y] of plants){
  const q=p(x,y,0);ctx.fillStyle='rgba(23,24,39,.07)';ctx.beginPath();ctx.ellipse(q.x+5,q.y+6,18,6,0,0,Math.PI*2);ctx.fill();
  const height=(y<0&&x%2===.5)?.55:.34;
  slab(p,x-.18,y-.18,.36,.36,height*(1-flat),height*(1-flat),C.paper,C.ink,true);
 }
 const pathTime=reduced?2:Math.min(4,Math.max(0,t-3)*.8),idx=Math.floor(pathTime),f=pathTime-idx,a=route[Math.min(idx,5)],b=route[Math.min(idx+1,6)];
 const dx=mix(a[0],b[0],f),dy=mix(a[1],b[1],f),dz=.42*(1-flat)+layer,dp=p(dx,dy,dz);
 for(const ox of [-.18,.18])for(const oy of [-.18,.18]){const q=p(dx+ox,dy+oy,dz);ctx.strokeStyle=C.blue;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(q.x,q.y,12,6+6*flat,0,0,Math.PI*2);ctx.stroke();}
 slab(p,dx-.13,dy-.13,.26,.26,dz+.06,.09,C.blue,C.blue);
 const tagx=dp.x+mix(32,-48,explode),tagy=dp.y+mix(-54,40,explode);line(dp.x,dp.y+(explode>.5?12:-12),tagx,tagy+16,C.blue,1.5);text('01',tagx+7,tagy,26,C.blue,500,'ToneCode');
 if(flat>.99){for(let i=0;i<6;i++){const q=p(-2.5+i,3.15);text(String(i),q.x,q.y+8,20,C.muted,400,'ToneCode','center')}}
 if(explode>.9){const q=p(2.5,-2.5,layer);const tx=portrait?825:1202,ty=portrait?490:350;line(q.x,q.y,tx,ty+60,C.blue,1);text('关系层',tx,ty,26,C.blue,500,undefined,'right')}
 return {tiltDegrees:alpha,yawDegrees:yaw,explosionCells:layer,projectedTop:cy+unit*minY,projectedBottom:cy+unit*maxY,stageTop,stageBottom};
}
function render(f){
 current=Math.max(0,Math.min(END-1,Math.floor(f)));const t=current/FPS,W=canvas.width,H=canvas.height;materialTime=reduced?0:t;texts=[];ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;
 const opening=t<2.6,final=t>=14.8;const sections=[t<6.4,t>=6.4&&t<10,t>=10&&t<14.8,final],index=sections.findIndex(Boolean);
 rect(0,0,W,H,C.paper);
 const pad=portrait?88:96,right=W-pad;
 text('FARM100',pad,portrait?100:62,26,C.ink,600,'ToneCode');text('PIXEL / OP-ART',right,portrait?100:62,24,C.muted,400,'ToneCode','right');
 registration(W,H);
 line(pad,portrait?150:108,right,portrait?150:108,C.line);
 const titles=['空间展开','深度归零','关系分层','阅读归位'],sub=['让位置与动作拥有层次','同一片田地，展平成可核对的坐标','提起关系，保留地面锚点','世界、代码与证据，共用一套秩序'];
 text(titles[index],pad,portrait?235:160,96,C.ink,400,'ToneDisplay');text(sub[index],pad,portrait?365:282,portrait?34:30,C.muted,500);
 let flat=phase(t,6.4,7.3)*(1-phase(t,10,10.9)),explode=phase(t,10.9,11.6)*(1-phase(t,14.1,14.8));
 if(final)flat=phase(t,14.8,15.7);
 if(reduced){flat=t>=6.4&&t<10||final?1:0;explode=0}
 const camera=world(t,{flat,explode,end:phase(t,14.8,15.7)});
 OpArt.glyph(ctx,'FARM',portrait?792:1424,portrait?1310:156,portrait?1.12:2.2,materialTime);
 const rx=portrait?88:1400,ry=portrait?1310:506,rw=portrait?904:424;
 const labels=[['01 / ORTHOGRAPHIC','正交视图','固定尺度','形体以轮廓和侧面区分'],['02 / FLATTEN','平面核对','坐标对齐','标签始终正视，便于阅读'],['03 / EXPLODE','关系视图','三层以内','路径抬升，保留连接关系'],['04 / EVIDENCE','证据视图','信息落稳','成绩、代码与字幕保持平面']][index];
 line(rx,ry,rx+48,ry,C.blue,3);text(labels[0],rx,ry+28,24,C.blue,500,'ToneCode');text(labels[1],rx,ry+86,portrait?48:42,C.ink,600);text(labels[2],rx,ry+160,30,C.ink,500);text(labels[3],rx,ry+213,portrait?32:26,C.muted);
 if(final){const by=ry+282;line(rx,by,rx+rw,by,C.line);text('目标  /  动作  /  证据',rx,by+26,portrait?30:26,C.ink,500)}
 const fy=H-(portrait?164:114);line(pad,fy-26,right,fy-26,C.line);
 text('设计演示 · 非模型实测',pad,fy,portrait?28:24,C.muted,400);text('像素欧普 / 浅空间',right,fy,24,C.muted,400,undefined,'right');
 const navY=H-(portrait?96:62);['空间','展平','分层','归位'].forEach((label,i)=>{const x=pad+i*(portrait?205:170);text(`${String(i+1).padStart(2,'0')}  ${label}`,x,navY,24,i===index?C.blue:C.muted,500);if(i===index)rect(x,navY+36,portrait?144:126,3,C.blue)});
 // Reference-inspired slice opening; not a replica of the missing PHASE engine.
 if(opening&&!reduced){
  const u=phase(t,1.6,2.6),cut=H*.48,span=H*u;
  ctx.save();ctx.beginPath();ctx.rect(0,0,W,Math.max(0,cut-span*.5));ctx.rect(0,cut+span*.5,W,H);ctx.clip();rect(0,0,W,H,C.paper);
  registration(W,H);text('FARM100',pad,portrait?100:62,26,C.ink,600,'ToneCode');text('PIXEL / OP-ART',right,portrait?100:62,24,C.muted,400,'ToneCode','right');
  OpArt.glyph(ctx,'FARM',portrait?144:268,portrait?310:176,portrait?4.5:4.5,materialTime);
  const tx=portrait?88:1260,ty=portrait?960:390;line(tx,ty-32,tx+48,ty-32,C.blue,2);text('像素欧普',tx,ty,112,C.ink,400,'ToneDisplay');text('固定轮廓，材质流动',tx,ty+160,portrait?36:32,C.muted,500);
  text('v2.1 / 材质方向修订',pad,H-160,28,C.muted,400);ctx.restore();
 }
 document.querySelector('#seek').value=String(current);document.querySelector('#time').textContent=`${(current/FPS).toFixed(1)} / 18s`;
 return {frame:current,aspect:portrait?'9:16':'16:9',camera,overflow:texts.filter(o=>o.x<0||o.x+o.w>W||o.y<0||o.y+o.h>H),texts};
}
function registration(W,H){
 const px=portrait?88:96,py=portrait?66:30;
 for(const x of [px,W-px-16])for(const [dx,dy,col] of [[0,0,'#0017F7'],[10,0,'#00FCFA'],[0,10,'#E900DF'],[10,10,'#ADFF00']])rect(x+dx,py+dy,6,6,col);
 cross(W/2,24,'#8D8DFF');cross(30,H/2,'#8D8DFF');cross(W-30,H/2,'#8D8DFF');
 for(let i=0;i<7;i++){const y=(portrait?470:330)+i*(portrait?142:74),col=['#0017F7','#00FCFA','#ADFF00','#E900DF'][i%4];line(W-56,y,W-32,y,col,1)}
}
function setAspect(p){portrait=p;canvas.width=p?1080:1920;canvas.height=p?1920:1080;document.querySelector('#aspect').textContent=p?'切换横屏':'切换竖屏';return render(current)}
window.renderFrame=render;window.getPng=()=>canvas.toDataURL('image/png').split(',')[1];window.setAspect=setAspect;window.setReduced=v=>{reduced=v;return render(current)};
window.opartCheck=()=>OpArt.check();
document.querySelector('#play').onclick=()=>{if(current>=END-1)current=0;playing=!playing;cursor=current;last=performance.now();document.querySelector('#play').textContent=playing?'暂停':'播放'};
document.querySelector('#seek').oninput=e=>{playing=false;render(+e.target.value);document.querySelector('#play').textContent='播放'};
document.querySelector('#aspect').onclick=()=>setAspect(!portrait);document.querySelector('#reduced').onchange=e=>{reduced=e.target.checked;render(current)};
const qs=new URLSearchParams(location.search);if(qs.has('render'))document.body.classList.add('render');
Promise.all([document.fonts.load('96px ToneDisplay'),document.fonts.load('500 30px ToneSans'),document.fonts.load('24px ToneCode')]).then(()=>{setAspect(qs.get('aspect')==='portrait');reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;document.querySelector('#reduced').checked=reduced;ready=true;window.filmReady=true;render(0)});
function animate(now){if(playing&&ready){cursor+=(now-last)/1000*FPS;last=now;render(cursor);if(current>=END-1){playing=false;document.querySelector('#play').textContent='播放'}}requestAnimationFrame(animate)}requestAnimationFrame(animate);

// An independent material study inspired by the supplied PHASE/SIGNAL reference.
// Fixed silhouettes, slow 12s phase, stepped spectrum and local optical interference.
const OpArt=(()=>{
 const palette=['#010540','#060088','#0017F7','#073AFF','#0067FF','#009BFF','#00DAFA','#00FCFA','#72FFFA','#C8FFFC','#4931FF','#7600F8','#C400EF','#EF00DC','#ADFF00','#0017F7'];
 const TAU=Math.PI*2,cache=new Map();
 const mod=(x,n)=>(x%n+n)%n,hash=(x,y)=>{let v=Math.imul(x+991,374761393)^Math.imul(y+73,668265263);v=Math.imul(v^(v>>>13),1274126177);return (v>>>0)/4294967295};
 function material(x,y,t,depth=9){
  const ph=TAU*mod(t,12)/12;
  const wx=x+9*Math.sin(y*.069+ph)+4*Math.cos(x*.039-ph),wy=y+11*Math.sin(x*.047-ph)+3*Math.cos(y*.063+ph);
  const v=.5+.28*Math.sin(wx*.047+wy*.031+ph)+.18*Math.sin(wy*.088-ph);
  const index=Math.floor(mod(v+(hash(x,y)-.5)*.065,1)*16);
  const zone=Math.sin(x*.041+y*.061+ph)+.4*Math.cos(x*.096-y*.031-ph);
  if(zone>.56&&depth>=2){const stripe=Math.floor(wx*.41+wy*.23+2*Math.sin(wy*.1+ph));const checker=(Math.floor(wx/2)^Math.floor(wy/3))&1;return (zone>1?checker:mod(stripe,2))?'#020102':'#FAFEFD'}
  return palette[index];
 }
 function mask(word){
  if(cache.has(word))return cache.get(word);
  const c=document.createElement('canvas');c.width=word.length*44;c.height=132;const g=c.getContext('2d');g.strokeStyle='#fff';g.lineWidth=8;g.lineCap='round';g.lineJoin='round';
  [...word].forEach((ch,i)=>{g.save();g.translate(i*44,0);g.beginPath();
   if(ch==='F'){g.moveTo(7,124);g.lineTo(7,8);g.lineTo(36,8);g.moveTo(7,61);g.lineTo(30,61)}
   if(ch==='A'){g.moveTo(5,124);g.lineTo(5,27);g.quadraticCurveTo(5,8,21,8);g.quadraticCurveTo(37,8,37,27);g.lineTo(37,124);g.moveTo(5,64);g.lineTo(37,64)}
   if(ch==='R'){g.moveTo(6,124);g.lineTo(6,8);g.lineTo(21,8);g.quadraticCurveTo(36,8,36,24);g.lineTo(36,45);g.quadraticCurveTo(36,61,21,61);g.lineTo(6,61);g.moveTo(19,61);g.lineTo(37,124)}
   if(ch==='M'){g.moveTo(5,124);g.lineTo(5,8);g.lineTo(21,68);g.lineTo(37,8);g.lineTo(37,124)}
   g.stroke();g.restore();
  });
  const pixels=g.getImageData(0,0,c.width,c.height).data,cells=[];
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(pixels[(y*c.width+x)*4+3]>=128){let depth=1;for(let r=1;r<5;r++){if([[x-r,y],[x+r,y],[x,y-r],[x,y+r]].some(([xx,yy])=>xx<0||yy<0||xx>=c.width||yy>=c.height||pixels[(yy*c.width+xx)*4+3]<128))break;depth=r+1}cells.push([x,y,depth])}
  const data={w:c.width,h:c.height,cells};cache.set(word,data);return data;
 }
 const field=document.createElement('canvas');field.width=field.height=128;const fg=field.getContext('2d');let fieldTime=null;
 function texture(t){if(t===fieldTime)return field;fieldTime=t;
  // Small projected faces get eight broad material cells, not a miniature hero texture.
  for(let y=0;y<128;y+=16)for(let x=0;x<128;x+=16){fg.fillStyle=material(24+x*.3,48+y*.3,t,2);fg.fillRect(x,y,16,16)}return field}
 const wordCanvas=document.createElement('canvas');
 function glyph(ctx,word,x,y,scale,t){const m=mask(word);wordCanvas.width=m.w;wordCanvas.height=m.h;const g=wordCanvas.getContext('2d');const lod=scale<3?2:1;for(const [gx,gy,depth] of m.cells){g.fillStyle=material(Math.floor(gx/lod)*lod,Math.floor(gy/lod)*lod,t,depth);g.fillRect(gx,gy,1,1)}ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(wordCanvas,Math.round(x),Math.round(y),m.w*scale,m.h*scale);ctx.restore();return {w:m.w*scale,h:m.h*scale}}
 function plane(ctx,points,t,offset=0){const[a,b,,d]=points;ctx.save();ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.clip();ctx.transform((b.x-a.x)/128,(b.y-a.y)/128,(d.x-a.x)/128,(d.y-a.y)/128,a.x,a.y);ctx.imageSmoothingEnabled=false;ctx.drawImage(texture(t),offset,0,128-offset,128,0,0,128,128);ctx.restore()}
 function check(){
  const m=mask('FARM'),values=t=>m.cells.map(([x,y,d])=>material(x,y,t,d)),a=values(0),b=values(12),c=values(3);
  const probe=document.createElement('canvas');probe.width=m.w;probe.height=m.h;const pg=probe.getContext('2d');
  const alphas=t=>{pg.clearRect(0,0,m.w,m.h);glyph(pg,'FARM',0,0,1,t);return pg.getImageData(0,0,m.w,m.h).data.filter((_,i)=>i%4===3)};
  const aa=alphas(0),ab=alphas(3),ac=alphas(12);
  return {maskCells:m.cells.length,maskWidth:m.w,maskHeight:m.h,phaseLoop:a.every((v,i)=>v===b[i]),phaseChanges:a.some((v,i)=>v!==c[i]),stableMask:aa.every((v,i)=>v===ab[i]&&v===ac[i]),opaqueRasterCells:aa.filter(v=>v===255).length}
 }
 return {glyph,plane,texture,check,mask,material};
})();

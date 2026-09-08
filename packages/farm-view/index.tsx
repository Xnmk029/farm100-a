import {useEffect,useRef} from 'react';
import {Application,Graphics,Text,Container} from 'pixi.js';
import 'pixi.js/unsafe-eval'; // Pixi's CSP adapter replaces generated functions with eval-free implementations.
import type {State,Event} from '../protocol';
export function FarmView({state,size,event,compact=false,trail=[]}:{state:State;size:number;event?:Event;compact?:boolean;trail?:[number,number][]}){
  const host=useRef<HTMLDivElement>(null);const latest=useRef({state,size,event,trail});latest.current={state,size,event,trail};
  const paintRef=useRef<()=>void>(()=>{});
  useEffect(()=>{
    const app=new Application();let dead=false;let observer:ResizeObserver;let target={x:0,y:0};
    const board=new Container(),actor=new Container();let first=true;
    app.init({backgroundAlpha:0,antialias:true,resolution:Math.min(devicePixelRatio,2),autoDensity:true,preference:'webgl'}).then(()=>{
      if(dead){app.destroy({removeView:true,releaseGlobalResources:false},{children:true});return;}host.current!.appendChild(app.canvas);app.stage.addChild(board,actor);
      actor.addChild(new Graphics().ellipse(0,9,16,7).fill({color:0x12392c,alpha:.22}).roundRect(-14,-14,28,23,8).fill(0xf5f3dd).stroke({width:2,color:0x1d513d}).circle(-7,-18,7).fill(0x2b644c).circle(7,-18,7).fill(0x2b644c).roundRect(-10,-10,20,11,4).fill(0x174b38).circle(-4,-5,2).fill(0xcafa8b).circle(4,-5,2).fill(0xcafa8b));
      const paint=()=>{
        if(dead||!host.current)return;
        const {state:s,size:n,event:e,trail:tr}=latest.current;
        const width=host.current.clientWidth,height=host.current.clientHeight;
        app.renderer.resize(width,height);board.removeChildren().forEach(x=>x.destroy({children:true}));
        const side=Math.min(width-64,height-48),cell=side/n,ox=(width-side)/2,oy=(height-side)/2;
        const bg=new Graphics().roundRect(ox-11,oy-11,side+22,side+22,18).fill(0x809b68).roundRect(ox-6,oy-6,side+12,side+12,14).fill(0xe1cf9a);board.addChild(bg);
        for(let y=0;y<n;y++)for(let x=0;x<n;x++){
          const i=y*n+x,v=s.grid[i],cx=ox+x*cell,cy=oy+y*cell;
          const g=new Graphics().roundRect(cx+1,cy+1,cell-2,cell-2,Math.min(6,cell/8)).fill((x+y)%2?0xe8dbb4:0xeedeBC);
          const px=cx+cell*.5,ground=cy+cell*.64,h=cell*(.13+v*.017);
          g.ellipse(px,ground+2,cell*.22,cell*.075).fill({color:0x797c45,alpha:.19});
          g.moveTo(px,ground).lineTo(px,ground-h).stroke({width:Math.max(1.5,cell*.035),color:0x456638});
          g.ellipse(px-cell*.1,ground-h*.55,cell*.12,cell*.055).fill(0x6e914b);
          g.ellipse(px+cell*.09,ground-h*.8,cell*.12,cell*.055).fill(0x91a758);
          if(e?.action==='swap'&&e.changes.some(c=>c[0]===i))g.roundRect(cx+3,cy+3,cell-6,cell-6,5).stroke({width:3,color:0xca762c});
          if(e?.action==='measure'&&x===s.x&&y===s.y)g.roundRect(cx+3,cy+3,cell-6,cell-6,5).stroke({width:2,color:0x528daa});
          if(x<n-1&&v>s.grid[i+1])g.moveTo(cx+cell-1,cy+cell*.25).lineTo(cx+cell-1,cy+cell*.75).stroke({color:0xc17e57,width:2,alpha:.75});
          if(y<n-1&&v>s.grid[i+n])g.moveTo(cx+cell*.25,cy+cell-1).lineTo(cx+cell*.75,cy+cell-1).stroke({color:0xc17e57,width:2,alpha:.75});
          board.addChild(g);const label=new Text({text:String(v),style:{fontFamily:'Consolas, monospace',fontSize:Math.max(11,Math.min(20,cell*.27)),fontWeight:'bold',fill:0x39432b}});label.anchor.set(.5);label.position.set(px,cy+cell*.82);board.addChild(label);
        }
        const line=new Graphics();tr.forEach(([x,y],i)=>{const px=ox+(x+.5)*cell,py=oy+(y+.42)*cell;if(!i)line.moveTo(px,py);else line.lineTo(px,py);});line.stroke({color:0x537fa2,width:2,alpha:.38});board.addChild(line);
        target={x:ox+(s.x+.5)*cell,y:oy+(s.y+.38)*cell};actor.scale.set(Math.min(1,cell/55));if(first){actor.position.set(target.x,target.y);first=false;}app.render();
      };
      paintRef.current=paint;observer=new ResizeObserver(paint);observer.observe(host.current!);paint();
      app.ticker.add(t=>{actor.x+=(target.x-actor.x)*Math.min(1,t.deltaTime*.24);actor.y+=(target.y-actor.y)*Math.min(1,t.deltaTime*.24);});
    }).catch(error=>{if(host.current)host.current.textContent='画布初始化失败：'+String(error);});
    return()=>{dead=true;observer?.disconnect();paintRef.current=()=>{};if(app.renderer)app.destroy({removeView:true,releaseGlobalResources:false},{children:true});};
  },[]);
  useEffect(()=>paintRef.current(),[state,size,event,trail]);
  return <div className={'farm-canvas'+(compact?' compact':'')} ref={host}/>;
}

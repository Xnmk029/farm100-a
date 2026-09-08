import {useEffect,useRef} from 'react';
import {Application,Assets,Container,Graphics,Sprite,Texture,Text} from 'pixi.js';
import 'pixi.js/unsafe-eval';
import {stageOf,ready,type GardenState,type GardenEvent} from '../garden/core';
import {DRONE_COLORS} from '../fleet/protocol';

const SIN=10/Math.sqrt(228),ANCHOR=.5+.7*Math.sqrt(128)/Math.sqrt(228)/6;
const names=[...['grass','soil','wet','path'].flatMap(k=>[0,1].map(v=>`tile-${k}-${v}`)),...['wheat','carrot','pumpkin','sunflower','cactus','bean','tree','crystal'].flatMap(k=>[0,1,2,3].map(s=>`${k}-${s}`)),...['barn','tank','crate','fence','pine','rock','composter','workbench','oilpress','loom','pantry','workshop','hedge','gate','relic','key-stone'],...Array.from({length:8},(_,i)=>`drone-${i}`)];
let textures:Promise<Record<string,Texture>>|undefined;
function load(){Assets.setPreferences({preferWorkers:false,preferCreateImageBitmap:false});return textures??=Promise.all(names.map(async n=>[n,await Assets.load<Texture>(`${import.meta.env.BASE_URL}assets/farm-v1/${n}.png`)] as const)).then(Object.fromEntries).catch(e=>{textures=undefined;throw e;});}
type Props={state:GardenState;event?:GardenEvent;nextEvent?:GardenEvent;events?:GardenEvent[];clock:number;cinematicClock?:number;follow:boolean;grid:boolean;selected:number;onSelect:(index:number)=>void;resetKey:number;onReady?:()=>void};

export function GardenView(props:Props){
  const host=useRef<HTMLDivElement>(null),latest=useRef(props),update=useRef<()=>void>(()=>{});latest.current=props;
  useEffect(()=>{
    const app=new Application();let dead=false,resize:ResizeObserver|undefined;
    let wheel:((e:WheelEvent)=>void)|undefined,down:((e:PointerEvent)=>void)|undefined,move:((e:PointerEvent)=>void)|undefined,up:((e:PointerEvent)=>void)|undefined;
    Promise.all([app.init({backgroundAlpha:0,antialias:true,resolution:Math.min(devicePixelRatio,2),autoDensity:true,preference:'webgl'}),load()]).then(([,atlas])=>{
      if(dead){app.destroy({removeView:true,releaseGlobalResources:false},{children:true});return;}
      const element=host.current!;element.appendChild(app.canvas);
      const world=new Container(),ground=new Container(),objects=new Container(),fx=new Container();objects.sortableChildren=true;
      world.addChild(ground,objects,fx);app.stage.addChild(world);
      const TW=96,TH=TW*SIN,ratio=TW*6/Math.sqrt(8),size=latest.current.state.size;
      const point=(x:number,y:number)=>({x:(x-y)*TW/2,y:(x+y-size+1)*TH/2});
      const sprite=(name:string,x:number,y:number,parent:Container,scale=1)=>{
        const s=new Sprite(atlas[name]);s.anchor.set(.5,ANCHOR);s.width=s.height=ratio*scale;const p=point(x,y);s.position.set(p.x,p.y);s.zIndex=(x+y)*100;parent.addChild(s);return s;
      };
      const tiles:Sprite[]=[],plants:{node:Container;shadow:Graphics;image:Sprite;ghost:Sprite;key:string;time:number;old:number}[]=[];
      for(let y=-3;y<size+3;y++)for(let x=-3;x<size+3;x++){
        const inside=x>=0&&y>=0&&x<size&&y<size;
        const variant=((x*7+y*11+size)%2+2)%2;
        const path=(!inside&&(x===-1||y===size));
        const tile=sprite(`tile-${path?'path':'grass'}-${variant}`,x,y,ground);
        if(inside){
          const index=y*size+x;tiles[index]=tile;
          const node=new Container(),p=point(x,y);node.position.set(p.x,p.y);node.zIndex=(x+y)*100+10;objects.addChild(node);
          const shadow=new Graphics().ellipse(0,1,TW*.28,TH*.17).fill({color:0x283b24,alpha:.15});node.addChild(shadow);
          const image=sprite('wheat-0',0,0,node),ghost=sprite('wheat-0',0,0,node);image.position.set(0,0);ghost.position.set(0,0);image.visible=ghost.visible=false;
          plants[index]={node,shadow,image,ghost,key:'',time:1,old:0};
        }else if((x===-3||y===-3||x===size+2||y===size+2)&&((x*13+y*7)&3)!==0){
          sprite((x+y)%3===0?'tree-3':'pine',x+.12,y-.1,objects,.8+((x*x+y*y)%4)*.1);
        }else if(!path&&((x*13+y*7)&15)===0)sprite('rock',x,y,objects);
      }
      sprite('barn',-1.65,-1.4,objects,1.45);sprite('tank',size+.8,-1,objects,1.2);
      const facilities=[
        {asset:'composter',unlock:'composting',recipe:'compost',x:-1.8,y:.6},
        {asset:'workbench',unlock:'carpentry',recipe:'boards',x:-1.8,y:2.6},
        {asset:'oilpress',unlock:'oilpress',recipe:'oil',x:-1.8,y:4.6},
        {asset:'loom',unlock:'fiberwork',recipe:'rope',x:-1.8,y:6.6},
        {asset:'pantry',unlock:'canning',recipe:'preserves',x:1,y:size+1.2},
        {asset:'workshop',unlock:'workshop',recipe:'parts',x:3,y:size+1.2},
      ].map(f=>({...f,image:sprite(f.asset,f.x,f.y,objects,.95)}));
      const processing=new Graphics();fx.addChild(processing);
      sprite('crate',-1,size-.6,objects,.85);sprite('crate',-.8,size+.6,objects,.7);
      for(let x=0;x<size;x++)sprite('fence',x,-.64,objects);
      for(let y=0;y<size;y++){
        const s=sprite('fence',size-.4,y,objects);s.scale.x*=-1;
      }
      const mazeWalls:{image:Sprite;a:number;b:number;gate:boolean}[]=[],mazeLoot:Sprite[]=[];
      const fog=new Graphics();fx.addChild(fog);
      if(latest.current.state.maze){
        const m=latest.current.state.maze;
        for(let y=0;y<size;y++)for(let x=0;x<size;x++){
          const i=y*size+x;
          for(const [bit,dx,dy,flip]of [[4,.5,0,1],[2,0,.5,0],[x===0?8:0,-.5,0,1],[y===0?1:0,0,-.5,0]]){
            if(!bit||!(m.walls[i]&bit)&&!(m.gates[i]&bit))continue;
            const gate=!!(m.gates[i]&bit),wall=sprite(gate?'gate':'hedge',x+dx,y+dy,objects,.9);
            if(flip)wall.scale.x*=-1;
            wall.zIndex=(x+y+dx+dy)*100+40;
            mazeWalls.push({image:wall,a:i,b:(y+dy*2)*size+x+dx*2,gate});
          }
          const loot=sprite('relic',x,y,objects,.85);loot.zIndex=(x+y)*100+20;mazeLoot[i]=loot;
        }
      }
      const selection=new Graphics();fx.addChild(selection);
      const boundary=new Graphics();fx.addChild(boundary);
      const conditions=new Graphics();fx.addChild(conditions);
      const traits=Array.from({length:size*size},(_,i)=>{const text=new Text({text:'',style:{fontFamily:'Consolas',fontSize:16,fill:0xffedb3,stroke:{color:0x243a27,width:3}}});text.anchor.set(.5,1);const p=point(i%size,Math.floor(i/size));text.position.set(p.x,p.y-28);fx.addChild(text);return text;});
      const marker=new Graphics();fx.addChild(marker);
      const drones=Array.from({length:latest.current.state.fleet?.drones.length??1},(_,id)=>{
        const shadow=new Graphics().ellipse(0,0,21,9).fill({color:0x14291c,alpha:.23});fx.addChild(shadow);
        const node=new Container(),body=sprite('drone-0',0,0,node);body.position.set(0,0);objects.addChild(node);
        const color=DRONE_COLORS[id],rotors=new Graphics(),badge=new Graphics().roundRect(-12,-53,24,17,6).fill(color);
        const label=new Text({text:String(id+1),style:{fontFamily:'Consolas',fontSize:12,fontWeight:'bold',fill:0x152a24}});label.anchor.set(.5);label.position.set(0,-45);
        badge.visible=label.visible=!!latest.current.state.fleet;node.addChild(rotors,badge,label);body.tint=latest.current.state.fleet?color:0xffffff;
        return {node,body,rotors,shadow,badge,label,target:point(latest.current.state.x,latest.current.state.y),next:undefined as GardenEvent|undefined};
      });
      let lastSeq=0,lastClock=latest.current.clock,elapsed=0,lastReset=latest.current.resetKey;
      const particles:{s:Graphics;vx:number;vy:number;life:number;max:number;spin:number}[]=[];
      let zoom=1,pan={x:0,y:0},fit=1,drag:{x:number;y:number;px:number;py:number}|null=null,dragged=false;
      const layout=()=>{
        if(dead)return;app.renderer.resize(element.clientWidth,element.clientHeight);
        fit=Math.min(element.clientWidth/((size+5.7)*TW),element.clientHeight/((size+6.4)*TH));
        world.scale.set(fit*zoom);world.position.set(element.clientWidth/2+pan.x,element.clientHeight*.53+pan.y);
      };
      const emit=(e:GardenEvent)=>{
        if(e.value===false||e.kind&&e.kind!=='complete')return;
        const action=e.action.replace('_area',''),harvesting=action==='harvest';
        const positions=harvesting?e.changes.filter(([,c])=>c.crop===null).map(([i])=>point(i%size,Math.floor(i/size))):e.action.endsWith('_area')?e.changes.filter(([i])=>Math.abs(i%size-e.x)<=1&&Math.abs(Math.floor(i/size)-e.y)<=1).map(([i])=>point(i%size,Math.floor(i/size))):[point(e.x,e.y)];
        const color=action==='collect'?0x7cdef2:action==='water'?0x79d8eb:harvesting?0xf4d36c:action==='plant'?0x9dc961:action==='repair'?0xc9a8ec:0xb99a68;
        const count=harvesting?18:action==='water'?12:['till','repair','fertilize','collect'].includes(action)?9:action==='plant'?7:0;
        for(const p of positions)for(let i=0;i<count;i++){
          const a=((e.seq*19+i*137)%360)*Math.PI/180,v=12+(i*17%40),s=new Graphics();
          if(action==='water')s.ellipse(0,0,1.8,3.8).fill(color);else s.rect(-2,-2,4,4).fill(color);
          s.position.set(p.x,p.y-8);fx.addChild(s);particles.push({s,vx:Math.cos(a)*v,vy:-24-Math.abs(Math.sin(a))*38,life:0,max:.6+(i%4)*.13,spin:(i%3-1)*3});
        }
      };
      const paint=()=>{
        const {state,event,selected,grid,resetKey}=latest.current;
        if(resetKey!==lastReset){zoom=1;pan={x:0,y:0};lastReset=resetKey;layout();}
        fog.clear();
        if(state.maze){
          for(const w of mazeWalls){w.image.visible=!(w.gate&&state.maze.keys>0);w.image.tint=state.maze.seen[w.a]||state.maze.seen[w.b]?0xffffff:0x82918a;}
          for(let i=0;i<mazeLoot.length;i++){
            const seen=state.maze.seen[i],loot=state.maze.loot[i],p=point(i%size,Math.floor(i/size));mazeLoot[i].visible=seen&&!!loot;if(loot)mazeLoot[i].texture=atlas[loot==='key'?'key-stone':'relic'];
            if(!seen)fog.poly([p.x,p.y-TH/2,p.x+TW/2,p.y,p.x,p.y+TH/2,p.x-TW/2,p.y]).fill({color:0x142d2a,alpha:.6});
          }
        }
        for(const f of facilities)f.image.visible=state.economy?.unlocks.includes(f.unlock)??false;
        conditions.clear();
        const extent=state.economy?.extent??size;
        for(let i=0;i<plants.length;i++){
          const c=state.cells[i],p=plants[i],oldHeight=p.image.height,key=c.crop?`${c.crop}-${stageOf(c)}`:'';
          const locked=i%size>=extent||Math.floor(i/size)>=extent,pos=point(i%size,Math.floor(i/size));
          tiles[i].tint=locked?0x678272:0xffffff;
          p.shadow.visible=!!c.crop;
          p.image.tint=c.damaged?0xb68393:0xffffff;
          const showTrait=c.crop&&(grid||i===selected)&&(c.crop==='cactus'||c.crop==='sunflower');
          p.image.height=ratio*(c.crop==='cactus'?.65+(c.trait??0)*.055:c.crop==='sunflower'?.88+(c.trait??0)*.025:1);
          traits[i].visible=!!showTrait;traits[i].text=showTrait?String(c.trait??0):'';
          if(c.damaged){conditions.moveTo(pos.x-5,pos.y-35).lineTo(pos.x+3,pos.y-24).lineTo(pos.x-3,pos.y-18).lineTo(pos.x+6,pos.y-7).stroke({color:0xffb6a0,width:3});conditions.circle(pos.x+16,pos.y-30,6).fill(0xf29471);}
          tiles[i].texture=atlas[`tile-${state.maze?'path':c.soil?(c.water>0?'wet':'soil'):'grass'}-${i%2}`];
          if(key!==p.key){
            p.ghost.texture=p.image.texture;p.ghost.height=oldHeight;p.ghost.visible=p.key!=='';p.ghost.alpha=1;p.old=1;p.time=0;
            p.key=key;p.image.visible=!!key;p.image.alpha=0;if(key)p.image.texture=atlas[key];
          }
        }
        boundary.clear();
        if(extent<size){const corners=[point(-.5,-.5),point(extent-.5,-.5),point(extent-.5,extent-.5),point(-.5,extent-.5)];boundary.poly(corners.flatMap(p=>[p.x,p.y])).closePath().stroke({color:0xe4d196,alpha:.8,width:3});}
        selection.clear();
        const diamond=(x:number,y:number,color:number,alpha:number,width:number)=>{const p=point(x,y);selection.moveTo(p.x,p.y-TH/2).lineTo(p.x+TW/2,p.y).lineTo(p.x,p.y+TH/2).lineTo(p.x-TW/2,p.y).closePath().stroke({color,alpha,width});};
        if(grid)for(let y=0;y<size;y++)for(let x=0;x<size;x++)diamond(x,y,0xe6edc9,.22,1);
        if(selected>=0)diamond(selected%size,Math.floor(selected/size),0xf2df9b,.85,2);
        for(let i=0;i<drones.length;i++){
          const d=state.fleet?.drones[i]??state,v=drones[i];v.target=point(d.x,d.y);
          v.body.texture=atlas[`drone-${({South:0,East:2,North:4,West:6} as Record<string,number>)[d.facing]??0}`];
          v.next=state.fleet?undefined:latest.current.nextEvent;
        }
        if(state.fleet&&latest.current.events){
          const pending=new Set(state.fleet.pending.map(p=>p.actor));
          for(let i=event?.seq??0;i<latest.current.events.length&&pending.size;i++){
            const e=latest.current.events[i];if(e.kind==='complete'&&pending.has(e.actor!)){drones[e.actor!].next=e;pending.delete(e.actor!);}
          }
        }
        if(event&&event.seq!==lastSeq){
          const continuous=event.seq>lastSeq&&event.seq-lastSeq<=128&&latest.current.clock>=lastClock&&latest.current.clock-lastClock<=30;
          if(continuous){for(const e of latest.current.events?.slice(lastSeq,event.seq)??[event])emit(e);}
          else{particles.forEach(p=>{fx.removeChild(p.s);p.s.destroy();});particles.length=0;}
          lastSeq=event.seq;
          const actor=state.fleet?.drones[event.actor!]??event,p=point(actor.x,actor.y);marker.clear().ellipse(p.x,p.y,TW*.3,TH*.22).stroke({color:event.value===false?0xf08162:event.action==='water'?0x92dcea:0xf2db8a,width:2,alpha:.8});
        }
        if(!event){lastSeq=0;marker.clear();}
        lastClock=latest.current.clock;
      };
      update.current=paint;layout();paint();resize=new ResizeObserver(layout);resize.observe(element);
      wheel=e=>{e.preventDefault();zoom=Math.max(.65,Math.min(2.5,zoom*Math.exp(-e.deltaY*.001)));layout();};
      down=e=>{drag={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y};dragged=false;element.setPointerCapture(e.pointerId);};
      move=e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>4)dragged=true;pan={x:drag.px+dx,y:drag.py+dy};layout();};
      up=e=>{
        if(!dragged){const r=element.getBoundingClientRect(),local=world.toLocal({x:e.clientX-r.left,y:e.clientY-r.top});
          const sum=local.y/(TH/2)+size-1,diff=local.x/(TW/2),x=Math.round((sum+diff)/2),y=Math.round((sum-diff)/2);
          if(x>=0&&y>=0&&x<size&&y<size)latest.current.onSelect(y*size+x);
        }drag=null;
      };
      element.addEventListener('wheel',wheel,{passive:false});element.addEventListener('pointerdown',down);element.addEventListener('pointermove',move);element.addEventListener('pointerup',up);
      let previousCinematic:number|undefined;
      app.ticker.add(t=>{
        const filmClock=latest.current.cinematicClock;
        const dt=filmClock===undefined?Math.min(.05,t.deltaMS/1000):previousCinematic===undefined?0:Math.max(0,Math.min(.1,filmClock-previousCinematic));
        previousCinematic=filmClock;elapsed=filmClock??elapsed+dt;
        for(let i=0;i<plants.length;i++){
          const p=plants[i];p.time=Math.min(1,p.time+dt*3);p.image.alpha=p.time;p.image.rotation=Math.sin(elapsed*1.3+i*1.9)*.009;
          p.ghost.alpha=1-p.time;p.ghost.visible=p.old>0&&p.time<1;p.ghost.y=p.key?0:-p.time*18;
        }
        const next=drones.find(d=>d.next?.action==='craft')?.next??latest.current.nextEvent;
        processing.clear();
        const facility=facilities.find(f=>next?.action==='craft'&&next.value!==false&&next.args[0]===f.recipe);
        if(facility){const p=point(facility.x,facility.y),u=Math.max(0,Math.min(1,(latest.current.clock-next!.fromTick)/(next!.tick-next!.fromTick)));processing.ellipse(p.x,p.y,37,15).stroke({color:0xeed487,width:2,alpha:.6});processing.rect(p.x-24,p.y-55,48,4).fill(0x30412c).rect(p.x-24,p.y-55,48*u,4).fill(0xf0d889);}

        for(let i=0;i<plants.length;i++){const pos=point(i%size,Math.floor(i/size));plants[i].node.position.set(pos.x,pos.y);}
        for(const v of drones){const next=v.next;if(next?.action==='swap'&&next.value===true){
          const actor=latest.current.state.fleet?.drones[next.actor!]??latest.current.state;
          const a=actor.y*size+actor.x,dir=next.args[0],b=a+(dir==='East'?1:dir==='West'?-1:dir==='South'?size:-size);
          if(plants[a]&&plants[b]){const p=point(a%size,Math.floor(a/size)),q=point(b%size,Math.floor(b/size)),f=Math.max(0,Math.min(1,(latest.current.clock-next.fromTick)/(next.tick-next.fromTick))),u=f*f*(3-2*f),arc=Math.sin(f*Math.PI)*18;plants[a].node.position.set(p.x+(q.x-p.x)*u,p.y+(q.y-p.y)*u-arc);plants[b].node.position.set(q.x+(p.x-q.x)*u,q.y+(p.y-q.y)*u+arc);}
        }}
        for(let id=0;id<drones.length;id++){
        const {node:drone,body,shadow:droneShadow,rotors,badge,label,target,next}=drones[id];
        let position=target;
        if(next?.action==='move'&&next.value===true){const end=point(next.x,next.y),f=Math.max(0,Math.min(1,(latest.current.clock-next.fromTick)/(next.tick-next.fromTick))),u=f*f*(3-2*f);position={x:target.x+(end.x-target.x)*u,y:target.y+(end.y-target.y)*u};body.texture=atlas[`drone-${({South:0,East:2,North:4,West:6} as Record<string,number>)[next.facing]??0}`];}
        const actor=latest.current.state.fleet?.drones[id]??latest.current.state;
        const peers=latest.current.state.fleet?.drones.filter(d=>d.x===actor.x&&d.y===actor.y)??[];
        const rank=peers.findIndex(d=>d.id===id),offset=peers.length>1?(rank-(peers.length-1)/2)*12:0;
        badge.x=label.x=offset;
        drone.position.set(position.x+offset,position.y-23-Math.abs(offset)*.18+Math.sin(elapsed*3+id)*2);
        drone.zIndex=(actor.x+actor.y)*100+80+id;
        droneShadow.position.set(drone.x,drone.y+25);
        rotors.clear();for(const [x,y]of [[-24,-8],[23,-8],[-3,-22],[0,8]])rotors.ellipse(x,y,9+Math.sin(elapsed*70)*2,2).fill({color:0xe8efd8,alpha:.22});
        const pending=latest.current.state.fleet?.pending.find(p=>p.actor===id);
        if(pending){const u=pending.end===null?.5:Math.max(0,Math.min(1,(latest.current.clock-pending.start)/(pending.end-pending.start)));rotors.roundRect(-17,15,34,3,1).fill(0x294b3b).roundRect(-17,15,Math.max(1,34*u),3,1).fill(DRONE_COLORS[id]);}
        }
        marker.alpha=.4+Math.sin(elapsed*4)*.15;
        for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life+=dt;p.s.x+=p.vx*dt;p.s.y+=p.vy*dt;p.vy+=55*dt;p.s.alpha=Math.max(0,1-p.life/p.max);p.s.rotation+=dt*p.spin;if(p.life>=p.max){fx.removeChild(p.s);p.s.destroy();particles.splice(i,1);}}
        if(latest.current.follow){const drone=drones[0].node;pan.x+=(-drone.x*fit*zoom-pan.x)*dt*2;pan.y+=(-drone.y*fit*zoom-pan.y)*dt*2;world.position.set(element.clientWidth/2+pan.x,element.clientHeight*.53+pan.y);}
      });
      app.render();element.dataset.ready='true';latest.current.onReady?.();
    }).catch(e=>{if(host.current){host.current.dataset.error=String(e);host.current.textContent='农场资产加载失败：'+String(e);}});
    return()=>{dead=true;resize?.disconnect();const el=host.current;if(el){if(wheel)el.removeEventListener('wheel',wheel);if(down)el.removeEventListener('pointerdown',down);if(move)el.removeEventListener('pointermove',move);if(up)el.removeEventListener('pointerup',up);}update.current=()=>{};if(app.renderer)app.destroy({removeView:true,releaseGlobalResources:false},{children:true});};
  },[props.state.size,!!props.state.maze,props.state.seed,props.state.fleet?.drones.length]);
  useEffect(()=>update.current(),[props.state,props.event,props.selected,props.grid,props.resetKey]);
  return <div className="garden-canvas" ref={host} data-drone-count={props.state.fleet?.drones.length??1} data-playback-clock={props.clock} aria-label="可拖动缩放的农场画布"/>;
}

import {CHALLENGE_BY_ID} from './challenges';
export function challengeSource(id:string,variant:'baseline'|'improved'|'failure'='improved'){
  const c=CHALLENGE_BY_ID[id];if(!c)throw Error('未知挑战');
  if(variant==='failure')return '// 失败案例：检查反馈，程序结束不代表完成目标。\n'+(c.fixture==='maze'?'move(North); collect(); // 越界探路，没有收集目标':'craft'===c.fixture?'craft("parts",4);':c.fixture==='repair-chain'?'craft("parts",4); // 未维修收获，缺少矿晶':c.fixture.includes('sort')||c.fixture==='cactus'?'harvest(); // 无序即采收，只得到单株产出':c.family==='空间布局'?'till(); plant(Tree); harvest(); // 生长尚未完成':'harvest(); // 空地或未成熟，无法交付目标');
  const fast=variant==='improved';
  const intro=`// ${c.name} · 人工${fast?'针对性改进解':'朴素基线'}\n// ${c.description}\n`;
  const common=`
const n=get_size();
function go(x,y){let p=get_position();while(p.x<x){if(!move(East))throw Error('path blocked');p.x++;}while(p.x>x){if(!move(West))throw Error('path blocked');p.x--;}while(p.y<y){if(!move(South))throw Error('path blocked');p.y++;}while(p.y>y){if(!move(North))throw Error('path blocked');p.y--;}}
function plots(w=n,h=n,ox=0,oy=0){const a=[];for(let y=oy;y<oy+h;y++)for(let x=ox;x<ox+w;x++)a.push([x,y]);return a;}
function mature(){let p=inspect();while(!p.ready){if(p.damaged){if(!repair())throw Error('repair materials missing');}else wait(50);p=inspect();}}
`;
  if(c.fixture==='maze')return intro+`
const n=get_size(),dirs=[North,East,South,West],dx=[0,1,0,-1],dy=[-1,0,1,0],back=[South,West,North,East];
let found=0,keys=0;
// 每次拿到钥匙后允许重访此前被锁门隔开的路。
function explore(x,y,seen){
  const here=y*n+x;seen[here]=true;
  const info=sense();
  if(info.loot){const item=collect();if(item==='relic')found++;if(item==='key')keys++;}
  ${fast?`if(found===${c.relics})return true;`:''}
  for(let d=0;d<4;d++){
    const nx=x+dx[d],ny=y+dy[d];if(nx<0||ny<0||nx>=n||ny>=n||seen[ny*n+nx])continue;
    ${fast?'if(!sense().exits[dirs[d]])continue;':''}
    if(move(dirs[d])){
      const done=explore(nx,ny,seen);
      ${fast&&!c.returnHome?'if(done)return true;':''}
      if(!move(back[d]))throw Error('return path closed');
      ${fast?'if(done)return true;':''}
    }
  }
  return false;
}
for(let pass=0;pass<2&&found<${c.relics};pass++)explore(0,0,{});
console.log('遗物',found,'钥匙',keys);
`;
  if(c.fixture==='cactus'||c.fixture==='mixed-sort')return intro+common+`
const width=${c.fixture==='cactus'?c.size:4};
${c.fixture==='mixed-sort'&&fast?'for(const [x,y]of plots(2,2,4,0)){go(x,y);water();}':''}
${fast?`const cache=[];for(let y=0;y<width;y++){cache[y]=[];for(let x=0;x<width;x++){go(x,y);cache[y][x]=inspect().trait;}}`:''}
function order(x,y,nx,ny,dir){
  ${fast?'const a=cache[y][x],b=cache[ny][nx];':'go(x,y);const a=inspect().trait;go(nx,ny);const b=inspect().trait;'}
  if(a>b){go(x,y);if(!swap(dir))throw Error('swap rejected');${fast?'cache[y][x]=b;cache[ny][nx]=a;':''}}
}
// 行排序后再列排序，列排序保持每一行的非递减关系。
for(let y=0;y<width;y++)for(let end=width-1;end>0;end--)for(let x=0;x<end;x++)order(x,y,x+1,y,East);
for(let x=0;x<width;x++)for(let end=width-1;end>0;end--)for(let y=0;y<end;y++)order(x,y,x,y+1,South);
go(0,0);harvest();
${c.fixture==='mixed-sort'?`for(const [x,y]of plots(2,2,4,0)){go(x,y);while(!inspect().ready)wait(50);}go(4,0);harvest();`:''}
`;
  if(c.fixture==='sunflowers')return intro+common+(fast?`
const flowers=[];for(const [x,y]of plots()){go(x,y);flowers.push({x,y,trait:inspect().trait});}
flowers.sort((a,b)=>b.trait-a.trait);
for(const p of flowers){go(p.x,p.y);harvest();}
`:`
for(let round=0;round<2;round++){
  for(const [x,y]of plots()){go(x,y);mature();harvest();}
  if(get_inventory().seeds>=128)break;
  for(const [x,y]of plots()){go(x,y);if(!plant(Sunflower))throw Error('seed budget');}
}
`);
  const growing=`
let waterLeft=get_inventory().water;
function sow(p,crop){go(p[0],p[1]);till();if(!plant(crop))throw Error('plant rejected');if(waterLeft>0){water();waterLeft--;}}
function cycle(ps,crop){
  ${fast?'for(const p of ps)sow(p,crop);for(const p of ps){go(p[0],p[1]);mature();harvest();}':'for(const p of ps){sow(p,crop);mature();harvest();}'}
}
`;
  if(c.fixture==='wheat')return intro+common+growing+'cycle(plots(),Wheat);';
  if(c.fixture==='rotation')return intro+common+growing+'cycle(plots(),Wheat);cycle(plots(),Carrot);';
  if(c.fixture==='compost')return intro+common+growing+'cycle(plots(),Wheat);cycle(plots(),Carrot);if(!craft("compost",16))throw Error("compost inputs");';
  if(c.fixture==='dry-wheat')return intro+common+(fast?`for(let x=0;x<4;x++){go(x,0);water();}for(const [x,y]of plots()){go(x,y);mature();harvest();}`:`for(const [x,y]of plots()){go(x,y);water();mature();harvest();}`);
  if(c.fixture==='repair-chain')return intro+common+(fast?`for(let x=0;x<4;x++){go(x,0);repair();}for(let x=0;x<4;x++){go(x,0);mature();harvest();}`:`for(let x=0;x<4;x++){go(x,0);mature();harvest();}`)+'if(!craft("parts",4))throw Error("parts inputs");';
  const trees=fast?'plots(4,4).filter(([x,y])=>(x+y)%2===0)':'plots(4,4).slice(0,8)';
  const beans=fast?'plots(4,4).filter(([x,y])=>(x+y)%2===1)':'plots(4,4).slice(8)';
  if(c.fixture==='orchard')return intro+common+growing+`const trees=${trees};for(const p of trees)sow(p,Tree);for(const p of trees){go(p[0],p[1]);mature();harvest();}`;
  if(c.fixture==='symbiosis'||c.fixture==='mixed-layout')return intro+common+growing+`
const trees=${trees},beans=${beans};
for(const p of trees){sow(p,Tree);${fast?'':'mature();'}}
${c.fixture==='mixed-layout'?'for(const p of plots(4,1,0,4))sow(p,Crystal);':''}
while(get_inventory().beans<40)cycle(beans,Bean);
for(const p of trees){go(p[0],p[1]);mature();harvest();}
${c.fixture==='mixed-layout'?`${fast?'for(const p of plots(4,1,0,4)){go(p[0],p[1]);if(inspect().damaged)repair();}':''}for(const p of plots(4,1,0,4)){go(p[0],p[1]);mature();harvest();}`:''}
`;
  throw Error('挑战缺少参考程序');
}

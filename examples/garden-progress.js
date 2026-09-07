// 人工成长参考解。每项研究、材料和土地均通过真实生产获得。
// 递归规划加工需求，在不同田区生产原料。可修改布局与收获顺序进行优化。
const recipes = {
  compost: ['composting', {grain:4, roots:2}, 3],
  boards: ['carpentry', {timber:2}, 2],
  oil: ['oilpress', {seeds:4}, 2],
  rope: ['fiberwork', {fiber:3}, 2],
  preserves: ['canning', {roots:3, beans:2, oil:1}, 2],
  parts: ['workshop', {boards:2, oil:1, crystal:1}, 2],
};
const technologies = {
  carrot: [[], {grain:12}],
  waterworks: [[], {grain:8}],
  composting: [['carrot'], {grain:8, roots:4}],
  soilcare: [['composting'], {compost:3}],
  orchard: [['carrot'], {grain:16, roots:6}],
  carpentry: [['orchard'], {timber:8, roots:4}],
  sunflowers: [['composting'], {roots:8, compost:4}],
  oilpress: [['sunflowers','carpentry'], {boards:6, seeds:8}],
  irrigation: [['waterworks','carpentry'], {boards:8, roots:6}],
  pumpkins: [['soilcare'], {compost:6, roots:10}],
  cacti: [['soilcare'], {compost:4, boards:6}],
  fiberwork: [['cacti'], {fiber:8, boards:4}],
  trellis: [['fiberwork','orchard'], {rope:4, boards:8}],
  survey: [['carpentry'], {boards:6, roots:8}],
  fieldtools: [['oilpress'], {boards:10, oil:4}],
  canning: [['trellis','oilpress'], {beans:8, roots:8, oil:2}],
  crystals: [['canning','pumpkins'], {preserves:4, pumpkins:8, compost:4}],
  workshop: [['crystals'], {crystal:6, boards:8, oil:4}],
  expansion: [['fiberwork','canning'], {boards:12, rope:6, preserves:4}],
  harvester: [['workshop','expansion'], {parts:6, rope:4, oil:4}],
};
const fields = {
  grain: [Wheat, null, {}, [[0,0],[1,0],[2,0],[3,0],[0,1],[1,1],[2,1],[3,1]]],
  roots: [Carrot, 'carrot', {grain:1}, [[0,2],[1,2],[2,2],[3,2]]],
  timber: [Tree, 'orchard', {grain:2}, [[0,3],[2,3]]],
  seeds: [Sunflower, 'sunflowers', {grain:2}, [[1,3],[3,3]]],
  pumpkins: [Pumpkin, 'pumpkins', {grain:2,roots:1}, [[0,0],[1,0],[0,1],[1,1]]],
  fiber: [Cactus, 'cacti', {grain:1}, [[2,0],[3,0],[2,1],[3,1]]],
  beans: [Bean, 'trellis', {grain:1,boards:1}, [[1,3],[3,3]]],
  crystal: [Crystal, 'crystals', {preserves:1,compost:1}, [[0,2],[1,2]]],
};
let {x,y} = get_position();
const unlocked = new Set(get_progress().unlocks);
function go(tx,ty) {
  while(x<tx){move(East);x++;} while(x>tx){move(West);x--;}
  while(y<ty){move(South);y++;} while(y>ty){move(North);y--;}
}
function costs(input, amount=1) {
  // 加工后续材料可能消耗先前备好的材料，需要重新检查整组库存。
  for(let pass=0;pass<50;pass++) {
    for(const resource of Object.keys(input)) ensure(resource,input[resource]*amount);
    const stock=get_inventory();
    if(Object.keys(input).every(resource=>stock[resource]>=input[resource]*amount))return;
  }
  throw Error('生产需求未收敛');
}
function unlock(id) {
  if(unlocked.has(id)) return;
  const [parents,input]=technologies[id];
  for(const parent of parents) unlock(parent);
  costs(input);
  if(!research(id)) throw Error('研究失败: '+id);
  unlocked.add(id); console.log('解锁',id);
}
function collectExisting() {
  let c=inspect();
  while(c.crop && !c.ready){
    if(c.damaged){
      const px=x,py=y;ensure('boards',1);ensure('rope',1);go(px,py);
      if(!repair())throw Error('维修材料不足');
    }
    wait(100);c=inspect();
  }
  if(c.crop)harvest();
}
function ensure(resource,target) {
  if(get_inventory()[resource]>=target)return;
  if(resource==='water'){
    unlock('waterworks');ensure('grain',Math.ceil((target-get_inventory().water)/24));
    while(get_inventory().water<target)if(!refill())throw Error('补水失败');return;
  }
  const recipe=recipes[resource];
  if(recipe){
    unlock(recipe[0]);
    while(get_inventory()[resource]<target){
      const amount=Math.min(20,Math.ceil((target-get_inventory()[resource])/recipe[2]));
      costs(recipe[1],amount);
      if(!craft(resource,amount))throw Error('加工失败: '+resource);
    }return;
  }
  const [crop,tech,input,plots]=fields[resource];
  if(tech)unlock(tech);
  while(get_inventory()[resource]<target){
    // 先准备一整轮耗材，避免种植中递归生产原料影响当前田区。
    costs(input,plots.length);
    for(const [px,py]of plots){
      go(px,py);collectExisting();till();
      if(!plant(crop))throw Error('播种失败: '+crop);
      if(!water() && unlocked.has('waterworks')){refill();water();}
    }
    for(const [px,py]of plots){go(px,py);collectExisting();}
  }
}
for(const id of Object.keys(technologies))unlock(id);
// 施肥练习：完成土壤养护任务，并留下可观察的混合生产农场。
ensure('compost',6);
for(let i=0;i<4;i++){go(i,0);collectExisting();till();fertilize();plant(Wheat);water();}
costs({boards:24,rope:12,preserves:8});
if(!expand() || !expand())throw Error('扩建失败');
const n=get_size();
// 装配与补给产出可用于后续扩建和区域作业。
ensure('parts',4);ensure('oil',6);
costs({grain:72,roots:8,boards:8,preserves:8,compost:8,water:64});
for(let row=0;row<8;row++)for(let col=0;col<8;col++){
  go(col,row);collectExisting();till();
  const crop=row<2?(col<4?Wheat:Carrot):row<4?(col<4?Sunflower:Pumpkin):row<6?(col<4?Cactus:Crystal):((row+col)%2?Bean:Tree);
  if(!plant(crop))throw Error('混合农场播种耗材不足');water();
}
wait(100);
console.log('农场已发展至',n,'×',n,'研究',get_progress().unlocks.length,'项');

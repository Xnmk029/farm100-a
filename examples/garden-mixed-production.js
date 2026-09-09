// 八机混合生产：每台负责四行，公共加工台使用原子锁。
// 先运行 garden-large-progress.js 获得土地、研究与启动材料，再部署 8 台。
const id=get_drone_id(),n=get_size(),count=get_drone_count();
if(n!==32||count!==8)throw Error('需要已扩建的 32×32 农场和 8 台无人机');
let {x,y}=get_position();
function go(tx,ty){
  while(x<tx){if(!move(East))throw Error('东侧路径受阻');x++;}
  while(x>tx){if(!move(West))throw Error('西侧路径受阻');x--;}
  while(y<ty){if(!move(South))throw Error('南侧路径受阻');y++;}
  while(y>ty){if(!move(North))throw Error('北侧路径受阻');y--;}
}
const recipes=[
  ['boards',{timber:2},2,160],['rope',{fiber:3},2,96],
  ['oil',{seeds:4},2,128],['compost',{grain:4,roots:2},3,128],
  ['preserves',{roots:3,beans:2,oil:1},2,96],
  ['parts',{boards:2,oil:1,crystal:1},2,256],
];
function supplies(){
  if(!compare_exchange('processing',null,id).exchanged)return;
  for(const [name,input,yieldCount,target] of recipes){
    const stock=get_inventory();let amount=Math.min(20,Math.ceil((target-stock[name])/yieldCount));
    for(const resource of Object.keys(input))amount=Math.min(amount,Math.floor(stock[resource]/input[resource]));
    if(amount>0)craft(name,amount);
  }
  const stock=get_inventory();
  if(stock.water<256&&stock.grain>128)for(let i=0;i<8;i++)refill();
  write_shared('processing',null);
}
function target(col,row,cycle){
  if(col<16)return Wheat;
  if(col<20)return cycle%2?Wheat:Carrot;
  if(col<24)return (row+col)%2?Bean:Tree;
  if(col<26)return Sunflower;
  if(col<28)return Cactus;
  if(col<30)return Pumpkin;
  return row%4===0?Crystal:Wheat;
}
if(id===0)write_shared('processing',null);
barrier('start');
for(let cycle=0;cycle<1000;cycle++){
  for(let row=id*4;row<id*4+4;row++){
    supplies();
    for(let step=0;step<n;step++){
      const col=row%2?n-1-step:step;go(col,row);
      let cell=inspect();
      if(cell.damaged){repair();cell=inspect();}
      if(cell.ready){harvest();cell=inspect();}
      if(!cell.crop){
        if(!cell.soil)till();
        if(!plant(target(col,row,cycle)))plant(Wheat);
        water();
      }else if(cell.water<30)water();
    }
  }
  write_shared('cycles'+id,cycle+1);
}

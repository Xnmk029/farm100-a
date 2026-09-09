/** Acceptance examples; the learner sees incomplete starters and incremental hints. */
const walk=`function walk(fn){for(let y=0;y<4;y++){for(let x=0;x<4;x++){fn();if(x<3)move(y%2===0?East:West);}if(y<3)move(South);}}`;
export const LESSON_SOLUTIONS:Record<string,string>={
  position:'move(East); const p=get_position(); console.log(p.x,p.y);',
  boundary:'get_size(); for(let i=0;i<4;i++)console.log(move(East));',
  loop:'for(let x=0;x<get_size();x++){till();if(x<get_size()-1)move(East);}',
  plant:'for(let x=0;x<4;x++){till();plant(Wheat);water();if(x<3)move(East);}',
  condition:'for(let x=0;x<2;x++){if(inspect().ready)harvest();else water();if(x===0)move(East);}',
  wait:'water(); while(!inspect().ready)wait(10); harvest();',
  function:'function seed(){till();plant(Wheat);water();}seed();move(East);seed();move(South);seed();move(West);seed();',
  memory:'let count=0;for(let x=0;x<4;x++){if(inspect().ready){harvest();count++;}if(x<3)move(East);}console.log(count);',
  path:walk+'walk(()=>till());',
  schedule:walk+'walk(()=>{till();plant(Wheat);water();});for(let y=0;y<3;y++)move(North);walk(()=>{if(inspect().ready)harvest();});',
  resources:'const stock=get_inventory();if(stock.grain>=14){research("carrot");for(let x=0;x<2;x++){till();plant(Carrot);if(x===0)move(East);}}console.log(get_inventory().grain);',
  capstone:`function row(fn){for(let x=0;x<4;x++){fn();if(x<3)move(East);}for(let x=0;x<3;x++)move(West);}for(let cycle=0;cycle<2;cycle++){row(()=>{till();plant(Wheat);water();});row(()=>{while(!inspect().ready)wait(10);harvest();});}if(get_inventory().grain>=16)research('carrot');row(()=>{till();plant(Carrot);});`,
};

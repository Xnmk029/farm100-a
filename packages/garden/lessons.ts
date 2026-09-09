import {Garden,copyGarden,gardenDefault,type GardenRun,type GardenState} from './core';
import {canonical} from '../protocol';

export const LESSON_VERSION='lessons-v1';
export type Lesson={id:string;title:string;concept:string;world:string;goal:string;explanation:string;starter:string;hints:string[]};
export const LESSONS:Lesson[]=[
  {id:'position',title:'第一步与坐标',concept:'调用与返回值',world:'空白 4×4 练习田，起点 (0,0)。',goal:'向东移动一格，再读取位置，停在 (1,0)。',explanation:'x 向东增加，y 向南增加。move(East) 执行一个动作；get_position() 返回含 x、y 的对象。分号结束一句指令。',starter:'// 01 · 第一步与坐标\n// 在这里写向东移动的指令\nconst p = get_position();\nconsole.log(p.x, p.y);',hints:['方向常量 East 不加引号。','把 move(East); 放在读取位置之前。']},
  {id:'boundary',title:'走到边界会怎样',concept:'布尔值与边界',world:'空白 4×4，起点 (0,0)。',goal:'连续尝试向东走四次；前三次成功，最后一次返回 false，位置仍为 (3,0)。',explanation:'开放尺寸由 get_size() 返回。坐标从 0 开始，所以最东端为 size - 1。失败移动也消耗时间，但不会绕到另一侧。',starter:'// 02 · 走到边界会怎样\nconst width = get_size();\nconsole.log("开放宽度", width);\n// 尝试四次 move(East)，用 console.log 显示返回值。',hints:['可以先逐行写四次 console.log(move(East));。下一课再用循环缩短。','第四次的 false 是本课要观察的结果，不是异常。']},
  {id:'loop',title:'用循环整理一行',concept:'for 循环',world:'空白 4×4，起点 (0,0)。',goal:'翻好最北边四块田，只移动三次，不越界。',explanation:'for 的初始化只做一次；每轮先检查条件，最后执行 x++。当前格也要处理，所以四块田只需要三次移动。',starter:'// 03 · 用循环整理一行\nfor (let x = 0; x < get_size(); x++) {\n  // 翻土\n  if (x < get_size() - 1) {\n    // 向东移动\n  }\n}',hints:['翻土使用 till();。','只在 if 内放 move(East);，保留最后一格的处理。']},
  {id:'plant',title:'把动作排成流程',concept:'循环内的顺序',world:'空白 4×4，起点 (0,0)。',goal:'最北一行种下四株小麦；每株先翻土，再播种，再浇水。',explanation:'plant(Wheat) 只能在已翻土且空着的格子播种。Wheat 种子免费；water() 消耗储水并加快成长。顺序错误可从动作返回值和田块观察中看出来。',starter:'// 04 · 把动作排成流程\nfor (let x = 0; x < 4; x++) {\n  // 依次翻土、播种、浇水\n  if (x < 3) move(East);\n}',hints:['使用 till(); plant(Wheat); water();。','把三条指令放在移动之前，处理的是脚下的格子。']},
  {id:'condition',title:'成熟才收获',concept:'if / else',world:'(0,0) 的麦子已成熟，(1,0) 刚播种；起点 (0,0)。',goal:'检查两格，只收获成熟的一株，给另一株浇水并保留它。',explanation:'inspect() 不改变作物。返回对象的 ready 表示现在是否成熟。if 和 else 让同一段程序根据田块状态选择不同动作。提前 harvest() 得到 0，不能产生粮食。',starter:'// 05 · 成熟才收获\nfor (let x = 0; x < 2; x++) {\n  const cell = inspect();\n  if (false) { // 改成成熟条件\n    harvest();\n  } else {\n    water();\n  }\n  if (x === 0) move(East);\n}',hints:['条件应读取 cell.ready。','不要等两株都成熟，也不要清除幼苗；本课要验证两条分支。']},
  {id:'wait',title:'等到条件成立',concept:'while 与模拟时间',world:'脚下是一株刚播种的小麦。',goal:'先浇水，反复检查成熟状态，成熟后收获；不提前收获，180 tick 内完成。',explanation:'while 每轮都重新判断条件。wait(10) 推进十个模拟 tick；空的 while 不会推进农场。一次 wait 允许 1～100 tick。',starter:'// 06 · 等到条件成立\nwater();\nwhile (false) { // 还没成熟时继续\n  wait(10);\n}\nharvest();',hints:['! 表示取反：!inspect().ready。','先检查再等待，退出循环后只收获一次。']},
  {id:'function',title:'把种植写成函数',concept:'函数与复用',world:'空白 4×4，起点 (0,0)。',goal:'补全 seed()，让现有调用种出左上角 2×2 的四株小麦。',explanation:'function 定义可复用动作；写下 seed() 才会执行它。修改函数一次，所有调用都会得到相同的改进。',starter:'// 07 · 把种植写成函数\nfunction seed() {\n  // 翻土、播种、浇水\n}\nseed();\nmove(East); seed();\nmove(South); seed();\nmove(West); seed();',hints:['把上一课的种植流程放进函数花括号。','函数内部处理脚下田块；移动保留在函数外。']},
  {id:'memory',title:'记住本轮的收获',concept:'变量与累加',world:'最北一行有四株麦，只有 (0,0)、(2,0) 成熟。',goal:'检查一行，收获两株成熟麦，保留两株幼苗，最后输出数字 2。',explanation:'变量 count 在整个循环中保留数值。count++ 表示加一。把初始化写到循环外，才不会每轮清零。它只记录本次程序，长期世界要通过存档保留。',starter:'// 08 · 记住本轮的收获\nlet count = 0;\nfor (let x = 0; x < 4; x++) {\n  if (inspect().ready) {\n    harvest();\n    // 记下这一株\n  }\n  if (x < 3) move(East);\n}\nconsole.log(count);',hints:['在成功收获之后写 count++;。','不要把 let count = 0 移到 for 里面。']},
  {id:'path',title:'走一条不回头的路',concept:'嵌套循环与蛇形路径',world:'空白 4×4，起点 (0,0)。',goal:'翻好全部 16 格，移动不超过 15 次，没有越界。',explanation:'每行交替向东、向西，行尾向南。y % 2 得到行号的奇偶性。这样下一行从当前位置继续，不必每次返回最西端。',starter:'// 09 · 走一条不回头的路\nconst n = get_size();\nfor (let y = 0; y < n; y++) {\n  const direction = y % 2 === 0 ? East : West;\n  for (let x = 0; x < n; x++) {\n    till();\n    // 未到行尾时，沿 direction 移动\n  }\n  // 未到最后一行时，向南移动\n}',hints:['内层条件是 x < n - 1，外层是 y < n - 1。','不要在内层循环里向南走。']},
  {id:'schedule',title:'让生长和工作重叠',concept:'生产调度',world:'空白 4×4，起点 (0,0)，储水足够。',goal:'浇水种满 16 格，再收获全部小麦；不调用 wait，总用时不超过 560 tick。',explanation:'任何农场动作都会推进生长。先种完整片田，再回到最先播种的一端采收，能把成长等待与其他田块的工作重叠。逐株等待会浪费这段时间。',starter:'// 10 · 让生长和工作重叠\nfunction seed() { till(); plant(Wheat); water(); }\n// 第一遍：沿上一课的蛇形路线调用 seed()\n// 回到 (0,0)\n// 第二遍：按同一顺序检查并收获成熟作物',hints:['4×4 蛇形路线结束在 (0,3)，向北三次回到起点。','第二遍使用 if (inspect().ready) harvest();。比较两遍的动作时间，观察最晚播种的格子。']},
  {id:'resources',title:'研究后还要留种子',concept:'资源条件与预留',world:'已有 15 粮食，来自实际五次小麦收获；空田，起点 (0,0)。',goal:'读取库存，研究根菜栽培（12 粮食），在最北一行种两株胡萝卜，最后保留至少 1 粮食。',explanation:'研究和播种共享仓库。研究之前先把种子支出也算进去：12 + 2。get_inventory().grain 是当前粮食，Carrot 每株消耗 1。缺粮时可回到免费小麦。',starter:'// 11 · 研究后还要留种子\nconst stock = get_inventory();\nif (stock.grain >= 14) {\n  // 研究 carrot，再种两株胡萝卜\n}\nconsole.log(get_inventory().grain);',hints:['研究调用 research("carrot")，播种使用 plant(Carrot)。','仍需先 till()；只播种两格即可，不要用光最后一份粮食。']},
  {id:'capstone',title:'自己的第一座自动农场',concept:'组合与迁移',world:'全新 4×4，零粮食、零研究；起点 (0,0)。',goal:'收获至少八株小麦，用产出研究根菜，最后保留四株胡萝卜；没有失败操作或提前收获。',explanation:'把前面的函数、路线、成熟判断和资源预留组合起来。先写一个能重复运行的种收周期，再决定何时研究。验证只检查实际行为和结果，不认定某一种代码写法才正确。',starter:'// 12 · 自己的第一座自动农场\n// 1. 定义种植与采收函数\n// 2. 重复生产，积累粮食\n// 3. 留足四株种子，再研究并种植胡萝卜\n',hints:['八株小麦至少产出 24 粮食；研究加四株种子共需 16。','可以先在一行做两轮小麦。每轮成熟后收获，再播种下一轮。','回到起点后，研究 carrot；用循环在四格分别翻土（已有土壤可跳过）和播种。']},
];
export const LESSON_BY_ID=Object.fromEntries(LESSONS.map(l=>[l.id,l])) as Record<string,Lesson>;
export function lessonWorld(id:string){
  if(!Object.hasOwn(LESSON_BY_ID,id))throw Error('未知引导练习');
  const config={...gardenDefault,seed:73,budget:2000},g=new Garden(config);
  const move=(direction:string,n=1)=>{for(let i=0;i<n;i++)g.act('move',[direction]);};
  const seed=()=>{g.act('till',[]);g.act('plant',['wheat']);};
  const mature=()=>{g.act('wait',[100]);g.act('wait',[100]);g.act('wait',[100]);};
  if(id==='condition'){seed();mature();move('East');seed();move('West');}
  if(id==='wait')seed();
  if(id==='memory'){
    for(let x=0;x<4;x++){seed();if(x<3)move('East');}mature();
    g.act('harvest',[]);g.act('plant',['wheat']);move('West',2);g.act('harvest',[]);g.act('plant',['wheat']);move('West');
  }
  if(id==='resources'){g.act('till',[]);for(let i=0;i<5;i++){g.act('plant',['wheat']);mature();g.act('harvest',[]);}}
  return {config,initial:copyGarden(g.state)};
}
export type LessonCheck={label:string;pass:boolean;detail:string};
export type LessonFeedback={id:string;version:string;pass:boolean;checks:LessonCheck[];reason:string;runId:string};
/** Grades observed behavior, never a regex guess about whether a concept was learned. */
export function gradeLesson(id:string,run:GardenRun):LessonFeedback{
  const expected=lessonWorld(id),s=run.result.state,initial=run.initial,events=run.events;
  const checks:LessonCheck[]=[],check=(label:string,pass:boolean,detail:string)=>checks.push({label,pass,detail});
  check('从本课固定练习田开始',canonical(expected.config)===canonical(run.config)&&canonical(expected.initial)===canonical(initial),'练习结果不使用自由农场的库存或旧成绩。');
  check('程序正常结束',run.result.reason==='finished',run.result.message);
  const calls=(action:string)=>events.filter(e=>e.action===action),failures=events.filter(e=>e.value===false||e.action==='harvest'&&e.value===0);
  if(id!=='boundary')check('动作条件满足',!failures.length,failures.length?`第 ${failures[0].seq} 个动作 ${failures[0].action} 未产生预期效果；检查资源、田块或成熟条件。`:'没有失败动作或提前收获。');
  check('保留作物，按目标生产',!calls('clear').length,'本课不使用 clear() 清除作物。');
  const cropAt=(indices:number[],crop:string)=>indices.every(i=>s.cells[i].crop===crop)&&s.cells.filter(c=>c.crop===crop).length===indices.length;
  const row=[0,1,2,3],harvested=s.harvests-initial.harvests,ticks=s.tick-initial.tick;
  switch(id){
    case 'position':check('读取移动后的位置',s.x===1&&s.y===0&&events.some(e=>e.action==='get_position'&&e.x===1&&e.y===0),`现在位于 (${s.x},${s.y})。`);break;
    case 'boundary':{const moves=calls('move');check('四次向东，最后一次受边界阻挡',moves.length===4&&moves.every(e=>e.args[0]==='East')&&moves.slice(0,3).every(e=>e.value===true)&&moves[3].value===false&&s.x===3&&s.y===0,`移动 ${moves.length} 次，失败 ${failures.length} 次，终点 (${s.x},${s.y})。`);check('读取开放尺寸',calls('get_size').length>0,'用 get_size() 读取开放的 4 格宽度。');break;}
    case 'loop':check('翻好一整行',row.every(i=>s.cells[i].soil)&&s.cells.filter(c=>c.soil).length===4,`已翻土 ${s.cells.filter(c=>c.soil).length} 格。`);check('只走三步',calls('move').length===3,`移动 ${calls('move').length} 次。`);break;
    case 'plant':check('一行四株麦',cropAt(row,'wheat'),'目标是 (0,0) 至 (3,0)。');check('每株都浇过水',new Set(calls('water').map(e=>e.y*s.size+e.x)).size===4,'water() 应在四块田各执行一次。');break;
    case 'condition':check('只收获成熟麦，保留幼苗',harvested===1&&s.cells[0].crop===null&&s.cells[1].crop==='wheat'&&ticks<=50,`本轮收获 ${harvested} 株，用时 ${ticks} tick。`);check('观察并照料幼苗',new Set(calls('inspect').map(e=>e.x)).size===2&&calls('water').some(e=>e.x===1&&e.y===0),'检查两格，为 (1,0) 浇水。');break;
    case 'wait':check('观察成熟后收获',harvested===1&&calls('inspect').some(e=>(e.value as any)?.ready===true),`本轮收获 ${harvested} 株。`);check('在 180 tick 内完成',ticks<=180,`用时 ${ticks} tick；浇水能缩短生长。`);break;
    case 'function':check('完成 2×2 种植',cropAt([0,1,8,9],'wheat'),'函数的四次调用应分别处理四块田。');break;
    case 'memory':check('只收获两株成熟麦',harvested===2&&s.cells[1].crop==='wheat'&&s.cells[3].crop==='wheat'&&ticks<=60,`本轮收获 ${harvested} 株，用时 ${ticks} tick。`);check('输出本轮数量',run.logs.at(-1)==='2',`最后一条输出：${run.logs.at(-1)??'（没有输出）'}。`);break;
    case 'path':check('覆盖全部 16 格',s.cells.filter(c=>c.soil).length===16,`已翻土 ${s.cells.filter(c=>c.soil).length} 格。`);check('路线不超过 15 步',calls('move').length<=15,`移动 ${calls('move').length} 次。`);break;
    case 'schedule':check('完成 16 株种收',harvested===16&&s.planted-initial.planted===16,`播种 ${s.planted-initial.planted} 株，收获 ${harvested} 株。`);check('生长与工作重叠',!calls('wait').length&&ticks<=560,`等待 ${calls('wait').length} 次，用时 ${ticks} tick。`);break;
    case 'resources':check('研究并种出两株根菜',s.economy!.unlocks.includes('carrot')&&cropAt([0,1],'carrot'),'研究消耗 12 粮食，两株播种再消耗 2。');check('读取库存并保留种子',calls('get_inventory').length>0&&s.inventory.grain>=1,`剩余 ${s.inventory.grain} 粮食。`);break;
    case 'capstone':check('粮食由实际生产获得',harvested>=8,`本轮收获 ${harvested} 株。`);check('产出支持新研究和播种',s.economy!.unlocks.includes('carrot')&&s.cells.filter(c=>c.crop==='carrot').length===4,'终态应保留四株胡萝卜。');break;
  }
  return {id,version:LESSON_VERSION,pass:checks.every(c=>c.pass),checks,reason:run.result.reason,runId:run.runId};
}

/** Gameplay content. Costs and dependencies are simulation rules, not UI unlock hints. */
export const RESOURCE_NAMES={grain:'粮食',roots:'根菜',water:'储水',compost:'堆肥',timber:'木材',boards:'木板',seeds:'油籽',oil:'植物油',pumpkins:'南瓜',fiber:'纤维',rope:'绳索',beans:'豆荚',preserves:'补给',crystal:'矿晶',parts:'零件'} as const;
export type Resource=keyof typeof RESOURCE_NAMES;
export type Costs=Partial<Record<Resource,number>>;
type CropDef={name:string;growth:number;yield:number;resource:Resource;seedCost:number;cost:Costs;unlock?:string;mechanic:string};
export const CROP_CONTENT:Record<'wheat'|'carrot'|'tree'|'sunflower'|'pumpkin'|'cactus'|'bean'|'crystal',CropDef>={
  wheat:{name:'金穗麦',growth:120,yield:3,resource:'grain',seedCost:0,cost:{},mechanic:'免耗材种子；轮作可以恢复土壤肥力。'},
  carrot:{name:'胡萝卜',growth:160,yield:2,resource:'roots',seedCost:1,cost:{grain:1},unlock:'carrot',mechanic:'消耗粮食；连续两轮根菜会降低收成，轮种或施肥可恢复。'},
  tree:{name:'果木林',growth:280,yield:4,resource:'timber',seedCost:2,cost:{grain:2},unlock:'orchard',mechanic:'四邻每棵树都会延长成长；保持间距提高木材产率。'},
  sunflower:{name:'向日葵',growth:200,yield:4,resource:'seeds',seedCost:2,cost:{grain:2},unlock:'sunflowers',mechanic:'优先收获成熟田中瓣数最高的一株，可多获得 4 油籽。'},
  pumpkin:{name:'合生南瓜',growth:230,yield:2,resource:'pumpkins',seedCost:2,cost:{grain:2,roots:1},unlock:'pumpkins',mechanic:'以偶数坐标为左上角的 2×2 成熟南瓜可连片收获，产出翻倍。'},
  cactus:{name:'晶节仙人掌',growth:180,yield:2,resource:'fiber',seedCost:1,cost:{grain:1},unlock:'cacti',mechanic:'相邻成熟仙人掌连通区域行列有序时可整片收获并获得双倍纤维。'},
  bean:{name:'共生藤豆',growth:180,yield:3,resource:'beans',seedCost:1,cost:{grain:1,boards:1},unlock:'trellis',mechanic:'四邻有树时成长与收成提升；布局需兼顾树木间距。'},
  crystal:{name:'矿晶花',growth:260,yield:3,resource:'crystal',seedCost:0,cost:{preserves:1,compost:1},unlock:'crystals',mechanic:'成长至中途会出现裂隙，需要维修后继续成长。'},
};
export type Tech={id:string;name:string;branch:'农艺'|'制造'|'物流';requires:string[];cost:Costs;description:string};
export const TECH:Tech[]=[
  {id:'carrot',name:'根菜栽培',branch:'农艺',requires:[],cost:{grain:12},description:'解锁胡萝卜，建立粮食到根菜的生产关系。'},
  {id:'waterworks',name:'蓄水设施',branch:'物流',requires:[],cost:{grain:8},description:'解锁 refill，以粮食补充储水。'},
  {id:'composting',name:'循环堆肥',branch:'农艺',requires:['carrot'],cost:{grain:8,roots:4},description:'将粮食与根菜制成堆肥。'},
  {id:'soilcare',name:'土壤养护',branch:'农艺',requires:['composting'],cost:{compost:3},description:'解锁 fertilize，恢复土壤并提高下一轮产量。'},
  {id:'orchard',name:'疏植林业',branch:'农艺',requires:['carrot'],cost:{grain:16,roots:6},description:'解锁果木林，树木间距影响成长。'},
  {id:'carpentry',name:'木工台',branch:'制造',requires:['orchard'],cost:{timber:8,roots:4},description:'将木材加工为木板。'},
  {id:'sunflowers',name:'油料栽培',branch:'农艺',requires:['composting'],cost:{roots:8,compost:4},description:'解锁向日葵，选择最高瓣数株优先收获。'},
  {id:'oilpress',name:'压榨机',branch:'制造',requires:['sunflowers','carpentry'],cost:{boards:6,seeds:8},description:'将油籽制成植物油。'},
  {id:'irrigation',name:'分区灌溉',branch:'物流',requires:['waterworks','carpentry'],cost:{boards:8,roots:6},description:'解锁 water_area，一次浇灌周围 3×3 土壤。'},
  {id:'pumpkins',name:'连片栽培',branch:'农艺',requires:['soilcare'],cost:{compost:6,roots:10},description:'解锁合生南瓜和 2×2 连片收获。'},
  {id:'cacti',name:'晶节排序',branch:'农艺',requires:['soilcare'],cost:{compost:4,boards:6},description:'解锁仙人掌与相邻 swap，有序连通区域获得收获奖励。'},
  {id:'fiberwork',name:'纤维工坊',branch:'制造',requires:['cacti'],cost:{fiber:8,boards:4},description:'将纤维搓制为绳索。'},
  {id:'trellis',name:'共生架田',branch:'农艺',requires:['fiberwork','orchard'],cost:{rope:4,boards:8},description:'解锁与树共生的藤豆，种植消耗木板。'},
  {id:'survey',name:'邻域观测',branch:'物流',requires:['carpentry'],cost:{boards:6,roots:8},description:'解锁 inspect_neighbors，读取四邻作物与性状。'},
  {id:'fieldtools',name:'整地工具',branch:'物流',requires:['oilpress'],cost:{boards:10,oil:4},description:'解锁 till_area，一次翻整周围 3×3 空地。'},
  {id:'canning',name:'补给加工',branch:'制造',requires:['trellis','oilpress'],cost:{beans:8,roots:8,oil:2},description:'将根菜、豆荚和植物油加工成补给。'},
  {id:'crystals',name:'矿晶培育',branch:'农艺',requires:['canning','pumpkins'],cost:{preserves:4,pumpkins:8,compost:4},description:'解锁矿晶花与 repair，维护裂隙作物。'},
  {id:'workshop',name:'精密工坊',branch:'制造',requires:['crystals'],cost:{crystal:6,boards:8,oil:4},description:'将木板、植物油和矿晶组装为零件。'},
  {id:'expansion',name:'农场扩建',branch:'物流',requires:['fiberwork','canning'],cost:{boards:12,rope:6,preserves:4},description:'解锁 expand，逐步开放更多土地。'},
  {id:'fleet2',name:'双机协同',branch:'物流',requires:['fiberwork'],cost:{boards:4,rope:2},description:'解锁同时部署两台无人机，各自执行程序并共享仓库。'},
  {id:'fleet4',name:'四机调度',branch:'物流',requires:['fleet2','workshop'],cost:{parts:4,rope:4},description:'解锁四机任务队列、并行生产与协作。'},
  {id:'fleet8',name:'八机编组',branch:'物流',requires:['fleet4','expansion'],cost:{parts:8,preserves:8,rope:8},description:'解锁八机规模的资源争用与综合调度。'},
  {id:'harvester',name:'区域收获',branch:'物流',requires:['workshop','expansion'],cost:{parts:6,rope:4,oil:4},description:'解锁 harvest_area，消耗植物油收获附近成熟作物。'},
];
export const TECH_BY_ID=Object.fromEntries(TECH.map(t=>[t.id,t])) as Record<string,Tech>;
export type Recipe={id:string;name:string;unlock:string;input:Costs;output:Costs;ticks:number};
export const RECIPES:Recipe[]=[
  {id:'compost',name:'腐熟堆肥',unlock:'composting',input:{grain:4,roots:2},output:{compost:3},ticks:24},
  {id:'boards',name:'锯制木板',unlock:'carpentry',input:{timber:2},output:{boards:2},ticks:20},
  {id:'oil',name:'压榨植物油',unlock:'oilpress',input:{seeds:4},output:{oil:2},ticks:30},
  {id:'rope',name:'编制绳索',unlock:'fiberwork',input:{fiber:3},output:{rope:2},ticks:20},
  {id:'preserves',name:'封装补给',unlock:'canning',input:{roots:3,beans:2,oil:1},output:{preserves:2},ticks:36},
  {id:'parts',name:'组装零件',unlock:'workshop',input:{boards:2,oil:1,crystal:1},output:{parts:2},ticks:40},
];
export const RECIPE_BY_ID=Object.fromEntries(RECIPES.map(r=>[r.id,r])) as Record<string,Recipe>;
export type Quest={id:string;name:string;instruction:string;counter:string;target:number};
export const QUESTS:Quest[]=[
  {id:'q01',name:'认识坐标',instruction:'用 move 移动 4 次，观察位置与方向。',counter:'move',target:4},
  {id:'q02',name:'准备田地',instruction:'翻整 4 块不同的田地，为种植做准备。',counter:'tilled',target:4},
  {id:'q03',name:'第一批麦种',instruction:'播种 4 株小麦，用循环减少重复代码。',counter:'plant:wheat',target:4},
  {id:'q04',name:'观察与判断',instruction:'调用 inspect 至少 8 次，读取 ready 决定是否收获。',counter:'inspect',target:8},
  {id:'q05',name:'安排维护',instruction:'成功浇水 4 次，比较湿润与干燥的成长。',counter:'watered',target:4},
  {id:'q06',name:'第一轮收成',instruction:'收获至少 4 株小麦，粮食可用于研究和播种。',counter:'harvest:wheat',target:4},
  {id:'q07',name:'研究新作物',instruction:'研究根菜栽培，尝试 research("carrot")。',counter:'research:carrot',target:1},
  {id:'q08',name:'建立轮作',instruction:'收获至少 4 株胡萝卜，注意连续种植的土壤负担。',counter:'harvest:carrot',target:4},
  {id:'q09',name:'资源再投入',instruction:'研究并制作一次堆肥，开启资源加工。',counter:'craft:compost',target:1},
  {id:'q10',name:'养护土壤',instruction:'用 fertilize 施肥 4 次，再比较产出。',counter:'fertilize',target:4},
  {id:'q11',name:'空间布局',instruction:'收获至少 2 棵树，尝试棋盘格疏植。',counter:'harvest:tree',target:2},
  {id:'q12',name:'组织生产链',instruction:'制作一次植物油，完成林业、油料与加工的联动。',counter:'craft:oil',target:1},
];

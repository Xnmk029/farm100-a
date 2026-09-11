import {CHALLENGES,challengeConfig} from '../garden/challenges';
import {LESSONS,lessonWorld} from '../garden/lessons';
import {RULE} from '../protocol';
export const BENCHMARK_VERSION='farm-benchmark-v2.0';
export const MANUAL_KEYS=['strategy','correctness','complexity','boundaries'] as const;
export type Module='challenge'|'lesson'|'sort';
export type CaseSpec={id:string;config:any;initial?:any};
export type Task={id:string;module:Module;name:string;weight:number;primary:'tick'|'cost';description:string;cases:CaseSpec[];operations:string[]};
const operationMap:Record<string,string[]>={
 'farm-1':['harvest:wheat'],'farm-2':['harvest:wheat','harvest:carrot'],'farm-3':['harvest:carrot','craft:compost'],
 'layout-1':['harvest:tree'],'layout-2':['harvest:tree','harvest:bean'],'layout-3':['harvest:tree','harvest:bean','harvest:crystal','repair'],
 'schedule-1':['harvest:wheat'],'schedule-2':['harvest:sunflower'],'schedule-3':['repair','craft:parts','harvest:crystal'],
 'sort-1':['ordered-cactus'],'sort-2':['ordered-cactus'],'sort-3':['ordered-cactus','merged-pumpkin'],
 'maze-1':['relics'],'maze-2':['relics'],'maze-3':['relics','home'],
 'fleet-harvest':['harvest:wheat'],'fleet-repair':['repair','craft:parts','harvest:crystal'],'fleet-overhead':['harvest:wheat'],
};
export const TASKS:Task[]=[
 ...CHALLENGES.map(c=>({id:c.id,module:'challenge' as const,name:c.name,weight:({'fleet-harvest':40,'fleet-repair':50,'fleet-overhead':15} as Record<string,number>)[c.id]??[20,35,50][c.tier-1],primary:c.primary,description:c.description,operations:operationMap[c.id],
   cases:[7,19,99].flatMap(seed=>(c.id==='fleet-overhead'?[1,8]:[c.id==='fleet-harvest'?8:c.id==='fleet-repair'?4:undefined]).map(drones=>({id:`${c.id}/${seed}/${drones??1}`,config:challengeConfig(c.id,seed,drones as 1|4|8|undefined)})))})),
 ...LESSONS.map((l,i)=>({id:'lesson-'+l.id,module:'lesson' as const,name:l.title,weight:Math.floor(i/4)+1,primary:'cost' as const,description:[l.world,l.goal,l.explanation,l.starter].join('\n'),operations:['lesson-behavior'],cases:[{id:'lesson-'+l.id,...lessonWorld(l.id)}]})),
 {id:'legacy-sort',module:'sort',name:'旧排序标准套件',weight:1,primary:'cost',description:'观察并通过相邻交换，使所有行从西到东、列从北到南非递减，然后 harvest() 一次收获全田。脚本应适用于所有尺寸与种子。',operations:['sorted-harvest'],cases:([4,8,16] as const).flatMap(size=>[0,1,7,42,99,1234,65535,4294967295].map(seed=>({id:`legacy/${size}/${seed}`,config:{rule:RULE,size,seed,budget:({4:2000,8:20000,16:200000})[size]}})))},
];
export const TASK_BY_ID=Object.fromEntries(TASKS.map(t=>[t.id,t]));
export const MODULE_WEIGHTS:Record<Module,number>={challenge:.7,lesson:.1,sort:.2};

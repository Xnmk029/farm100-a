# FARM100 编程挑战难度实测：Luna max

实测日期为 2026-09-10。解题模型为 `gpt-5.6-luna`，reasoning 为 `max`，规则版本为 `garden-v0.5.0`，固定种子为 42。范围覆盖 `packages/garden/challenges.ts` 中全部 18 个编程挑战；多机题使用真实 fleet 调度，部署数量分别为 `fleet-harvest=8`、`fleet-repair=4`、`fleet-overhead=8`。

这是一轮单模型、固定种子、允许基于真实失败做修订的观察性测试。Luna max 的通过结果不能直接等同于新手难度，也不能作为新手通过率或全种子鲁棒性的估计。

## 方法与边界

我先读取了题面、`packages/garden/economy-core.ts`、`packages/garden/runner.ts`、`packages/fleet/runner.ts`、fleet 协议/调度代码以及玩家可见 API 说明，然后让 Luna 独立编写 JavaScript 解法。没有读取 `packages/garden/challenge-examples.ts`、`scripts/lesson-solutions.ts`，也没有读取 `tests/` 下的文件或参考解。

独立测试脚本位于 `F:\benchmark\FARM100\artifacts\difficulty-luna-20260910\run-benchmark.ts`。它直接调用 `executeGarden`，再用 `validateGardenRun` 重放校验，最后用 `evaluateChallenge` 读取目标、逻辑成本、tick、失败动作和终态资源。未改动引擎、题目定义、预算、目标或判定。

需要区分三类轮次：

- `raw/round-1-syntax-entry/` 保存模型最初把同步 API 写成顶层 `await` 的真实记录；18 题均为 runner 入口语法错误。这是入口使用问题，尚未形成题目动作。
- `summary-round-1.json` 保存把脚本包进 `async function main()` 后的真实记录。由于 runner 不等待返回的 Promise，脚本多数只完成了第一个 API 调用；这仍是入口适配问题。
- `round-2` 是第一次完整执行算法的可运行轮次，16/18 通过；`farm-2` 与 `fleet-repair` 根据真实结果各修订一次，在 `round-3` 通过。表中的“首轮”指这个首次可运行算法轮次。前两类失败没有被删除，也没有冒充题目失败。

如果把入口适配源代码版本也算作题解修订，则所有题在首次完整算法运行前经历了两次统一适配；报告将其单列。按题目策略统计，只有 `farm-2` 和 `fleet-repair` 各发生一次题解修订，均未超过两次。

## 逐题结果

最终指标格式为 `tick / cost / harvests / planted / failedActions`。所有最终记录的 `result.reason` 都是 `finished`；目标值写成“实际值/目标值”。“难度”是本次模型行为的定性分级，不是校准后的新手等级。

| ID / 题名 | 首轮（round-2） | 失败或修订 | 难度与实际理由 | 最终指标与目标 |
|---|---|---|---|---|
| `fleet-harvest` 八行麦田的分工 | 通过 | 无 | 中：需要理解 `get_drone_id()` 和按行分工，但没有通信或动态协调。 | `105 / 156 / 64 / 0 / 0`；grain `192/192`；8 台机 |
| `fleet-repair` 协同维修与装配 | 失败：`finished`，crystal `13/16`，2 个失败动作 | round-3 加入收获前回到行首的定位，1 次题解修订后通过 | 很高：维修触发、空间偏移、成长等待、共享仓库、屏障和装配必须同时对齐；这是唯一首轮真实目标失败的多机题。 | `1002 / 2456 / 8 / 0 / 0`；parts `16/16`、crystal `16/16`；4 台机 |
| `fleet-overhead` 一株小麦需要几台机 | 通过 | 无 | 低：目标只有一株粮食，复杂度主要来自调度固定开销。 | `9 / 17 / 1 / 0 / 0`；grain `3/3`；8 台机 |
| `farm-1` 第一片麦田 | 通过 | 无 | 低：网格遍历、种植、等待、收获，状态依赖较少。 | `923 / 489 / 16 / 16 / 0`；grain `48/48` |
| `farm-2` 双季轮作 | 失败：`ReferenceError: 'n' is not defined`，已完成第一季 | round-3 把第二季循环放回 `main` 的 `n` 作用域内，1 次题解修订后通过 | 中高：6×6 全田生产还要管理 wheat→grain→carrot→roots 的资源闭环；首轮失败是作用域错误，暴露了组合任务的代码管理负担。 | `3347 / 1565 / 72 / 72 / 0`；grain `72/72`、roots `72/72` |
| `farm-3` 闭环堆肥 | 通过 | 无 | 高：8×8、96 次种收、研究依赖和 grain/roots/compost 加工链同时存在。 | `4771 / 1897 / 96 / 96 / 0`；compost `48/48` |
| `layout-1` 给树留一点距离 | 通过 | 无 | 中：需要把邻接惩罚转成棋盘格空间布局，并安排成长等待。 | `967 / 717 / 8 / 8 / 0`；timber `32/32` |
| `layout-2` 林间藤豆 | 通过 | 无 | 中高：树木疏植和豆靠树的相反空间要求要同时满足，还要覆盖两种收成。 | `1363 / 845 / 16 / 16 / 0`；timber `32/32`、beans `40/40` |
| `layout-3` 三块田的取舍 | 通过 | 无 | 高：树、豆、矿晶三种布局与裂隙维修、水分和收获顺序耦合。 | `2069 / 1285 / 20 / 20 / 0`；timber `32/32`、beans `40/40`、crystal `12/12` |
| `schedule-1` 只有四桶水 | 通过 | 无 | 低：已播种局面可用少量浇水后固定等待；要求的是资源约束下的时序安排。 | `482 / 300 / 16 / 0 / 0`；grain `48/48` |
| `schedule-2` 追着花盘走 | 通过 | 无 | 中高：需要读取 trait、排序成熟株、安排两轮向日葵并保留粮食；最终 seeds `256`，明显超过最低目标。 | `2120 / 1328 / 32 / 16 / 0`；seeds `256/128` |
| `schedule-3` 维修材料刚刚好 | 通过 | 无 | 中：固定四株矿晶的维修、等待、采收和 parts 配方链条清晰，但资源余量很紧。 | `601 / 338 / 4 / 0 / 0`；parts `8/8`、crystal `8/8` |
| `sort-1` 晶节方阵 | 通过 | 无 | 中：4×4 数组观察、相邻交换和行列单调性需要维护本地镜像。 | `581 / 279 / 16 / 0 / 0`；fiber `64/64` |
| `sort-2` 扩大的排序田 | 通过 | 无 | 中高：6×6 的行列约束显著增加交换和路径成本；同一冒泡策略仍能在预算内完成。 | `1902 / 907 / 36 / 0 / 0`；fiber `144/144` |
| `sort-3` 收获窗口 | 通过 | 无 | 高：4×4 仙人掌排序、2×2 南瓜合生、凉夜成长减半和四桶水叠加。 | `1657 / 1308 / 20 / 0 / 0`；fiber `64/64`、pumpkins `16/16` |
| `maze-1` 篱墙里的信标 | 通过 | 无 | 中：需要脚下感知、递归回退和坐标记忆，但只有一个遗物且无需回家。 | `206 / 111 / 0 / 0 / 0`；relics `1/1` |
| `maze-2` 记住来过的路 | 通过 | 无 | 中高：6×6 有环图要求 visited 集合和完整回溯，目标增至三个遗物。 | `478 / 253 / 0 / 0 / 0`；relics `3/3` |
| `maze-3` 带着钥匙回家 | 通过 | 无 | 高：8×8、钥匙、锁门、三个遗物和回到起点形成状态变化；这是迷宫梯度中最完整的一题。 | `848 / 450 / 0 / 0 / 0`；relics `3/3`、home `1/1`，keys `1` |

多机记录还保留了调度摘要：`fleet-harvest` 为 8 台机、156 次 dispatch/complete、16 个通信 API 事件；`fleet-repair` 为 4 台机、73 次 dispatch/complete、16 个通信 API 事件；`fleet-overhead` 为 8 台机、17 次 dispatch/complete、32 个通信 API 事件。完整调度事件在各题 raw JSON 中可复核。

## 梯度突变与前置知识

低阶题主要考察同步 API、坐标、循环、函数、条件和基本状态读取。进入二阶后，难点从“走完整片田”变为资源预算、作物邻接、排序状态或带环图的 visited 记忆。三阶的突变集中在资源生产链、混合作物维修、受限成长窗口、锁门状态变化和多机同步，而不只是尺寸变大。

最明显的跳变有三处：`farm-2 → farm-3` 从两季轮作跳到研究、根菜和堆肥加工闭环；`layout-2 → layout-3` 从两种作物共生跳到三种作物、晶体裂隙和维修；`maze-2 → maze-3` 加入钥匙、锁门和必须回家。`sort-2 → sort-3` 的面积反而缩小，但时间窗口和水资源约束使组合难度上升。`schedule-2 → schedule-3` 的编号梯度不稳定：schedule-2 需要 trait 排序和重复向日葵生产，schedule-3 的动作链更短，模型实际成本也从 1328 降至 338。

前置知识可以按以下层次理解：

- 基础层：JavaScript 的 `for`、函数、条件、坐标和同步函数返回值。
- 组合层：嵌套循环、库存算术、固定路线、`Set` 记忆、对象数组排序和二维单调性。
- 高阶层：资源依赖图、研究前置、成长与等待调度、邻接布局、维修状态、屏障同步、DFS 回溯、钥匙开门后的重新探索。

本轮还暴露了一个与题面难度分开的前置信息缺口：玩家可见 API 是同步调用，但运行入口没有把“不要使用顶层 `await`、runner 不等待返回 Promise”说得足够明确。Luna 的第一批源码因此先后出现语法错误和只执行到第一个 API 的记录。建议在玩家 API 说明旁放一个最小同步程序，并明确脚本顶层返回的 Promise 不会被等待，否则会把 runner 入口知识误计为挑战难度。

## 描述歧义、可投机通过与不足约束

`fleet-harvest` 的描述要求比较单机全包与按行分工，但通过条件只检查 grain 总量；它没有要求每台机承担一行、没有要求比较两种配置，也没有把并行收益纳入指标。`fleet-overhead` 描述全队通信集合，但通过条件只需要一株粮食；实际解法可以让大多数无人机只调用身份 API，甚至不要求有效的集合协议。若目的是考协作，应增加每台机的参与、屏障或共享状态断言，并记录单机/多机的对照成本。

`schedule-1` 的文字要求减少空等和重复巡查，但当前通过判定只检查产量和完成状态，`primary: tick` 没有转成明确的 tick 上限。`schedule-2` 要求优先收最高瓣数并允许翻倍，但没有要求输出接近目标或成本达到某个上限；本轮最终 seeds 为 `256/128`，证明过量产出可以通过。应把优化目标写成可判定约束，或把成本、tick 作为正式排序分数。

迷宫一、二只要求收齐遗物，不要求回起点，也不要求路线长度或探索重复次数；DFS 全图探索在当前预算下即可通过。`maze-3` 明确加入回家约束，三题的语义因此不完全对称。可以为 maze-1/2 增加可选路线预算、访问上限或统一的 return-home 目标，以便难度梯度由题面约束而不是预算余量决定。

多题只检查最终资源，没有检查中间行为。例如 `farm-3` 没有单独断言实际发生了根菜生产和堆肥加工，只要最终 compost 达标即可；`layout` 系列也没有对布局模式、最少作物数或无效动作次数设硬条件。若这些过程是教学目标，应增加事件级断言；若只想测最终规划，应删去描述中的过程性要求，避免玩家不知道哪些条件真正计分。

固定 seed 42 也允许模型针对单一地图形成稳定路线。正式难度标定应至少用多个固定 seed 复测，报告每题通过率、成本分布和失败类型；这轮结果只说明这一地图上的一次模型行为。

## 具体调整建议

1. 在运行入口和 API 文档中补上同步示例、Promise 行为和错误处理说明，把入口适配与题目解题分开计分。
2. 把 `primary` 从展示字段变成可执行判定：为 schedule-1 写出明确 tick 上限，为 schedule-2 写出 cost 或过量产出的约束，为排序/迷宫题写出路线或交换预算。
3. 给三道 fleet 题增加事件级目标。`fleet-harvest` 检查行分工或比较配置，`fleet-overhead` 检查全队通信/屏障，`fleet-repair` 将失败动作或错误维修作为明确失败条件。
4. 给 farm-3、layout-3、schedule-3 增加中间资源链和维修事件的断言；给 maze-1/2 统一是否回家的规则，并说明是否限制重复探索。
5. 在 tier 之间重新校准：保留 farm-3、layout-3、sort-3、maze-3 的高阶组合约束；考虑把 schedule-2 的 trait 排序与重复生产拆成更平滑的两个步骤，或提高 schedule-3 的资源/同步约束，避免三阶题反而更短更直线。
6. 用多 seed、多模型和新手实测分别建立三种证据，不把本次 Luna max 的 18/18 当作新手通过率。

## 证据与未测范围

主要证据位于：

- `F:\benchmark\FARM100\artifacts\difficulty-luna-20260910\final-summary.json`
- `F:\benchmark\FARM100\artifacts\difficulty-luna-20260910\summary-round-1.json`
- `F:\benchmark\FARM100\artifacts\difficulty-luna-20260910\summary-round-2.json`
- `F:\benchmark\FARM100\artifacts\difficulty-luna-20260910\summary-round-3.json`
- `F:\benchmark\FARM100\artifacts\difficulty-luna-20260910\raw\round-1-syntax-entry\`
- `F:\benchmark\FARM100\artifacts\difficulty-luna-20260910\raw\round-1\`
- `F:\benchmark\FARM100\artifacts\difficulty-luna-20260910\raw\round-2\`
- `F:\benchmark\FARM100\artifacts\difficulty-luna-20260910\raw\round-3\`
- `F:\benchmark\FARM100\artifacts\difficulty-luna-20260910\sources\`
- `F:\benchmark\FARM100\artifacts\difficulty-luna-20260910\metrics.jsonl`
- `F:\benchmark\FARM100\artifacts\difficulty-luna-20260910\commands.log`

新增脚本和修订脚本为 `run-benchmark.ts`、`prepare-revision.ts`、`assemble-summary.ts`，都在上述 artifacts 目录内。`commands.log` 记录了实际调用的仓库内 `node node_modules/tsx/dist/cli.mjs` 命令；`pnpm exec tsx` 在当前 PowerShell 环境中不可用，因此没有把该环境问题误写成 runner 失败。

18 道挑战均已进入真实 runner，最终没有未测的挑战题。12 课没有抽样，因为挑战覆盖已完成，未需要用课程衔接来解释任何未决梯度；因此课程难度、课程到挑战的转化率和课程新手体验仍属于未测范围。没有运行打包、30 分钟性能测试、下载、虚拟机或其他昂贵流程。

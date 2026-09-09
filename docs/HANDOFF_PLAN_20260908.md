# FARM100 完成度核查与接力计划

核查日期：2026-09-08。来源任务：codex://threads/01a0777f-c8e5-7b91-a81d-1d9d215cddef（评估 farm100 完成度与相似度）。本次范围为该任务对应的 FARM100，不覆盖父工作区其他项目。

## 结论

项目已具备经营、挑战、多机协作和可信记录回放的主要能力，处于 G5 工程与产品验收阶段。0.5.1 已形成 Git 检查点，0.5.2 流式运行与分页回放已实现并有多项专项证据，但最终发行验收与提交尚未收口。完整产品目标未完成；不能据功能数量给出与《编程农场》同等级的结论，也不使用无权重依据的完成百分比。

核查方法：读取原任务近期记录、当前 Git 状态、产品目标、阶段文档、专项 JSON 与关键实现，重跑类型检查和自动测试。本次未重新做全部桌面操作、长时性能、视觉听感或原版实机审计。历史通过与本次复测分别标明。

## 当前接棒现场

- 仓库：F:/benchmark/FARM100；分支 codex/rebuild-v1。
- HEAD：e6f20a0（0.5.1 历史持久化与恢复）；此前 f1b3ec0 为多机，208e923 为挑战，79931f3 为经营。
- package.json：0.5.2-alpha.1；规则仍为 garden-v0.5.0。
- 接棒前已有 18 个跟踪文件修改和 6 个未跟踪文件。保留全部改动，不能 reset/clean 或重新实现覆盖。
- 新文件：stream-qa.ts、paged-replay.ts、STREAM_IMPLEMENTATION.md、garden/stream.ts、garden/trace.ts、garden-stream.test.ts。
- 上一实施轮停在最终构建复核，没有最终总结或提交；后续任务启动失败记录为 401 / 缺少 api.responses.write。该错误来自任务运行环境，不能归因为 FARM100 应用故障。
- 预览路径：release/garden-preview/win-unpacked/FARM100.exe。release/win-unpacked 为旧排序首版，不能混作当前发行证据。

## 分项完成度

| 项目 | 判断 | 已有证据与缺口 |
| --- | --- | --- |
| G0 原版对标 | 未闭环 | 产品目标与对标方法已固定；缺原版固定版本实录、机制映射与外部评价 |
| G1 基础生产观赏 | 基础阶段已有证据 | 两作物循环与历史五分钟录像；不能替代当前八作物、多机、声音和失败恢复的整体验收 |
| G2 经营与成长 | 主要机制完成，教学待完善 | 八作物、生产加工、23 项研究、新档生产解锁证据；12 个任务存在，但多为 API/产出计数，函数、状态记忆、路径与调度教学需补实 |
| G3 多机制挑战 | 阶段实现完成 | 五家族十五题加三题协作，共 18 题；历史 1080 次固定种子执行通过；综合机制已有案例，当前改动后的发布回归应绑定最终包 |
| G4 多机协作 | 阶段实现完成 | 1/2/4/8 机、稳定冲突规则、原子共享与屏障；历史 720 次矩阵及两项分工收益、一项通信开销反例 |
| G5 历史与恢复 | 0.5.1 完成并提交 | 逐批持久化、跨会话检索、崩溃前缀恢复；恢复世界不恢复 JavaScript 调用栈 |
| G5 流式与分页 | 0.5.2 已实现，待收口 | 有界事件缓冲、增量规则校验、分页跳转、farmjournal 导入导出；缺最终发行汇总和可追溯提交 |
| 大农场与长时性能 | 未验收 | 32×32 新档容量/扩地体验未完成；8×8 等待循环的大记录不等于混合作物 30 分钟性能 |
| 完整视听与 DPI | 未验收 | 当前版本五分钟连续生产、声音密度与同步、150%/200% DPI 仍需实测 |
| Windows 正式交付 | 未验收 | 本机预览包可运行；干净 Windows 离线安装、升级兼容、卸载尚无完整证据 |

上述“完成”是阶段实现判断，不代替整体产品验收。依据 docs/PRODUCT_TARGET_V1.md，观赏性、深度、规则回放与发布四项须同时通过。

## 0.5.2 证据审计

已读本地证据：

- artifacts/stream/utility-packaged/stream-utility-qa.json：正常、取消、子进程崩溃、注入 ENOSPC、大记录均有结果。大记录 64,008 事件，运行器峰值 72、校验器峰值 8、100 次跳转、窗口最多 256 事件。
- artifacts/stream/ui-dev/stream-ui-qa.json：开发版导入、10 个乱序时间跳转、跨页播放、再次导出重开与八机渲染通过。
- artifacts/stream/history-final/history-ui-qa.json：崩溃后恢复 200 事件、100 点回放、搜索与新运行持久化通过。
- artifacts/stream/regression-final/：经营和挑战通过记录存在；该目录未见 fleet-ui-qa.json。
- artifacts/stream/history-packaged/qa-error.json：保留早期历史界面失败。后来的 history-final 通过，不能单凭旧失败宣布当前仍坏，也不能删除失败记录掩盖修复过程。

发行证据尚不闭合：

1. 当前 app.asar 修改时间为 2026-09-08 10:10:41（本地时区）；utility-packaged 与 regression-packaged 的报告约为 10:03，早于这个包。
2. history-final 和 regression-final 约为 10:12，虽晚于包，但缺汇总中的启动命令与包哈希，不能仅据目录名认定全部属于最终包。
3. 未发现最终包分页 UI 报告；docs/stream-release-verification.json 尚不存在，STREAM_IMPLEMENTATION.md 中是待生成链接。
4. streamUIQA 替换了 Electron 文件对话框返回路径；它验证实际导入导出处理链，不构成人工原生文件选择器验收。报告里 shipped dialog 的措辞应澄清。
5. 64,008 事件工作负载是 8×8、8 机 wait 循环，只证明记录架构的规模能力；不证明 32×32 混合作物实时渲染、总进程内存或两小时运行达标。

## 接力顺序与验收门槛

### 接力 1：收口 0.5.2（最高优先级）

目标：把当前未提交成果整理成可追溯、可回归的阶段检查点。

- 先核对本文件、本次测试结果及 git diff，保留旧改动；检查 garden-host、journal、trace、runner、paged-replay、garden-view 的跨层边界。
- 当前源码通过 typecheck、test、build 后生成同一最终预览包。测试失败先定位，不进入功能扩张。
- 使用最终 app.asar 跑 stream utility、stream UI、history crash/reopen、economy、challenge、fleet 回归。输出到全新的 artifacts/stream/final-<timestamp>/，记录命令、时间、版本和退出码。
- 记录 FARM100.exe 与 app.asar 的 SHA-256，验证各报告对应同一构建；生成 docs/stream-release-verification.json，更新 STREAM_IMPLEMENTATION 与 README 的链接/限制。
- 明确取消、写入错误、损坏片段、同刻多机前缀、旧格式兼容与导出重开均通过后，形成一个范围清楚的 Git 提交。

完成门槛：最终包六类回归有对应证据、源码测试全过、汇总与包哈希匹配、无悬空文档链接。此时只能宣布“0.5.2 阶段完成”。

相关入口：apps/desktop/src/main/index.ts；--qa-stream-utility；--qa-render --qa-garden --qa-stream-ui；--qa-history-crash / --qa-history-ui；--qa-fleet-ui。具体组合和环境变量按当前源码核实，使用独立 QA profile，避免真实用户历史。

### 接力 2：大农场与性能

- 补齐 32×32 的容量选择、正常扩地路径及旧存档兼容，不能只修改常量绕过成长。
- 建立 32×32、8 机、混合作物持续生产脚本，包含维护、生产、共享争用与回放；记录实际硬件、分辨率、软件和脚本版本。
- 在 1080p 连续 30 分钟测帧时间 p95、各进程 RSS、记录体积、窗口缓存、取消响应与保存恢复。
- 按热点实测优化；保持完整计分事件。两小时上限是保护配置，不是通过性能验收的证据。

完成门槛：p95 ≤ 20 ms，30 分钟后内存无持续失控增长，逻辑与恢复一致。未达标则保存原始曲线和复现，不写“性能完成”。

### 接力 3：成长教学与视听

- 审核 12 个任务是否真的教会循环、条件、函数、状态记忆、路径和调度；加入小步脚手架、错误反馈及逐步撤除提示，避免必须粘贴最终脚本。
- 审查三条生产链、资源不足恢复、三类综合机制取舍，并保存从新档到八机的连续流程。
- 补足动作/环境/收获声音，核对倍速声音限流、静音和独立音量；完成镜头、动作可读性与 DPI 检查。
- 输出当前版本 1080p 连续五分钟真实生产与失败恢复演示，以及同输入两种策略的可见差异。

完成门槛：新用户按教学可推进；机制关系能由事件解释；当前全流程录像和视听验收记录齐全，历史两作物录像不作为替代。

### 接力 4：发行与外部对标

- 在干净 Windows 实机或 VM 验收离线安装、新档、保存重开、历史、对比、导出、升级与卸载；覆盖 720p/1080p、150%/200% DPI 与真实文件对话框。
- 获得原版合法可用的固定版本与代表存档后，录制可比工作负载，建立机制对应表。
- 按 PRODUCT_TARGET_V1 邀请至少五名外部体验者，保留评分锚点、原始评分和理解问题回答；无外部证据时对标结论继续待验。

完成门槛：按原产品文档四项总体门槛验收。环境或参与者未具备时列明外部依赖，继续可独立完成的工作，不假造评分。

## 可直接给下一位执行者的接棒指令

请接手 F:/benchmark/FARM100，先读 docs/HANDOFF_PLAN_20260908.md 与 docs/PRODUCT_TARGET_V1.md。基线 HEAD 为 e6f20a0，当前工作区已有未提交的 0.5.2 流式记录与分页回放，不要覆盖或重做。先执行“接力 1”，核对本次复测文件，补齐同一最终发行包的专项回归、哈希汇总与 Git 检查点，再按接力 2–4 推进。每轮结束更新已完成、证据、限制和下一步；保留旧规则兼容，不将历史报告或等待循环当作最终性能/产品验收。缺原版实录及外部评价时，不宣称达到原版同等级。

## 本次复测结果与新增首要阻塞

- pnpm typecheck：通过。
- pnpm test：46 项，45 通过、1 失败，退出码 1（约 66.9 秒）。失败项为 tests/garden.test.ts 的 garden sandbox locks APIs after budget, cancellation, OOM and hostile error getters。
- 失败位置：tests/garden.test.ts:45 的 wallMs:35 忙循环案例；packages/garden/runner.ts:27 在创建诊断对象时 unwrapResult 抛出 InternalError: interrupted。
- 单项复测：node node_modules/tsx/dist/cli.mjs --test --test-name-pattern='garden sandbox' tests/garden.test.ts，通过 1/1。
- 判断：存在与短时限/调度相关的不稳定初始化路径。源码在初始化诊断对象之前启用了 deadline 中断，异常发生于该初始化调用；单项成功不能消除全量失败。确切触发条件与资源释放影响尚待定位，不把推断写作已证实根因。
- 接力 1 的第一步调整为：复现并处理初始化超时/取消，使其生成预期明确结果并释放 VM 资源，然后重跑全量。不能简单删除断言或仅扩大 35 ms 掩盖边界。
- git diff --check：通过，只有现有 LF/CRLF 提示。
- 本次未改业务源码、未提交、未重打包；新增本接力计划及复测摘要。测试会写入项目既有 artifacts 测试证据。
- 本机 pnpm exec tsx 命令未解析到 tsx；上述直接调用本地 cli.mjs 的单项命令可用。它是启动方式问题，不计为额外产品测试失败。

## 2026-09-09 接力执行更新

已修复接力 1 的单机初始化边界：内部诊断对象和安全环境初始化纳入 try/finally，完成内部初始化后才启用 guest 中断；原有 deadline 仍覆盖初始化耗时，并在执行用户代码前显式检查超时/取消。启动即超时或取消会返回零事件、零日志的明确终态，释放 VM；没有扩大原来的 35 ms 测试时限。

本次类型检查、构建及全量 47 项测试通过，新增启动即超时/取消及后续正常运行回归。结果见 artifacts/stream/final-20260909/source-verification.json 与 tests.log。

新增 scripts/stream-release-qa.mjs，用同一发行包依次核验大记录、分页界面、崩溃恢复和经营/挑战/多机界面，保存参数、时间、退出码、原始报告以及执行前后包哈希。最终包独立放在 release/stream-0.5.2-final，旧 garden-preview 保留。最终验收状态以 docs/stream-release-verification.json 为准。


## 2026-09-10 接力执行更新

接力 1 已完成：本次源码类型检查、47/47 测试、构建、独立打包通过；同一最终包完成流式 utility、分页 UI、历史崩溃/重开、经营、挑战、多机回归。正常退出 0，注入崩溃退出 86；200 条已提交事件完整恢复。包内 94 个 dist 文件与本次构建一致，EXE/asar 执行前后哈希一致。

最终预览为 release/stream-0.5.2-20260910/win-unpacked/FARM100.exe；证据为 artifacts/stream/final-20260910/ 和 docs/stream-release-verification.json。旧目录和旧失败证据保留。分页 QA 报告明确说明文件对话框路径由测试替代。本轮未改动模拟规则或扩展内容，只完成已有 0.5.2 成果的验证与文档收口。

下一项为接力 2：32×32 正常成长路径、8 机混合生产负载与 1080p 连续 30 分钟性能。整体产品目标、干净 Windows、完整视听和原版/外部对标仍未验收。不要将本次 8×8 等待循环的大记录证据用于声明这些门槛达标。


## 2026-09-10 新目标与接力 2 开发检查点

用户已重新设定持续目标：从 a2598b9 继续完成 PRODUCT_TARGET_V1 的剩余开发与验收；应用目标保持 active，未设置 token 预算。

0.5.3 开发实现已加入 8/16/32 新档上限选择、正常逐级扩地、真实成长和八机混合生产程序、最多 192 条事件的实时观看窗口，以及大农场无损压缩日志/档案。模拟规则保持 garden-v0.5.0。详见 LARGE_FARM_IMPLEMENTATION.md。

成功的零库存成长证据为 artifacts/large-farm/preparation-v2/：20,065 条真实事件、成本 136,402、32×32、23 项研究，重开一致。源码 50 项测试通过，经营/挑战/多机开发版回归通过。两次旧校准均未通过完整性能门槛，失败理由与原始数据已保留。

当前候选包 release/large-farm-0.5.3-final/win-unpacked/FARM100.exe 已构建，包内 dist 和生产示例与当前构建一致。scripts/large-farm-release-qa.mjs 已开始运行，输出 artifacts/large-farm/release-20260910/release-qa.json；依次进行兼容性回归、120 秒校准、校准通过后的 1800 秒完整测量。不要重复启动同一测试或改变测试期间的包；先读取该 JSON、各子报告和活动进程确认状态。脚本返回 pass 之前，不声明本阶段性能完成。

后续先核验长测结果、内存曲线与压缩档案完整导出重开，再更新发行报告与阶段文档；若校准或长测失败则保存原始证据并修复。实时观看时间条当前仍沿用普通回放的终态标签，后续视听/界面打磨时应明确显示已记录上界。

### 渲染校准跟进

上述 release-20260910 流程已结束：同包兼容性全部通过，但校准 p95 27.8 ms 失败，因此没有启动长测。CPU 采样定位到 Pixi 场景遍历和重打包；拆分渲染组并减少重复植物更新后，calibration-groups 的 120 秒 p95 为 16.8 ms，全部非时长检查通过。新版本 0.5.3-alpha.2，候选目录 release/large-farm-0.5.3-r2；新驱动输出使用 artifacts/large-farm/release-r2-20260910，保留所有先前失败证据。

新增可选 FARM100_PERF_PROFILE=1 渲染线程采样与实际 WebGL 后端记录；带分析器的运行只做定位。新增 large-farm-archive-qa.ts，长测后执行完整压缩档案及两组各 100 次乱序跳转检查。先看父流程 release-qa.json 和存活进程再继续，不能因尚无终态报告而重复启动。总体目标仍 active。

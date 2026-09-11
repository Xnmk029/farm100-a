# FARM100 · 算法农场

Windows 本地算法测评客户端，首个关卡为二维作物排序与整田收获。原项目已完整归档；本目录为独立重建的新实现。

2026-09-08 起正在实施完整农场目标。当前 0.5.4-alpha.1 包含八作物、23 项研究、18 个编程挑战、迷宫探索、1/2/4/8 台无人机协作、12 项引导课程、独立环境/动作/收获声音与同输入并排回放。源码通过 `pnpm dev` 启动。旧的 0.1.0 安装包只包含排序测评。

农场开发预览版安装包：`release/scoring-0.5.3-r4/FARM100 Setup 0.5.3-alpha.4.exe`；免安装目录入口为同目录下 `win-unpacked/FARM100.exe`（需要保留整个目录）。交付检查、证据和已知限制见 [2026-09-10 交付检查](docs/DELIVERY_REVIEW_20260910.md)。alpha.4 新增挑战目标完成度、同配置排名及相对效率，评分规则和 Luna 实测见 [挑战评分 v1](docs/CHALLENGE_SCORING.md)。这是阶段预览，尚未达到完整产品目标。

0.5.2 起自由农场支持流式执行、逐批规则校验和分页回放，可通过 `.farmjournal` 导出并重新打开长记录；挑战与旧记录保留原有验证和对比流程。历史检索与中断恢复始于 0.5.1。alpha.2 的长时性能证据见 [大农场验证](docs/LARGE_FARM_IMPLEMENTATION.md)；大记录完整重开仍有明显等待。

评分 v2 预览：`release/scoring-v2-0.5.4-r1/FARM100 Setup 0.5.4-alpha.1.exe`。新增60+40评分工作台、93案例清单、人工评分和证据导出，使用与真实测试状态见 [评分 v2](docs/BENCHMARK_V2.md)。Spark部分实测已保存，人工待评，暂未发布正式总榜。

## 使用

当前预览请启动 `release/scoring-v2-0.5.4-r1/win-unpacked/FARM100.exe`。新手可先进入课程，按提示编辑并执行程序，查看实际反馈。自由农场新档从一行小麦开始，研究、加工和任务页支持经营；“挑战”页可选关卡和种子，载入基线/改进/失败案例。挑战记录可选择两次相同输入进行并排回放。声音默认关闭，可在声音面板开启并分别调整三个通道。

体验协作：挑战 → 八行麦田的分工 → 部署 8 台 → 改进 → 执行。自由农场通过研究分阶段解锁队伍；`examples/garden-fleet-progress.js` 是从新档获得全部研究的人工参考流程。每台机运行同一份程序，以 `get_drone_id()` 分工，局部变量互不共享。

### 旧排序首版

可运行 `release/win-unpacked/FARM100.exe`，或使用 `release/FARM100 Setup 0.1.0.exe` 安装包。首屏载入人工参考解，点击“执行代码”（Ctrl+Enter）运行。选择“改进解”后再次运行，可以比较同一地图上的操作成本。

程序执行与回放独立。运行结束后，使用播放、暂停、单步、进度条和成本/秒倍率观察动作。“对比解法”仅允许相同配置的运行记录；比较范围涵盖两侧完整成本，较早完成的一侧保留终态。

“保存工作区”保存代码与配置；“导出完整记录”生成 `.farmrun` 文件，包含原始代码、版本化配置、完整动作、快照、结果和一致性哈希。重新打开客户端后，可以使用“导入回放”加载该文件。导入不会执行代码。

运行自动保存到 `%APPDATA%/farm100/farm100/runs/`（由 Electron userData 决定）。运行记录页当前显示本次会话记录。CSV 导出包含单次运行指标；命令行批量测试输出完整测试集 CSV/JSON。

模型名称是手工标签，示例明确标为人工参考解。可展开“模型生成记录”填写生成毫秒、输入/输出 Token 和记录来源；空值表示未提供，不自动填成零。此处旧工作流不根据标签、脚本执行耗时推断这些数据；v2独立工作台通过调用证据导入真实模型元数据。

## 开发与验证

要求 Node.js 24+，pnpm 11.22.0。依赖版本固定在锁文件中。

```powershell
pnpm install
node node_modules/electron/install.js
pnpm typecheck
pnpm test
pnpm dev
```

其他入口：

```powershell
pnpm batch
pnpm qa:utility
pnpm build
node node_modules/electron/cli.js . --qa-render
pnpm package
```

`qa:utility` 在真实 Electron utility process 中执行参考解、内存超限、忙循环中止与恢复验证。`--qa-render` 使用独立临时配置与离屏窗口生成真实客户端的两种尺寸图像。它不伪造运行结果。

`artifacts/batch/` 包含固定 24 个案例 × 两个解法的结果，以及 8×8 seed 42 的两个可导入运行包。QA 输出默认位于 `artifacts/`；分发版可通过 `FARM100_QA_DIR` 指定输出目录。

## 文档

- [下一阶段产品目标：观赏性与系统深度](docs/PRODUCT_TARGET_V1.md)
- [完整农场实施记录](docs/GARDEN_IMPLEMENTATION.md)
- [规则与 API](docs/RULES_API.md)
- [运行、消息与记录协议](docs/PROTOCOL.md)
- [实施与验收状态](docs/IMPLEMENTATION_STATUS.md)
- [重建规划](docs/REBUILD_PLAN.md)
- [原始构建文档](docs/source/BUILD_PLAN.md)
- [旧项目归档证据](docs/archive-verification.json)

首版评价先看通关，再比较逻辑操作成本。机器耗时为辅助指标；不提供未经定标的百分制。

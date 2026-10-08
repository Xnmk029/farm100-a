# farm100-a · FARM100 算法农场

公开仓库：[farm100-a](https://github.com/Xnmk029/farm100-a)，默认分支为 `farm100-a`。

Windows 本地算法测评客户端，首个关卡为二维作物排序与整田收获。原项目已完整归档；本目录为独立重建的新实现。

智能体参赛入口：请按 [参赛指引](AGENT_START.md) 完成 31 道题、93 个案例；同时支持标准输入/输出模式的 MCP。宿主安装、独立会话、恢复与证据说明见[智能体网关](docs/AGENT_GATEWAY.md)。这是独立会话赛道，结果不会自动混入历史三模型榜。

当前源码版本为 0.5.4-alpha.1，包含八种作物、23 项研究、18 个编程挑战、迷宫探索、1/2/4/8 台无人机协作、12 项引导课程、独立环境/动作/收获音效，以及相同输入的并排回放。此分支只保留源码和文档；安装包、运行证据包及其他生成产物需在本机重新生成。

历史阶段交付记录与已知限制见[交付检查](docs/DELIVERY_REVIEW_20260910.md)；首版挑战评分规则见[挑战评分 v1](docs/CHALLENGE_SCORING.md)。该版本仍是阶段预览，尚未达到完整产品目标。

0.5.2 起自由农场支持流式执行、逐批规则校验和分页回放，可通过 `.farmjournal` 导出并重新打开长记录；挑战与旧记录保留原有验证和对比流程。历史检索与中断恢复始于 0.5.1。alpha.2 的长时性能证据见 [大农场验证](docs/LARGE_FARM_IMPLEMENTATION.md)；大记录完整重开仍有明显等待。

评分 v2 包含 60+40 分工作台、93 案例清单、人工评分和证据导出；规则及历史测试状态见[评分 v2](docs/BENCHMARK_V2.md)。历史运行数据保留在原工作区，本分支不携带生成的证据包。

## 使用

在仓库根目录运行 `pnpm install` 后执行 `pnpm dev` 启动。新手可先进入课程，按提示编辑并执行程序，查看实际反馈。自由农场新档从一行小麦开始，研究、加工和任务页支持经营；“挑战”页可选关卡和随机种子，载入基线/改进/失败案例。挑战记录可选择两次相同输入进行并排回放。声音默认关闭，可在声音面板开启并分别调整三个通道。

体验协作：挑战 → 八行麦田的分工 → 部署 8 台 → 改进 → 执行。自由农场通过研究分阶段解锁队伍；`examples/garden-fleet-progress.js` 是从新档获得全部研究的人工参考流程。每台机运行同一份程序，以 `get_drone_id()` 分工，局部变量互不共享。

### 排序测评

在客户端进入“排序与收获”页面，载入人工参考解并点击“执行代码”（Ctrl+Enter）。选择“改进解”后再次运行，可以比较同一地图上的操作成本。

程序执行与回放独立。运行结束后，使用播放、暂停、单步、进度条和成本/秒倍率观察动作。“对比解法”仅允许相同配置的运行记录；比较范围涵盖两侧完整成本，较早完成的一侧保留终态。

“保存工作区”保存代码与配置；“导出完整记录”生成 `.farmrun` 文件，包含原始代码、版本化配置、完整动作、快照、结果和一致性哈希。重新打开客户端后，可以使用“导入回放”加载该文件。导入不会执行代码。

运行自动保存到 `%APPDATA%/farm100/farm100/runs/`（由 Electron userData 决定）。运行记录页当前显示本次会话记录。CSV 导出包含单次运行指标；命令行批量测试输出完整测试集 CSV/JSON。

模型名称是手工标签，示例明确标为人工参考解。可展开“模型生成记录”填写生成毫秒、输入/输出词元数量和记录来源；空值表示未提供，不自动填成零。此处旧工作流不根据标签、脚本执行耗时推断这些数据；v2 独立工作台通过调用证据导入真实模型元数据。

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

`qa:utility` 在真实 Electron 辅助进程中执行参考解、内存超限、忙循环中止与恢复验证。`--qa-render` 使用独立临时配置与离屏窗口生成真实客户端的两种尺寸图像。它不伪造运行结果。

执行 `pnpm batch` 会在 `artifacts/batch/` 生成固定 24 个案例 × 两个解法的结果，以及 8×8、随机种子 42 的两个可导入运行包。QA 输出默认位于 `artifacts/`；分发版可通过 `FARM100_QA_DIR` 指定输出目录。生成数据和本机运行记录不纳入此分支。

## 文档

- [视觉体系 v2：3D 空间平面化与全项目动效规划](docs/visual-system-v2/README.md)（2026-10-03，设计与独立样机，尚未替换业务客户端）
- [下一阶段产品目标：观赏性与系统深度](docs/PRODUCT_TARGET_V1.md)
- [完整农场实施记录](docs/GARDEN_IMPLEMENTATION.md)
- [规则与接口](docs/RULES_API.md)
- [运行、消息与记录协议](docs/PROTOCOL.md)
- [实施与验收状态](docs/IMPLEMENTATION_STATUS.md)
- [重建规划](docs/REBUILD_PLAN.md)
- [原始构建文档](docs/source/BUILD_PLAN.md)
- [旧项目归档证据](docs/archive-verification.json)

本地中文清理分支和数据范围见 [FORK.md](FORK.md)。项目许可证为 GPL 第 3 版，详见 [LICENSE](LICENSE)。

首版评价先看通关，再比较逻辑操作成本。机器耗时为辅助指标；不提供未经定标的百分制。

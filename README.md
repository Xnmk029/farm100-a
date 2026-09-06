# FARM100 · 算法农场

Windows 本地算法测评客户端，首个关卡为二维作物排序与整田收获。原项目已完整归档；本目录为独立重建的新实现。

## 使用

可运行 `release/win-unpacked/FARM100.exe`，或使用 `release/FARM100 Setup 0.1.0.exe` 安装包。首屏载入人工参考解，点击“执行代码”（Ctrl+Enter）运行。选择“改进解”后再次运行，可以比较同一地图上的操作成本。

程序执行与回放独立。运行结束后，使用播放、暂停、单步、进度条和成本/秒倍率观察动作。“对比解法”仅允许相同配置的运行记录；比较范围涵盖两侧完整成本，较早完成的一侧保留终态。

“保存工作区”保存代码与配置；“导出完整记录”生成 `.farmrun` 文件，包含原始代码、版本化配置、完整动作、快照、结果和一致性哈希。重新打开客户端后，可以使用“导入回放”加载该文件。导入不会执行代码。

运行自动保存到 `%APPDATA%/farm100/farm100/runs/`（由 Electron userData 决定）。运行记录页当前显示本次会话记录。CSV 导出包含单次运行指标；命令行批量测试输出完整测试集 CSV/JSON。

模型名称是手工标签，示例明确标为人工参考解。可展开“模型生成记录”填写生成毫秒、输入/输出 Token 和记录来源；空值表示未提供，不自动填成零。当前没有连接模型 API，也不根据标签、脚本执行耗时推断这些数据。

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

- [规则与 API](docs/RULES_API.md)
- [运行、消息与记录协议](docs/PROTOCOL.md)
- [实施与验收状态](docs/IMPLEMENTATION_STATUS.md)
- [重建规划](docs/REBUILD_PLAN.md)
- [原始构建文档](docs/source/BUILD_PLAN.md)
- [旧项目归档证据](docs/archive-verification.json)

首版评价先看通关，再比较逻辑操作成本。机器耗时为辅助指标；不提供未经定标的百分制。

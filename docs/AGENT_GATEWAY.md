# FARM100 跨智能体测试入口

版本：farm-agent-session-v1。支持任意能调用本地命令或标准输入/输出 MCP 的智能体，不要求其依赖特定厂商接口。参赛入口：[AGENT_START.md](../AGENT_START.md)。

## 一次准备，随后一句话开测

在本机项目根目录执行：

```powershell
pnpm agent:prepare
pnpm agent config
```

prepare 校验并复制93份冻结参考，不改写历史 bundle 或模型成绩。缺少历史 manifest 时，复用现有引擎生成并冻结参考；这可能需要较长时间。题面/规则变化会拒绝覆盖已有网关题库，须用新的 `--root` 创建独立版本。

config 输出 `artifacts/agent-gateway/mcp.json`，其中 command 是本机 Node 的绝对路径，args 是启动脚本、mcp子命令及独立数据目录。把其中 farm100 配置加入目标客户端的 MCP 配置并重新连接。脚本从任意工作目录启动均可，标准输出只承载 JSON-RPC。没有网络监听、接口密钥、模型付费调用或额外运行依赖。

连接后给智能体一句话：**使用当前智能体完成 FARM100 标准测试，逐题提交、失败最多修订一次，完成后导出成绩和回放。**

客户端无需 MCP 时，可以直接要求它按项目根目录 AGENT_START.md 操作。缺少本地 Node/文件/命令权限的纯聊天客户端不能直接使用此入口。

## 传输与状态

- MCP stdio：initialize、ping、tools/list、tools/call、prompts/list、prompts/get；内置 farm100_test 提示。工具为 start、next、submit、status、resume、export。支持2024-11-05、2025-03-26、2025-06-18、2025-11-25协议协商。
- CLI：`node scripts/farm100-agent.mjs help`。命令还包括宿主 prepare/config，以及独立评审者 review。
- 会话：自动UUID，默认存到 `artifacts/agent-gateway/sessions/<UUID>/`；与 `artifacts/scoring-v2/` 隔离。
- 领取题目固定票据；重复next不换题。提交保存原文与哈希；同票据同文本重试幂等，改文本拒绝。格式错误也占一个提交槽位。
- 后台子进程使用原QuickJS沙箱、预算和超时。每例完成后落盘；进程崩溃可以恢复尚未完成的同一答卷，不重新调用模型或重抽首答。
- 每題最多首次加一次失败修订；通关不提供修订。只有完成全部选定任务后才能导出含参考文件的档案。
- `--tasks lesson-position` 等是练习子集；完整运行省略此项。练习报告明确保留全套93案例分母，不冒充完整测试。

## 证据、回放与评审

导出目录保留 REPORT.md、report.json/csv、bundle.json、calls、runs和references。导出重新校验原始答卷与运行事件并重算分数。bundle可以在原评分工作台中导入；请保留完整目录。模型标签以 `[Agent]` 开头，providers保存会话模式和自报身份边界。不会自动合并历史模型榜。

身份字段由智能体自报，实际模型由宿主客户端截图或运行证据另行佐证。词元数量及模型费用保持未知，网关自身不发起模型调用；reserved=0 只表示本工具没有预留接口调用开销，不表示外部模型使用免费。领取到提交的时长包含工具和人工等待，不是纯模型生成时长。

设计40分仍使用既有四项量表。完成后由独立评审者准备原ReviewSchema格式JSON（attemptId、reviewer、strategy/correctness/complexity/boundaries，逐项score/reason/evidence），通过 `review --session UUID --file ABSOLUTE_PATH` 追加记录，然后重新export。评审未完成时100分总分为空。review不作为参赛MCP工具暴露；拥有本地文件权限的客户端仍须遵守宿主隔离约束。

本入口修正 collect 无参数说明，保留同一模拟规则、随机种子和评分权重，题面另存哈希；智能体持续会话可能共享前题经验，所以与原 v2 独立调用榜分开。

## 宿主入库

完整测试结束后由宿主执行 `node scripts/farm100-agent.mjs archive --session UUID`。此命令重新校验并导出会话，把答卷、运行、参考与报告复制到 `artifacts/agent-gateway/archives/<UUID>/<bundle哈希>/`，生成逐文件哈希清单，并登记到 `artifacts/agent-gateway/registry.json`。相同版本重复入库不新增行；补充独立评审后再次入库生成新版本，保留旧版。未结束的会话不能入库，练习会话明确标为 practice。归档命令不暴露为参赛 MCP 工具。

## 验证命令

`pnpm typecheck`、`pnpm test`。新增真实引擎用例覆盖：身份未知、任务隔离、固定票据、提前导出拒绝、重复/篡改提交、格式错误、最多一次修订、真实失败、进程间恢复、互斥领取、分数篡改拒绝。子进程测试通过MCP实际握手、调用、后台worker和导出，并从另一个cwd启动。

Windows成品安装包尚未包含此新CLI入口；当前以源码工作区运行。既有Electron UI未在本轮重新打包。

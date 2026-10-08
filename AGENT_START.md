# 用当前智能体参加 FARM100

用户一句话入口：**请按本文件使用当前智能体完成 FARM100 全套测试，结束后导出记录。**

这是参赛指引，不是开发任务。不要修改项目源码、测试、评分规则或既有记录。只读本文件和网关返回的题面/反馈，不搜索参考解、旧答卷或成绩。不得委托其他模型作答。可以使用自己的文件工具保存答卷，以及终端工具运行下述网关命令；这些工具只承担提交与记录功能，不用于额外试跑答案。

当前规则为 `farm-agent-session-v1`，共 31 题、93 个案例。所有题都要完成提交，失败可以存在，不能把未通关说成未执行。每题由网关决定是否允许一次修订；不能新建会话重抽首答。完成前不要读取网关的内部 session.json、references、runs、calls 或其他智能体的目录。

## 首选 MCP

若已连接 `farm100` MCP，直接使用 `farm100_start → farm100_next → farm100_submit → farm100_status`。`next` 返回 `complete` 后调用 `farm100_export`。以下 CLI 是同一网关的备用通道，不是另一套评分规则。

## CLI

入口为本文件同目录的 `scripts/farm100-agent.mjs`。请在仓库根目录打开终端并使用 Node.js 24+。宿主已准备题库，不需要参赛智能体执行 prepare。

1. 创建一次会话，把智能体名称写为实际客户端名称，模型与推理档位仅在确定时填写。未知项省略。**完整测试不要传 `--tasks`。**

   `node scripts/farm100-agent.mjs start --agent "你的客户端名称" --model "实际已选择的模型"`

2. 立即记下返回的 `sessionId`。把它及每题答卷保存在你自己的 `artifacts/agent-submissions/客户端名称/` 下。不得覆盖其他客户端的文件。

3. 获取题目：

   `node scripts/farm100-agent.mjs next --session SESSION_ID`

   返回 `state=question` 时，`id` 是本次 `ticketId`，`prompt` 是完整题面。只依据题面独立解答。答卷是UTF-8 JSON文件，有且只有以下五项字符串；代码不能使用 async/await 或外部模块。

   ```json
   {"source":"同步 JavaScript 代码","strategy":"算法策略","correctness":"正确性说明","complexity":"复杂度和取舍","boundaries":"边界处理"}
   ```

4. 提交文件：

   `node scripts/farm100-agent.mjs submit --session SESSION_ID --ticket TICKET_ID --file "答卷绝对路径"`

   网关先持久保存答卷，再启动后台判题。不要因为 submit 返回 queued 就重新生成答案；相同票据只允许同一份原始文本重复提交。格式错误会消耗一次作答机会。

5. 每隔约5秒查询：

   `node scripts/farm100-agent.mjs status --session SESSION_ID`

   `job=null` 表示这一份判题结束，继续 `next`。失败后 `next` 返回原答案和实际反馈，允许最多一次修订；第二次之后继续下一题。若 job 存在但 workerAlive=false，或基础设施失败，执行 `resume --session SESSION_ID`，只恢复原答案，不生成新答案。不要把短暂 queued / 尚未启动当成解题失败。

6. 重复到 `next` 返回 `state=complete`，然后：

   `node scripts/farm100-agent.mjs export --session SESSION_ID`

7. 报告 sessionId、31 题完成情况、首次/修订后 93 案例覆盖、实际通关情况、客观 60 分及返回的证据目录。40 分设计评审由独立评审流程补充；不要自评、不要声称已有 100 分总分。模型身份、词元数、生成时间或费用不确定的项目保持未知。

中断后继续同一个 sessionId。不要为了提高分数重复创建测试，不要跳题，不要在完整运行尚未结束时停止并称已完成。额度或上下文确实阻断时，保存 sessionId 与最后进度，并如实说明。

## 公平性范围

本入口测量持续智能体会话中的解题流程；会话上下文、工具编排、客户端行为与历史独立模型调用测试不同。题面版本单独冻结，明确 collect() 无参数。结果单独入库，不直接加入原 v2 三模型排行。服务端能够限制票据、提交与修订次数；若客户端拥有整个项目的文件权限，服务端无法阻止其绕过指引读参考答案，宿主应限制权限或保留操作审计。

# 运行与记录协议 0.1.0

## 信任边界

Electron 主进程管理文件与 utility process；preload 只暴露指定 IPC；React/PixiJS 不持有模拟世界的写入入口。参赛代码在 QuickJS/WASM 内执行，宿主不向它传递实际引擎对象或任意 IPC。

首版命令有 start、cancel、ack。运行器发出 ready、events、result、error，携带 protocolVersion、runId 和连续 sequence。不同 runId 的过期消息被忽略，序号错误导致终止。每个事件批次最多 256 个，等待消费端确认后继续；10 秒未确认则报错，宿主另有硬超时。

API 返回值、动作计费和状态变化由模拟核心统一产生一次。记录 seq、累计 cost、action、args、value、position、changes、harvested。不是用渲染帧或动画次数计费。

## 运行包

`.farmrun` 为 UTF-8 JSON，包含 format/version、runId、createdAt、engineVersion/runtimeVersion/prngVersion、config、source、sourceHash、configHash、label、attempt、initial、events、snapshots、result、logs、logsTruncated、complete、logicalHash。

快照包含完整网格、位置、累计成本、分类计数、收获状态；保存初始态、每 256 个事件及最终态。录制数据先在受限数量的内存结构中累积，结束后主进程原子保存；运行器异常退出时，主进程可使用已确认事件重建前缀，标记 complete=false。客户端主进程或系统整体崩溃时，尚未封存的运行目前无法恢复，属于首版限制。

导入限制 64 MiB；校验配置、版本、代码哈希、配置指纹、初始状态、事件序号、预算和每一个动作的真实结果。校验器重新执行事件动作并对照期望事件，检查快照、终态、通关标志和逻辑哈希。导入的源代码不执行。JSON 格式避免压缩包路径解压问题。

逻辑哈希排除 runId、日期和耗时；哈希用于一致性与损坏检测，不认证模型来源。人工标签不构成真实模型调用证据。

## 回放

从最近快照恢复，再按事件归约到指定 seq。逻辑状态只有完整动作前后两种；无人机位置的视觉平滑不改变逻辑结果。

单回放支持事件单步和跳转；播放速度使用逻辑成本/秒。比较双方配置指纹须一致，范围取双方最终成本的最大值；每侧显示“不超过当前对齐成本的最后一个完整事件”，提前结束的一侧冻结在终态。

执行 preparing/running/终态与回放 paused/playing/ended 分别管理，暂停回放不会暂停 VM，也不会改变成绩。

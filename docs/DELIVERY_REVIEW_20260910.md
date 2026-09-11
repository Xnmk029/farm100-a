# 交付检查（2026-09-10）

结论：可作为开发预览版交付，尚不满足完整产品正式验收。交付对象为 `release/teaching-audio-0.5.3-r3/FARM100 Setup 0.5.3-alpha.3.exe`（142,757,754 字节），不是旧的 0.1.0 安装包。安装包 SHA256：`F938AC8B57D3E9196A92716B4A5FB4FA1F011B4D148D84A19E562300978631B3`。

## 验证范围

- 源码类型检查、构建及 54/54 测试已通过，证据：`artifacts/audio/final-20260910/verification.json`。
- 12 项课程实际执行与反馈、三路声音的 11 项离线波形检查、农场相关七类页面 100%/150%/200% DPR 回归已通过。真人学习效果和设备听感不在自动检查范围内。
- alpha.3 包内 103 个构建/示例/场景文件与构建内容一致，证据：`artifacts/audio/package-r3-contents.json`。
- 本次直接运行 alpha.3 的七项成品包回归全部通过：流式 utility、流式 UI 导入导出/分页、预期崩溃退出、历史恢复 UI、经济、挑战、多机。证据：`artifacts/delivery/alpha3-packaged/packaged-verification.json`，完成于北京时间 18:15:35，执行前后 EXE/asar 哈希一致。
- 同一 alpha.3 包的 12 项课程及 100%/150%/200% 实际 DPR 回归全部通过，证据：`artifacts/delivery/alpha3-ui/verification.json`，完成于北京时间 18:16:07。已查看 200% 农场截图，执行、编辑、镜头和回放入口可用。复验包内容仍为 103 文件一致：`artifacts/delivery/alpha3-contents.json`。
- alpha.2 冻结包完成 32×32、8 台无人机、8 类混合作物的 30 分钟实跑，p95 帧时 11.2 ms，中止 1157 ms；十次确定性重复通过。此证据属于 alpha.2，不能声称 alpha.3 重跑过同样的长时验收。

## 未完成的正式交付条件

1. 大记录完整重开曾耗时约 17.5 分钟，存在明显等待体验问题。
2. 当前版本连续 5 分钟 1080p 生产、失败恢复、同输入策略对比及完整成长过程的演示证据未收齐。
3. 原版固定版本实录、外部评价和真人新手学习验收尚未完成。
4. 旧排序与双方案对比界面的高 DPI 检查、设备实际听音尚未完成。
5. 独立 Windows 安装、升级、卸载、原生文件对话框验收由用户暂停；没有通过结论。安装包未签名。

## 虚拟机测试停止与清理状态

用户已取消 Win10 虚拟机测试。Luna 子代理已关闭，临时 VirtualBox VM `FARM100-QA-W10-reuse`、`FARM100-QA-HARDEN-TEST` 已注销；检查时无运行中的 VBox VM，也未创建成功 Hyper-V VM。

原始 `F:\VBwin\VMs\kuakedownloads\kuakedownloads.vdi` 保留，大小 13,455,327,232 字节，修改时间仍为 2026-07-03；原始登记仍指向旧 G 盘，显示不可访问。本次清理没有改写该登记。

此前修复已将 VirtualBox 7.1.12 同版本重新安装到 F 盘，修正 Oracle 安装路径，并调整安装目录权限。这些宿主修改不等于虚拟机启动成功，本轮没有继续修复或回退安装。注册表和 ACL 备份及变更记录保存在 `artifacts/host-maintenance/vbox-20260910/`（约 327 KiB）。系统 Windows Installer 缓存和用户原有镜像不属于清理目标。

已核对两个无重解析点的精确清理目录：

| 待删除目录 | 文件数 | 逻辑字节数 |
| --- | ---: | ---: |
| `F:\benchmark\FARM100\artifacts\windows-vm` | 94 | 34,674,563,951 |
| `D:\FARM100-QA-W10-HV` | 2 | 67,454,164,992 |

合计约 95.1 GiB，包含 partial ISO、克隆 VDI、动态/固定 VHD、下载的 VBox 安装包及测试日志。自动审批检查拒绝递归删除（仅返回 `blocked by policy`），因此仍在磁盘上，未计为已释放空间。`scripts/download-windows-eval.ps1`、`prepare-clean-windows.ps1`、`prepare-reused-windows.ps1` 和 `vbox-repair-*.ps1` 也待清理；本轮没有再次启动这些脚本。C 盘两次 `FARM100-VBoxLocalTest-*` 临时目录已不存在。

清理清单：`artifacts/host-maintenance/vbox-20260910/cleanup-manifest.json`。项目功能测试、正常成品包和验收证据保留。

用户再次明确授权后，重新检查两个目录、重解析点和 VM 状态，并再次尝试按精确路径删除，执行通道仍返回 `blocked by policy`。复查仍有 94+2 个文件、102,128,728,943 逻辑字节；不能将授权或删除尝试算作清理完成。

已派发独立 `gpt-5.6-luna`、`max` 解题子代理（ID `01a08b9a-7629-7aa0-8a71-bcfc903dea60`），自行解答并运行挑战、记录失败和难度梯度。预定报告为 `docs/DIFFICULTY_REVIEW_LUNA_20260910.md`，证据目录为 `artifacts/difficulty-luna-20260910/`；当前尚未收到结论。

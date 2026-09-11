# 独立 Windows 验收环境（用户已暂停）

2026-09-10 更新：用户取消虚拟机 Win10 测试并要求删除测试镜像与文件。修复子代理已关闭，两个测试 VM 已注销；目录删除被自动审批检查拒绝，尚未完成。当前清单、宿主修复影响和交付判断以 [交付检查](DELIVERY_REVIEW_20260910.md) 为准。以下是历史准备记录，不再执行。

2026-09-10。当前只有开发机发行包验证，尚未完成独立系统安装与功能验收。

## 改用用户已有的 VirtualBox 环境

用户提供 `F:\VBwin` 后，已确认该目录含 VirtualBox 7.1.12 及 `VMs\kuakedownloads\kuakedownloads.vbox/.vdi`。配置为 Windows 10 x64、4 GiB 内存、4 CPU、VBoxSVGA；磁盘约 13.46 GB。历史日志记录该系统安装了 Guest Additions 7.1.12 并正常关机。

当前登记为不可访问的原因是登记路径仍为 `G:\VBwin\VMs\kuakedownloads\kuakedownloads.vbox`，文件已在 F 盘；不能据此判断系统盘损坏。原有共享目录也指向旧 G 盘。为保留原环境，未改写原 VM、磁盘或登记项，正在将原磁盘克隆至 `artifacts/windows-vm/existing-vbox/FARM100-QA-W10.vdi`，随后创建独立、断网的测试 VM。系统能否启动、内部是否有开发工具须实际检查，尚不能宣布干净 Windows 验收通过。

已停止此前 ISO 下载与自动重试，保留 partial 文件，状态记录为 paused。本节取代下面尚未实施的新建 Windows 11 VM 计划；不再等待新镜像来推进测试。

## 镜像与环境

使用微软公开的 Windows 11 Enterprise Evaluation 25H2 x64 简体中文 ISO。官方页面提供评估下载，相关安装要求以该页面为准。[微软下载页](https://www.microsoft.com/en-us/evalcenter/download-windows-11-enterprise)

下载目标 `artifacts/windows-vm/Windows11-Enterprise-Eval-25H2-zh-cn.iso`，官方文件大小为 7,371,034,624 字节。已读取并渲染核对官方哈希表第 3 页的 ZH-CN 项：`7B4AC87391B659F7724229682B642256289A1C00504056249F0F12029157D3D2`。[官方哈希表入口](https://go.microsoft.com/fwlink/?linkid=2334901)

`scripts/download-windows-eval.ps1` 支持续传，核对大小和 SHA256 后才将 `.partial` 改为最终 ISO。下载日志及 `iso-download.json` 保存在上述目录；下载失败会保留部分文件，不覆盖既有不同哈希的镜像。此时下载已启动，尚未写出已核验终态。

本机 Hyper-V 服务可用，没有既有虚拟机。本次计划创建独立的 `FARM100-QA-W11-r1`，第 2 代、2 虚拟 CPU、4 GiB 启动内存、80 GiB 动态 VHDX、Secure Boot 与 vTPM，不连接网络。准备脚本默认只创建关机状态环境；启动前再次检查实际可用内存和其他验收进程。

## 部署路径与边界

`scripts/prepare-clean-windows.ps1` 尚未实际执行。脚本拒绝已有 VM 名称或已有目标目录；只对新建 VHDX 操作。每次分区/格式化/应用映像前确认磁盘反向映射到该文件，且不是主机启动或系统盘；写入映像和启动文件前还核对分区盘符归属。

从已核验 ISO 中应用 Enterprise Evaluation 的 Windows 映像，在虚拟磁盘中建立 EFI 和系统分区。BCDBoot 必须指定该虚拟 EFI 分区的 `/s`，不创建主机 NVRAM 启动条目；不修改主机的双启动菜单。[微软 BCDBoot 说明](https://learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/bcdboot-command-line-options-techref-di?view=windows-11)

使用 Windows 无人值守安装支持的本地账户配置，创建仅用于此离线测试机的 FarmTest。随机凭据以主机 DPAPI 保护的 CLIXML 保存到已忽略的验收目录；不写入源码或报告。[微软 LocalAccount 说明](https://learn.microsoft.com/en-us/windows-hardware/customize/desktop/unattend/microsoft-windows-shell-setup-useraccounts-localaccounts-localaccount)

## 实际验收清单

以下项目均需运行后记录，当前没有通过项：

1. 第一次启动记录 OS 版本、机器名、已安装程序与开发工具状态；确认测试机未安装 Node、编译器、IDE 或项目开发依赖。
2. 记录与导入最终安装包哈希，离线运行普通安装流程，检查安装目录、快捷方式与卸载条目。
3. 正常启动安装后的客户端，从新档执行，保存并关闭，再启动后重开同一农场。
4. 从历史检索真实记录，回放、暂停、单步及跳转，检查世界与记录一致。
5. 打开挑战并比较同输入的两个策略，导出记录，再从原生文件选择界面导入。
6. 先装上一已验收版本，准备农场与历史；升级到新包后重开、回放和继续运行，核对旧规则结果。
7. 运行卸载，确认程序与快捷方式按选择移除，用户数据保留或删除行为与界面承诺一致。

保存系统盘点、安装/升级/卸载日志、实际窗口截图、农场文件和导出记录。发行内嵌 QA 可用于辅助，但对话框路径替换的检查不能独自证明原生文件操作通过。主机上的开发版运行不能替代上述环境证据。

# FARM100 像素欧普 / 浅空间 v2.1

针对用户指出的 v2 缺少像素欧普风格，保留原空间展开逻辑并补齐像素字形与程序材质。旧目录 `visual-system-v2` 保留作对照。

- 视频、对照图和机器核验输出由下方脚本生成，清理分支不随附这些产物。
- [设计补充规范](../../docs/visual-system-v2/PIXEL_OPART_ADDENDUM.md)
- [验证记录](QA.md)

在 FARM100 仓库根目录运行：

```powershell
node video/visual-system-v2-opart/server.cjs
node node_modules/electron/cli.js video/visual-system-v2-opart/render.cjs --samples
node node_modules/electron/cli.js video/visual-system-v2-opart/render.cjs
node video/visual-system-v2-opart/verify.cjs
```

首条命令输出交互预览地址。支持播放、拖动、横竖屏和减少动效；视频只导出横屏，竖屏提供同逻辑样帧。

`opart.js` 是独立材质实现，`study.js` 管理空间投影和时间线。得意黑、Noto Sans SC 和 Fira Code 从本机读取；后两者是正式信息字体的临时代用。可通过 `FARM_TONE_DISPLAY`、`FARM_TONE_SANS`、`FARM_TONE_CODE` 指定字体文件。字体不随目录分发。

本片使用合成几何和演示路径，非模型实测，不承担评分证据。未迁移业务界面。美术验收未由用户确认。

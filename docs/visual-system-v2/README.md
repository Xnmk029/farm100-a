# FARM100 视觉体系 v2

2026-10-04 更新：当前风格样机为 **v2.1 像素欧普 / 浅空间**。用户指出旧版材质不足，新版补上固定像素字形、蓝青色阶与黑白干涉纹。旧版作为过程对照保留。

- [v2.1 材质设计规范](PIXEL_OPART_ADDENDUM.md)
- 视频和对照图属于生成输出；清理分支不随附，可按[样机说明](../../video/visual-system-v2-opart/README.md)重新生成。
- [v2.1 源码、复现与验证](../../video/visual-system-v2-opart/README.md)

以用户提供的 `unbox-swe2max-tone.zip` 为基准，补齐“3D 空间平面化”的完整设计要求。原始参考不改，旧视觉作品保留。本轮产出设计与独立样机，尚未换装业务客户端。

- [主设计规范：design.md](design.md)：全项目色彩、字体、空间相机、几何、遮挡、动作、事件、界面映射、视频与实施验收。
- [参考审计](REFERENCE_AUDIT.md)：定稿优先级、被撤回样式、demo 核对及缺失源资产。
- [动效参数](motion-tokens.json)：可供后续实现读取的结构化提案。
- 18 秒空间动效样片属于生成输出，清理分支不随附。
- [横竖屏画面与源码](../../video/visual-system-v2/)。
- [验证与限制](QA.md)。

## 交互预览

在 FARM100 根目录执行：

```powershell
node video/visual-system-v2-opart/server.cjs
```

打开输出的本机地址，可播放、拖动、切换横竖屏和减少动效。字体从本机已安装文件读取，无需联网。不复制字体进项目；换机器用 `FARM_TONE_DISPLAY`、`FARM_TONE_SANS`、`FARM_TONE_CODE` 设置字体文件路径。正式资产与许可仍需锁定。

```powershell
node node_modules/electron/cli.js video/visual-system-v2-opart/render.cjs --samples
node node_modules/electron/cli.js video/visual-system-v2-opart/render.cjs
node video/visual-system-v2-opart/verify.cjs
```

渲染采用现有 Electron、Canvas 和 FFmpeg。样机用合成几何、演示路径与明确标签，不使用任何模型成绩，不宣称为实测回放。横屏视频按 60 fps 输出，竖屏本轮提供同逻辑交互预览与样帧。

## 本轮边界

已设计全界面语义和迁移顺序，已实现相机展开/展平、关系层、阅读叠层、切片揭幕与独立像素材质试验引擎。未实现正式美术资产、多种作物动画、所有业务页面换肤、参考原版 PHASE 引擎、配音或正式评测节目。技术自检已做，用户审美验收未确认。

# 视觉与依赖来源

农场地块、植物、无人机、路径和动作标记由本项目 `packages/farm-view/index.tsx` 使用 PixiJS Graphics 绘制。没有复制旧 FARM100 素材，也没有下载第三方图片、角色或声音。

字体使用 Windows 已安装字体及通用等宽后备字体，无在线字体请求。Monaco 的字体/worker 与前端构建产物一同打包。

Electron 默认应用图标随 Electron 分发；当前测试安装包尚未定制系统图标。Electron、React、PixiJS、Monaco、QuickJS 及其他依赖许可随其软件包保留。准确依赖版本见 package.json 和 pnpm-lock.yaml。

页面保持严格 CSP；`pixi.js/unsafe-eval` 是 Pixi 提供的兼容入口，用固定解释实现替代动态生成函数，不是在 CSP 中允许 unsafe-eval。
# 2026-09-08 原创农场资产扩展

新增 54 张 Blender 渲染透明 PNG 与可编辑 `.blend` 模型库，全部由 `scripts/assets/build_farm.py` 本地生成。来源、复现命令、已接入与预备素材范围见 `GARDEN_IMPLEMENTATION.md`。本次未调用图像生成 API，也未引入外部模型或原版游戏素材。资产已进入 `apps/desktop/public/assets/farm-v1/` 并随构建分发。

## 2026-09-08 加工设施

新增 6 张原创设施 PNG，总计 60 张。独立可编辑源库 assets/source/farm-facilities-v1.blend，清单 facilities-manifest.json；同一脚本加 --facilities-only 可复现。设施随科技解锁显示，加工进度按真实事件时间绘制。

## 2026-09-08 探索资产

新增篱墙、锁门、钥匙信标、遗物信标 4 张 PNG，总计 64 张。源库 assets/source/farm-exploration-v1.blend，--exploration-only 可复现，exploration-manifest.json 记录构成。

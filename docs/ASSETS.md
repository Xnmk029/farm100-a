# 视觉与依赖来源

农场地块、植物、无人机、路径和动作标记由本项目 `packages/farm-view/index.tsx` 使用 PixiJS Graphics 绘制。没有复制旧 FARM100 素材，也没有下载第三方图片、角色或声音。

字体使用 Windows 已安装字体及通用等宽后备字体，无在线字体请求。Monaco 的字体/worker 与前端构建产物一同打包。

Electron 默认应用图标随 Electron 分发；当前测试安装包尚未定制系统图标。Electron、React、PixiJS、Monaco、QuickJS 及其他依赖许可随其软件包保留。准确依赖版本见 package.json 和 pnpm-lock.yaml。

页面保持严格 CSP；`pixi.js/unsafe-eval` 是 Pixi 提供的兼容入口，用固定解释实现替代动态生成函数，不是在 CSP 中允许 unsafe-eval。

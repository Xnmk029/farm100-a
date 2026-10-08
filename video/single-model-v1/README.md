# FARM100 单模型视频导播 v1

样片对象：GLM-5.3 / ZCode（自报）。本目录独立于业务界面和评分规则。

- [导播方案与视觉规范](DIRECTOR_PLAN.md)
- [旁白草稿与逐镜头EDL](NARRATION_EDL.md)
- [原始证据索引](evidence-ledger.json)
- [精确时间线](public/timeline.json)
- 静音视频样片和抽帧图属于生成输出，清理分支不随附；按下方步骤重新生成。
- [自行验证报告](QA.md)

## 重新生成

在FARM100根目录执行，每一步成功后再执行下一步：

```powershell
node node_modules/tsx/dist/cli.mjs video/single-model-v1/prepare.ts
node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM --esModuleInterop --skipLibCheck video/single-model-v1/film.ts video/single-model-v1/prepare.ts
node video/single-model-v1/build.mjs
node node_modules/electron/cli.js video/single-model-v1/render.cjs --samples
node node_modules/electron/cli.js video/single-model-v1/render.cjs
node video/single-model-v1/verify.mjs
node node_modules/electron/cli.js video/single-model-v1/verify-controls.cjs
```

`render.cjs`使用隐藏的独立Electron窗口和临时本机HTTP服务，结束时关闭，不连接模型API。首次运行需在PATH中可用ffmpeg和ffprobe。当前机器使用已安装的Remotion FFmpeg二进制。

成片验证的拼图步骤另需 Python 与 Pillow。

交互预览：运行 `node video/single-model-v1/serve.cjs`，访问脚本打印的本机地址，播放或拖动时间线。不要直接通过file协议打开页面，因为数据使用fetch加载。预览和视频使用同一份绘制代码。

最终数据快照和生成结果均在本目录内。重新制作其他模型时需更新prepare中的归档会话与案例，以及film中的具体结论文案；模型名和总分已经从数据读取，镜头结构可以复用，但当前不是所有题型的全自动视频生成器。

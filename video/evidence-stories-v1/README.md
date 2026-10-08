# FARM100 · 真实案例视频 v1

总体按 Opus 规划，Astra 仅做细节补充。沿用用户基本认可的像素欧普／浅空间视觉。此目录独立生产，未改模拟器、题库、评分或历史归档。

- 两部成片及联系表属于生成输出，清理分支不随附；按下方步骤生成后会写入 `output/`。
- [制作规划与指标词典](PRODUCTION_PLAN.md)
- [实施范围与复用记录](REUSE.md)
- [验证报告](QA.md)
- [迷宫EDL](maze-3-EDL.md) / [多机EDL](fleet-harvest-EDL.md)
- [结论与来源台账](evidence-ledger.json)
- [独立证据页](public/evidence.html)（完整下载、预览链接请经下述本地服务打开）

两片均为1920×1080、30fps、H.264＋AAC，带本机合成的临时中文旁白和烧录字幕。清理分支不附带本机合成语音及编译包，运行下方流程后再生成。没有最终配音、背景音乐或商业发布包装。主体为归档事件重建，不是客户端录屏。人工理解测试、平台上传验证、用户美术验收仍待进行。

## 本地观看与编辑

在 FARM100 仓库根目录运行：

```powershell
node video/evidence-stories-v1/server.cjs
```

打开输出的本地地址，可切换两片、播放、拖动和打开证据页。服务仅监听127.0.0.1。原始归档下载依赖本仓库原归档目录；派生数据、源码摘录和影片已在本目录。

编辑 `plan.json` 改旁白与章节；编辑 `film.ts` 改画面，`prepare.ts` 管理只读证据提取。替换不同题型仍需明确适配，不是任意模型一键节目生成器。

## 复现顺序

```powershell
node node_modules/tsx/dist/cli.mjs video/evidence-stories-v1/prepare.ts
powershell -NoProfile -ExecutionPolicy Bypass -File video/evidence-stories-v1/narrate.ps1
node video/evidence-stories-v1/build.mjs
node video/evidence-stories-v1/evidence-page.mjs
node video/evidence-stories-v1/verify-evidence.mjs
node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM --esModuleInterop --skipLibCheck video/evidence-stories-v1/film.ts video/evidence-stories-v1/prepare.ts
node node_modules/electron/cli.js video/evidence-stories-v1/render.cjs --samples
node node_modules/electron/cli.js video/evidence-stories-v1/render.cjs
node video/evidence-stories-v1/verify-media.mjs
node node_modules/electron/cli.js video/evidence-stories-v1/verify-page.cjs
```

依赖仓库已有tsx/esbuild/Electron、PATH中ffmpeg/ffprobe、本机System.Speech与System.Drawing。字体沿用v2.1（得意黑、Noto Sans SC、Fira Code），不随包分发；可用FARM_TONE_DISPLAY、FARM_TONE_SANS、FARM_TONE_CODE指定字体文件。

临时旁白Microsoft Huihui Desktop，Rate=1。build按实测语音长度扩展章节，保留开头0.6秒及片尾余量，不加速截断语音。字幕按完整语义段显示，非逐字对齐。

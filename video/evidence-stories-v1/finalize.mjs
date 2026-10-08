import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=path.resolve('video/evidence-stories-v1'),hash=b=>createHash('sha256').update(b).digest('hex');
const read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const plan=await read('public/plan.json'),evidence=await read('evidence-qa.json'),page=await read('output/page-qa.json');assert(evidence.pass&&page.pass);
const media=[];
for(const s of plan.stories){const q=await read(`output/${s.id}/media-qa.json`),l=await read(`output/${s.id}/layout-qa.json`);assert(q.pass&&l.pass);assert.equal(q.sha256,hash(await fs.readFile(path.join(root,`output/${s.id}/${s.id}.mp4`))),'verification stale');assert.equal(q.frames,s.totalFrames);assert(l.frames.some(f=>f.chapter==='terminal'&&f.texts.some(t=>t.s.includes(s.id==='maze-3'?'底色越深':'柱形表示'))),'missing revised legend');media.push(q);}
await fs.writeFile(path.join(root,'output/media-qa.json'),JSON.stringify(media,null,2));
const qa=['# 成片与证据自检报告','',
'2026-10-05（Asia/Shanghai）。状态：本轮真实片段与第二案例复用已制作、自检；未获得用户美术验收，未做真人理解测试或公开发布。','',
'| 成片 | 时长 | 画幅 / 帧率 | 编码 | 文件大小 | 完整解码 |',
'| --- | --- | --- | --- | --- | --- |',
...media.map(q=>`| ${q.id} | ${q.seconds}s | 1920×1080 / 30fps | H.264 + AAC | ${(q.bytes/1000000).toFixed(2)} MB | 通过 |`),'',
'## 已验证','',
'- 两个真实案例、四份原始答卷、四份seed7运行文件与登记bundle哈希吻合；首答与修订初态完全一致。原判题与全三个种子汇总保留。',
'- 原始事件逐条恢复的终态与归档终态相等，并与仓库gardenAt恢复函数交叉检查。失败计数排除dispatch和系统终止，完成动作避免双计数。',
'- 2579条成功移动的端点及持续时间有效；迷宫移动不穿墙。相关源码摘录和首次失败处sense字段已核对。',
'- TypeScript严格类型检查通过；两条时间轴均7章，无空白尾部。音频实测长度用于扩展章节，每段旁白保留余量。',
'- 两片各35个布局样帧无文本越界；回退seek像素一致，双栏共用tick，播放、暂停及拖动通过。',
'- 最终视频均完整解码，帧数分别2760和2640；各提取7个章节中点及14个边界帧。当前报告及media-qa哈希对应最终成片。',
'- PCM解码确认音轨非静音、无采样满幅削波；仅技术检查，未冒称完整听审。临时旁白为本机Microsoft Huihui Desktop；发音、自然度和长时间听感待用户试听。',
'- 本地证据页浏览器检查通过，无横向溢出；4份源码下载哈希与原始源码一致，原始运行下载核验通过。完整归档仍从本地只读原路径提供。','',
'## 视觉复查与调整','',
'检查对象包括实际H.264解码帧，而非仅渲染前PNG。核对成绩、tick、失败数、图例、起点、代码摘录、字幕及结尾；实际成片与数据解释一致。浅空间在任务建立段展平，进入比较后固定正视。两方案用位置与圆/方标记区分；证据数字和代码不填像素材质。',
'复查补齐终态跳时与热度图例，多机终态去掉访问热度覆盖，保留麦田状态和各机采收量。修正实现期发现的迷宫方向位映射（North=1、South=2、East=4、West=8），最终视频使用正确映射。源码没有被当作实时执行行。',
'## 压缩与动态检查','',
'已生成同画幅CRF35、maxrate800k压力转码并抽帧对照。主要标题、计数、路径与源码仍可辨认；细密材质和小字边缘可见软化。联系表只作总览，精读应打开1920×1080解码帧或成片。不能据此声称已通过B站/抖音平台重编码。',
'对全部帧计算了低分辨率相邻帧亮度变化面积，含章节切换；该统计不是正式闪烁阈值检测或光敏安全认证。包装相位慢速变化，证据段品牌纹理保持静止。','',
'## 复用结果与范围','',
'第二案例复用了同一计划格式、渲染器、音频拼接、字幕、播放器和QA流程；新增麦田/多机图层及案例文案。未记录可靠的人工工时，故不编造节约比例。两例同属Sol会话，只验证跨题型复用，未验证任意模型自动接入。',
'尚待：真人理解测试、目标平台上传对照、用户美术验收、正式配音/混音；后续增加题型与公开交互平台需要另行范围确认。原历史成绩、业务源码、评分规则均未在本轮修改。','',
'## 文件索引','',
'- [证据与数据核验](evidence-qa.json)','- [音视频核验](output/media-qa.json)','- [证据页核验](output/page-qa.json)',
'- [迷宫压缩对照](output/maze-3/compression-comparison.jpg)','- [多机压缩对照](output/fleet-harvest/compression-comparison.jpg)',
'- [文件哈希清单](delivery-manifest.json)',''];
await fs.writeFile(path.join(root,'QA.md'),qa.join('\n'));
const files={};async function walk(dir,prefix=''){for(const e of await fs.readdir(dir,{withFileTypes:true})){const rel=prefix?prefix+'/'+e.name:e.name;if(e.name==='delivery-manifest.json'||e.name.includes('profile')||e.name==='stills')continue;if(e.isDirectory())await walk(path.join(dir,e.name),rel);else files[rel]=hash(await fs.readFile(path.join(dir,e.name)));}}
await walk(root);await fs.writeFile(path.join(root,'delivery-manifest.json'),JSON.stringify({at:new Date().toISOString(),timezone:'Asia/Shanghai',goalScope:'first real case + second task reuse verification',pass:true,files},null,2));console.log(JSON.stringify({pass:true,files:Object.keys(files).length,media:media.map(q=>({id:q.id,seconds:q.seconds,bytes:q.bytes,sha256:q.sha256})),qa:path.join(root,'QA.md')},null,2));

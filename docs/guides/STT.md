# 录完转写：本地第一版

2026-10-12。用户选择录完转写、编辑确认后发送、API、中英混说；当前几十秒，目标支持每段最多 5 分钟。用户报告此前邮件修复实际测试通过。云端版本保持不变。

## 为什么这样选择

录完转写可以复用现有输入和记忆管道；确认后发送允许先纠正人名、日期及专有词。供应商从 OpenAI 改为百炼，是因为用户的支付/账号可用性。选 qwen3-asr-flash 是因为支持短音频直接提交，暂不需要公开音频 URL 或额外存储。弗吉尼亚使用原生 DashScope 协议；不要套用该地域未支持的 ASR OpenAI 兼容调用。

## 本机配置

在 frontend/.env.local 保存以下服务端值，不用 NEXT_PUBLIC 前缀：

```dotenv
STT_API_KEY=百炼对应业务空间的key
STT_MODEL=qwen3-asr-flash
STT_BASE_URL=https://你的业务空间ID.us-east-1.maas.aliyuncs.com/api/v1
```

业务空间 ID 来自 Base URL 的域名，例如 ws-...；API key 列表中的数字 ID 不是业务空间 ID。程序把 /services/aigc/multimodal-generation/generation 加到原生 base URL 后。key、workspace 和 region 必须匹配。不要复制以 /compatible-mode/v1 结尾的聊天 Base URL 直接调用语音。

官方参考：[Qwen-ASR API](https://help.aliyun.com/zh/model-studio/qwen-asr-api-reference)、[音频规格](https://help.aliyun.com/zh/model-studio/asr-model)。

## 使用与恢复

登录 localhost 后，输入框旁点击录音，允许麦克风，点击停止录音。转写文字追加到当前输入框；检查/编辑后点 Send，才按现有消息流程保存。每段最长 5 分钟，48 kbps 录音，文件最多 3 MiB；文件格式目前以 Chrome/Edge 的 webm/ogg 为主。

取消会释放麦克风、丢弃这段音频、不修改原输入。失败可显式重试转写或取消；没有自动无限重试。音频保留在页面内存，离开页面/退出登录后不提供恢复。转写端点不创建 conversation、messages、pending_changes 或音频存储；确认发送后的文字是后续记忆的用户来源。供应商端数据处理以其服务政策为准。

## 验证和剩余验收

151 项自动测试全部通过，含 SQL，0 跳过；类型检查和生产构建通过。真实虚构合成英文录音已成功转写，证明配置和原生调用连通，不证明用户中英混合录音准确率。

用户需验收：短中文夹英文、专有词、2–5 分钟、静音/噪声、取消和失败重试；检查修改后发送保存的文字及提案来源。尚未验收 Safari/mobile、Vercel 运行时、长音频可靠性或提供者全局并发限流。客户端时长 header 仅作为基本检查，实际音频时长还由提供者验证。

## 实现入口

- backend/lib/stt.ts：原生配置、输入、提供者响应与安全错误。
- backend/routes/speech/transcribe/route.ts：认证、同源、读取限制与转写。
- frontend/app/api/speech/transcribe/route.ts：Next 适配。
- frontend/public/legacy/src/js/voice.js：录音、编辑确认前置、取消/重试。
- frontend/public/legacy/src/css/voice.css：沿用现有视觉的录音控件。

没有新增数据库迁移、独立后端依赖或服务器。未推送/部署云端。

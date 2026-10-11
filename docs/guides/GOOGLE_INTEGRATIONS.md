# Gmail 与 Google Calendar：第一版

已实现自然语言生成提案、Google 账号授权、Gmail 草稿准备，以及 Review 批准后的发送 / 创建日程。真实账号尚未联调：本地缺少 Google OAuth 配置与服务器密钥，远端数据库升级尚未确认执行。

## 使用流程

- 邮件：说清收件人邮箱和邮件需求 → 系统生成内容，并保存到连接账号的 Gmail 草稿 → 在 Review 查看或修改 → **Approve & send** 才发送。草稿保存失败时，提案仍可保留，连接 Google 后可点 **Prepare in Gmail**。
- 日程：说清标题、开始与结束时间 / 时长 → 在 Review 预览日期、时区、地点、参与人及邀请通知 → **Approve & create event** 才创建到连接账号的主日历。批准前不会占用 Google Calendar。
- 缺少收件人邮箱或必要日程信息时，助手应先询问；不会根据人名编造邮箱。相对日期使用发送消息时的日期和浏览器时区；提交前必须检查 Review 中的具体日期。
- 修改 Review 后需要再次批准。批准邮件时，会用应用中审阅的内容更新 Gmail 草稿；在 Gmail 中单独修改的草稿内容会被覆盖。
- Reject 不发送、不创建日程，但已经准备好的 Gmail 草稿仍留在 Gmail，需要时可手动删除。

## 一次性配置

已执行 011 的数据库还需要执行 [权限补丁 012](../../database/migrations/202610110012_google_execution_permissions.sql)。它补充服务器读取提案、校验原文和保存 Google 回执的必要权限；不会扩大浏览器权限或取消 RLS。原来的本地测试额外授予了服务器全表权限，掩盖了这处遗漏；测试已修正为使用迁移中的实际权限，132 项回归与类型检查再次通过。

1. 打开 [Google Cloud Console](https://console.cloud.google.com/)，选择或创建项目，启用 **Gmail API** 和 **Google Calendar API**。
2. 在 Google Auth Platform 配置应用名称、支持邮箱和受众。个人测试可使用 Testing，并将要连接的 Google 邮箱加入测试用户。工作账号还可能需要组织管理员批准权限。
3. 创建 **Web application** 类型的 OAuth client。Authorized redirect URI 填应用实际地址加 `/api/google/callback`。例如本地端口 3000：`http://localhost:3000/api/google/callback`。若应用运行在其他端口，Google 控制台和环境变量都要使用该端口。
4. 在 `frontend/.env.local` 配置以下服务器变量。保留原有 Supabase、DeepSeek 配置；不要把密钥贴到聊天或使用 `NEXT_PUBLIC_` 前缀。

   ```dotenv
   GOOGLE_CLIENT_ID=Google 提供的 client ID
   GOOGLE_CLIENT_SECRET=Google 提供的 client secret
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback
   GOOGLE_TOKEN_ENCRYPTION_KEY=32 字节随机密钥的 base64 值
   SUPABASE_SECRET_KEY=该 Supabase 项目的服务器 secret key
   ```

   可在本机终端运行 `node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"` 生成加密密钥，然后直接存入本机环境配置。保存好该值；更换后已有连接令牌无法解密，需要重新连接 Google。

5. 在 Supabase SQL Editor 执行 `database/migrations/202610110011_google_integrations.sql`。这是迁移 **011**，只需执行一次。已有数据库应先按文件名顺序完成前面的迁移；新数据库按 `database/migrations/` 顺序执行全部文件。此升级增加连接凭据、执行回执和防重复保护，不恢复或修改已有的人物记忆。
6. 重启前端，登录 Personal OS，点击 **Connect Google**，选择邮箱并授予请求的权限。连接成功后，标题栏会显示连接邮箱。

申请的业务权限是 Gmail `gmail.compose` 与 Calendar `calendar.events.owned`，另有账号身份权限。前者支持草稿与发送，后者支持所属日历中的日程；本版仅操作主日历，没有收件箱同步功能。令牌在服务器端加密存储，浏览器角色无权读取连接凭据或调用执行函数。

Google OAuth 设置参考：[官方 Web Server OAuth 指南](https://developers.google.com/identity/protocols/oauth2/web-server)。提供者功能参考：[Gmail 草稿指南](https://developers.google.com/workspace/gmail/api/guides/drafts)、[Calendar events.insert](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)。

## 真实账号验收

用自己的邮箱测试，避免先向其他人发送或邀请。

1. 输入“帮我给 `<自己的真实邮箱>` 写一封测试邮件，标题是 Personal OS test，正文说明这是一封测试邮件”。检查 Review 内容和 Gmail 草稿；**此时 Sent 中不应有邮件**。
2. 在 Review 修改正文，保存，点击 **Approve & send**。检查 Sent 中只有一封，内容与 Review 一致；刷新后不应重复发送。
3. 输入一个具体未来日期的日程，例如“在 2026 年 10 月 15 日纽约时间下午 3 点到 3 点半安排 Personal OS 测试，不邀请任何人”。以测试时实际未来日期为准。在批准前检查 Google Calendar 没有该日程；批准后核对时间、时区和只有一个事件。
4. 再准备一封邮件并 Reject，确认它没有发送。已生成的 Gmail 草稿可以手动删除。
5. 检查明确缺失收件人 / 结束时间时的询问，以及更换账号、取消授权、权限不足时的提示。

## 验证与边界

2026-10-11 本地自动检查：**132 项测试通过，0 失败，0 跳过**；TypeScript、界面脚本语法检查和生产构建通过。包含原有记忆回归、加密隔离、来源与审批校验、实际 PostgreSQL 兼容测试、草稿与发送分离、重复批准、账号切换保护、时区和夏令时校验。Google 调用在测试中使用模拟响应，没有真实发送邮件或创建日程。

- Google 已收到请求但响应丢失、服务器进程中断或回执保存失败时，会阻止自动重试，避免重复发送。用户需要先检查 Gmail Sent / Google Calendar；本版尚无自动核对与解除不确定状态的功能。
- 外部写入与本地数据库不能组成同一个事务；不能承诺跨服务绝对只执行一次。日历使用稳定事件 ID，重复批准使用已保存回执。
- Disconnect 删除应用保存的连接，保留 Google 中已生成的草稿和事件；彻底撤销权限需在 Google 账号的第三方连接设置中操作。
- 当前是自然语言文本对话入口；本版未增加麦克风语音识别。邮件附件、收件箱读取、批量发送、全天 / 重复日程、会议链接、多个日历，以及已经创建日程的修改 / 删除不在本版范围内。

## 维护入口

- 提供者请求与时区校验：`backend/lib/google-api.ts`
- 草稿准备 / 批准执行：`backend/lib/google-service.ts`
- 连接授权：`backend/routes/google/`
- Review 批准：`backend/routes/pending-changes/[changeId]/route.ts`
- 数据库保护：`database/migrations/202610110011_google_integrations.sql`

后续需要修改 SQL 时新增迁移，不在已经部署的数据库上重复运行 011。


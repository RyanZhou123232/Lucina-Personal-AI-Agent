# Personal OS / Personal Agent：完整进展与上下文交接

更新日期：2026-10-11，America/New_York。项目：`E:/project repo/Personal Agent`。

这份文件用于重置聊天上下文后继续开发。它综合本对话、用户截图与诊断、早期交接记录及当前代码；没有 Git 提交历史可用于逐次对比。用户已澄清真正起点：项目当时只有 PRD、TDL、SCHEMA、IMPLEMENTATION_PLAN、EVALUATION 五份设计文件。基础应用也是此后实现的；早期保存的交接记录是开发中途快照，不能当作最初接手状态。后续助手应先读本文件，再读根目录 `AGENTS.md` 和需要改动的代码。

## 1. 当前结论与停止点

### 最新补充：Lucina 品牌文案（2026-10-22）

- 用户最终确认发布当前版本到 GitHub/Vercel，撤销此前“暂不推送”的限制。本轮发布前 151 项回归（含 SQL、0 跳过）、类型检查、生产构建通过。额外静态脚本检查发现 api.js 的 IIFE 开头缺失，已恢复并通过所有浏览器脚本语法检查；不改变接口行为。源码推送不携带 frontend/.env.local；云端运行配置仍独立由 Vercel 管理。

- 用户随后将加载页文案进一步改为 `Preparing Lucina 01.`，取代 YOUR LIFE AGENT。
- 修正加载标题逐字动画的统一 min-width：字母按自然宽度排列，避免窄字母 I 两侧出现类似词内空格的间隙；实际词间空格与动画保留。

- 用户在准备 push/deploy 时叫停，要求先修改登录与网站品牌。加载页 NETWORK SEQUENCE 01 改为 YOUR LIFE AGENT；登录页 Network Access、外层与 legacy 网页标题、iframe 名称改为 Lucina。网站描述同步为 Lucina 的 life agent 定位；沿用现有视觉与动画，不改变内部事件/接口/数据库名称。
- 本次修改仅在本地；尚未 push/deploy。当前真实 Next 应用运行 localhost:3001，3000 被独立预览服务占用。本机 Google 回调仍为 localhost:3000，导致用户在 3001 批准邮件时被 origin 检查拦截，未进入执行调用；这次错误不能证明 Google 授权已过期。用户选择后续部署当前版本，不要求本次迁移本地端口或放宽来源校验。

### 最新补充：全屏 Canvas 前端第一版（2026-10-13）

- 用户授权大幅调整前端。已在唯一实际 UI `frontend/public/legacy/` 内重排，未新建第二套页面，未改 API、数据库或部署。背景继续使用原 WebGL 渐变。
- 空闲页面移除原顶部文案、Session active、邮箱、常驻 Google/退出按钮、左右大面板和页脚。底部为轻量沟通线，包含文字、录音、发送及按需菜单。账号/连接、人物、历史对话、诊断仍可从菜单打开。
- 对话记录默认不展示已加载历史；用户发送后出现，可关闭或从菜单重新查看。录音仍是录完转写、编辑后发送，未实现实时转录/持续通话。Enter 发送、Shift+Enter 换行，中文输入法组合输入不触发发送，转写不自动发送。
- 新增真实 pending changes 与未完成 tasks 的事项条；点击事项才展开邮件/日程审核或任务界面，仍复用原准备、编辑、明确批准、提交与任务完成 API。编辑和准备期间保留 review ID；成功移出返回列表后关闭对应工作界面，失败和 uncertain 保护沿用原逻辑。首次进入从后端加载，支持找回未完成记录。
- 事项条目前聚合两类已有记录；提案提交为普通任务后的跨实体身份连续性、执行过程推送、自动切换工作界面和完整历史结果入口仍未完善。没有实现球的动效、原生 Gmail 或实时任务识别；本次不能算完整 UX 或 MVP1 验收通过。
- 新增 canvas-workspace.css/js 管理表层布局和按需界面；保留旧样式供原登录/既有编辑控件使用。任务/审核渲染器发布加载事件并附加事项 ID，表层不复制或替代真实业务实现。单事项审核按钮保持可见；未保存编辑阻止关闭/切换/新建对话；界面根据底部入口高度避免遮挡。
- 验证：151 项原有回归全部通过，含 SQL、0 跳过；脚本语法、类型检查和生产构建通过。隔离预览使用虚构数据验证空闲画布、按需菜单、对话后事项出现、邮件编辑保持同一 review ID、未保存编辑保护、模拟邮件办结与任务完成退场；页面无控制台错误。未登录真实账号或执行真实 Gmail/Calendar 验收，未验收真实 2–5 分钟录音与移动设备。
- 原文件备份及独立预览脚本位于 `C:/Users/HUAWEI/.codex/visualizations/2026/10/14/01a137fa-a4dc-79c3-8f0f-0f9309d84588/`，首页截图为 canvas-idle.jpg。预览仅用于验证，不属于产品运行入口。下一步由用户体验本地真实页面，再调整沟通线、事项呈现和工作界面，补体验合同与剩余 MVP1 验收。

### 最新补充：品牌哲学与 MVP1 前端体验目标（2026-10-13）

- 用户要求先更新文档，再讨论实施；此次未修改前端、后端、数据库或部署。MVP1 仍未完成。
- PRD 更新至 v0.4：品牌目标是减少压力、释放大脑，系统承担复杂度。整个背景即 Canvas，空闲时只保留底部 Agent 沟通线；顶部说明、Session active、邮箱、Google 连接与退出按钮从主画布移除，管理能力按需打开。现阶段保留按需调试和沟通中的对话记录。
- 用户视角统一追踪“还没办完的事”：还未准备、准备中、等待审核属于同一事项的连续体验，不能按后台阶段拆成不同栏目。真实任务工作界面按需出现；明确办结才退场，等待决定、失败和不确定结果仍可找回。审批、来源及外部执行保护不变。
- PRD 第 16 节新增 MVP1 必需体验指标；EVALUATION v0.2 第 16 节新增对应场景验收方法。尚未实施或验收，不能据此标记通过。PRD 原 Gmail 流程同步为现行“先真实未发送草稿、明确批准后发送”。
- MVP1 先允许录完转写、编辑提交后识别事项；2–5 分钟持续叙述不中断。边说边识别/转录、事项从沟通线掉出形成球的动效、原生 Gmail 接入和默认隐藏对话记录是长期方向，形式未定，不新增为 MVP1 硬门槛。
- 下一步建议先核对当前 UI 与真实 pending changes/tasks 的连接，明确最小未完成事项闭环，再改全屏布局和轻量入口。实际 UI 仍在 frontend/public/legacy，避免建立第二套实现。旧版参考可读取 E:/project repo/Network；只参考视觉与交互，不复制旧后端或恢复社交功能。

### 最新补充：本地 STT 第一版（2026-10-12）

- 用户报告请求分类修复后的邮件流程没有问题，要求继续 STT。已明确录完转写、编辑确认后发送、服务端 API；中文混英文人名/公司/术语，现在几十秒，未来 2–5 分钟。用户 OpenAI 支付受阻，改选阿里云百炼 `qwen3-asr-flash`，弗吉尼亚地域。
- 本地新增录音/停止/取消/失败重试和时间提示，最长 5 分钟。转写结果追加到当前输入框，保留已有输入和转写期间修改；不自动发送。录音/转写期间阻止发送和切换聊天；取消、退出登录、离开页面会停止麦克风并忽略迟到的结果。失败录音只在当前页面内存中保留，供显式重试。
- 新增 `backend/lib/stt.ts`、`backend/routes/speech/transcribe/route.ts`，Next API 仅转发。登录验证、同源验证、类型/文件签名、流式读取大小上限（3 MiB）、客户端时长范围检查、单进程同 owner 并发保护及 90 秒提供者超时。真实音频时长仍依赖录音端和提供者限制；客户端时长 header 不证明实际音频长度。多实例全局限流尚未实现。
- 采用 DashScope 原生同步接口，以 Base64 提交音频；不将录音公开发布，不读取个人历史作为识别词库，不在应用中持久化音频。混合语种不设置单一 language。浏览器当前支持 webm/ogg 录音（Chrome/Edge）；Safari/mobile 尚未验收。iframe 添加 microphone permission；视觉沿用现有设计。
- 用户最初提供的 3042432 是 API key 编号，不是 Workspace ID；第一次虚构音频测试返回 BadRequest.IllegalEndpoint。随后用户提供完整 Base URL，确认业务空间为 ws-a8r6rdmj4x0pleoc。仅更新本机 STT_BASE_URL 为该域名的 /api/v1；保留原 key/model。正确地址下真实合成英文录音转写成功（49 字符），未保存用户消息或执行 Gmail/Calendar。
- 151 项回归通过（包含 SQL，0 跳过），类型检查和生产构建通过。9 项新增检查覆盖安全 endpoint、输入限制、原生请求、错误/截断不重试、登录/来源，以及草稿保留、取消迟到结果、拒绝麦克风权限和 5 分钟自动停止。
- 当前只完成本地实现及上述验证；用户真实中英混合录音、2–5 分钟录音、静音/噪声/网络故障和来源管道端到端仍需验收，不能据此宣称 STT 质量或整个 MVP1 完成。配置及测试步骤见 guides/STT.md。用户明确要求云端保持现状；未 push GitHub、未部署 Vercel、未执行 SQL 迁移。

下方 STT 缺口及“文本入口”描述是此前阶段状态；以本补充为最新进度。

### 最新补充：云端部署与邮件请求分类修复（2026-10-11）

- 用户报告项目已推送 GitHub 并通过 Vercel 部署；线上配置 Supabase 公共变量并重新部署后登录成功。固定生产域名为 `https://personal-agent-eta-opal.vercel.app`。GitHub remote 本地读取为 `https://github.com/RyanZhou123232/Personal-Agent.git`；尚未独立核对云端代码版本和所有环境配置。
- 用户线上请求“准备一封邮件草稿，先保存 Gmail、Review 批准后发送”，收到历史无证据回复且 Review 0。用户提供的 metadata 确认 `plan.intent=lookup`、`taskStatus=pending`、检索 types 为 tasks/messages；实际 evidence 非空。分类错误后旧 lookup 分支禁止所有提案，不是这轮 Gmail API 请求失败。更早的混合请求还出现回复声称草稿已准备而 Review 0；该轮完整诊断未取得。
- 本地已将请求计划拆分为 `needs_memory` 与 `allow_proposals` 两个必填布尔量，分别映射为 `needsMemory`、`allowProposals`。新动作可不检索历史，混合请求可同时检索和生成提案，纯查询禁止新提案。`intent` 仅作为兼容诊断，由 proposal permission 派生；旧内存 fixture 的兼容 fallback 不用于接受缺少新字段的模型计划。
- 生成、来源验证、有限修复和服务端 binding 分支根据 proposal permission 执行。固定无证据拒答仅用于只读历史请求；普通建议、缺信息的动作澄清不会被吞掉。增加语义检查要求：无对应提案不能声称草稿已准备／进入 Review。没有关键词强制动作，没有放松原文、owner、Review 或 Google 执行保护。
- 142 项回归全部通过（含 SQL，0 跳过）、类型检查和生产构建通过。真实 DeepSeek 使用虚构数据验证四种分类，以及新邮件提案生成和独立检查，通过；未调用 Gmail 写入、未发送邮件、未写入 hosted 数据库。证据见 `testing/REQUEST_PLAN_VALIDATION.20261011.md`。
- 修复目前只在本机源码。尚未提交／推送 GitHub，也未部署 Vercel；仅 Redeploy 旧源码不能上线修复。下一步把代码同步到 GitHub，部署后用正式域名检查 Review 提案和真实 Gmail 草稿；发送仍由用户明确批准。此次没有数据库迁移。
- Chrome 在随机部署地址出现“在诈骗网站中输入密码”的警告；用户确认账号密码与 Google 密码不同，固定生产地址随后未出现相同提醒。Google Transparency Report 对随机地址没有数据显示。具体原因尚未确证，不能把没有警告当成安全审计或已完成修复。

下文 134 项、最后目录整理等描述保留为此前阶段的记录，最新停止点以本补充为准。

**本文件边界**：维护当前实现、验证证据、缺口、交接步骤和目录规则，不另行定义产品范围。产品目标看 PRD，任务拆分看 TDL，验收标准看 EVALUATION，数据设计看 SCHEMA / 实际迁移，开发方式看根 AGENTS。用户最新明确要求优先；最初 IMPLEMENTATION_PLAN 是历史方案参考。完整文件职责与冲突处理统一维护在 [README：文件边界](README.md#文件边界遇到问题该听哪份)，避免再复制一套权威说明。

应用已具备文本对话、个人记录提取、来源校验、Review 编辑 / 批准 / 拒绝、内部提交、任务和人物基础管理、跨对话结构化与关键词检索，以及 Gmail / Google Calendar 集成。

用户报告记忆十题复测全部通过；Google 授权已由开发工具真实验证，两类 API 读取均返回 HTTP 200；用户反馈邮件流程通过、日历创建成功。最后完成的代码修改是：拦截旧邮件提案后，回复只列出真正通过校验的提案，不能再说“邮件和日历两项待审核”。最新本地回归 134 项通过，类型检查与整理后的生产构建通过。

**MVP1 尚未完成。** 主要缺口是麦克风 / STT、完整向量检索、完整实体编辑能力，以及按正式评测合同量化质量。部分知识层和故障恢复仍需补齐或验收，不能用十题通过代替 MVP1 总体验收。

当前没有等待中的用户批准，也没有授权下一轮自动发送邮件或创建新日程。本轮用户要求组织整个工程并清理重复文件，整理已完成。下一轮从剩余 MVP1 工作中选择，不重复搭建已有 Google 连接。

## 2. 接手时已经有什么

最初只有五份设计文件，没有可运行应用。它们现在统一保存在 `docs/core/`。原来的交接错误地把中途已有的基础代码算作接手前能力，现已纠正。

接手后先完成基础应用：Next.js / React / TypeScript、复用原视觉的登录与工作区、Supabase Auth / 数据表 / owner RLS、conversation / messages、DeepSeek 提取、pending changes / Review，以及内部原子提交。数据库迁移 001–004 属于这阶段实现，包括修复 `record "new" has no field "linked_task_id"` 的关系触发器错误；随后开展下文的检索、记忆与 Google 集成。
用户后来用截图确认 Alex coffee-chat 的 people / interaction / task 提案变为 committed，并确认人物互动关系、来源边正确。这是一个用户验收案例，不是整体准确率证据。

## 3. 接手后做了什么

### 3.1 对话与模型输出可靠性

- 支持完整 JSON fence；对空输出、截断、根结构和必要字段错误给出明确诊断。
- 格式错误只做一次有限重试，截断时提高输出预算；不无限调用模型。
- 校验提案类型、置信度、对象大小与原始来源；失败时保留用户消息，不编造成功回复或记录。
- 增加规划器输出格式修复，处理用户遇到的 `Invalid memory search terms`。该截图只能证明规划参数不合法，不能反推具体是数组长度还是类型。

### 3.2 Review 编辑

- 新增 Edit / Save changes / Cancel；编辑与批准分开。
- 失败保存保留输入，切换 tab 和自动刷新不覆盖正在编辑的内容。
- 服务端保留原有 provenance，不信任浏览器伪造或替换来源。
- 日期留空或旧 `null` 文本转换为 JSON null；自然语言时间无法解析时不硬塞给数据库时间字段。
- 人物绑定 ID、修改前值、版本不能通过 Review 编辑绕过；过期版本拒绝提交。

### 3.3 Task 与 People 基础管理

- Context 中新增任务列表、编辑标题 / 描述、完成、查看已完成、重新打开；保留来源与完成时间语义。
- 新增认证且按 owner 过滤的任务 GET / PATCH，更新有 optimistic `updated_at` 检查。
- Context 中新增 People 搜索、Name / Notes 编辑、linked interactions；分页读取并按 owner 隔离。
- 没有把同 conversation 的任务自动归给某个人，也没有声称已经做完整任务 / 人物 CRUD。人物核心字段与灵活属性的完整编辑仍缺失。

### 3.4 检索第一阶段及来源体系修复

- 新增 `search_personal_memory`，查询自己的结构化记录、属性、图来源和用户原文，支持人物 / 类型 / 任务状态及关键词 / PostgreSQL full-text。
- 对话先规划并检索，再生成回答；保存检索计划、证据层级、引用和校验结果到 assistant metadata。
- lookup 不生成新提案，排除当前查询消息和助手回复作为事实证据；检索失败时不发布个人历史答案。
- 建立 EXACT / RELATED / NONE；引用必须属于本次返回的证据，不允许生造 M 标签或裸 UUID。
- 来源 UI 按原始 message ID 去重，同一个原文的多个证据表示保留标签但只展示一次。
- 数字昵称不得被 UUID、时间戳、JSON 字段名命中误导；SQL 改为搜索允许的正文、字段和属性值。正文与上下文权重分开。

历史上发现 Alex / 23 串人与错误来源边：确切原文可以存在，但人物归属仍错误。早期修复改用显式消息 ID + 原文摘录，增加来源的前置用户上下文与独立语义校验。用户曾确认针对性来源边修复已执行；不要把旧修复脚本再批量执行，也不要假定所有历史坏数据均已清理。

### 3.5 人物更新、指代与历史

- 新增已有人物解析、`update_person`、服务端身份绑定、修改前值与版本快照；不要因大小写变化新增另一位 Leon。
- 新增与纠正区分，人物字段 / 属性修改保留历史和原始来源；源消息不是助手推测。
- attributes-only 更新无需冗余 `fields`；兼容允许的 flat / nested 表达，冲突或非法类型仍拒绝。
- 历史回答不使用被污染的旧助手断言做身份事实；上下文可以解释指代，但不能充当一个错误引用的主要事实来源。
- 核对 citationId + primary messageId + 精确 quote；存在的 quote 并不自动证明主体或含义正确，仍需语义校验。
- 对歧义、人物绑定或语义失败提供一次反馈修复，修复候选重新绑定和独立检查；第二次失败停止。
- 无法区分 Leon / Alex 或 Mira / Niko 时应询问；明确确认可连接原事实和最新确认两条来源。
- 未来入职计划不能替换当前公司；无入职证据不等于确定未入职；取消计划只取消该计划。
- 加入 New conversation +，保存新 conversation 后切换，保留全局记忆 / Review，保护草稿和失败状态。未做历史聊天选择器。
- 用户要求减少机械规则后，移除最近位置 / 姓名出现的硬身份 veto，保留候选与原文上下文，交由模型理解、再由检查器核验。没有关闭安全校验。

### 3.6 十道题与 Memory v6 统一升级

根据用户逐步测试与完整诊断，统一改进 memory 写入和 retrieval：

- `mode:add` 保留独立旧事实，重复值去重，必要时把属性值转为去重列表；`mode:correct` 只替换 / 清空明确被纠正的事实。
- 核心字段变更需明确纠正；SQL 009 与 binder 同时防止新增把旧事实覆盖。
- `field_history` 记录 `operation:add|correct|unknown`，旧历史保留 unknown，不能把历史物理覆盖自动解释为用户撤销事实。
- 修复 Mira 面条被陶艺覆盖后，检索误说“没有饮食偏好”的推理问题。原始面条来源保留；**没有替用户在远端自动恢复结构化面条属性**。
- SQL 010 平衡结构化记录和原文消息候选预算，避免某通道挤满结果；来源前置用户窗口由 3 条扩到 8 条。
- 非空检索的 NONE 拒答也接受独立检查；RELATED 不自动叠加宽泛拒答前缀。
- 历史陈述在普通对话中也需要精确来源；旧问题不持续成为当前请求，环境闲聊不重提已批准人物事实。
- 固定十题涵盖直接检索、无记录、指代、换人、歧义澄清、未来 / 现在、纠正历史、取消、数字昵称、检索追问。见 `AGENT_EVAL_CASES.md`。
- v6 当时 108 项本地测试通过。用户后来报告十道题全部通过；没有逐题完整新版记录，不能把 v5 失败基线改写为 v6 全通过的正式评测报告。

### 3.7 Gmail 和 Google Calendar

用户明确选择的邮件行为优先于旧设计文件：**先保存真实 Gmail 草稿，批准后发送**。Calendar 是本地预览，批准后才创建。

- 实现 Web OAuth、state、PKCE、offline refresh；OAuth 回调 cookie 正确限定路径与过期清除。
- Google access / refresh token 用 AES-256-GCM 加密，绑定 owner；连接表和执行表仅服务器可用，浏览器角色不能读取。
- Gmail 使用 `gmail.compose`，Calendar 使用 `calendar.events.owned`，另有账号身份权限；本版只操作主日历。
- 对话生成规范化 email / calendar 提案，精确用户来源校验通过后保存；连接可用时自动准备 Gmail 草稿。
- 邮件 MIME 支持 UTF-8、to / cc / bcc，拒绝非法邮箱、邮件头注入、缺内容；Gmail 保存成功才写本地草稿回执。
- 日程以明确 local start / end 和 IANA time zone 转换，拒绝夏令时不存在 / 重复时刻、非法日期和缺结束时间；不默认邀请其他人。
- Review 显示邮件 / 日程可读预览，支持修改；批准要求与服务端当前 payload 完全一致，防止旧界面误批修改后的内容。
- 服务器 claim / receipt ledger、稳定 Calendar event ID、完成回执缓存、并发冻结与账号切换保护，降低重复执行风险。
- 已发送 / 创建的动作回执完成后，pending change 才是 committed；邮件仅准备为草稿时仍是 pending。
- 未知结果（网络中断、进程中断、回执未保存）阻止自动重试；没有跨 Google / SQL 事务，也没有承诺绝对 exactly-once。
- Gmail 内单独改动的草稿会在发送前被应用中批准的内容替换；Reject 保留 Google 已有草稿；Disconnect 删除应用连接，不删除外部对象，也不自动撤销 Google 账号权限。

### 3.8 配置与真实账号验收，以及最后两次修复

- 用户将 OAuth client、server secret 和加密密钥写入本机 `.env.local`；开发工具不打印密钥。
- 用户最初填入的加密 key 格式无效；在当时数据库尚无 Google 连接表的情况下，本机生成正确 32 字节随机 base64 密钥，保持其他配置。**现在已有连接，后续不得随意重新生成此 key。**
- 授权后真实验证了连接记录、令牌解密、必要 scopes；Gmail 草稿 list 和 Calendar 主日历 events list 均 HTTP 200。没有打印邮件 / 日程正文。
- 邮件测试暴露 `External proposal not found`。实际是 `service_role` 对原核心表缺权限（42501），不是缺提案。
- 新增迁移 012，以必要 select / insert / update 授权修复；浏览器权限与 RLS 不变。修正服务层错误提示。
- 本地测试此前给 service role 额外全表权限，掩盖了迁移遗漏；现在删掉这种测试授权，用实际迁移权限测试，fixture 通过 authenticated 身份创建提案。
- 用户反馈邮件流程通顺、Calendar 创建成功。实际发送 / 创建结果属于用户确认；开发工具没有替用户点击批准发送。
- Calendar 请求中模型重新生成旧邮件，被原文校验拦住，但回复仍说“两项待审”。增加修复反馈，明确删掉旧动作与对应描述；源检查或语义检查筛掉候选后，从剩余提案重建数量和摘要。
- 新增该实际序列和语义拒绝的回归测试，最新 134 项通过，TypeScript 通过。有效 Calendar 不受旧邮件拦截影响。

## 4. 距离 MVP1 还缺什么

### 必须优先补齐

1. **STT / 麦克风输入**：当前入口是文本。选 provider / model，决定录音与转写方式，实现 mic 权限、转写编辑 / 确认、失败处理，然后复用现有消息与来源管道。实时 speech-to-speech 不属于 MVP1。
2. **向量检索**：当前仅结构化 + lexical / full-text + 原文来源。选择 embedding 模型 / 维度，pgvector schema / index、写入与补录、向量相似度、与精确匹配融合、来源追溯和回归评测。模型理解候选语义不等于已做 semantic vector retrieval。
3. **正式质量评测**：按 `EVALUATION.md` 记录字段级 precision / recall / F1、approved action 成功率、来源支持与错误率，以及耗时 / 模型调用次数。十题用户反馈和 134 单元 / SQL 测试不能证明 F1≥95%、动作≥95%、grounding=100%。补充措辞变体、重复运行、两用户隔离及 Google 日期 / 收件人验收。
4. **编辑与纠错完整性**：People 当前只编辑 Name / Notes；缺核心字段 / attributes 编辑、批准误操作撤销或有来源的修复、合并 / 删除 / unlink UI。Task 有创建提案、编辑、完成 / 重开，但无 DELETE API；不要称其完整 CRUD。删除必须处理图引用和来源，不直接删历史。

### 需补实现或明确验收边界

- Observation / candidate insight / minimal manual belief 已有 schema、提案和内部 commit 类型，但没有完整知识浏览 / 关联管理和正式专项验收。先检查真实流程再判断是否需要 UI；不做自动 belief promotion 或 full decision engine。
- precise date / interaction-type 检索过滤、模型主导追加检索、持久化 clarification continuation 仍未完善；当前来源上下文窗口有限。
- 外部动作不确定状态尚无自动 reconciliation / 用户恢复入口；要能查 Google 后明确核对，不能通过重置状态盲目重发。
- OAuth refresh 正常流程已有代码，但长时间 token 过期、撤权、学校账号政策、权限不足等需真实故障验收；Disconnect 不是提供者撤权。
- Gmail / Calendar 本地结果表尚未纳入 `memory.ts` 的查询类型 allowlist。不能保证自然语言问“我刚发了什么邮件 / 刚建了什么日程”能从执行回执准确回答。
- UI 大部分为 legacy iframe / plain JavaScript；需要改善审阅状态、错误恢复、空状态、部分字段仍技术化的编辑体验，保持现有视觉。
- 旧数据误来源 / 泛属性键误覆盖可能需要有来源的修复。没有进行全面历史数据审计，不擅自恢复、合并或删除真实人物。
- 消息序号并发写入、长历史 / 证据上下文预算、语义检查调用数与延迟，需专项评估。没有自动把超限证据静默省略。

### 本轮不要扩展到这些

完整 Gmail / Calendar clone、inbox sync、附件、批量发送、recurring / all-day / meeting-link 日程、多日历管理、已创建 Google event 编辑 / 删除、自动任务排期、LinkedIn / WeChat / 小红书、native mobile、多 agent runtime、fine-tuning、自动信念升级均未做，且多项属于 MVP2 / MVP3。不要因为 Google 接通就自动扩大权限与范围。

## 5. 当前架构与代码入口

页面与浏览器代码在 `frontend/`，服务端实现在 `backend/`；仍由同一 Next.js 进程运行。**不要把 docs 或 artifacts 的副本当运行源码**。以下路径均相对项目根目录。

- `frontend/app/page.tsx`：承载 `/legacy/index.html` 的 iframe，向 UI 共享登录客户端。
- `frontend/public/legacy/src/js/personal-os.js`：聊天、来源、Review、Google 连接及预览；`api.js`：浏览器 API；People / Tasks 各自的 UI 脚本仍在同目录。
- `backend/routes/conversations/`：conversation 与消息存储；messages route：plan → retrieval → generation → person / Google binding → verification → proposals → Gmail draft preparation。
- `backend/lib/deepseek.ts`：规划、生成、格式修复、独立语义核验、最后的 review 摘要一致性修复。诊断 `evidence-v6`。
- `backend/lib/memory.ts` / `evidence.ts`：RPC、证据层级、引用与 source quote 边界。
- `backend/lib/person-memory.ts`：人物解析、增补 / 纠正、身份 / before / version 绑定。
- `backend/lib/proposal-time.ts`：内部提案日期规范化；`review.ts`：编辑与来源保护。
- `backend/routes/pending-changes/[changeId]/route.ts`：内部提交调用 `commit_pending_change`；Google 类型进入显式批准 executor。
- `backend/lib/google-api.ts`：OAuth / 加密 / provider REST / MIME / 时区规范化。
- `backend/lib/google-service.ts`：连接、refresh、草稿准备、claim / execute / receipt；`google-proposals.ts`：纯提案校验。
- `backend/routes/google/`：connect、callback、status / disconnect、draft preparation。
- `backend/routes/people/`、`backend/routes/tasks/`：认证、owner-filtered 管理。
- `database/migrations/`：唯一数据库迁移源。

内部动作：Review → RPC 一次数据库事务 → 目标表 / attrs / edges → committed。外部动作：Review → 服务端 claim → Google → 回执事务 → committed；与外部调用不具备原子事务。Gmail 提前准备草稿不等于批准发送。

## 6. 数据库迁移及部署状态

已有迁移顺序：

1. 001 `personal_os_core`：核心表与 owner / 关系 / 来源约束。
2. 002 `grant_authenticated_access`：登录用户权限，仍有 RLS。
3. 003 `commit_approved_changes`：内部原子提交。
4. 004 `fix_owned_relationship_trigger`：日历专属字段触发器修复。
5. 005 `memory_search`：首版检索。
6. 006 `memory_source_context`：来源上下文。
7. 007 `memory_content_search`：正文检索与噪声控制。
8. 008 `person_memory_updates`：人物更新 / 绑定 / 历史。
9. 009 `additive_memory`：保留独立事实与 add / correct 防覆盖。
10. 010 `balanced_memory_retrieval`：结构化 / 原文平衡与上下文窗口。
11. 011 `google_integrations`：连接、执行账本、回执及并发保护。
12. 012 `google_execution_permissions`：Google executor 所需核心表权限。

001 / 003 / 004 早期有用户执行或截图证据；006 与当时特定来源修复曾明确确认。002 / 005 / 007 / 008 / 009 / 010 的逐项 hosted 执行记录并不完整。用户十题通过也不能单独证明 009 / 010 的 SQL 防覆盖已部署。

011 的表存在、授权记录可读已经真实验证；012 后用户反馈邮件 / Calendar 成功，功能上已验收，但没有导出完整 hosted grants / schema。需要核对时做只读检查，不让用户重跑整套迁移。

重复 SQL 副本已删除：只使用 `database/migrations/` 中的 009、010、011、012 原迁移。 已部署库修改需新增迁移 013 起，不改历史文件并假装自动部署。

## 7. 配置、账号与权限注意事项

配置文件是本机 `frontend/.env.local`。其中有 Supabase public config、DeepSeek、Google OAuth、服务器密钥与 token 加密 key。交接文档不保存任何实际 secret。

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`：Google Web application OAuth client。
- `GOOGLE_REDIRECT_URI`：本次配置为 `http://localhost:3000/api/google/callback`；真实运行端口改变时 Google 控制台与 env 必须完全一致。
- `GOOGLE_TOKEN_ENCRYPTION_KEY`：32 字节随机值的 base64，用于服务器加密 Google 令牌；已连接后更换会导致需重新授权。
- `SUPABASE_SECRET_KEY`：仅服务器使用，读取提案、保存加密连接和执行回执；不用 `NEXT_PUBLIC_`。
- DeepSeek 当前配置沿用现有工程，不为了交接切换模型；需要确认仅检查非敏感 model / base URL，勿打印整个 env。

本会话默认 shell 为 PowerShell，cwd 为 docs。写 frontend 时可能需要环境提供的文件权限升级；不要把这类限制误说成用户没授权实施。网络在受限执行环境可能失败；之前 Supabase 默认网络读失败、批准后的网络执行可读，不能据此认定 key 无效。

工程根目录与 frontend 当前均未发现 `.git`，没有本次提交 / PR，也没有确认远端代码备份。不要承诺已保存到 GitHub。项目新仓库 / 备份可作为单独事项。

## 8. 验证记录与复现

- Memory v6：108 项本地通过；用户反馈固定十题通过，逐题新版证据缺失。
- Google 初版：132 项测试、类型、JS 语法与 Next 生产构建通过。
- 012 权限修复：移除测试额外授权后，132 项与类型再次通过。
- 最后旧邮件 / 两项摘要修复及目录整理：134 项与类型通过，整理后生产构建通过；没有重新调用真实模型或执行外部动作。
- Google OAuth 与读访问：开发工具真实 HTTP 200；草稿 / 发送 / event 创建：用户实际操作成功反馈。开发工具没有自动做外部发送验收。

一般回归，在 frontend 运行：

```powershell
npm test
npx tsc --noEmit --incremental false
```

真实 SQL 本地测试需 `PGLITE_MODULE`。本机现有位置：

```powershell
$env:PGLITE_MODULE='C:\Users\HUAWEI\.codex\visualizations\2026\10\10\01a12789-d1aa-70b1-90fe-616013539d23\retrieval\sql-test-runtime\node_modules\@electric-sql\pglite\dist\index.js'
npm test
```

不设置该变量会跳过 SQL 集成组；报告时不得当成全测通过。更换机器时安装 / 定位 PGlite 并更新绝对路径；不要依赖 artifacts 永远存在。必要构建运行 `npm run build`，一般开发 `npm run dev`。

## 9. 原文、诊断和其他文档

- [固定十题](testing/AGENT_EVAL_CASES.md)、[正式评测合同](core/EVALUATION.md)、[旧 v5 基线](testing/AGENT_EVAL_RUN.20261011.json)、[评测模板](testing/AGENT_EVAL_RUN.template.json)。旧失败基线保持原貌，不能因后来用户说通过就覆盖。
- [Memory v6 说明](guides/MEMORY_V6.md)、[Google 配置与验收](guides/GOOGLE_INTEGRATIONS.md)。这些文件前段描述写作当时状态，最新状态以本交接为准。
- [PRD](core/PRD.md)、[TDL](core/TDL.md)、[原实现计划](core/IMPLEMENTATION_PLAN.md)、[Schema](core/SCHEMA.md)。它们是原设计，不等于当前实现清单；原计划 Gmail “批准后仅建草稿”已经被用户新选择取代。
- assistant metadata：`memory.plan/evidence/verification`、`agent_candidate`、`generatedProposals`、`proposalIssues`、`verification.retry`。查失败先看原输入、candidate、绑定、过滤、最终 turn 和来源；截图里的泛化报错不足以推断具体 payload。
- 早期详细交接与修复证据位于 `C:/Users/HUAWEI/.codex/visualizations/2026/10/10/01a12789-d1aa-70b1-90fe-616013539d23/handoff/`；本次 archives 在 `memory-v6/` 和 `google-feature/`。

archive 中 `prepare.mjs` 等是一次性补丁脚本，多数不幂等，**不要对当前源码重跑**。`fix-google-key.mjs` 会换加密 key，也不能重跑；`verify-live-google.mjs` 只查 API、必要时 refresh token，但任何验证都不要输出 secret 或私人正文。

## 10. 下一轮推荐怎么接着做

1. 先读本文件和 AGENTS，确认用户此次目标；不要重问已确定的 Gmail 批准行为，不重复要求账号配置。
2. 如用户说“继续 MVP1”且未指定，建议先做 **STT 文本转写入口**，它是明显缺失、且能直接复用现有证据 / Review 链路的主功能。先确定 provider 和录音体验；不能把“讲话”默认为已经实现。
3. 接着实现 pgvector semantic retrieval，精确来源与 owner 隔离不放松，并与当前 lexical 做评测对比。
4. 补实体编辑 / 有来源的纠错和正式测试集；外部动作不确定状态提供安全核对 / 恢复，不做盲目 retry。
5. 完成 MVP1 验收报告后才宣称完成；不自动开始 MVP2。

用户偏好：用中文，直接动手，持续到目标完成；解释清楚结果与下一步，避免频繁重复确认。保留原视觉，UI 面向非技术用户。技能 / 环境要求若确实阻塞才解释原因。密钥放本机，真实邮件发送与日程创建仍交给用户明确 Review 批准。

2026-10-11 用户补充的长期协作偏好：这个项目同时是学习全局思维的契机。重要决策需解释目标与约束、有哪些合理候选方案、各自取舍，以及最终选择背后的逻辑。说明应简明、面向用户理解，不能只报告实施结果。此偏好已保存在项目交接中；不代表已写入账号级全局记忆。

2026-10-11 最新部署进展（用户报告）：项目已推送 GitHub 并通过 Vercel 部署；因此上文“没有确认远端代码备份”是此前状态。尚未核对仓库 URL、生产域名、Vercel 环境变量与构建配置。用户截图显示线上登录出现 Supabase 配置错误；本地源码在缺少 `NEXT_PUBLIC_SUPABASE_URL` 或 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 时返回空客户端，legacy UI 等待客户端超时后显示该错误。Google 回调地址此前为 localhost，迁移到生产需同步配置 Vercel 的 `GOOGLE_REDIRECT_URI` 与 Google OAuth 的 authorized redirect URI；未修改代码或云端配置。

### 可直接放进新 conversation 的接手提示

> 请先读 `E:/project repo/Personal Agent/docs/PROJECT_HANDOFF.md`、项目根 AGENTS.md，再检查需要改动的当前代码。项目已完成 Memory v6、基础任务 / 人物管理、Gmail 草稿后批准发送、Calendar 预览后批准创建；Google 已连接，用户验收邮件和日历成功。最新 134 项回归与类型检查通过。MVP1 仍缺 STT、向量检索、完整编辑纠错与正式质量评测。不要重跑迁移、一次性补丁脚本或重新生成加密 key；不要自动发邮件 / 建日程。根据我的下一条要求继续开发。


## 11. 文件编排与维护规则（2026-10-11 已执行）

```text
Personal Agent/
├── AGENTS.md                    开发助手自动读取的项目规则
├── frontend/                    页面、浏览器代码、Next.js 运行配置
│   ├── app/api/                 Next.js 路由适配器，转发到 backend/routes
│   ├── lib/supabase/client.ts   浏览器登录客户端
│   ├── public/legacy/           唯一实际运行的原视觉 UI
│   └── AGENTS.md                Next.js 自动维护的框架规则
├── backend/
│   ├── lib/                    服务端业务逻辑与 provider 服务
│   ├── routes/                 API 实际实现
│   ├── tests/                  自动化回归测试
│   ├── scripts/                安装辅助脚本
│   └── node_modules            指向 frontend/node_modules 的依赖链接
├── database/migrations/         唯一 SQL 源，001–012
└── docs/
    ├── README.md                文档入口与启动说明
    ├── PROJECT_HANDOFF.md       唯一当前状态与交接总览
    ├── core/                   原始五份设计文档
    ├── testing/                十题、模板、历史评测结果
    ├── guides/                 Memory 与 Google 专项指南
    └── reference/              原始需求 ORIGINAL_REQUEST.docx
```

前后端分目录，但仍是一个 Next.js 服务。`frontend/app/api` 必须留在框架路由位置，只保留方法转发与必要路由配置；不要把业务实现复制回这里。根 AGENTS 是自动加载规则文件，不是普通资料，必须保持根位置；frontend 的 AGENTS 由 Next 自动生成，不能删除后假设不会重建。

安装依赖在 frontend 执行 `npm install`，postinstall 自动创建 backend 依赖链接。`npm test` 已改为执行 backend/tests；tsconfig alias 与 Turbopack / tracing 根目录已适配跨目录导入。不要复制 node_modules 作为第二套依赖。开发服务器须重启一次以加载新配置。

新增产品目标 / schema / 工作清单更新 core；专项配置更新 guides；评测用例、模板和结果放 testing；原始附件放 reference。可执行测试放 backend/tests，SQL 放 database/migrations，不能再把迁移副本塞进 docs。每次能力或目录变更更新本交接，README 仅承担入口，不再新增相互重叠的状态文档。

### 已清理内容与恢复

- 删除旧 `personal-os/`：是参考 UI 副本，实际运行 UI 在 frontend/public/legacy。两份需求 docx 内容一致，保留 docs/reference 一份。
- 删除 frontend/assets、src、supabase 空目录（src 仅空 css/js 子目录）。
- 删除 frontend/README.md；启动、视觉来源与维护说明整合到 docs/README 和本交接，旧说明已过时。
- 删除 GOOGLE_IMPLEMENTATION_STATUS.md；阶段状态整合到本交接。
- 删除 docs 中 MEMORY_V6_UPGRADE.sql、GOOGLE_INTEGRATIONS_UPGRADE.sql、GOOGLE_PERMISSIONS_FIX.sql，保留 database/migrations 中唯一对应 SQL。
- 一次性 organize-project.ps1 已移出工程，避免误重跑；没有删除有用途的运行模块、测试、历史失败结果、框架文件、密钥或安装依赖。

移动前已保存并 SHA256 校验 99 份源码/文档快照：`C:/Users/HUAWEI/.codex/visualizations/2026/10/10/01a12789-d1aa-70b1-90fe-616013539d23/organization-backup/`，清单是 manifest.json。它是本机临时恢复点，不是 Git 或远端备份，且不含 .env.local、node_modules、.next。恢复时按清单选择具体文件，勿整体覆盖当前工程或环境配置。

整理后的验证：134 项（包含 SQL 集成）通过、TypeScript 检查通过、Next.js 生产构建通过；所有既有 API 路由仍被构建识别。依赖链接脚本在已有链接上重跑成功。未重新发送邮件、创建日程或执行远端数据库迁移。

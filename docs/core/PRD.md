# Personal OS — Product Requirements Document (PRD)

> 文档边界：产品目标与功能范围，不代表当前完成进度。用户后续明确决定优先；当前实现看 PROJECT_HANDOFF。 完整职责说明见 [文档入口](../README.md#文件边界遇到问题该听哪份)。
Version: v0.4  
Status: MVP1 working specification

## 1. Product Definition

Personal OS is a voice-first personal operating system that turns conversations into structured personal data, memory, and actions.

Core principle:

> The user should live their life and talk.  
> The system should understand, structure, remember, act, and surface only what matters.

The product must reduce the amount of life the user needs to manually manage. It should not become another dashboard, CRM, or knowledge-management system that requires constant upkeep.

## 2. Core Interaction Model

The product has two primary UI primitives:

- **Agent** — conversational control layer
- **Canvas** — contextual visual workspace

The user should not need to navigate across many permanent modules.

The Canvas should normally stay visually quiet. It changes only when the current conversation requires context such as:
- a person
- a pending review
- a task
- a calendar event
- a retrieval result
- an execution status

Design principle:

> The user should not need to find the tool. The tool should come to the user.

### 2.1 品牌哲学与用户体验原则（2026-10-13）

产品应让人减少压力，把需要记住、整理和跟进的事情交给专业的 Agent，让大脑得到释放。极致简洁与高效是产品目标：用户表达意图，系统承担复杂度，只在需要用户参与时呈现有关内容。

界面的组织单位是用户的事情，而不是系统处理阶段。“还没开始写邮件”和“邮件已准备好、等待审核发送”，对用户而言都是同一件“还没办完的事”。后台仍须区分识别、准备、审批、执行及结果，以保证可靠性；前端将这些阶段组织为同一事项的连续体验，不要求用户理解流程或跨栏目追踪。

只显示有助于表达、理解当前事项或做出必要决定的信息。账号、连接管理、历史记录和诊断信息按需打开；不以常驻状态标签、品牌说明和空模块填满页面。必要的确认应在相关事项中自然完成，既减少打断，也保留明确审批和真实结果反馈。

### 2.2 全屏 Canvas 与按需出现的工作界面

- 整个页面背景就是 Canvas，不再将 Canvas 做成页面右侧的独立卡片。沿用旧版 Network 的渐变、玻璃质感和浮动视觉语言。
- 没有进行中的沟通、未完成事项或主动打开的内容时，页面只呈现背景与底部轻量 Agent 沟通线；不显示欢迎标题、说明文字、Session active、登录邮箱或 Google 连接/退出按钮。账户与连接能力保留在按需入口。
- 底部沟通线是文字和语音入口，不能继续使用永久占据大面积的输入卡片。具体形状、动效和布局在设计阶段确定。
- 开始沟通后，当前对话记录可直接出现在 Canvas 上，帮助现阶段检查 Agent 的理解，不需要永久聊天面板。长期在可靠性充分验证后可默认不显示记录，但原始来源仍须保存并可追溯。
- 实际处理邮件、日程等事情时，相关工作界面才出现，并呈现真实内容和进度。需要编辑、补充信息或审批时，在该事项内完成。
- 确认办结后，相关工作界面退场；等待用户决定、失败或结果不确定的事项仍属于未完成事项，不得因隐藏界面而被视为成功。历史结果可按需查看，未完成事项不能因关闭视图而丢失。

### 2.3 未完成事项与持续语音场景

核心场景：用户在路上用 2–5 分钟讲述刚刚发生的交流，在叙述中顺带说“哦，对了，等会给他写封关于……的邮件”，然后继续讲述。

Agent 应接住这个意图，让用户不必继续记着这件事，也不必立即中断叙述、转入邮件编辑。界面提供一个轻量的未完成事项区域；事项从识别后到办结前保持连续身份，不因后台阶段变化变成不同的卡片或分散到不同栏目。任务识别不代表立即执行，更不代表获准发送邮件。

识别中的候选意图应允许用户纠正或取消；表达不完整时，不把猜测展示为确定任务。不要求每个技术步骤都向用户索取决定，只在缺少关键意图或需要明确审批时邀请用户参与。

**MVP1 边界：** 先完成全屏 Canvas、轻量沟通入口、临时对话记录、统一未完成事项及按需任务工作界面的基本闭环。现有录完转写、编辑后发送可作为第一版入口，事项可在已提交内容处理后出现；MVP1 不以边说边识别、实时转录或连续语音通话作为新增硬性门槛。

**长期方向：** 在持续语音中及时呈现已识别但未落地的事项；可探索事项从沟通线掉出形成球等动效，具体形式尚未确定。探索 Gmail 原生工作体验在 Canvas 内逐步操作，以及减少默认对话记录。这些方向不代表 MVP1 已实现，也不要求 MVP1 复刻 Gmail。

## 3. Project Structure and Legacy Reference

This is a **new Personal Agent project**.

The old Network Project repository:

`https://github.com/RyanZhou123232/network-project`

is a **read-only visual and interaction reference**.

The new project must not inherit the old backend architecture.

### Visual Elements to Migrate from the Legacy Project

- landing page
- loading sequence
- existing visual identity
- gradient background
- glass / blur language
- rounded floating UI
- floating visual language (pending-item bubble animation is optional; do not restore legacy social bubbles)
- animation style

### Existing Infrastructure to Reuse

- existing Supabase project
- existing Supabase Auth
- existing user accounts

### Rebuild in the New Project

- authenticated home/workspace
- Agent interaction layer
- Canvas
- Personal OS schema
- application backend/server layer
- agent orchestration
- memory pipeline
- task logic
- Gmail integration
- Google Calendar integration
- retrieval system

### Do Not Depend On

The new system should not depend on old social-network-specific logic such as:
- friend requests
- legacy social connection mechanics
- moments
- referrals
- old interaction scoring

The old repository should not be copied wholesale into the new project. It should be inspected and selectively migrated only for frontend visual/interaction reference.

## 4. Frontend Architecture

The existing frontend design should be **migrated**, not visually reinvented.

Target frontend:
- Next.js
- React
- TypeScript

The authenticated workspace should be redesigned around Agent + Canvas.

## 5. MVP Roadmap

### MVP1 — Core System Works

Primary goal:

> Prove that conversations can reliably become structured personal data and useful actions.

#### Frontend
- migrate landing page
- migrate loading flow
- preserve current visual language
- build new desktop-first Agent + Canvas workspace
- meet the low-pressure, full-screen Canvas and unfinished-item criteria in sections 2 and 16
- mobile-specific UX is deferred

#### Conversation
- text input
- speech-to-text input
- conversation sessions
- message-level source storage
- optional derived transcript view

#### Agent
- single orchestrator agent
- tool-based execution
- moderately proactive clarification
- may ask follow-up questions when ambiguity matters
- should not behave like an aggressive coach

#### Network / People
- identify existing people
- create people
- update people
- progressive schema
- flexible attributes
- interaction history
- edit / merge / delete / correct support

#### Coffee Chat Flow
- user reviews a coffee chat verbally
- system extracts:
  - people
  - interaction details
  - observations
  - tasks
  - candidate insights
  - other structured information
- system stages changes
- user reviews
- approved changes commit

#### Tasks
- detect task intent
- create task after review
- task system exists
- automatic calendar scheduling deferred

#### Gmail
Flow:
Conversation → detect draft intent → prepare a real unsent Gmail draft → explicit Review approval → send via Gmail API

Draft preparation and awaiting approval belong to one unfinished user item. Preparing a draft is not permission to send it. Provider receipts and uncertain-outcome protection remain required.

MVP1 does **not** require Gmail UI recreation in Canvas.

#### Google Calendar
Flow:
Conversation → extraction → review → approval → Google Calendar API creates event

MVP1 does **not** require a Google Calendar clone.

#### Knowledge Layer
- fully support observations/facts
- support candidate insights with review
- beliefs exist only as a minimal/manual layer in MVP1
- no automatic belief promotion rule is required in MVP1
- all derived knowledge must remain traceable to source

#### Retrieval
Use evidence-aware hybrid retrieval:

1. structured filtering
2. keyword / lexical search
3. semantic vector search
4. evidence fusion / ranking
5. source retrieval
6. grounded answer generation

Evidence tiers:
- EXACT
- RELATED
- NONE

### MVP2 — Reliability and Integration
- database refinement
- bug fixes
- stronger memory refinement
- richer Gmail interaction experiments
- richer Calendar interaction experiments
- task ↔ calendar scheduling
- stronger Canvas behavior
- UI polish
- better synchronization

### MVP3 — Expansion and Interaction Quality
- Xiaohongshu drafts
- LinkedIn drafts
- WeChat Moments drafts
- Content Mode
- proactive content interviewing
- deeper personalization
- deeper decision support
- knowledge visualization
- mobile-specific experience

## 6. Agent Initiative

MVP1 agent may proactively:
- disambiguate people
- ask for missing information
- suggest creating an obvious task
- suggest drafting an obvious email
- suggest creating an obvious calendar event

Future versions may add an initiative control:
Quiet ←→ Pushy

## 7. Conversation / Mode Model

Use one persistent agent.

Modes are temporary objectives, not separate agents.

Examples for future:
- normal
- content
- planning
- reflection

Memory capture continues regardless of mode.

## 8. Canonical Write Workflow

Conversation  
→ Extraction  
→ Pending Review  
→ User Review  
→ Commit  
→ Structured Data / Actions

Review should support:
- approve
- edit
- reject
- commit

## 9. Long-Term Cognition Model

Raw Source  
→ Observation / Fact  
→ Insight  
→ Belief  
→ Decision

### Observation / Fact
Concrete evidence.

Example:
> Kevin said he is raising a seed round.

### Insight
Derived interpretation.

Example:
> Early-stage hardware founders often struggle more with distribution than product.

### Belief
Long-term worldview formed from repeated insights or explicit confirmation.

For MVP1:
- belief creation should be minimal
- explicit confirmation is preferred
- no automatic promotion threshold is required

### Decision
Future layer linking:
- question
- context
- beliefs
- decision
- later outcome

## 10. Progressive Schema

Use:
- stable core fields
- flexible attributes
- graph relationships

Do not hard-code every future property.

Flexible attributes may exist on any supported entity type.

## 11. Interaction vs Event

### Interaction
Human-to-human activity:
- coffee chat
- meeting
- call
- intro
- message

### Event
Broader real-world event:
- conference
- internship
- launch
- presentation
- trip

## 12. Task vs Calendar

### Task
What needs to be done.

### Calendar Event
When something is happening.

A task may later be scheduled into a calendar event.

## 13. Retrieval and Grounding

Use evidence-aware hybrid retrieval.

Search order:

1. **Structured Search**
   - person
   - date
   - entity type
   - interaction type
   - explicit metadata filters

2. **Keyword / Lexical Search**
   - exact terms
   - names
   - acronyms
   - phrases
   - identifiers

3. **Semantic Vector Search**
   - semantically related records even when wording differs

4. **Evidence Fusion / Ranking**
   - combine structured, lexical, and semantic evidence
   - direct exact evidence should outrank merely semantic similarity

5. **Retrieve Source Evidence**

6. **Generate Grounded Answer**

Evidence tiers:

### EXACT
Direct supporting evidence exists.

### RELATED
No exact evidence exists, but semantically related evidence exists.

The Agent must explicitly say exact evidence was not found.

### NONE
No relevant evidence exists.

The system must not turn RELATED into EXACT.

## 14. Source of Truth

Message-level raw source evidence is authoritative.

Derived transcript views, summaries, insights, beliefs, and structured records must remain traceable to source evidence.

If derived content conflicts with source evidence, source evidence wins.

## 15. Editability

All AI-generated structured data must be editable.

User must be able to:
- edit
- merge
- delete
- unlink
- reject
- correct

## 16. MVP1 Success Criteria

### Structured Extraction Accuracy
Target: **≥95%**

Measured using the Evaluation Specification in `EVALUATION.md`.

### Action Execution Accuracy
Target: **≥95%**

Applies to:
- person create/update
- task creation
- Gmail draft creation
- Calendar event creation

Measured using the Evaluation Specification in `EVALUATION.md`.

### Personal Memory Grounding
Target: **100%**

Every factual claim about stored personal history must be backed by retrieved evidence.

### Unsupported Personal-History Claims
Target: **0**

### Provenance
Every derived observation / insight must be traceable to source conversation, message, interaction, or event.

### 低压力、简洁且高效的 Agent + Canvas 体验

这是 MVP1 的必需成功指标，与准确率、来源和执行可靠性一起验收；不能只因后端测试通过就宣称 MVP1 完成。

以下场景须全部通过，验收方法见 `EVALUATION.md` 第 16 节：

- **安静入口：** 无未完成事项的工作区只显示背景和底部沟通入口，没有常驻标题、账号信息、连接按钮、People/Context/Review 面板或空工作卡片。
- **表达不中断：** 支持 2–5 分钟录音、转写后编辑确认；用户夹带一个稍后动作时，不被强制切换到任务表单。第一版允许提交后识别。
- **事项连续：** 已识别的未完成事项集中可见；邮件从准备到等待审批保持同一事项，不要求跨栏目寻找，不把草稿已准备视为用户事情已办完。
- **按需操作：** 邮件、日程等工作界面与真实事项关联，只在相关时出现；关键编辑和审批可在事项内完成，用户无需理解技术状态名。
- **真实结束：** 已确认办结的工作界面退场；等待决定、执行失败或结果不确定时仍可找到该事项，不以动画或界面消失冒充成功。未完成事项重新进入后仍可找回。
- **调试可查但不占据首页：** 现阶段可查看对话记录、来源及后端诊断；账户与连接管理可按需打开，不长期占据主画布。

## 17. MVP1 Non-Goals

MVP1 does not require:
- LinkedIn API
- Instagram API
- WeChat API
- Xiaohongshu API
- content publishing
- full Content Mode
- full Gmail recreation
- full Google Calendar recreation
- native mobile app
- autonomous task scheduling
- multi-agent system
- automatic belief promotion
- full decision engine


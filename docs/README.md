# Personal Agent 文档入口

继续开发先读 [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md)，然后读项目根目录 `AGENTS.md`。交接文件记录当前能力、已验证结果、MVP1 缺口和目录维护规则。

- `core/`：最初五份核心设计——[PRD](core/PRD.md)、[TDL](core/TDL.md)、[SCHEMA](core/SCHEMA.md)、[IMPLEMENTATION_PLAN](core/IMPLEMENTATION_PLAN.md)、[EVALUATION](core/EVALUATION.md)。设计目标与当前完成情况不同，最新状态以交接文件为准。
- `testing/`：[固定十题](testing/AGENT_EVAL_CASES.md)、评测模板与历史运行结果。历史失败结果保留，不覆盖成后来的通过记录。
- `guides/`：[Memory v6](guides/MEMORY_V6.md)、[Google 集成配置](guides/GOOGLE_INTEGRATIONS.md)。新增专项指南放这里。
- `reference/`：原始需求附件 `ORIGINAL_REQUEST.docx`，只保留一份。

- [本地语音转写配置与验收](guides/STT.md)：百炼录完转写、编辑确认后发送；当前本地实现与验收边界。

## 文件边界：遇到问题该听哪份

用户最新明确要求优先于项目文档。文档按职责判断，不把所有文件排成一个通用优先级：

- **PRD**：产品目标、功能范围和非目标；回答“要做什么”。不作为当前完成进度。
- **TDL**：任务拆分与勾选状态；回答“有哪些任务”。已完成能力与验证细节以 HANDOFF 为准；发现勾选与实际不符时核对代码和证据后更新。
- **SCHEMA**：数据模型设计；回答“表和关系怎么设计”。实际建库定义以 `database/migrations/` 为准，托管库是否部署还需核对，不能仅凭文档推定。
- **IMPLEMENTATION_PLAN**：最初实施顺序与方案；供规划参考。不能覆盖用户后续决定或当前架构，也不能证明功能已经完成。
- **EVALUATION**：质量指标与验收方法；回答“怎样算通过”。测试代码、运行记录和用户反馈提供证据，不能自行降低验收标准。
- **PROJECT_HANDOFF**：当前实现、已验证结果、已知缺口、后续接手事项与目录规则；回答“现在做到哪里”。它记录状态，不自行扩大产品范围；状态有疑点时核对实际代码与运行证据。
- **根 AGENTS.md**：开发助手自动读取的工作规则、目录约定与数据保护要求；约束“怎样开发”，不另行定义产品需求。`frontend/AGENTS.md` 只补充框架规则。
- **README**：文档导航、启动入口和本节职责说明；不重复维护功能进度或产品需求。
- **guides/**：专项配置与操作方法；不独立维护项目总进度。**testing/**：用例、模板及历史证据；旧失败记录不会因后续通过而改写。**reference/**：原始附件，仅供追溯，用户后续决定优先。

冲突处理：先确认问题属于范围、状态、数据、验收还是开发方式，再采用对应职责文件；当前代码或运行结果是核对状态的证据，不能反过来把实现缺口解释为需求取消。发现冲突时更新相应文件和 HANDOFF 中的变更记录，避免新增第二份总览。

例如：最初计划“批准后创建邮件草稿”，用户后来要求“先保存 Gmail 草稿、批准后发送”，执行后者；HANDOFF 记录这一决定和实现状态，旧计划仅保留历史参考价值。

日常查阅主要使用 PRD、TDL 和 HANDOFF；新助手接手先读 HANDOFF、根 AGENTS，再按任务读取相应设计或指南。

## 运行与维护

在项目的 `frontend/` 中执行 `npm install`，再执行 `npm run dev`；浏览器打开 `http://localhost:3000`。现有本机配置在 `frontend/.env.local`，不要覆盖或输出密钥。新环境使用 `.env.example` 配置；Google 设置见专项指南。

`frontend/` 放页面、浏览器代码和 Next.js 路由适配器；`backend/` 放服务端逻辑、实际 API 实现和自动化测试；两者由同一个 Next.js 服务运行，不需要第二个后端进程。安装脚本自动把 `backend/node_modules` 链接到前端依赖目录。

数据库唯一迁移源是 `../database/migrations/`，按文件名顺序部署。已有托管库先核对已执行版本，不重复执行历史迁移；修改新增下一编号迁移。

在 `frontend/` 执行 `npm test`、`npm run typecheck`、`npm run build`。SQL 集成测试还需要设置 `PGLITE_MODULE`，具体路径与跳过规则见交接文件。

原视觉参考来自 Network Project；实际页面在 `frontend/public/legacy/`，Next 页面通过 iframe 承载。不要新建另一套 UI 副本。

# 请求计划分离验证：2026-10-11

用户失败诊断：完整邮件草稿请求被计划为 lookup，并附加 pending task filter。检索结果非空；最终 tier NONE。旧 lookup 分支禁止提案，Review 0。原始附件不复制到仓库，避免增加个人历史副本。

修复：独立的 needs_memory / allow_proposals，不再用检索分类禁用新动作。保留原文来源、独立语义检查、owner 隔离、Review 和 provider receipt。没有数据库迁移或界面重设计。

本机验证：142 项全部通过，包含 PGlite SQL 集成，0 跳过；npm run typecheck 与 npm run build 通过。新增 8 项涵盖两种权限的四种组合、字段错误拒绝、无需检索的新动作、邮件生成与校验、混合请求、纯历史只读、收件人澄清和普通建议。

真实模型验证：通过当前本机 DeepSeek 配置运行，model 使用现有配置或 deepseek-flash 默认值；没有切换模型。输入均为虚构内容，邮箱 test@example.com。四个请求分别得到：

- 新邮件：needsMemory=false，allowProposals=true，taskStatus=null。
- 历史邮件查询：needsMemory=true，allowProposals=false，taskStatus=null。
- 查询 Alex 记录并写新邮件：needsMemory=true，allowProposals=true，taskStatus=null。
- 缺收件人的新邮件请求：needsMemory=false，allowProposals=true，taskStatus=null。

新邮件另经真实生成与独立检查，保留 1 条 draft_email 提案，recipient/subject/body 匹配测试输入，replySupported=true。缺收件人澄清和混合提案保留行为由回归测试验证；这次真实模型对这两类仅验证分类，不声称真实生成流程已全面验收。

没有 Gmail 写入、发送、Calendar 写入或 hosted 数据库写入。未独立验证线上部署。单次真实分类测试不是正式 MVP1 质量评测，也不能证明模型永不误分类。旧 evidence-v5 评测结果保持不变。

# Personal OS — Evaluation Specification

> 文档边界：质量指标与验收方法；运行结果是证据，当前进度看 PROJECT_HANDOFF，不以少量测试替代正式验收。 完整职责说明见 [文档入口](../README.md#文件边界遇到问题该听哪份)。
Version: v0.2  
Scope: MVP1

## 1. Purpose

This document defines how MVP1 quality metrics are measured.

It exists to prevent vague claims such as "95% accurate" without a repeatable test method.

## 2. Evaluation Set

Maintain a versioned test set containing representative scenarios.

Minimum categories:
- simple coffee chat
- multiple people in one interaction
- ambiguous person identity
- incomplete dates/times
- task creation
- Gmail draft request
- Calendar event request
- factual memory lookup
- lexical/exact lookup
- semantic/related lookup
- no-evidence lookup
- contradictory evidence
- correction after review

Each test case should contain:
- input conversation/transcript
- expected entities
- expected fields
- expected proposed actions
- expected evidence links
- expected retrieval classification where applicable

## 3. Structured Extraction Accuracy

Primary measurement should be field-level.

For each test case, compare expected structured fields against extracted fields.

Track:

### Precision
Of all structured facts/actions the system extracted, how many were correct?

### Recall
Of all structured facts/actions that should have been extracted, how many were found?

### F1
Use F1 as the main combined extraction score unless a feature requires a different metric.

MVP1 target:
- overall extraction F1 ≥ 0.95 on the agreed evaluation set

Also report per-category scores for:
- person identity
- person attributes
- interaction fields
- event fields
- task fields
- observations
- candidate insights

## 4. Action Execution Accuracy

Measure each attempted approved action as one execution case.

Examples:
- create/update person
- create task
- create Gmail draft
- create Calendar event

An execution is successful only if:
- the correct external/internal object is created or updated
- required fields match user intent
- no unintended side effect occurs

Metric:

`successful executions / total approved execution attempts`

Target:
- ≥95%

## 5. Gmail Evaluation

Check:
- recipient
- CC/BCC if applicable
- subject
- body content
- draft created in correct account
- no accidental send

A Gmail action is considered successful only when the draft exists in Gmail with the intended core fields.

## 6. Calendar Evaluation

Check:
- title
- date
- start time
- end time / duration
- timezone
- correct calendar
- no duplicate unintended event

A Calendar action is successful only when the event exists in Google Calendar with intended core fields.

## 7. Retrieval Evaluation

Each retrieval test must have an expected evidence tier:

- EXACT
- RELATED
- NONE

### EXACT
Direct supporting evidence exists.

Pass conditions:
- system returns EXACT
- answer is supported by stored evidence
- source IDs resolve to supporting records

### RELATED
No exact evidence exists, but related evidence exists.

Pass conditions:
- system does not claim exact evidence exists
- system explicitly communicates that exact evidence was not found
- surfaced related evidence is actually semantically relevant

### NONE
No relevant evidence exists.

Pass conditions:
- system does not fabricate an answer
- system clearly indicates no relevant record was found

## 8. Grounding Metric

For every factual statement about personal history, verify there is supporting stored evidence.

Target:
- grounded personal-history factual claims = 100%
- unsupported personal-history factual claims = 0

## 9. Contradictory Evidence

When stored evidence conflicts:
- system must not silently choose one side as certain
- system should surface uncertainty or conflict
- direct source records should be inspectable

## 10. Review / Commit Evaluation

Test that:
- rejected changes do not commit
- edited changes commit edited values
- approved changes commit once
- repeated submission does not duplicate records
- failed actions expose an error state
- provenance survives commit

## 11. RLS / Ownership Evaluation

Test with at least two users.

Verify:
- user A cannot read user B's private Personal OS rows
- user A cannot update/delete user B's rows
- polymorphic links cannot cross owners

## 12. Reporting

For each evaluation run, record:
- code version / commit
- model/provider/version
- prompt version
- test-set version
- per-category extraction scores
- action execution success rate
- retrieval tier accuracy
- grounding failures
- known regressions

Do not claim MVP1 quality targets are achieved without a recorded evaluation run.

## 13. Continuous Person Memory

Offline coverage for migration 008 and the conversational update pipeline:

- Exact existing-name reuse selects the owned person ID; same-name ambiguity withholds proposals.
- New names can create people; missing explicit update targets cannot silently create people.
- Repeated facts produce no redundant person update. Additive notes retain earlier facts; corrections replace only proposed fields.
- Review edits preserve identity, version and provenance while allowing human field corrections.
- Cross-conversation updates preserve the person's ID, original sources and field history.
- Repeated approval commits once; stale updates and malformed source quotes fail without overwriting facts.
- Attribute updates retain historical values without creating another current attribute row.
- Commit failures roll back both entity writes and history. Named interactions require a valid person link.
- A second owner's queries and anonymous RPC calls cannot expose private people or revision history.

Live acceptance after the hosted migration is confirmed: use a fictional test person, save an initial company, approve a correction in a later conversation, and ask both current and historical company questions. Verify one person record, separate old/current values and the correct original source for each answer. Also test ambiguous pronouns with two possible people. Offline tests do not establish model accuracy on these live cases.

## 14. Harness Simplification Evaluation

Evidence v5 removes application-side name/leading-pronoun candidate filtering and nearest-turn-only attribution rules. Generation and examination receive all context returned with each source, plus up to eight recent user turns for lookup follow-ups. Recent turns help interpret the question; historical claims still require retrieved original-message citations. Owner isolation, exact source validation, approved writes, bounded retries and semantic examination remain in place. The SQL retrieval limit and source-context window have not changed.

Offline comparison with the previous filter reproduces loss of candidates for nonadjacent antecedents, pronouns inside a sentence, and an intervening Chinese aside. The new pipeline preserves these candidates and context; both versions reject fabricated message IDs and quotes. Mocked semantic verdicts verify routing and guard behavior, not actual model attribution accuracy. Removing a positional veto means an incorrect semantic approval may now pass when its quoted source exists; measure this explicitly rather than claiming that structural checks prove meaning.

For a paired live evaluation, hold provider/model, fictional saved data and questions constant. Compare previous and simplified behavior on direct names, nonadjacent pronouns, explicit subject switches, ambiguous two-person references, numeric nicknames, corrected company history, and cross-conversation follow-up questions. Include negative cases where an unrelated person's source is attached to a record. Record correct answers/updates, wrong-person claims/updates, unsupported claims, unnecessary clarification, evidence-backed refusal, requests per turn and latency. Do not count refusal as success simply because it avoids a false claim.

Retain the simplified candidate path only if grounded answer coverage improves without increasing wrong-person or unsupported outputs. Evaluate semantic-check removal or advisory operation separately before changing production behavior. Model-directed additional retrieval and tracked clarification continuation are future work; v5 does not implement them.

## 15. Memory v6 Acceptance

See `MEMORY_V6.md` for the unified addition/correction semantics, balanced retrieval, source validation and upgrade steps. Local verification on 2026-10-11 passed 108 checks including database integration, and TypeScript. No real-model v6 run has been performed; these results establish implementation behavior, not a ten-question model pass rate.

The full T10 diagnostic confirms a physical `attributes.likes` overwrite and an examiner incorrectly interpreting that overwrite as factual revocation. Preserve this failure in the v5 baseline. In v6, test both independent facts coexisting and explicit corrections superseding the same fact; test alternate wording and unrelated attribute keys as well as the original examples. Addition safety must be enforced at commit, not solely in prompts.

After 009/010 are confirmed applied, run all ten cases with isolated fictional data and fixed model settings. Measure adequate grounded answers, wrong attribution, duplicate proposals, unnecessary recap, unsupported negative assertions and false refusals. Check that generated, bound, withheld, reviewed and committed states are distinguished. A pending proposal or an accepted mock verdict is not proof of a correct stored fact.

## 16. Agent + Canvas Experience Acceptance

产品原则与范围以 [PRD 第 2 节及第 16 节](PRD.md) 为准。本节定义 MVP1 体验验收方法，不代表已通过。

在桌面浏览器执行以下场景，分别记录实际行为、通过/失败、截图或录屏及用户反馈；全部通过才满足该体验指标。不要用视觉截图代替真实交互和后端结果核对。

1. 用无未完成事项的账号进入工作区：只呈现背景和底部 Agent 沟通入口，无常驻标题、邮箱、连接按钮、固定功能面板或空卡片；按需入口仍可打开账户与连接管理。
2. 录制一段 2–5 分钟、中英混合的交流复述，中间夹带“等会给他写封邮件”的意图，然后继续叙述：录音不中断、不强制打开表单；转写可编辑后提交；处理后能在未完成事项中找到该动作。此项不要求实时识别或实时转录，识别质量另按提取指标评估。
3. 跟随同一封邮件从准备到待审批：事项保持连续，不需要在多个栏目之间寻找；草稿能编辑，明确批准前不发送，批准后的结果与真实 provider 回执一致。等待审批仍计为未完成。
4. 执行一个日程请求：相关工作界面按需出现，可补充信息并审批；未批准不创建，实际创建结果符合第 6 节标准。
5. 分别验证等待用户决定、明确执行失败、结果不确定及已确认成功：前三种仍可找回和处理该事项，结果不确定时不引导盲目重试；仅确认办结后相关工作界面退场。重新进入工作区，未完成事项仍可找回。
6. 在沟通时查看对话记录，并按需打开来源及后端诊断：能检查 Agent 理解和真实状态；结束查看后可恢复安静画布，关闭视图不会删除事项或来源。

真实邮件发送与日程创建仍需用户明确审批；失败/不确定场景可使用受控测试，不能为体验验收盲目执行外部动作。本轮仅新增验收合同，尚无体验验收结果；长期动效、边说边识别和原生 Gmail 接入不计入本节通过门槛。

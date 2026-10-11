# Personal OS — Technical Decision Log (TDL)

> 文档边界：任务拆分与勾选状态；完成细节和验证证据以 PROJECT_HANDOFF 为准，差异需核对实际实现。 完整职责说明见 [文档入口](../README.md#文件边界遇到问题该听哪份)。
Version: v0.3

Legend:
- **DECIDED** — locked for MVP1
- **P1 TBD** — decide during MVP1
- **P2 DEFERRED** — not required for MVP1
- **IMPLEMENTATION-CRITICAL TBD** — must be resolved before affected feature ships

## TDL-001 — Project / Legacy Strategy
**Status: DECIDED**

This is a new Personal Agent project.

The old repository:

`https://github.com/RyanZhou123232/network-project`

is a read-only visual and interaction reference.

Decision:
- migrate landing page, loading flow, and visual identity from the old repo
- do not reuse the old backend architecture
- do not make the new project depend on legacy social-network tables
- keep the same Supabase project/Auth/users where practical
- do not copy the old repository wholesale into the new project

## TDL-002 — Frontend Framework
**Status: DECIDED**

- Next.js
- React
- TypeScript

Goal: visual migration, not visual reinvention.

## TDL-003 — Supabase
**Status: DECIDED**

Use Supabase for:
- PostgreSQL
- Auth
- RLS
- pgvector
- optional Storage later

## TDL-004 — User Model
**Status: DECIDED**

- MVP1 has one active user
- architecture remains multi-user safe
- private tables use `owner_id`
- RLS isolates users

## TDL-005 — Agent Architecture
**Status: DECIDED**

Use one orchestrator agent + tools.

No multi-agent system in MVP1.

## TDL-006 — Voice Architecture
**Status: DECIDED**

Use speech-to-text for MVP1.

Full realtime speech-to-speech is deferred.

## TDL-007 — STT Provider / Model
**Status: P1 TBD**

Need to choose:
- provider/model
- streaming vs chunked
- transcript confidence behavior
- interruption handling
- mic capture implementation

## TDL-008 — Write Pipeline
**Status: DECIDED**

Conversation → Extraction → Pending Review → Review → Commit

## TDL-009 — Gmail MVP1
**Status: DECIDED**

Updated by explicit user choice on 2026-10-11: Conversation → content generation → Gmail API saves an unsent draft → explicit Review approval → Gmail API sends the reviewed contents.

Preparing an unsent draft does not approve sending. Missing recipient details require clarification. Google account setup and live provider acceptance remain required; see [Google integrations setup](../guides/GOOGLE_INTEGRATIONS.md).

No Gmail-like Canvas editor required.

## TDL-010 — Rich Gmail Experience
**Status: P2 DEFERRED**

Later evaluate:
- contextual email preview
- limited custom composer
- deeper Gmail sync
- external handoff

## TDL-011 — Google Calendar MVP1
**Status: DECIDED**

Conversation → extraction → review → commit → Google Calendar API creates event.

## TDL-012 — Rich Calendar Experience
**Status: P2 DEFERRED**

Later evaluate:
- contextual schedule UI
- partial calendar UI
- full calendar-like UI
- handoff/deep-link approach

## TDL-013 — Retrieval Architecture
**Status: DECIDED**

Use evidence-aware hybrid retrieval:

1. structured filtering
2. keyword / lexical search
3. pgvector semantic search
4. evidence fusion / ranking
5. source evidence retrieval
6. grounded answer

Evidence tiers:
- EXACT
- RELATED
- NONE

Exact lexical/source evidence should outrank merely semantic similarity.

## TDL-014 — Keyword Search
**Status: DECIDED**

Use PostgreSQL-native keyword/full-text search for MVP1.

Do not add a separate search service unless evidence shows Postgres is insufficient.

Exact lexical matches should be preserved and weighted strongly for:
- names
- acronyms
- explicit phrases
- identifiers

## TDL-015 — Vector Infrastructure
**Status: DECIDED**

Use Supabase/Postgres pgvector.

No external vector DB in MVP1.

## TDL-016 — Embedding Model
**Status: P1 TBD**

Choose based on:
- retrieval quality
- cost
- latency
- storage size
- provider lock-in

## TDL-017 — Grounding Rule
**Status: DECIDED**

Retrieve first, answer second.

No retrieved evidence = no factual claim about personal history.

## TDL-018 — Progressive Schema
**Status: DECIDED**

Use:
- core fields
- generic flexible attributes
- graph relationships

## TDL-019 — Flexible Attribute Storage
**Status: DECIDED**

Use generic `entity_attributes` table with:
- entity type
- entity id
- key
- JSONB value
- provenance
- confidence

## TDL-020 — Knowledge Graph Storage
**Status: DECIDED**

Use relational `entity_edges` in Postgres.

No Neo4j in MVP1.

## TDL-021 — Polymorphic Reference Integrity
**Status: DECIDED**

`entity_attributes` and `entity_edges` use polymorphic references such as:

- `entity_type`
- `entity_id`

These cannot be protected by a normal single-table foreign key.

Decision:
- database trigger validation against an explicit allowlist of supported entity tables
- owner equality is checked on every polymorphic reference
- deletion is blocked while graph or flexible-attribute references remain
- direct conversation/task references are checked by database triggers where ownership matters

Requirements:
- prevent or detect orphan references
- prevent cross-owner references
- preserve safe deletion behavior
- make validation testable

## TDL-022 — Memory Model
**Status: DECIDED**

Raw Source → Observation → Insight → Belief → Decision

## TDL-023 — Belief Logic
**Status: DECIDED for MVP1 scope / P1 TBD for automation**

For MVP1:
- beliefs are minimal/manual
- explicit user confirmation is preferred
- no automatic belief-promotion threshold is required

Future automation remains TBD.

Possible future inputs:
- repeated theme
- repeated user agreement
- time span
- supporting observations
- explicit user statement
- contradictory evidence

## TDL-024 — Decision Layer
**Status: P2 DEFERRED**

Schema can exist. Full workflow not required.

## TDL-025 — Canvas State Architecture
**Status: P1 TBD**

Need to decide state management for:
- active conversation
- active Canvas view
- pending review
- tool state
- active person
- errors

Potential options:
- React Context
- Zustand
- server state + local state

## TDL-026 — Backend Runtime
**Status: P1 TBD**

Likely start inside Next.js using Route Handlers/server logic.

Avoid unnecessary standalone Express backend unless later needed.

## TDL-027 — Background Jobs
**Status: P1 TBD**

Potential uses:
- embeddings
- retry logic
- delayed processing
- future proactive behavior
- consistency checks for polymorphic references

## TDL-028 — OAuth Token Storage
**Status: IMPLEMENTATION-CRITICAL TBD**

Must finalize secure token storage for Gmail / Calendar.

Requirements:
- encrypted at rest
- refresh-token support
- revocation support
- never exposed to browser
- multi-user safe

## TDL-029 — Model Provider Abstraction
**Status: P1 TBD**

Keep personal data provider-independent.

Do not over-engineer abstraction in MVP1.

## TDL-030 — Personal Data Portability
**Status: DECIDED as requirement**

Future export should support some combination of:
- JSON
- Markdown
- CSV
- database export

Raw source data must remain exportable.

## TDL-031 — Realtime Canvas Updates
**Status: P1 TBD**

Possible:
- optimistic local state
- Supabase Realtime
- polling
- server push
- hybrid

Prioritize correctness first.

## TDL-032 — Transcript Representation
**Status: DECIDED**

`messages` are the canonical conversational source of truth.

Any conversation-level `raw_transcript` field is only a derived/cache representation.

If transcript cache and messages disagree, messages win.

The implementation may omit persisted `raw_transcript` entirely in MVP1 if deriving it from messages is simpler.

## TDL-033 — Gmail Draft Persistence Semantics
**Status: DECIDED**

Before Gmail API success:
- proposed email content lives in `pending_changes`

After Gmail API success:
- create/update `email_drafts`
- persist `gmail_draft_id`

Therefore `email_drafts` represents a successfully created external Gmail draft, not merely an internal proposal.

Failed Gmail creation remains represented by the pending/action execution state and error log.

## TDL-034 — Calendar Persistence Semantics
**Status: DECIDED**

`calendar_events` represents successfully created Google Calendar events.

Before external creation:
- proposal remains in `pending_changes`

After successful Google API response:
- persist `google_event_id` and event record

## TDL-035 — Evaluation
**Status: DECIDED**

Use `EVALUATION.md` as the measurement contract for:
- extraction accuracy
- action execution accuracy
- retrieval grounding
- unsupported-claim rate

## TDL-036 — Mobile Architecture
**Status: P2 DEFERRED**

Desktop smoothness first.

Future:
- responsive web
- PWA
- React Native / Expo
- native iOS

## TDL-037 — External Social Platforms
**Status: P2 DEFERRED**

No MVP1 direct integrations for:
- LinkedIn
- Instagram
- WeChat
- Xiaohongshu

## TDL-038 — Fine-Tuning
**Status: P2 DEFERRED**

Do not fine-tune in MVP1.

First collect:
- AI draft
- user edits
- final version
- recurring style corrections



# Personal OS — Implementation Plan

> 文档边界：最初实施顺序与方案，供历史规划参考；用户后续决定与当前架构优先，不据此推定功能完成。 完整职责说明见 [文档入口](../README.md#文件边界遇到问题该听哪份)。
Version: v0.3  
Scope: MVP1

## 0. Execution Rules

Before coding:

1. Read `PRD.md`
2. Read `TDL.md`
3. Read `SCHEMA.md`
4. Read `EVALUATION.md`
5. Treat this directory as a **new Personal Agent project**
6. Inspect the legacy visual reference at:
   `https://github.com/RyanZhou123232/network-project`
7. Do not modify the legacy repository
8. Do not copy the entire legacy repository into this project
9. Do not implement MVP2/MVP3 features
10. Do not silently contradict a DECIDED item
11. If an implementation-critical TBD blocks work, stop and surface it
12. Preserve visual identity during frontend migration
13. Do not make the new app depend on legacy social-network tables
14. Build in small testable phases

## Phase 1 — Frontend / Repository Foundation

Goal:
Create the new application architecture while preserving the existing visual experience.

Tasks:
- inspect the legacy GitHub repo as a read-only reference
- create Next.js + TypeScript app
- connect to the existing Supabase project
- verify current users can sign in
- selectively migrate landing page
- selectively migrate loading sequence
- migrate major visual tokens
- create authenticated Agent + Canvas shell

Acceptance:
- existing user can sign in
- landing/loading visually matches closely
- new authenticated workspace loads
- no dependency on old social backend
- legacy repo remains untouched

## Phase 2 — Database Foundation

Tasks:
- implement new Personal OS migrations
- enable RLS
- add owner-scoped policies
- add indexes
- add updated_at triggers
- enable pgvector
- prepare PostgreSQL-native keyword/full-text search
- leave old Supabase legacy tables untouched
- resolve TDL-021 polymorphic integrity strategy before finalizing polymorphic writes

Acceptance:
- migrations run cleanly
- existing users remain valid
- RLS isolation works
- polymorphic reference validation is testable

## Phase 3 — Conversation Storage

Tasks:
- create/start conversation
- save user messages
- save assistant messages
- preserve sequence
- support text input
- support basic STT input
- persist conversation state
- derive transcript view from messages where needed

Acceptance:
- conversation survives reload
- source message IDs remain stable
- messages remain canonical source of truth

## Phase 4 — Extraction Engine

Initial extraction targets:
- existing person match
- new person
- person update
- interaction
- event
- observation
- candidate insight
- task
- email draft intent
- calendar event intent

Rules:
- use one orchestrator agent
- output strict structured objects
- write proposals into `pending_changes`
- include provenance
- do not directly commit final records

## Phase 5 — Review / Commit

Canvas review must support:
- approve
- edit
- reject
- commit

Acceptance:
- rejected change is never committed
- edited change commits edited value
- commit retains source trace
- duplicate commit prevented
- errors visible

## Phase 6 — Coffee Chat End-to-End Flow

Example:
> I just had coffee with Alex. He is building robotics hardware, raising seed, and I promised to send him the BridgeStar deck.

Expected:
- person create/update
- interaction
- flexible attributes
- observations
- candidate insight
- task

Acceptance:
- ≥95% extraction score under `EVALUATION.md`
- correction before commit works
- resulting person history can be reconstructed

## Phase 7 — Task Foundation

Tasks:
- task CRUD
- task status
- source link
- contextual Canvas display

Do not implement automatic scheduling yet.

## Phase 8 — Gmail Draft Integration

Flow:
Conversation → draft generation → approval → Gmail API creates real draft

Tasks:
- Google OAuth
- secure token handling
- minimum Gmail scopes
- draft creation tool
- persist `gmail_draft_id` only after Gmail success
- show success/failure

Do not build Gmail composer UI.

Acceptance:
- recipient correct
- subject correct
- body correct
- draft exists in Gmail
- ≥95% execution accuracy under `EVALUATION.md`
- never auto-send

## Phase 9 — Google Calendar Integration

Flow:
Conversation → extraction → review → approval → Google Calendar API creates event

Tasks:
- OAuth / scopes
- create event
- persist Google event record only after API success
- store Google event ID
- store calendar ID
- optional task link
- optional source conversation link

Acceptance:
- date/time correct
- timezone correct
- title correct
- event exists in Google Calendar
- ≥95% execution accuracy under `EVALUATION.md`

## Phase 10 — Knowledge Layer

Tasks:
- create observations
- create candidate insights
- review/confirm insights
- allow minimal/manual candidate beliefs
- link using `entity_edges`

Rules:
- observation requires source
- insight links to evidence
- no automatic belief-promotion algorithm in MVP1
- source evidence wins

## Phase 11 — Hybrid Retrieval

Tasks:
- choose embedding model
- implement structured filters
- implement PostgreSQL keyword/full-text search
- embed messages
- embed observations
- embed insights
- embed interaction summaries
- implement vector similarity
- implement evidence fusion/ranking
- implement evidence-tier classification

Flow:
1. parse query
2. identify structured constraints
3. narrow scope
4. run keyword/lexical search
5. run semantic search
6. merge/rank evidence
7. retrieve source
8. classify EXACT / RELATED / NONE
9. generate grounded response

Required behavior:
- direct exact evidence outranks semantic similarity
- RELATED must explicitly state exact evidence was not found
- NONE must say no relevant record was found
- no unsupported personal-history claims

Targets:
- 100% grounded personal-history claims
- 0 unsupported claims

## Phase 12 — UI Refinement

Focus:
- transitions
- visual clarity
- whitespace
- contextual Canvas behavior
- fast review flow
- minimal persistent dashboard clutter

Desktop smoothness first.

## Phase 13 — Test Harness

Follow `EVALUATION.md`.

Test:
- coffee chat extraction
- ambiguous people
- multiple people
- task extraction
- event extraction
- Gmail draft creation
- Calendar dates/times/timezones
- exact lexical retrieval
- exact structured retrieval
- semantically related retrieval
- no-evidence retrieval
- contradictory evidence
- RLS isolation
- polymorphic reference integrity

Targets:
- extraction accuracy ≥95%
- action execution accuracy ≥95%
- grounded memory claims = 100%
- unsupported personal-history claims = 0

## MVP1 Stop Condition

MVP1 is complete when:
- visual migration is done
- new workspace exists
- STT works
- coffee chat extraction works
- review/commit works
- people/interactions/tasks persist correctly
- Gmail draft creation works
- Calendar event creation works
- hybrid retrieval works
- insights retain provenance
- success metrics are met on the evaluation set

Do not automatically continue to MVP2.


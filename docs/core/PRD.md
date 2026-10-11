# Personal OS — Product Requirements Document (PRD)

> 文档边界：产品目标与功能范围，不代表当前完成进度。用户后续明确决定优先；当前实现看 PROJECT_HANDOFF。 完整职责说明见 [文档入口](../README.md#文件边界遇到问题该听哪份)。
Version: v0.3  
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
- bubble visualization language
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
Conversation → detect draft intent → generate draft → approval → Gmail API creates real Gmail draft

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


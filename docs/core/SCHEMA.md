# Personal OS — Database Schema Specification

> 文档边界：数据模型设计。实际建库定义以 database/migrations 为准，托管库部署状态须另行核对。 完整职责说明见 [文档入口](../README.md#文件边界遇到问题该听哪份)。
Version: v0.3  
Target: Supabase / PostgreSQL

## Conventions

- primary keys: `uuid`
- generated IDs: `gen_random_uuid()`
- private tables include `owner_id`
- timestamps use `timestamptz`
- flexible values use `jsonb`
- all private tables use RLS
- default ownership rule: `auth.uid() = owner_id`

## 1. profiles

- `id uuid primary key references auth.users(id) on delete cascade`
- `display_name text not null`
- `avatar_url text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

## 2. people

- `id uuid primary key default gen_random_uuid()`
- `owner_id uuid not null references public.profiles(id) on delete cascade`
- `name text not null`
- `email text null`
- `phone text null`
- `company text null`
- `role text null`
- `school text null`
- `location text null`
- `linkedin_url text null`
- `notes text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:
- `(owner_id, name)`
- `(owner_id, email)` where email is not null
- `(owner_id, updated_at desc)`

## 3. conversations

- `id uuid primary key default gen_random_uuid()`
- `owner_id uuid not null references public.profiles(id) on delete cascade`
- `title text null`
- `conversation_type text not null default 'general'`
- `status text not null default 'active'`
- `started_at timestamptz not null default now()`
- `ended_at timestamptz null`
- `raw_transcript text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Important:
- `messages` are the canonical source of truth
- `raw_transcript` is only a derived/cache representation
- implementation may omit persisted `raw_transcript` if deriving from messages is cleaner

## 4. messages

- `id uuid primary key default gen_random_uuid()`
- `conversation_id uuid not null references public.conversations(id) on delete cascade`
- `owner_id uuid not null references public.profiles(id) on delete cascade`
- `role text not null`
- `content text not null`
- `sequence_number integer not null`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

Constraint:
- unique `(conversation_id, sequence_number)`

Canonical source-of-truth for conversation content.

## 5. interactions

- `id uuid primary key default gen_random_uuid()`
- `owner_id uuid not null references public.profiles(id) on delete cascade`
- `interaction_type text not null`
- `title text null`
- `summary text null`
- `occurred_at timestamptz null`
- `location text null`
- `source_conversation_id uuid null references public.conversations(id) on delete set null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

## 6. interaction_people

- `owner_id uuid not null references public.profiles(id) on delete cascade`
- `interaction_id uuid not null references public.interactions(id) on delete cascade`
- `person_id uuid not null references public.people(id) on delete cascade`
- `role text null`
- `created_at timestamptz not null default now()`

Primary key:
- `(interaction_id, person_id)`

The owner is validated against both the interaction and person, and RLS scopes rows to that owner.

## 7. events

- `id uuid primary key default gen_random_uuid()`
- `owner_id uuid not null references public.profiles(id) on delete cascade`
- `event_type text not null`
- `title text not null`
- `description text null`
- `started_at timestamptz null`
- `ended_at timestamptz null`
- `location text null`
- `source_conversation_id uuid null references public.conversations(id) on delete set null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

## 8. entity_attributes

- `id uuid primary key default gen_random_uuid()`
- `owner_id uuid not null references public.profiles(id) on delete cascade`
- `entity_type text not null`
- `entity_id uuid not null`
- `key text not null`
- `value_json jsonb not null`
- `source_type text null`
- `source_id uuid null`
- `confidence numeric null check (confidence >= 0 and confidence <= 1)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:
- `(owner_id, entity_type, entity_id)`
- `(owner_id, key)`

Important:
- this is a polymorphic reference
- database triggers validate that referenced entities exist and belong to the same owner
- deletions are blocked while polymorphic references remain

## 9. pending_changes

- `id uuid primary key default gen_random_uuid()`
- `owner_id uuid not null references public.profiles(id) on delete cascade`
- `conversation_id uuid not null references public.conversations(id) on delete cascade`
- `change_type text not null`
- `target_entity_type text null`
- `target_entity_id uuid null`
- `payload_json jsonb not null`
- `status text not null default 'pending'`
- `confidence numeric null check (confidence >= 0 and confidence <= 1)`
- `created_at timestamptz not null default now()`
- `reviewed_at timestamptz null`
- `committed_at timestamptz null`
- `error_message text null`

## 10. observations

- `id uuid primary key default gen_random_uuid()`
- `owner_id uuid not null references public.profiles(id) on delete cascade`
- `content text not null`
- `observation_type text null`
- `confidence numeric null check (confidence >= 0 and confidence <= 1)`
- `status text not null default 'active'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Observations must link to source evidence through `entity_edges`.

## 11. insights

- `id uuid primary key default gen_random_uuid()`
- `owner_id uuid not null references public.profiles(id) on delete cascade`
- `content text not null`
- `status text not null default 'candidate'`
- `confidence numeric null check (confidence >= 0 and confidence <= 1)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

MVP1:
- candidate/confirmed insight workflow is supported
- insight must remain linked to source evidence

## 12. beliefs

- `id uuid primary key default gen_random_uuid()`
- `owner_id uuid not null references public.profiles(id) on delete cascade`
- `content text not null`
- `status text not null default 'candidate'`
- `confidence numeric null check (confidence >= 0 and confidence <= 1)`
- `first_formed_at timestamptz null`
- `last_reinforced_at timestamptz null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

MVP1:
- table may exist
- belief creation is minimal/manual
- no automatic promotion algorithm is required

## 13. decisions

Reserved for future use.

- `id uuid primary key default gen_random_uuid()`
- `owner_id uuid not null references public.profiles(id) on delete cascade`
- `question text not null`
- `decision text null`
- `reasoning_summary text null`
- `status text not null default 'open'`
- `decided_at timestamptz null`
- `outcome text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

## 14. tasks

- `id uuid primary key default gen_random_uuid()`
- `owner_id uuid not null references public.profiles(id) on delete cascade`
- `title text not null`
- `description text null`
- `status text not null default 'pending'`
- `priority text null`
- `due_at timestamptz null`
- `estimated_minutes integer null`
- `source_conversation_id uuid null references public.conversations(id) on delete set null`
- `completed_at timestamptz null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

## 15. calendar_events

This table represents events successfully created in Google Calendar.

- `id uuid primary key default gen_random_uuid()`
- `owner_id uuid not null references public.profiles(id) on delete cascade`
- `google_event_id text not null`
- `calendar_id text not null`
- `title text not null`
- `start_at timestamptz not null`
- `end_at timestamptz not null`
- `status text not null default 'confirmed'`
- `linked_task_id uuid null references public.tasks(id) on delete set null`
- `source_conversation_id uuid null references public.conversations(id) on delete set null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Unique:
- `(owner_id, calendar_id, google_event_id)`

Before Google API success, proposed event data remains in `pending_changes`.

## 16. email_drafts

This table represents drafts successfully created in Gmail.

- `id uuid primary key default gen_random_uuid()`
- `owner_id uuid not null references public.profiles(id) on delete cascade`
- `gmail_draft_id text not null`
- `to_email text not null`
- `cc_json jsonb not null default '[]'::jsonb`
- `bcc_json jsonb not null default '[]'::jsonb`
- `subject text null`
- `body text not null`
- `status text not null default 'created'`
- `source_conversation_id uuid null references public.conversations(id) on delete set null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Unique:
- `(owner_id, gmail_draft_id)`

Before Gmail API success, proposed draft data remains in `pending_changes`.

## 17. entity_edges

- `id uuid primary key default gen_random_uuid()`
- `owner_id uuid not null references public.profiles(id) on delete cascade`
- `source_type text not null`
- `source_id uuid not null`
- `relation_type text not null`
- `target_type text not null`
- `target_id uuid not null`
- `confidence numeric null check (confidence >= 0 and confidence <= 1)`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

Examples:
- observation `sourced_from` message
- insight `derived_from` observation
- belief `supported_by` insight
- belief `contradicted_by` insight
- task `created_from` conversation
- task `scheduled_as` calendar_event

Important:
- source and target references are polymorphic
- database triggers validate both references and prevent cross-owner links
- deletions are blocked while polymorphic references remain

## 18. embeddings

- `id uuid primary key default gen_random_uuid()`
- `owner_id uuid not null references public.profiles(id) on delete cascade`
- `entity_type text not null`
- `entity_id uuid not null`
- `chunk_index integer not null default 0`
- `chunk_text text not null`
- `embedding vector(<dimension TBD>) not null`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Unique:
- `(owner_id, entity_type, entity_id, chunk_index)`

MVP1 initial embedding targets:
- messages
- observations
- insights
- interaction summaries

## 19. Keyword Search

Use PostgreSQL-native full-text / lexical search.

Implementation details may include:
- generated `tsvector`
- GIN indexes
- exact-match paths for short identifiers/names/acronyms

Exact matches should be preserved strongly during evidence fusion.

## 20. OAuth Integration Storage

Exact encrypted token design is still TBD.

Minimum logical fields:
- owner_id
- provider
- encrypted_access_token
- encrypted_refresh_token
- expires_at
- scopes
- created_at
- updated_at

Tokens must never be exposed to the browser.

## Migration Notes

- The initial migration creates the core schema and owner-scoped RLS policies.
- `embeddings` is deferred until the embedding model and vector dimension are selected.
- `decisions` exists as a reserved table; its workflow remains deferred for MVP1.
- Migration `202610100008_person_memory_updates.sql` adds reviewed `update_person` commits and `person_memory_revisions`. Hosted execution must be confirmed separately.

### Reviewed Person Memory Updates

- Match people by exact name after trimming and case normalization, within the signed-in owner. Multiple matches require clarification; aliases and similar names are not automatically merged.
- `update_person` targets an existing person ID selected by the server. Its immutable `person_binding` contains the expected `updated_at` and before values; editable fields contain the proposed after values.
- Approval locks the person, checks identity and version, updates allowed core fields or flexible attributes, and commits the proposal atomically. Repeated approval is idempotent. A stale proposal must be regenerated.
- `person_memory_revisions` stores `owner_id`, `person_id`, `change_id`, `field_key`, `old_value`, `new_value`, `previous_sources`, `source_message_ids`, and `created_at`. `(change_id, field_key)` is unique. RLS restricts reads to the owner; history entries cannot be updated through the authenticated role.
- Existing raw messages and provenance edges remain intact. Retrieval includes the person's field history so approved corrections can be distinguished from historical values and cited against their original user messages.
- Additive notes preserve previous notes; explicitly requested corrections can replace them. Flexible attributes update in place and retain earlier values in revision history. Conflicting duplicate attribute rows require resolution.
- Named interactions cannot silently commit without a person link. Approve a new person's proposal before approving its interaction; retry the interaction if needed.

## Core Data Flows

### Write Flow
Conversation → Messages → Extraction → Pending Changes → Review → Commit

### Knowledge Flow
Raw Source → Observation → Insight → Belief → Decision

### Retrieval Flow
Structured Filter  
→ Keyword Search  
→ Semantic Search  
→ Evidence Fusion  
→ Source Evidence  
→ EXACT / RELATED / NONE  
→ Grounded Answer


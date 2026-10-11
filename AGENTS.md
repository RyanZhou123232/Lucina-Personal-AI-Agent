# Personal OS project guidance

Read `docs/PROJECT_HANDOFF.md` first for current state and remaining MVP1 work; `docs/README.md` is the documentation index.

## Layout
- `frontend/`: Next.js pages, browser Supabase client, active UI at `public/legacy/`; `app/api/` contains routing adapters only.
- `backend/lib/`: server services, extraction, retrieval, evidence validation and Google execution.
- `backend/routes/`: actual API handlers; `backend/tests/`: automated tests; `backend/scripts/`: dependency setup.
- `database/migrations/`: the only ordered SQL migration source.
- `docs/core/`: the original five specifications; `docs/testing/`: evaluation cases/results; `docs/guides/`: feature setup; `docs/reference/`: original request attachment.
- Keep project rules here. `frontend/AGENTS.md` is framework-generated Next guidance; retain and follow it, rather than duplicating it into docs.

## Runtime and verification
Frontend and backend run in one Next.js service. Run npm commands from `frontend/`: `npm install`, `npm run dev`, `npm test`, `npm run typecheck`, `npm run build`.
Postinstall links backend dependencies to frontend/node_modules; do not create an independent backend dependency tree or server without a deliberate architectural change.
SQL tests require `PGLITE_MODULE`; skipped SQL groups do not count as fully tested. See handoff for local setup.
Follow `frontend/AGENTS.md` and read relevant installed Next.js documentation before framework changes.

## Invariants
- Supabase Auth/Postgres and owner-scoped RLS isolate private records; validate ownership of relationships and sources.
- User messages are primary evidence. Preserve provenance and citation validation; do not use assistant claims as new facts.
- Internal reviewed writes use atomic `commit_pending_change`; approval alone is not a committed result.
- Add independent person facts; replace only explicitly corrected facts. Preserve history and version checks.
- Gmail: prepare a real unsent draft, then explicit Review approval sends. Calendar: local preview, then approval creates an event.
- Preserve provider receipts, concurrency protection and uncertain-outcome blocking; never blindly resend.
- Keep secrets server-only in frontend/.env.local; never print them, use NEXT_PUBLIC for secrets, or rotate the existing token encryption key casually.
- Add new numbered migrations; do not assume repository SQL has been applied to hosted Supabase.
- Preserve the existing visual design and nontechnical UI. No social/bubble features or original Network Project backend.

## Maintenance
Put new files in the appropriate existing directory. Update docs/PROJECT_HANDOFF.md after meaningful changes and moves.
Keep one canonical migration and runtime implementation; historical evaluation evidence stays unchanged. Remove obsolete copies only after checking references and recoverability.
MVP1 still needs STT, vector retrieval, fuller entity correction/editing and formal evaluation; do not claim complete based on ten questions alone.

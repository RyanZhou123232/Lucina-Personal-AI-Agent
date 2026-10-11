-- Migration 012: required table privileges for server-only Google execution.
-- Browser permissions and owner RLS policies remain unchanged.
begin;
grant usage on schema public to service_role;
grant select on public.pending_changes, public.messages to service_role;
grant update on public.pending_changes to service_role;
grant select, insert, update on public.email_drafts, public.calendar_events to service_role;
grant select, insert on public.entity_edges to service_role;
commit;

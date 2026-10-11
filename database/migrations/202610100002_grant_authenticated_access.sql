-- Grant signed-in users table privileges; RLS policies continue to restrict
-- each user to rows whose owner_id (or profile id) matches auth.uid().
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Keep privileges consistent for tables added later by the postgres role.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to authenticated;

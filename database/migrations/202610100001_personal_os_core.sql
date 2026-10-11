create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), 'Personal OS'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null, email text, phone text, company text, role text, school text, location text,
  linkedin_url text, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists people_owner_name_idx on public.people(owner_id, name);
create index if not exists people_owner_email_idx on public.people(owner_id, email) where email is not null;
create index if not exists people_owner_updated_idx on public.people(owner_id, updated_at desc);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  title text, conversation_type text not null default 'general', status text not null default 'active',
  started_at timestamptz not null default now(), ended_at timestamptz, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_owner_updated_idx on public.conversations(owner_id, updated_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade, role text not null check (role in ('user','assistant','system')),
  content text not null, sequence_number integer not null check (sequence_number > 0), metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), unique (conversation_id, sequence_number)
);
create index if not exists messages_owner_created_idx on public.messages(owner_id, created_at desc);
create index if not exists messages_conversation_sequence_idx on public.messages(conversation_id, sequence_number);

create table if not exists public.interactions (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  interaction_type text not null, title text, summary text, occurred_at timestamptz, location text,
  source_conversation_id uuid references public.conversations(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.interaction_people (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  interaction_id uuid not null references public.interactions(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade, role text, created_at timestamptz not null default now(),
  primary key (interaction_id, person_id)
);
create or replace function public.validate_interaction_people_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.interactions where id=new.interaction_id and owner_id=new.owner_id)
    or not exists(select 1 from public.people where id=new.person_id and owner_id=new.owner_id) then
    raise exception 'Interaction and person must both belong to owner';
  end if;
  return new;
end;
$$;
drop trigger if exists validate_interaction_people_owner on public.interaction_people;
create trigger validate_interaction_people_owner before insert or update on public.interaction_people
for each row execute function public.validate_interaction_people_owner();
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null, title text not null, description text, started_at timestamptz, ended_at timestamptz, location text,
  source_conversation_id uuid references public.conversations(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null, description text, status text not null default 'pending', priority text, due_at timestamptz,
  estimated_minutes integer, source_conversation_id uuid references public.conversations(id) on delete set null,
  completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.observations (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  content text not null, observation_type text, confidence numeric check (confidence between 0 and 1), status text not null default 'active',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.insights (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  content text not null, status text not null default 'candidate', confidence numeric check (confidence between 0 and 1),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.beliefs (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  content text not null, status text not null default 'candidate', confidence numeric check (confidence between 0 and 1),
  first_formed_at timestamptz, last_reinforced_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.decisions (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  question text not null, decision text, reasoning_summary text, status text not null default 'open',
  decided_at timestamptz, outcome text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.pending_changes (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade, change_type text not null,
  target_entity_type text, target_entity_id uuid, payload_json jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','committed','failed')),
  confidence numeric check (confidence between 0 and 1), created_at timestamptz not null default now(),
  reviewed_at timestamptz, committed_at timestamptz, error_message text
);
create index if not exists pending_changes_owner_status_idx on public.pending_changes(owner_id, status, created_at desc);
create table if not exists public.entity_attributes (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  entity_type text not null, entity_id uuid not null, key text not null, value_json jsonb not null,
  source_type text, source_id uuid, confidence numeric check (confidence between 0 and 1),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists entity_attributes_entity_idx on public.entity_attributes(owner_id, entity_type, entity_id);
create index if not exists entity_attributes_key_idx on public.entity_attributes(owner_id, key);
create table if not exists public.entity_edges (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  source_type text not null, source_id uuid not null, relation_type text not null, target_type text not null, target_id uuid not null,
  confidence numeric check (confidence between 0 and 1), metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  google_event_id text not null, calendar_id text not null, title text not null, start_at timestamptz not null, end_at timestamptz not null,
  status text not null default 'confirmed', linked_task_id uuid references public.tasks(id) on delete set null,
  source_conversation_id uuid references public.conversations(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (owner_id, calendar_id, google_event_id)
);
create table if not exists public.email_drafts (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  gmail_draft_id text not null, to_email text not null, cc_json jsonb not null default '[]'::jsonb,
  bcc_json jsonb not null default '[]'::jsonb, subject text, body text not null, status text not null default 'created',
  source_conversation_id uuid references public.conversations(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (owner_id, gmail_draft_id)
);

do $$
declare tbl text;
begin
  foreach tbl in array array['profiles','people','conversations','messages','interactions','interaction_people','events','tasks','observations','insights','beliefs','decisions','pending_changes','entity_attributes','entity_edges','calendar_events','email_drafts'] loop
    execute format('alter table public.%I enable row level security', tbl);
  end loop;
end $$;

drop policy if exists owner_all on public.profiles;
create policy owner_all on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);

do $$
declare tbl text;
begin
  foreach tbl in array array['people','conversations','messages','interactions','interaction_people','events','tasks','observations','insights','beliefs','decisions','pending_changes','entity_attributes','entity_edges','calendar_events','email_drafts'] loop
    execute format('drop policy if exists owner_all on public.%I', tbl);
    execute format('create policy owner_all on public.%I for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id)', tbl);
  end loop;
end $$;

create or replace function public.assert_owned_entity(p_type text, p_id uuid, p_owner uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare found boolean := false;
begin
  case p_type
    when 'profiles' then select exists(select 1 from public.profiles where id=p_id and id=p_owner) into found;
    when 'people' then select exists(select 1 from public.people where id=p_id and owner_id=p_owner) into found;
    when 'conversations' then select exists(select 1 from public.conversations where id=p_id and owner_id=p_owner) into found;
    when 'messages' then select exists(select 1 from public.messages where id=p_id and owner_id=p_owner) into found;
    when 'interactions' then select exists(select 1 from public.interactions where id=p_id and owner_id=p_owner) into found;
    when 'events' then select exists(select 1 from public.events where id=p_id and owner_id=p_owner) into found;
    when 'tasks' then select exists(select 1 from public.tasks where id=p_id and owner_id=p_owner) into found;
    when 'observations' then select exists(select 1 from public.observations where id=p_id and owner_id=p_owner) into found;
    when 'insights' then select exists(select 1 from public.insights where id=p_id and owner_id=p_owner) into found;
    when 'beliefs' then select exists(select 1 from public.beliefs where id=p_id and owner_id=p_owner) into found;
    when 'decisions' then select exists(select 1 from public.decisions where id=p_id and owner_id=p_owner) into found;
    when 'pending_changes' then select exists(select 1 from public.pending_changes where id=p_id and owner_id=p_owner) into found;
    when 'calendar_events' then select exists(select 1 from public.calendar_events where id=p_id and owner_id=p_owner) into found;
    when 'email_drafts' then select exists(select 1 from public.email_drafts where id=p_id and owner_id=p_owner) into found;
    else raise exception 'Unsupported entity type: %', p_type;
  end case;
  return found;
end;
$$;

create or replace function public.validate_polymorphic_reference()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'entity_attributes' then
    if not public.assert_owned_entity(new.entity_type, new.entity_id, new.owner_id) then
      raise exception 'Attribute entity must exist and belong to owner';
    end if;
    if new.source_id is not null and (new.source_type is null or not public.assert_owned_entity(new.source_type, new.source_id, new.owner_id)) then
      raise exception 'Attribute source must exist and belong to owner';
    end if;
  else
    if not public.assert_owned_entity(new.source_type, new.source_id, new.owner_id) then
      raise exception 'Edge source must exist and belong to owner';
    end if;
    if not public.assert_owned_entity(new.target_type, new.target_id, new.owner_id) then
      raise exception 'Edge target must exist and belong to owner';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists validate_entity_attribute_reference on public.entity_attributes;
create trigger validate_entity_attribute_reference before insert or update on public.entity_attributes
for each row execute function public.validate_polymorphic_reference();
drop trigger if exists validate_entity_edge_references on public.entity_edges;
create trigger validate_entity_edge_references before insert or update on public.entity_edges
for each row execute function public.validate_polymorphic_reference();
revoke all on function public.assert_owned_entity(text, uuid, uuid) from public;

create or replace function public.prevent_orphaned_polymorphic_references()
returns trigger language plpgsql as $$
begin
  if exists(select 1 from public.entity_attributes a where a.entity_type=tg_table_name and a.entity_id=old.id)
    or exists(select 1 from public.entity_edges e where (e.source_type=tg_table_name and e.source_id=old.id) or (e.target_type=tg_table_name and e.target_id=old.id)) then
    raise exception 'Entity is still referenced by Personal OS graph data';
  end if;
  return old;
end;
$$;
do $$
declare tbl text;
begin
  foreach tbl in array array['profiles','people','conversations','messages','interactions','events','tasks','observations','insights','beliefs','decisions','pending_changes','calendar_events','email_drafts'] loop
    execute format('drop trigger if exists prevent_orphaned_poly_refs on public.%I', tbl);
    execute format('create trigger prevent_orphaned_poly_refs before delete on public.%I for each row execute function public.prevent_orphaned_polymorphic_references()', tbl);
  end loop;
end $$;

create or replace function public.validate_owned_relationships()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'messages' then
    if not exists(select 1 from public.conversations where id=new.conversation_id and owner_id=new.owner_id) then
      raise exception 'Message conversation must belong to owner';
    end if;
  elsif tg_table_name = 'pending_changes' then
    if not exists(select 1 from public.conversations where id=new.conversation_id and owner_id=new.owner_id) then
      raise exception 'Pending change conversation must belong to owner';
    end if;
    if new.target_entity_id is not null and (new.target_entity_type is null or not public.assert_owned_entity(new.target_entity_type, new.target_entity_id, new.owner_id)) then
      raise exception 'Pending change target must belong to owner';
    end if;
  elsif tg_table_name in ('interactions','events','tasks','calendar_events','email_drafts') then
    if new.source_conversation_id is not null and not exists(select 1 from public.conversations where id=new.source_conversation_id and owner_id=new.owner_id) then
      raise exception 'Source conversation must belong to owner';
    end if;
    if tg_table_name = 'calendar_events' then
      if new.linked_task_id is not null
        and not exists(select 1 from public.tasks where id=new.linked_task_id and owner_id=new.owner_id) then
        raise exception 'Linked task must belong to owner';
      end if;
    end if;
  end if;
  return new;
end;
$$;
do $$
declare tbl text;
begin
  foreach tbl in array array['messages','pending_changes','interactions','events','tasks','calendar_events','email_drafts'] loop
    execute format('drop trigger if exists validate_owned_relationships on public.%I', tbl);
    execute format('create trigger validate_owned_relationships before insert or update on public.%I for each row execute function public.validate_owned_relationships()', tbl);
  end loop;
end $$;

do $$
declare tbl text;
begin
  foreach tbl in array array['profiles','people','conversations','interactions','events','tasks','observations','insights','beliefs','decisions','entity_attributes','calendar_events','email_drafts'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', tbl);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', tbl);
  end loop;
end $$;

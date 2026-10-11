begin;
-- Reviewed person updates: exact identity, optimistic concurrency and field history.
-- This migration changes no existing personal records.
create table public.person_memory_revisions (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
 person_id uuid not null references public.people(id) on delete cascade,
 change_id uuid not null references public.pending_changes(id) on delete restrict,
 field_key text not null, old_value jsonb not null, new_value jsonb not null,
 previous_sources jsonb not null default '[]', source_message_ids uuid[] not null,
 created_at timestamptz not null default now(), unique(change_id,field_key)
);
create index person_memory_revisions_person_idx on public.person_memory_revisions(owner_id,person_id,created_at);
alter table public.person_memory_revisions enable row level security;
create policy person_revision_read on public.person_memory_revisions for select to authenticated using(owner_id=auth.uid());
create policy person_revision_insert on public.person_memory_revisions for insert to authenticated with check(
 owner_id=auth.uid() and exists(select 1 from public.people p where p.id=person_id and p.owner_id=auth.uid())
 and exists(select 1 from public.pending_changes c where c.id=change_id and c.owner_id=auth.uid()));
grant select,insert on public.person_memory_revisions to authenticated;
revoke all on public.person_memory_revisions from anon;

create or replace function public.resolve_person_name(p_name text) returns setof jsonb
language sql stable security invoker set search_path='' as $$
 select to_jsonb(p)-'owner_id' || jsonb_build_object('attributes',coalesce((select jsonb_object_agg(a.key,a.value_json order by a.updated_at,a.id)
 from public.entity_attributes a where a.owner_id=auth.uid() and a.entity_type='people' and a.entity_id=p.id),'{}'::jsonb))
 from public.people p where p.owner_id=auth.uid() and lower(btrim(p.name))=lower(btrim(p_name)) order by p.id limit 2
$$;
revoke all on function public.resolve_person_name(text) from public,anon;
grant execute on function public.resolve_person_name(text) to authenticated;

-- Commit approved internal proposals atomically and preserve message provenance.
-- External Gmail and Calendar actions remain staged until their APIs are connected.

create or replace function public.commit_pending_change(p_change_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_change public.pending_changes%rowtype;
  v_payload jsonb;
  v_source_ids uuid[];
  v_entity_id uuid;
  v_entity_type text;
  v_confidence numeric;
  v_text text;
  v_person_name text;
  v_person_id uuid;
  v_match_count integer;
  v_attr record;
  v_person public.people%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_field record;
  v_old jsonb;
  v_sources jsonb;
  v_attr_id uuid;
begin
  if v_owner is null then
    raise exception 'Sign in before committing a change.' using errcode = '42501';
  end if;

  select * into v_change
  from public.pending_changes
  where id = p_change_id and owner_id = v_owner
  for update;

  if not found then
    raise exception 'Pending change not found.' using errcode = 'P0002';
  end if;

  if v_change.status = 'committed' then
    return jsonb_build_object(
      'status', 'committed', 'changeId', v_change.id,
      'targetEntityType', v_change.target_entity_type,
      'targetEntityId', v_change.target_entity_id,
      'alreadyCommitted', true
    );
  end if;

  if v_change.status not in ('pending', 'approved', 'failed') then
    raise exception 'Only pending, approved, or failed changes can be committed.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.conversations c
    where c.id = v_change.conversation_id and c.owner_id = v_owner
  ) then
    raise exception 'Source conversation is no longer available.' using errcode = '23503';
  end if;

  v_payload := v_change.payload_json;
  v_entity_type := v_change.target_entity_type;
  v_confidence := v_change.confidence;

  if jsonb_typeof(v_payload #> '{provenance,source_message_ids}') <> 'array' then
    raise exception 'This change has no message source evidence.' using errcode = '22023';
  end if;

  select array_agg(m.id order by m.sequence_number desc)
  into v_source_ids
  from jsonb_array_elements_text(v_payload #> '{provenance,source_message_ids}') with ordinality as source(value, ordinality)
  join public.messages m
    on m.id = source.value::uuid
   and m.owner_id = v_owner
   and m.conversation_id = v_change.conversation_id;

  if coalesce(array_length(v_source_ids, 1), 0) = 0 then
    raise exception 'The source messages could not be verified.' using errcode = '22023';
  end if;

  if v_change.change_type in ('create_person','update_person','create_interaction') then
    v_person_name := lower(btrim(case when v_change.change_type='create_interaction' then coalesce(v_payload->>'person_name',v_payload->>'person') else v_payload->>'name' end));
    if v_person_name is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text || ':' || v_person_name,0));
    end if;
  end if;

  case v_change.change_type
    when 'create_person' then
      v_entity_type := 'people';
      v_text := nullif(btrim(v_payload->>'name'), '');
      if v_text is null then raise exception 'A person name is required.' using errcode = '22023'; end if;
      if exists(select 1 from public.people where owner_id=v_owner and lower(btrim(name))=lower(v_text)) then
        raise exception 'This name already exists. Generate an update proposal or clarify the person; no duplicate was created.' using errcode='22023';
      end if;
      insert into public.people (owner_id, name, email, phone, company, role, school, location, linkedin_url, notes)
      values (
        v_owner, v_text, nullif(btrim(v_payload->>'email'), ''), nullif(btrim(v_payload->>'phone'), ''),
        nullif(btrim(v_payload->>'company'), ''), nullif(btrim(v_payload->>'role'), ''),
        nullif(btrim(v_payload->>'school'), ''), nullif(btrim(v_payload->>'location'), ''),
        nullif(btrim(v_payload->>'linkedin_url'), ''), nullif(btrim(v_payload->>'notes'), '')
      ) returning id into v_entity_id;

    when 'update_person' then
      v_entity_type := 'people';
      v_entity_id := v_change.target_entity_id;
      select * into v_person from public.people where id=v_entity_id and owner_id=v_owner for update;
      if not found or v_change.target_entity_type is distinct from 'people' then
        raise exception 'The selected person is unavailable.' using errcode='42501';
      end if;
      if lower(btrim(v_person.name)) is distinct from lower(btrim(v_payload->>'name'))
        or (select count(*) from public.people where owner_id=v_owner and lower(btrim(name))=lower(btrim(v_person.name)))<>1 then
        raise exception 'Person identity is ambiguous or has changed. Regenerate the proposal.' using errcode='22023';
      end if;
      if (v_payload #>> '{person_binding,id}')::uuid is distinct from v_person.id
        or (v_payload #>> '{person_binding,expected_updated_at}')::timestamptz is distinct from v_person.updated_at then
        raise exception 'This person changed after the proposal was generated. Regenerate the proposal before approving.' using errcode='40001';
      end if;
      if jsonb_typeof(v_payload->'fields') is distinct from 'object'
        or jsonb_typeof(v_payload->'attributes') is distinct from 'object' then
        raise exception 'Person updates require fields and attributes objects.' using errcode='22023';
      end if;
      -- Every source must be an owned user message in the proposal conversation.
      if exists(select 1 from jsonb_array_elements_text(v_payload #> '{provenance,source_message_ids}') s(value)
        where not exists(select 1 from public.messages m where m.id=s.value::uuid and m.owner_id=v_owner and m.conversation_id=v_change.conversation_id and m.role='user')) then
        raise exception 'Invalid person update source.' using errcode='22023';
      end if;
      v_before := to_jsonb(v_person);
      if jsonb_typeof(v_payload #> '{provenance,source_quotes}') is distinct from 'array'
        or jsonb_array_length(v_payload #> '{provenance,source_quotes}')=0 then
        raise exception 'Person updates require original source quotes.' using errcode='22023';
      end if;
      if exists(select 1 from jsonb_array_elements(v_payload #> '{provenance,source_quotes}') q(value)
        where not exists(select 1 from public.messages m where m.id=(q.value->>'messageId')::uuid
          and m.owner_id=v_owner and m.conversation_id=v_change.conversation_id and m.role='user'
          and m.id=any(v_source_ids) and length(btrim(q.value->>'quote'))>0
          and strpos(m.content,q.value->>'quote')>0))
        or exists(select 1 from unnest(v_source_ids) s(id) where not exists(
          select 1 from jsonb_array_elements(v_payload #> '{provenance,source_quotes}') q(value) where (q.value->>'messageId')::uuid=s.id)) then
        raise exception 'Person update quotes do not match their original messages.' using errcode='22023';
      end if;
      v_after := v_before;
      for v_field in select key,value from jsonb_each(v_payload->'fields') loop
        if v_field.key not in ('email','phone','company','role','school','location','linkedin_url','notes')
          or jsonb_typeof(v_field.value) not in ('string','null') or length(v_field.value::text)>20002 then
          raise exception 'Unsupported person update field.' using errcode='22023';
        end if;
        if v_field.value is distinct from v_before->v_field.key then
          select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) into v_sources from public.entity_edges e
            where e.owner_id=v_owner and e.source_type='people' and e.source_id=v_person.id and e.relation_type='derived_from';
          insert into public.person_memory_revisions(owner_id,person_id,change_id,field_key,old_value,new_value,previous_sources,source_message_ids)
            values(v_owner,v_person.id,v_change.id,v_field.key,v_before->v_field.key,v_field.value,v_sources,v_source_ids);
          v_after := jsonb_set(v_after,array[v_field.key],v_field.value);
        end if;
      end loop;
      for v_field in select key,value from jsonb_each(v_payload->'attributes') loop
        if length(v_field.key)=0 or length(v_field.key)>200 or length(v_field.value::text)>20000 then
          raise exception 'Invalid person attribute.' using errcode='22023';
        end if;
        if (select count(*) from public.entity_attributes where owner_id=v_owner and entity_type='people' and entity_id=v_person.id and key=v_field.key)>1 then
          raise exception 'This attribute has conflicting historical rows. Resolve them before updating.' using errcode='22023';
        end if;
        select id,value_json,jsonb_build_array(jsonb_build_object('source_type',source_type,'source_id',source_id))
          into v_attr_id,v_old,v_sources from public.entity_attributes
          where owner_id=v_owner and entity_type='people' and entity_id=v_person.id and key=v_field.key for update;
        if v_old is distinct from v_field.value then
          insert into public.person_memory_revisions(owner_id,person_id,change_id,field_key,old_value,new_value,previous_sources,source_message_ids)
            values(v_owner,v_person.id,v_change.id,'attributes.' || v_field.key,coalesce(v_old,'null'::jsonb),v_field.value,coalesce(v_sources,'[]'::jsonb),v_source_ids);
          if v_attr_id is null then
            insert into public.entity_attributes(owner_id,entity_type,entity_id,key,value_json,source_type,source_id,confidence)
              values(v_owner,'people',v_person.id,v_field.key,v_field.value,'messages',v_source_ids[1],v_confidence);
          else
            update public.entity_attributes set value_json=v_field.value,source_type='messages',source_id=v_source_ids[1],confidence=v_confidence
              where id=v_attr_id and owner_id=v_owner;
          end if;
        end if;
      end loop;
      update public.people set email=v_after->>'email',phone=v_after->>'phone',company=v_after->>'company',role=v_after->>'role',
        school=v_after->>'school',location=v_after->>'location',linkedin_url=v_after->>'linkedin_url',notes=v_after->>'notes'
        where id=v_person.id and owner_id=v_owner;

    when 'create_interaction' then
      v_entity_type := 'interactions';
      insert into public.interactions (owner_id, interaction_type, title, summary, occurred_at, location, source_conversation_id)
      values (
        v_owner,
        coalesce(nullif(btrim(v_payload->>'interaction_type'), ''), 'conversation'),
        coalesce(nullif(btrim(v_payload->>'title'), ''), nullif(left(btrim(v_payload->>'summary'), 160), ''), 'Conversation'),
        coalesce(nullif(btrim(v_payload->>'summary'), ''), nullif(btrim(v_payload->>'notes'), '')),
        coalesce(nullif(v_payload->>'occurred_at', '')::timestamptz, nullif(v_payload->>'date', '')::timestamptz),
        nullif(btrim(v_payload->>'location'), ''), v_change.conversation_id
      ) returning id into v_entity_id;

      v_person_name := coalesce(nullif(btrim(v_payload->>'person_name'), ''), nullif(btrim(v_payload->>'person'), ''));
      if v_person_name is not null then
        select count(*), min(id::text)::uuid into v_match_count, v_person_id
        from public.people where owner_id = v_owner and lower(btrim(name)) = lower(btrim(v_person_name));
        if v_match_count > 1 then
          raise exception 'More than one saved person matches "%". Resolve the person before retrying.', v_person_name using errcode = '22023';
        elsif v_match_count = 1 then
          insert into public.interaction_people (owner_id, interaction_id, person_id, role)
          values (v_owner, v_entity_id, v_person_id, nullif(btrim(v_payload->>'person_role'), ''));
        else
          raise exception 'Approve the person proposal first, then retry this interaction.' using errcode='22023';
        end if;
      end if;

      if v_payload ? 'person_id' then
        if v_person_name is not null and v_person_id is distinct from (v_payload->>'person_id')::uuid then
          raise exception 'Person name and selected ID disagree.' using errcode='22023';
        end if;
        v_person_id := nullif(v_payload->>'person_id', '')::uuid;
        if not exists (select 1 from public.people where id = v_person_id and owner_id = v_owner) then
          raise exception 'The selected person does not belong to this account.' using errcode = '42501';
        end if;
        insert into public.interaction_people (owner_id, interaction_id, person_id)
        values (v_owner, v_entity_id, v_person_id) on conflict do nothing;
      end if;

    when 'create_event' then
      v_entity_type := 'events';
      v_text := nullif(btrim(v_payload->>'title'), '');
      if v_text is null then raise exception 'An event title is required.' using errcode = '22023'; end if;
      insert into public.events (owner_id, event_type, title, description, started_at, ended_at, location, source_conversation_id)
      values (
        v_owner, coalesce(nullif(btrim(v_payload->>'event_type'), ''), 'event'), v_text,
        coalesce(nullif(btrim(v_payload->>'description'), ''), nullif(btrim(v_payload->>'summary'), '')),
        coalesce(nullif(v_payload->>'started_at', '')::timestamptz, nullif(v_payload->>'date', '')::timestamptz),
        nullif(v_payload->>'ended_at', '')::timestamptz, nullif(btrim(v_payload->>'location'), ''), v_change.conversation_id
      ) returning id into v_entity_id;

    when 'create_task' then
      v_entity_type := 'tasks';
      v_text := nullif(btrim(v_payload->>'title'), '');
      if v_text is null then raise exception 'A task title is required.' using errcode = '22023'; end if;
      insert into public.tasks (owner_id, title, description, status, priority, due_at, estimated_minutes, source_conversation_id)
      values (
        v_owner, v_text, coalesce(nullif(btrim(v_payload->>'description'), ''), nullif(btrim(v_payload->>'notes'), '')),
        coalesce(nullif(btrim(v_payload->>'status'), ''), 'pending'), nullif(btrim(v_payload->>'priority'), ''),
        coalesce(nullif(v_payload->>'due_at', '')::timestamptz, nullif(v_payload->>'date', '')::timestamptz),
        nullif(v_payload->>'estimated_minutes', '')::integer, v_change.conversation_id
      ) returning id into v_entity_id;

    when 'create_observation' then
      v_entity_type := 'observations';
      v_text := coalesce(nullif(btrim(v_payload->>'content'), ''), nullif(btrim(v_payload->>'observation'), ''));
      if v_text is null then raise exception 'Observation content is required.' using errcode = '22023'; end if;
      insert into public.observations (owner_id, content, observation_type, confidence)
      values (v_owner, v_text, nullif(btrim(v_payload->>'observation_type'), ''), v_confidence)
      returning id into v_entity_id;

    when 'create_insight' then
      v_entity_type := 'insights';
      v_text := coalesce(nullif(btrim(v_payload->>'content'), ''), nullif(btrim(v_payload->>'insight'), ''));
      if v_text is null then raise exception 'Insight content is required.' using errcode = '22023'; end if;
      insert into public.insights (owner_id, content, confidence)
      values (v_owner, v_text, v_confidence) returning id into v_entity_id;

    when 'create_belief' then
      v_entity_type := 'beliefs';
      v_text := coalesce(nullif(btrim(v_payload->>'content'), ''), nullif(btrim(v_payload->>'belief'), ''));
      if v_text is null then raise exception 'Belief content is required.' using errcode = '22023'; end if;
      insert into public.beliefs (owner_id, content, confidence, first_formed_at, last_reinforced_at)
      values (
        v_owner, v_text, v_confidence,
        nullif(v_payload->>'first_formed_at', '')::timestamptz,
        nullif(v_payload->>'last_reinforced_at', '')::timestamptz
      ) returning id into v_entity_id;

    when 'create_decision' then
      v_entity_type := 'decisions';
      v_text := coalesce(nullif(btrim(v_payload->>'question'), ''), nullif(btrim(v_payload->>'title'), ''));
      if v_text is null then raise exception 'A decision question is required.' using errcode = '22023'; end if;
      insert into public.decisions (owner_id, question, decision, reasoning_summary, status, decided_at, outcome)
      values (
        v_owner, v_text, nullif(btrim(v_payload->>'decision'), ''), nullif(btrim(v_payload->>'reasoning_summary'), ''),
        coalesce(nullif(btrim(v_payload->>'status'), ''), 'open'),
        nullif(v_payload->>'decided_at', '')::timestamptz, nullif(btrim(v_payload->>'outcome'), '')
      ) returning id into v_entity_id;

    when 'draft_email' then
      raise exception 'Gmail is not connected yet. This approved draft is waiting for Gmail integration.' using errcode = '0A000';

    when 'create_calendar_event' then
      raise exception 'Google Calendar is not connected yet. This approved event is waiting for Calendar integration.' using errcode = '0A000';

    else
      raise exception 'Unsupported change type: %', v_change.change_type using errcode = '22023';
  end case;

  -- Flexible fields can be attached without changing the stable core schema.
  if v_change.change_type <> 'update_person' and jsonb_typeof(v_payload->'attributes') = 'object' then
    for v_attr in select key, value from jsonb_each(v_payload->'attributes') loop
      insert into public.entity_attributes (owner_id, entity_type, entity_id, key, value_json, source_type, source_id, confidence)
      values (v_owner, v_entity_type, v_entity_id, v_attr.key, v_attr.value, 'messages', v_source_ids[1], v_confidence);
    end loop;
  end if;

  -- Keep each committed record traceable to the exact user messages that supported it.
  insert into public.entity_edges (owner_id, source_type, source_id, relation_type, target_type, target_id, confidence, metadata)
  select v_owner, v_entity_type, v_entity_id, 'derived_from', 'messages', source_id, v_confidence,
         jsonb_build_object('pending_change_id', v_change.id, 'conversation_id', v_change.conversation_id)
  from unnest(v_source_ids) as source(source_id);

  update public.pending_changes
  set status = 'committed', target_entity_type = v_entity_type, target_entity_id = v_entity_id,
      reviewed_at = coalesce(reviewed_at, now()), committed_at = now(), error_message = null
  where id = v_change.id and owner_id = v_owner;

  return jsonb_build_object(
    'status', 'committed', 'changeId', v_change.id,
    'targetEntityType', v_entity_type, 'targetEntityId', v_entity_id,
    'alreadyCommitted', false
  );
end;
$$;

revoke all on function public.commit_pending_change(uuid) from public, anon;
grant execute on function public.commit_pending_change(uuid) to authenticated;

-- Search human content only. Resolve pronouns from context without treating nearby records as the same person.
-- No vector model selected yet. No writes, external calls or changes to RLS.
create or replace function public.search_personal_memory(
  p_terms text[] default '{}', p_person_name text default null,
  p_entity_types text[] default '{}', p_task_status text default null,
  p_exclude_message_id uuid default null, p_limit integer default 12
) returns table(entity_type text, entity_id uuid, record jsonb, sources jsonb, score integer)
language sql stable security invoker set search_path = '' as $$
with recursive
eligible_messages as (
  select p.* from public.messages p
  where p.owner_id=auth.uid() and p.role='user' and p.id is distinct from p_exclude_message_id
    and not exists (select 1 from public.messages answer where answer.owner_id=p.owner_id and answer.conversation_id=p.conversation_id and answer.role='assistant' and answer.sequence_number=p.sequence_number+1 and answer.metadata->'memory'->'plan'->>'intent'='lookup')
), records as (
  select 'people'::text as kind, p.id, to_jsonb(p)-'owner_id' || jsonb_build_object('field_history',coalesce((select jsonb_agg(to_jsonb(h)-'owner_id' order by h.created_at,h.id) from public.person_memory_revisions h where h.person_id=p.id and h.owner_id=auth.uid()),'[]'::jsonb)) as value, p.updated_at as stamp from public.people p where p.owner_id=auth.uid()
  union all select 'interactions', p.id, to_jsonb(p)-'owner_id', p.updated_at from public.interactions p where p.owner_id=auth.uid()
  union all select 'tasks', p.id, to_jsonb(p)-'owner_id', p.updated_at from public.tasks p where p.owner_id=auth.uid()
  union all select 'events', p.id, to_jsonb(p)-'owner_id', p.updated_at from public.events p where p.owner_id=auth.uid()
  union all select 'observations', p.id, to_jsonb(p)-'owner_id', p.updated_at from public.observations p where p.owner_id=auth.uid()
  union all select 'insights', p.id, to_jsonb(p)-'owner_id', p.updated_at from public.insights p where p.owner_id=auth.uid()
  union all select 'beliefs', p.id, to_jsonb(p)-'owner_id', p.updated_at from public.beliefs p where p.owner_id=auth.uid()
  union all select 'decisions', p.id, to_jsonb(p)-'owner_id', p.updated_at from public.decisions p where p.owner_id=auth.uid()
  union all select 'messages', p.id, to_jsonb(p)-'owner_id'-'metadata', p.created_at from eligible_messages p
), paths(root_kind, root_id, kind, id, depth, visited) as (
  select r.kind, r.id, r.kind, r.id, 0, array[r.kind || ':' || r.id::text] from records r
  union all
  select p.root_kind, p.root_id, e.target_type, e.target_id, p.depth+1, p.visited || (e.target_type || ':' || e.target_id::text)
  from paths p join public.entity_edges e on e.source_type=p.kind and e.source_id=p.id and e.owner_id=auth.uid()
  where p.depth<4 and e.relation_type in ('derived_from','sourced_from','supported_by','created_from')
    and not (e.target_type || ':' || e.target_id::text)=any(p.visited)
), source_rows as (
  select distinct p.root_kind, p.root_id, m.id, m.conversation_id, m.content, m.created_at, m.sequence_number
  from paths p join eligible_messages m on p.kind='messages' and p.id=m.id
  where m.owner_id=auth.uid() and m.role='user' and m.id is distinct from p_exclude_message_id
  union
  select a.entity_type, a.entity_id, m.id, m.conversation_id, m.content, m.created_at, m.sequence_number
  from public.entity_attributes a join eligible_messages m on a.source_type='messages' and a.source_id=m.id
  where a.owner_id=auth.uid() and m.owner_id=auth.uid() and m.role='user' and m.id is distinct from p_exclude_message_id
), documents as (
  select r.*, coalesce(s.items,'[]'::jsonb) as source_items,
    coalesce(a.items,'{}'::jsonb) as attributes,
    lower(coalesce((select string_agg(v.value,' ') from jsonb_each_text(r.value) v where v.key in ('name','notes','role','company','school','location','title','summary','description','content','question','rationale','decision','reasoning_summary','outcome','statement','email','phone','linkedin_url','interaction_type','observation_type')),'') || ' ' || coalesce(s.body,'') || ' ' || coalesce(a.body,'')) as search_text,
    lower(coalesce(s.context_body,'')) as context_text
  from records r
  left join lateral (
    select jsonb_agg(jsonb_build_object('id',s.id,'conversation_id',s.conversation_id,'content',s.content,'created_at',s.created_at,'context',coalesce((select jsonb_agg(to_jsonb(ctx) order by ctx.sequence_number) from (select prev.id,prev.content,prev.sequence_number from public.messages prev where prev.owner_id=auth.uid() and prev.role='user' and prev.conversation_id=s.conversation_id and prev.sequence_number<s.sequence_number and prev.id is distinct from p_exclude_message_id order by prev.sequence_number desc limit 3) ctx),'[]'::jsonb)) order by s.created_at,s.id) as items,
      string_agg(s.content,' ') as body,
      string_agg((select string_agg(ctx.content,' ') from (select prev.content from public.messages prev where prev.owner_id=auth.uid() and prev.role='user' and prev.conversation_id=s.conversation_id and prev.sequence_number<s.sequence_number and prev.id is distinct from p_exclude_message_id order by prev.sequence_number desc limit 3) ctx),' ') as context_body from source_rows s where s.root_kind=r.kind and s.root_id=r.id
  ) s on true
  left join lateral (
    select jsonb_object_agg(a.key,a.value_json order by a.updated_at,a.id) as items,
      string_agg(a.value_json::text,' ') as body from public.entity_attributes a
    where a.owner_id=auth.uid() and a.entity_type=r.kind and a.entity_id=r.id
  ) a on true
), ranked as (
  select d.*, (
    select count(*)::integer from unnest(coalesce(p_terms,'{}'::text[])) t(term)
    where length(btrim(t.term))>0 and (
      strpos(d.search_text,lower(t.term))>0 or
      pg_catalog.to_tsvector('simple'::regconfig,d.search_text) @@ pg_catalog.plainto_tsquery('simple'::regconfig,t.term)
    )
  ) as matches,
  (select count(*)::integer from unnest(coalesce(p_terms,'{}'::text[])) t(term) where length(btrim(t.term))>0 and strpos(d.context_text,lower(t.term))>0) as context_matches,
  case when p_person_name is not null and d.kind='people' and lower(d.value->>'name')=lower(p_person_name) then 50 else 0 end as person_boost
  from documents d
  where auth.uid() is not null
    and (cardinality(coalesce(p_entity_types,'{}'::text[]))=0 or d.kind=any(p_entity_types))
    and (p_task_status is null or d.kind<>'tasks' or d.value->>'status'=p_task_status)
    and (p_person_name is null or (
      (d.kind='people' and lower(d.value->>'name')=lower(p_person_name)) or
      (d.kind='interactions' and exists (
        select 1 from public.interaction_people ip join public.people p on p.id=ip.person_id
        where ip.owner_id=auth.uid() and p.owner_id=auth.uid() and ip.interaction_id=d.id and lower(p.name)=lower(p_person_name)
      )) or (d.kind not in ('people','interactions') and (strpos(d.search_text,lower(p_person_name))>0 or strpos(d.context_text,lower(p_person_name))>0))
    ))
)
select r.kind, r.id, r.value || jsonb_build_object('attributes',r.attributes), r.source_items,
  r.matches*40+r.context_matches*5+r.person_boost as score
from ranked r
where (r.matches>0 or r.context_matches>0 or p_person_name is not null or
  (cardinality(coalesce(p_terms,'{}'::text[]))=0 and cardinality(coalesce(p_entity_types,'{}'::text[]))>0))
  and (r.kind not in ('observations','insights','beliefs') or jsonb_array_length(r.source_items)>0)
order by (r.kind='people' and r.value->>'name' is not null and lower(btrim(r.value->>'name'))=lower(btrim(p_person_name))) desc, (r.kind='messages') desc, r.matches*40+r.context_matches*5+r.person_boost desc, r.stamp desc, r.id
limit greatest(1,least(coalesce(p_limit,12),30));
$$;
revoke all on function public.search_personal_memory(text[],text,text[],text,uuid,integer) from public, anon;
grant execute on function public.search_personal_memory(text[],text,text[],text,uuid,integer) to authenticated;

commit;

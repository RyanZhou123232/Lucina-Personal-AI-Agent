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

  select array_agg(m.id order by source.ordinality)
  into v_source_ids
  from jsonb_array_elements_text(v_payload #> '{provenance,source_message_ids}') with ordinality as source(value, ordinality)
  join public.messages m
    on m.id = source.value::uuid
   and m.owner_id = v_owner
   and m.conversation_id = v_change.conversation_id;

  if coalesce(array_length(v_source_ids, 1), 0) = 0 then
    raise exception 'The source messages could not be verified.' using errcode = '22023';
  end if;

  case v_change.change_type
    when 'create_person' then
      v_entity_type := 'people';
      v_text := nullif(btrim(v_payload->>'name'), '');
      if v_text is null then raise exception 'A person name is required.' using errcode = '22023'; end if;
      insert into public.people (owner_id, name, email, phone, company, role, school, location, linkedin_url, notes)
      values (
        v_owner, v_text, nullif(btrim(v_payload->>'email'), ''), nullif(btrim(v_payload->>'phone'), ''),
        nullif(btrim(v_payload->>'company'), ''), nullif(btrim(v_payload->>'role'), ''),
        nullif(btrim(v_payload->>'school'), ''), nullif(btrim(v_payload->>'location'), ''),
        nullif(btrim(v_payload->>'linkedin_url'), ''), nullif(btrim(v_payload->>'notes'), '')
      ) returning id into v_entity_id;

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
        from public.people where owner_id = v_owner and lower(name) = lower(v_person_name);
        if v_match_count > 1 then
          raise exception 'More than one saved person matches "%". Resolve the person before retrying.', v_person_name using errcode = '22023';
        elsif v_match_count = 1 then
          insert into public.interaction_people (owner_id, interaction_id, person_id, role)
          values (v_owner, v_entity_id, v_person_id, nullif(btrim(v_payload->>'person_role'), ''));
        end if;
      end if;

      if v_payload ? 'person_id' then
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
  if jsonb_typeof(v_payload->'attributes') = 'object' then
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

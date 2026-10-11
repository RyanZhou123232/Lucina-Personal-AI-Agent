begin;
-- Legacy revisions remain unknown; storage history alone never establishes revocation.
alter table public.person_memory_revisions add column operation text not null default 'unknown'
  check(operation in ('unknown','add','correct'));
create or replace function public.memory_add_values(before_value jsonb, incoming jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select case when incoming is null or incoming='null'::jsonb then coalesce(before_value,'null'::jsonb)
 when before_value is null or before_value='null'::jsonb then incoming
 else (select case when count(*)=1 then (jsonb_agg(value order by position))->0 else coalesce(jsonb_agg(value order by position),'[]'::jsonb) end
 from (select value,min(ordinality) as position from jsonb_array_elements(
  (case when jsonb_typeof(before_value)='array' then before_value else jsonb_build_array(before_value) end) ||
  (case when jsonb_typeof(incoming)='array' then incoming else jsonb_build_array(incoming) end)
 ) with ordinality where value<>'null'::jsonb group by value) unique_values) end
$$;
revoke all on function public.memory_add_values(jsonb,jsonb) from public,anon;
grant execute on function public.memory_add_values(jsonb,jsonb) to authenticated;
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
      if coalesce(v_payload->>'mode','') not in ('add','correct') then
        raise exception 'Person update mode must be add or correct. Regenerate this proposal.' using errcode='22023';
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
          if v_payload->>'mode'='add' and v_field.key<>'notes' and v_before->v_field.key is distinct from 'null'::jsonb then
            raise exception 'An addition cannot replace an existing core fact. Generate an explicit correction.' using errcode='22023';
          end if;
          if v_payload->>'mode'='add' and v_field.value='null'::jsonb then
            raise exception 'An addition cannot clear a fact.' using errcode='22023';
          end if;
          if v_payload->>'mode'='add' and v_field.key='notes' and v_before->>'notes' is not null
            and strpos(coalesce(v_field.value #>> '{}',''),v_before->>'notes')=0 then
            raise exception 'Additive notes must retain previous notes.' using errcode='22023';
          end if;
          select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) into v_sources from public.entity_edges e
            where e.owner_id=v_owner and e.source_type='people' and e.source_id=v_person.id and e.relation_type='derived_from';
          insert into public.person_memory_revisions(owner_id,person_id,change_id,field_key,old_value,new_value,previous_sources,source_message_ids,operation)
            values(v_owner,v_person.id,v_change.id,v_field.key,v_before->v_field.key,v_field.value,v_sources,v_source_ids,v_payload->>'mode');
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
        if v_payload->>'mode'='add' then
          if v_field.value is distinct from public.memory_add_values(v_old,v_field.value) then
            raise exception 'Additive attributes must retain previous values. Regenerate the proposal.' using errcode='22023';
          end if;
        end if;
        if v_old is distinct from v_field.value then
          insert into public.person_memory_revisions(owner_id,person_id,change_id,field_key,old_value,new_value,previous_sources,source_message_ids,operation)
            values(v_owner,v_person.id,v_change.id,'attributes.' || v_field.key,coalesce(v_old,'null'::jsonb),v_field.value,coalesce(v_sources,'[]'::jsonb),v_source_ids,v_payload->>'mode');
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


commit;

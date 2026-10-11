-- Avoid reading calendar_events-only fields while validating other record types.
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
    -- Keep calendar-only field access inside its own branch. PL/pgSQL record fields
    -- are table-specific and cannot safely be referenced in a compound condition.
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

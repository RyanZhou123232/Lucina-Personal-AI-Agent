begin;
-- Credentials and execution receipts are server-only. No browser write grants.
create table public.google_connections (
 owner_id uuid primary key references public.profiles(id) on delete cascade,
 google_subject text not null,email text not null,scopes text[] not null,
 access_cipher text not null,refresh_cipher text not null,expires_at timestamptz not null,
 time_zone text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.google_actions (
 change_id uuid primary key references public.pending_changes(id) on delete cascade,
 owner_id uuid not null references public.profiles(id) on delete cascade,
 google_subject text not null,payload_hash text not null,
 state text not null check(state in ('preparing','prepared','executing','succeeded','failed','uncertain')),
 phase text not null check(phase in ('prepare','execute')),claim_token uuid not null,
 draft_id text,remote_id text,result jsonb,error_message text,
 updated_at timestamptz not null default now()
);
alter table public.google_connections enable row level security;
alter table public.google_actions enable row level security;
revoke all on public.google_connections,public.google_actions from public,anon,authenticated;
grant all on public.google_connections,public.google_actions to service_role;
alter table public.email_drafts add column change_id uuid unique references public.pending_changes(id) on delete restrict;
alter table public.email_drafts add column gmail_message_id text;
alter table public.calendar_events add column change_id uuid unique references public.pending_changes(id) on delete restrict;

create function public.google_action_claim(p_owner uuid,p_change uuid,p_phase text,p_hash text,p_snapshot jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.pending_changes%rowtype;a public.google_actions%rowtype;g public.google_connections%rowtype;k uuid;
begin
 if p_phase not in ('prepare','execute') or length(p_hash)<>64 then raise exception 'Invalid Google action.';end if;
 select * into c from public.pending_changes where id=p_change and owner_id=p_owner for update;
 if not found or c.change_type not in ('draft_email','create_calendar_event') then raise exception 'External proposal not found.';end if;
 if c.payload_json is distinct from p_snapshot then raise exception 'This proposal changed after it was reviewed. Reload Review before approving.';end if;
 select * into g from public.google_connections where owner_id=p_owner for update;
 if not found then raise exception 'Connect Google before preparing or approving this action.';end if;
 select * into a from public.google_actions where change_id=p_change and owner_id=p_owner for update;
 if a.google_subject is not null and a.google_subject<>g.google_subject then raise exception 'Reconnect the Google account used for this draft.';end if;
 if a.state='succeeded' then return to_jsonb(a)||jsonb_build_object('cached',true);end if;
 if a.state in ('preparing','executing','uncertain') then raise exception 'The previous Google action is in progress or its outcome is uncertain. Check Gmail or Calendar before trying again.';end if;
 if c.status='rejected' or c.status='committed' then raise exception 'This proposal is no longer actionable.';end if;
 if p_phase='prepare' then
  if c.change_type<>'draft_email' or c.status not in ('pending','failed') then raise exception 'Only unapproved email drafts can be prepared.';end if;
  if a.state='prepared' and a.payload_hash=p_hash then return to_jsonb(a)||jsonb_build_object('cached',true);end if;
 else
  if c.status not in ('pending','approved','failed') then raise exception 'This proposal cannot be approved.';end if;
  if c.change_type='draft_email' and (a.draft_id is null or a.payload_hash<>p_hash) then raise exception 'Prepare the current email draft before sending.';end if;
 end if;
 -- Every external action retains exact owned user-message evidence.
 if jsonb_typeof(c.payload_json #> '{provenance,source_quotes}') is distinct from 'array'
  or jsonb_array_length(c.payload_json #> '{provenance,source_quotes}')=0 then raise exception 'Original user-message evidence is required.';end if;
 if exists(select 1 from jsonb_array_elements(c.payload_json #> '{provenance,source_quotes}') q
  where not exists(select 1 from public.messages m where m.id=(q->>'messageId')::uuid and m.owner_id=p_owner
   and m.conversation_id=c.conversation_id and m.role='user' and length(btrim(q->>'quote'))>0 and strpos(m.content,q->>'quote')>0)) then
  raise exception 'External proposal source quotes could not be verified.';
 end if;
 k:=gen_random_uuid();
 insert into public.google_actions(change_id,owner_id,google_subject,payload_hash,state,phase,claim_token,draft_id)
 values(p_change,p_owner,g.google_subject,p_hash,case when p_phase='prepare' then 'preparing' else 'executing' end,p_phase,k,a.draft_id)
 on conflict(change_id) do update set payload_hash=excluded.payload_hash,state=excluded.state,phase=excluded.phase,
  claim_token=excluded.claim_token,error_message=null,updated_at=now();
 if p_phase='execute' then update public.pending_changes set status='approved',reviewed_at=now(),error_message=null where id=p_change and owner_id=p_owner;end if;
 return (select to_jsonb(r)||jsonb_build_object('cached',false) from public.google_actions r where change_id=p_change and owner_id=p_owner);
end;$$;

create function public.google_action_finish(p_owner uuid,p_change uuid,p_claim uuid,p_state text,p_draft text,p_remote text,p_result jsonb,p_error text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.google_actions%rowtype;c public.pending_changes%rowtype;entity uuid;kind text;source record;
begin
 select * into c from public.pending_changes where id=p_change and owner_id=p_owner for update;
 if not found then raise exception 'External proposal not found.';end if;
 select * into a from public.google_actions where change_id=p_change and owner_id=p_owner for update;
 if not found or a.claim_token<>p_claim or a.state not in ('preparing','executing') then raise exception 'External action receipt does not match its claim.';end if;
 if p_state not in ('prepared','succeeded','failed','uncertain') then raise exception 'Invalid external result state.';end if;
 if p_state='prepared' and (a.phase<>'prepare' or nullif(p_draft,'') is null) then raise exception 'Invalid draft receipt.';end if;
 if p_state='succeeded' and (a.phase<>'execute' or c.status<>'approved' or nullif(p_remote,'') is null) then raise exception 'Explicit approval and a provider receipt are required.';end if;
 if p_state='prepared' or (p_state='succeeded' and c.change_type='draft_email') then
  insert into public.email_drafts(owner_id,change_id,gmail_draft_id,to_email,cc_json,bcc_json,subject,body,status,source_conversation_id,gmail_message_id)
  values(p_owner,p_change,coalesce(p_draft,a.draft_id),p_result->>'to_email',p_result->'cc',p_result->'bcc',p_result->>'subject',p_result->>'body',case when p_state='succeeded' then 'sent' else 'created' end,c.conversation_id,p_remote)
  on conflict(change_id) do update set to_email=excluded.to_email,cc_json=excluded.cc_json,bcc_json=excluded.bcc_json,
   subject=excluded.subject,body=excluded.body,status=excluded.status,gmail_message_id=excluded.gmail_message_id
  returning id into entity;kind:='email_drafts';
 elsif p_state='succeeded' then
  insert into public.calendar_events(owner_id,change_id,google_event_id,calendar_id,title,start_at,end_at,source_conversation_id)
  values(p_owner,p_change,p_remote,'primary',p_result->>'title',(p_result->>'start_at')::timestamptz,(p_result->>'end_at')::timestamptz,c.conversation_id)
  on conflict(change_id) do update set google_event_id=excluded.google_event_id returning id into entity;kind:='calendar_events';
 end if;
 if entity is not null then
  for source in select distinct (q->>'messageId')::uuid as id from jsonb_array_elements(c.payload_json #> '{provenance,source_quotes}') q loop
   if not exists(select 1 from public.entity_edges where owner_id=p_owner and source_type=kind and source_id=entity and relation_type='derived_from' and target_id=source.id) then
    insert into public.entity_edges(owner_id,source_type,source_id,relation_type,target_type,target_id) values(p_owner,kind,entity,'derived_from','messages',source.id);
   end if;
  end loop;
 end if;
 update public.google_actions set state=p_state,draft_id=coalesce(p_draft,draft_id),remote_id=p_remote,result=p_result,
  error_message=p_error,updated_at=now() where change_id=p_change and owner_id=p_owner;
 if p_state='succeeded' then
  update public.pending_changes set status='committed',target_entity_type=kind,target_entity_id=entity,committed_at=now(),error_message=null where id=p_change and owner_id=p_owner;
 elsif p_state='prepared' then
  update public.pending_changes set status='pending',error_message=null where id=p_change and owner_id=p_owner;
 elsif p_state in ('failed','uncertain') then
  update public.pending_changes set status='failed',error_message=p_error where id=p_change and owner_id=p_owner;
 end if;
 return jsonb_build_object('status',p_state,'targetEntityId',entity,'remoteId',p_remote,'draftId',coalesce(p_draft,a.draft_id));
end;$$;
revoke all on function public.google_action_claim(uuid,uuid,text,text,jsonb),public.google_action_finish(uuid,uuid,uuid,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.google_action_claim(uuid,uuid,text,text,jsonb),public.google_action_finish(uuid,uuid,uuid,text,text,text,jsonb,text) to service_role;

-- Freeze the approved snapshot while Google is executing. Review edits remain
-- available before preparation/execution and after a definitive provider failure.
create function public.guard_google_proposal_edit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='rejected' and exists(select 1 from public.google_actions where change_id=old.id and state in ('preparing','executing')) then
  raise exception 'Wait for the in-progress Google action before rejecting this proposal.';
 end if;
 if old.change_type in ('draft_email','create_calendar_event') and exists(select 1 from public.google_actions where change_id=old.id and state in ('preparing','executing','uncertain','succeeded'))
  and (new.payload_json is distinct from old.payload_json or new.change_type is distinct from old.change_type or new.conversation_id is distinct from old.conversation_id or new.owner_id is distinct from old.owner_id) then
  raise exception 'This Google action is in progress, completed or uncertain; its approved contents cannot be changed.';
 end if;
 return new;
end;$$;
create trigger google_proposal_edit_guard before update on public.pending_changes for each row execute function public.guard_google_proposal_edit();

-- Serializes account changes with claims, so a token can never be used for a
-- different account from the action's bound Google subject.
create function public.guard_google_connection_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' or new.google_subject is distinct from old.google_subject then
  if exists(select 1 from public.google_actions where owner_id=old.owner_id and state in ('preparing','executing','uncertain')) then
   raise exception 'Resolve in-progress or uncertain Google actions before changing the account.';
  end if;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
create trigger google_connection_change_guard before update or delete on public.google_connections for each row execute function public.guard_google_connection_change();
commit;

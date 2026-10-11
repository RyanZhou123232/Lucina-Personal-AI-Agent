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
  select 'people'::text as kind, p.id, to_jsonb(p)-'owner_id' as value, p.updated_at as stamp from public.people p where p.owner_id=auth.uid()
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
order by (r.kind='messages') desc, r.matches*40+r.context_matches*5+r.person_boost desc, r.stamp desc, r.id
limit greatest(1,least(coalesce(p_limit,12),30));
$$;
revoke all on function public.search_personal_memory(text[],text,text[],text,uuid,integer) from public, anon;
grant execute on function public.search_personal_memory(text[],text,text[],text,uuid,integer) to authenticated;

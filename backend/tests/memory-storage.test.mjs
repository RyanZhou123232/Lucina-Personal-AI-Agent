// Optional database integration suite. Set PGLITE_MODULE to an installed
// @electric-sql/pglite entry point; no provider or hosted database is contacted.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
test('memory v6: reviewed storage, retrieval, histories and isolation', {skip:!process.env.PGLITE_MODULE}, async t=>{
 const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE).href);
 const db=new PGlite();
 const owner='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
 let serial=100;const id=()=>`00000000-0000-0000-0000-${String(serial++).padStart(12,'0')}`;
 try {
  await db.exec(`create schema auth;create role authenticated;create role anon;
   create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.owner',true),'')::uuid$$;`);
  for(const name of ['202610100001_personal_os_core.sql','202610100002_grant_authenticated_access.sql','202610100003_commit_approved_changes.sql','202610100004_fix_owned_relationship_trigger.sql','202610100007_memory_content_search.sql','202610100008_person_memory_updates.sql','202610110009_additive_memory.sql','202610110010_balanced_memory_retrieval.sql']) {
   await db.exec((await readFile(new URL('../../database/migrations/'+name,import.meta.url),'utf8')).replace('create extension if not exists pgcrypto;',''));
  }
  await db.exec(`grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
   insert into auth.users values('${owner}','fixture@example.invalid','{}'),('${other}','other@example.invalid','{}');`);
  const conv=id(),mira=id(),niko=id(),numeric=id();
  await db.query('insert into conversations(id,owner_id) values($1,$2)',[conv,owner]);
  let sequence=0;
  const source=async content=>{
   const message=id();await db.query("insert into messages(id,owner_id,conversation_id,role,content,sequence_number) values($1,$2,$3,'user',$4,$5)",[message,owner,conv,content,++sequence]);return{messageId:message,quote:content};
  };
  const seed=await source('Mira currently engineers at Cedar and likes noodles. Niko designs at Harbor and likes rice. 58 interns at Maple.');
  await db.query("insert into people(id,owner_id,name,company,role) values($1,$2,'Mira','Cedar','engineer'),($3,$2,'Niko','Harbor','designer'),($4,$2,'58','Maple','intern')",[mira,owner,niko,numeric]);
  for(const [person,value] of [[mira,'noodles'],[niko,'rice']]) await db.query("insert into entity_attributes(owner_id,entity_type,entity_id,key,value_json,source_type,source_id) values($1,'people',$2,'likes',$3,'messages',$4)",[owner,person,JSON.stringify(value),seed.messageId]);
  for(const person of [mira,niko,numeric]) await db.query("insert into entity_edges(owner_id,source_type,source_id,relation_type,target_type,target_id) values($1,'people',$2,'derived_from','messages',$3)",[owner,person,seed.messageId]);
  await db.exec(`set role authenticated;set test.owner='${owner}';`);
  const resolve=async name=>(await db.query('select * from resolve_person_name($1)',[name])).rows[0].resolve_person_name;
  const pending=async (person,name,mode,fields,attributes,sources,version)=>{
   const change=id();const before=await resolve(name);
   const payload={name,mode,fields,attributes,person_binding:{id:person,expected_updated_at:version??before.updated_at},provenance:{source_message_ids:sources.map(s=>s.messageId),source_quotes:sources}};
   await db.query("insert into pending_changes(id,owner_id,conversation_id,change_type,target_entity_type,target_entity_id,payload_json,confidence) values($1,$2,$3,'update_person','people',$4,$5,0.9)",[change,owner,conv,person,payload]);return change;
  };
  const commit=async change=>(await db.query('select commit_pending_change($1) as result',[change])).rows[0].result;
  const search=async (terms,name=null,limit=12)=>(await db.query("select * from search_personal_memory($1,$2,'{}',null,null,$3)",[terms,name,limit])).rows;
  await t.test('T01/T02: current state retains primary sources and does not invent absent fields',async()=>{
   const rows=await search(['Mira'],'Mira');assert.equal(rows[0].record.company,'Cedar');
   assert.ok(rows[0].sources.some(s=>s.id===seed.messageId));assert.equal(rows[0].record.attributes.birthday,undefined);
  });
  await t.test('T03/T04: independent attributes coexist, separate people retain their facts',async()=>{
   const pottery=await source('Mira started pottery.');
   const destructive=await pending(mira,'Mira','add',{}, {likes:'pottery'},[pottery]);
   await assert.rejects(commit(destructive),/retain previous/);
   assert.equal((await resolve('Mira')).attributes.likes,'noodles');
   await commit(await pending(mira,'Mira','add',{}, {likes:['noodles','pottery']},[pottery]));
   const cups=await source('She likes making cups on weekends.');
   await commit(await pending(mira,'Mira','add',{}, {weekend:'cups'},[pottery,cups]));
   const guitar=await source('Switching subjects: Niko started guitar.');
   await commit(await pending(niko,'Niko','add',{}, {interests:'guitar'},[guitar]));
   assert.deepEqual((await resolve('Mira')).attributes.likes,['noodles','pottery']);
   assert.equal((await resolve('Niko')).attributes.likes,'rice');
  });
  await t.test('T05/T06: original statement plus confirmation survive; future plans do not replace current state',async()=>{
   const meal=await source('I had dinner with Mira and Niko.');
   await source('The cafe was noisy.');await source('It was raining.');await source('Dinner was late.');
   const plan=await source('Someone said he will join Spruce next month.');
   const confirmation=await source('It was Niko.');
   const blocked=await pending(niko,'Niko','add',{company:'Spruce'},{},[plan,confirmation]);
   await assert.rejects(commit(blocked),/cannot replace/);
   await commit(await pending(niko,'Niko','add',{}, {future_plan:'Join Spruce next month',unresolved_time:'next month'},[plan,confirmation]));
   const rows=await search(['Niko','Spruce'],'Niko');const record=rows.find(r=>r.entity_id===niko);
   assert.equal(record.record.company,'Harbor');assert.ok(record.sources.some(s=>s.id===plan.messageId));
   const retrieved=rows.find(r=>r.entity_id===plan.messageId);assert.ok(retrieved.sources[0].context.some(s=>s.id===meal.messageId));
  });
  await t.test('T07: correction changes only the requested state; old employer and preference remain evidenced',async()=>{
   const update=await source('Update: Mira left Cedar and now engineers at Willow.');
   await commit(await pending(mira,'Mira','correct',{company:'Willow'}, {},[update]));
   const record=(await search(['Mira'],'Mira'))[0];assert.equal(record.record.company,'Willow');
   assert.deepEqual(record.record.attributes.likes,['noodles','pottery']);
   assert.ok(record.record.field_history.some(h=>h.field_key==='company' && h.old_value==='Cedar' && h.operation==='correct'));
   assert.ok(record.record.field_history.some(h=>h.field_key==='attributes.likes' && h.operation==='add'));
   assert.ok(record.sources.some(s=>s.id===seed.messageId));
  });
  await t.test('T08: cancellation replaces a plan and clears relative time without changing employer',async()=>{
   const cancel=await source('Niko cancelled Spruce and still works at Harbor.');
   await commit(await pending(niko,'Niko','correct',{}, {future_plan:'Cancelled Spruce',unresolved_time:null},[cancel]));
   const record=await resolve('Niko');assert.equal(record.company,'Harbor');assert.equal(record.attributes.future_plan,'Cancelled Spruce');assert.equal(record.attributes.unresolved_time,null);
  });
  await t.test('T09: numeric names are resolved exactly and retain their own sources',async()=>{
   const watercolor=await source('58 likes watercolor.');
   await commit(await pending(numeric,'58','add',{}, {interests:'watercolor'},[watercolor]));
   assert.equal((await resolve('58')).attributes.interests,'watercolor');
   assert.equal((await search(['58'],'58'))[0].entity_id,numeric);
  });
  await t.test('T10: original facts remain retrievable under message crowding',async()=>{
   for(let i=0;i<18;i++) await source('Mira discussed another project '+i);
   const rows=await search(['Mira'],'Mira');assert.equal(rows.length,12);
   assert.ok(rows.some(r=>r.entity_type==='messages'));
   const person=rows.find(r=>r.entity_id===mira);assert.ok(person);assert.ok(person.sources.some(s=>s.id===seed.messageId));
   assert.deepEqual(person.record.attributes.likes,['noodles','pottery']);
  });
  await t.test('atomicity, stale versions, idempotence and additive database guards',async()=>{
   const quote=await source('Mira additional information.');const version=(await resolve('Mira')).updated_at;
   const first=await pending(mira,'Mira','add',{}, {extra:'one'},[quote],version);
   const stale=await pending(mira,'Mira','add',{}, {extra:'two'},[quote],version);
   await commit(first);assert.equal((await commit(first)).alreadyCommitted,true);await assert.rejects(commit(stale),/changed after/);
   const rollback=await pending(mira,'Mira','correct',{company:'Bad'}, {likes:'x'.repeat(20001)},[quote]);
   await assert.rejects(commit(rollback),/Invalid person attribute/);assert.equal((await resolve('Mira')).company,'Willow');
   const beforeCount=(await db.query('select count(*)::int as count from person_memory_revisions')).rows[0].count;
   const missingMode=await pending(mira,'Mira',null,{}, {extra:'bad'},[quote]);await assert.rejects(commit(missingMode),/mode must/);
   assert.equal((await db.query('select count(*)::int as count from person_memory_revisions')).rows[0].count,beforeCount);
   const merged=(await db.query("select memory_add_values('{\"a\":1,\"b\":2}', '{\"b\":2,\"a\":1}') as value")).rows[0].value;
   assert.deepEqual(merged,{a:1,b:2});
  });
  await t.test('owner isolation and anonymous access remain enforced',async()=>{
   await db.exec(`set test.owner='${other}';`);assert.equal((await search(['Mira'])).length,0);
   assert.equal((await db.query('select * from person_memory_revisions')).rows.length,0);
   await db.exec('reset role;set role anon;');await assert.rejects(db.query("select * from resolve_person_name('Mira')"),/permission denied/);
  });
 } finally {await db.close();}
});

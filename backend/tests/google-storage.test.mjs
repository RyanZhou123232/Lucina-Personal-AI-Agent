import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
test('Google storage: approval receipts, account ownership, snapshot locking and uncertain writes',{skip:!process.env.PGLITE_MODULE},async t=>{
 const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE).href),db=new PGlite();
 const owner='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';let serial=100;
 const id=()=>`00000000-0000-0000-0000-${String(serial++).padStart(12,'0')}`;
 try{
  await db.exec(`create schema auth;create role authenticated;create role anon;create role service_role bypassrls;
   create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.owner',true),'')::uuid$$;`);
  for(const file of ['202610100001_personal_os_core.sql','202610100002_grant_authenticated_access.sql','202610100004_fix_owned_relationship_trigger.sql','202610110011_google_integrations.sql','202610110012_google_execution_permissions.sql']){
   await db.exec((await readFile(new URL('../../database/migrations/'+file,import.meta.url),'utf8')).replace('create extension if not exists pgcrypto;',''));
  }
  await db.exec(`grant usage on schema public,auth to service_role;grant execute on function auth.uid() to service_role;
   insert into auth.users values('${owner}','owner@example.invalid','{}'),('${other}','other@example.invalid','{}');`);
  const conv=id(),source=id();
  await db.query('insert into conversations(id,owner_id) values($1,$2)',[conv,owner]);
  await db.query("insert into messages(id,owner_id,conversation_id,role,content,sequence_number) values($1,$2,$3,'user','Draft an email to alex@example.com',1)",[source,owner,conv]);
  await db.query("insert into google_connections(owner_id,google_subject,email,scopes,access_cipher,refresh_cipher,expires_at,time_zone) values($1,'google-owner','owner@example.invalid','{}','encrypted','encrypted',now(),'America/New_York')",[owner]);
  const payload={to_email:'alex@example.com',cc:[],bcc:[],subject:'Hello',body:'Test draft',provenance:{source_quotes:[{messageId:source,quote:'Draft an email to alex@example.com'}]}};
  async function pending(type='draft_email',p=payload){const change=id();await db.exec(`set role authenticated;set test.owner='${owner}';`);await db.query("insert into pending_changes(id,owner_id,conversation_id,change_type,payload_json) values($1,$2,$3,$4,$5)",[change,owner,conv,type,p]);await db.exec('reset role;set role service_role;');return change;}
  const claim=async(change,phase='prepare',snapshot=payload,pOwner=owner)=>(await db.query('select google_action_claim($1,$2,$3,$4,$5) as result',[pOwner,change,phase,'a'.repeat(64),snapshot])).rows[0].result;
  const finish=async(change,action,state,draft='draft-123',remote=null,result={to_email:'alex@example.com',cc:[],bcc:[],subject:'Hello',body:'Test draft'})=>(await db.query('select google_action_finish($1,$2,$3,$4,$5,$6,$7,$8) as result',[owner,change,action.claim_token,state,draft,remote,result,state==='uncertain'?'Check Google':null])).rows[0].result;
  const change=await pending();await db.exec('set role service_role;');
  await t.test('preparing a Gmail draft is not approval and does not commit a send',async()=>{
   const action=await claim(change);assert.equal(action.state,'preparing');await finish(change,action,'prepared');
   assert.equal((await db.query('select status from pending_changes where id=$1',[change])).rows[0].status,'pending');
   assert.equal((await db.query('select status from email_drafts')).rows[0].status,'created');assert.equal((await claim(change)).cached,true);
  });
  await t.test('explicit execution records a single send receipt and freezes contents',async()=>{
   const action=await claim(change,'execute');
   await assert.rejects(db.query("update google_connections set google_subject='another-account' where owner_id=$1",[owner]),/changing the account/);
   await assert.rejects(db.query('delete from google_connections where owner_id=$1',[owner]),/changing the account/);
   await assert.rejects(db.query("update pending_changes set payload_json=payload_json||'{\"body\":\"edited after approval\"}' where id=$1",[change]),/cannot be changed/);
   await assert.rejects(db.query("update pending_changes set status='rejected' where id=$1",[change]),/in-progress/);
   await assert.rejects(claim(change,'execute'),/in progress/);
   await finish(change,action,'succeeded','draft-123','message-123');
   assert.equal((await db.query('select status from pending_changes where id=$1',[change])).rows[0].status,'committed');
   assert.equal((await db.query('select gmail_message_id from email_drafts')).rows[0].gmail_message_id,'message-123');
   assert.equal((await claim(change,'execute')).cached,true);assert.equal((await db.query('select count(*)::int as n from email_drafts')).rows[0].n,1);
  });
  await t.test('stale approval snapshots, foreign owner requests and false quotes are blocked',async()=>{
   const next=await pending();await assert.rejects(claim(next,'prepare',{...payload,body:'wrong'}),/changed after/);
   await assert.rejects(claim(next,'prepare',payload,other),/not found/);
   const forged={...payload,provenance:{source_quotes:[{messageId:source,quote:'Invented text'}]}};
   const bad=await pending('draft_email',forged);await assert.rejects(claim(bad,'prepare',forged),/could not be verified/);
  });
  await t.test('uncertain execution never authorizes another send',async()=>{
   const next=await pending();const prep=await claim(next);await finish(next,prep,'prepared','draft-next');
   const sending=await claim(next,'execute');await finish(next,sending,'uncertain','draft-next');
   await assert.rejects(claim(next,'execute'),/uncertain/);
   await assert.rejects(db.query("update pending_changes set payload_json=payload_json||'{\"body\":\"changed\"}' where id=$1",[next]),/cannot be changed/);
  });
  await t.test('calendar preview does not create an event; execution stores a provider event receipt',async()=>{
   const event={title:'Coffee',start_local:'2026-10-12T15:00',end_local:'2026-10-12T16:00',time_zone:'America/New_York',provenance:payload.provenance};
   const next=await pending('create_calendar_event',event);
   assert.equal((await db.query('select count(*)::int as n from calendar_events')).rows[0].n,0);
   const action=await claim(next,'execute',event);
   await finish(next,action,'succeeded',null,'pos123',{title:'Coffee',start_at:'2026-10-12T19:00:00Z',end_at:'2026-10-12T20:00:00Z'});
   assert.equal((await db.query('select google_event_id from calendar_events')).rows[0].google_event_id,'pos123');
   assert.equal((await db.query("select count(*)::int as n from entity_edges where source_type='calendar_events'")).rows[0].n,1);
  });
  await t.test('credentials and execution RPCs are inaccessible to browser roles',async()=>{
   await db.exec(`reset role;set role authenticated;set test.owner='${owner}';`);
   await assert.rejects(db.query('select * from google_connections'),/permission denied/);
   await assert.rejects(db.query('select * from google_actions'),/permission denied/);
   await assert.rejects(claim(change),/permission denied/);
   await db.exec('reset role;set role anon;');await assert.rejects(claim(change),/permission denied/);
  });
 }finally{await db.close();}
});

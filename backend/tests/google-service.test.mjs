import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {seal,googleScopes,GoogleError} from '../lib/google-api.ts';
let source=stripTypeScriptTypes(await readFile(new URL('../lib/google-service.ts',import.meta.url),'utf8'));
source=source.replace(/import[^;]+from '@supabase\/supabase-js';/,'const createClient=()=>{throw new Error("Unexpected live database")};');
source=source.replace("'@/lib/google-api'",JSON.stringify(new URL('../lib/google-api.ts',import.meta.url).href));
const {prepareGmailDraft,executeGoogleAction}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const oldKey=process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
process.env.GOOGLE_TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,9).toString('base64');
test.after(()=>{if(oldKey===undefined)delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;else process.env.GOOGLE_TOKEN_ENCRYPTION_KEY=oldKey;});
function fixture(kind='draft_email'){
 const row={id:'353bd499-fc33-4e3a-84ea-b41f64b4f425',owner_id:'owner',change_type:kind,status:'pending',payload_json:kind==='draft_email'?{to_email:'self@example.com',subject:'Review',body:'Approved contents'}:{title:'Coffee',start_local:'2026-10-12T15:00',end_local:'2026-10-12T16:00',time_zone:'America/New_York'}};
 const account={owner_id:'owner',scopes:googleScopes,access_cipher:seal('mock-token','owner'),expires_at:new Date(Date.now()+3600000).toISOString()};
 const f={row,action:null,calls:[],finishCalls:[]};
 f.db={from(table){const filters={};const q={select(){return q},eq(key,value){filters[key]=value;return q},async maybeSingle(){const value=table==='pending_changes'?f.row:table==='google_connections'?account:f.action;return{data:value&&Object.entries(filters).every(([k,v])=>value[k]===v)?value:null,error:null}}};return q},async rpc(name,args){
  if(name==='google_action_claim'){
   if(args.p_owner!=='owner')return{error:{message:'Owner mismatch'}};
   if(f.action?.state==='succeeded'||(args.p_phase==='prepare'&&f.action?.state==='prepared'&&f.action.payload_hash===args.p_hash))return{data:{...f.action,cached:true}};
   f.action={...f.action,owner_id:'owner',change_id:row.id,state:args.p_phase==='prepare'?'preparing':'executing',claim_token:'claim',payload_hash:args.p_hash};return{data:{...f.action}};
  }
  f.finishCalls.push(args);f.action={...f.action,state:args.p_state,draft_id:args.p_draft,remote_id:args.p_remote};if(args.p_state==='succeeded')row.status='committed';return{data:{}};
 }};
 f.fetch=async(url,options)=>{f.calls.push({url,options,body:JSON.parse(options.body)});return Response.json({id:url.endsWith('/send')?'sent-1':url.includes('calendar')?'event-1':'draft-1'})};return f;
}
async function withFetch(f,run){const original=globalThis.fetch;globalThis.fetch=f.fetch;try{await run()}finally{globalThis.fetch=original}}
test('preparation creates only an unsent draft; explicit execution sends and duplicate approval is cached',async()=>{
 const f=fixture();await withFetch(f,async()=>{
  await prepareGmailDraft('owner',f.row.id,f.db);assert.equal(f.calls.length,1);assert.ok(f.calls[0].url.endsWith('/drafts'));assert.equal(f.action.state,'prepared');assert.equal(f.row.status,'pending');
  await executeGoogleAction('owner',f.row.id,f.row.payload_json,f.db);assert.equal(f.calls.length,3);assert.equal(f.calls[1].options.method,'PUT');assert.ok(f.calls[2].url.endsWith('/drafts/send'));assert.equal(f.row.status,'committed');
  const cached=await executeGoogleAction('owner',f.row.id,f.row.payload_json,f.db);assert.equal(cached.alreadyCommitted,true);assert.equal(f.calls.length,3);
 });
});
test('stale review contents and another owner cause no provider writes',async()=>{
 const f=fixture();await withFetch(f,async()=>{
  await assert.rejects(executeGoogleAction('owner',f.row.id,{...f.row.payload_json,body:'Old'},f.db),/changed/);
  await assert.rejects(prepareGmailDraft('other-owner',f.row.id,f.db),/not found/);assert.equal(f.calls.length,0);
 });
});
test('uncertain send outcome blocks any duplicate execution',async()=>{
 const f=fixture();const base=f.fetch;f.fetch=async(url,options)=>{if(url.endsWith('/send')){f.calls.push({url});throw new Error('network lost')}return base(url,options)};
 await withFetch(f,async()=>{
  await assert.rejects(executeGoogleAction('owner',f.row.id,f.row.payload_json,f.db),GoogleError);assert.equal(f.action.state,'uncertain');const count=f.calls.length;
  await assert.rejects(executeGoogleAction('owner',f.row.id,f.row.payload_json,f.db),/automatic retry is blocked/);assert.equal(f.calls.length,count);
 });
});
test('calendar approval creates one event using reviewed zone and suppresses invitations by default',async()=>{
 const f=fixture('create_calendar_event');await withFetch(f,async()=>{
  assert.equal(f.calls.length,0);await executeGoogleAction('owner',f.row.id,f.row.payload_json,f.db);assert.equal(f.calls.length,1);
  assert.match(f.calls[0].url,/sendUpdates=none$/);assert.equal(f.calls[0].body.start.dateTime,'2026-10-12T19:00:00.000Z');assert.equal(f.calls[0].body.start.timeZone,'America/New_York');assert.match(f.calls[0].body.id,/^[0-9a-v]+$/);
 });
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
function setup({guest=false,searchError=false}={}) {
  const rows=[{id:'original',role:'user',content:'I promised Alex a deck',sequence_number:1}];
  const evidence=[{citationId:'M1',entityType:'tasks',entityId:'task',record:{title:'Send deck'},sources:[{id:'original',content:rows[0].content}]}];
  const calls=[]; const writes=[];
  const supabase={from(table){ let insertion; const q={
    select(){return q},eq(){return q},order(){return q},limit(){return q},update(){return q},
    insert(value){insertion=value;writes.push({table,value});return q},
    async maybeSingle(){return {data:table==='conversations'?{id:'conversation'}:rows.at(-1),error:null}},
    async range(){return {data:[...rows],error:null}},
    async single(){const row={id:'saved-'+rows.length,...insertion};rows.push(row);return{data:row,error:null}},
    then(resolve){resolve({data:[],error:null})}
  }; return q;}};
  const fixture={user:guest?null:{id:'owner'},supabase,
    async createMemoryPlan(chat){calls.push({step:'plan',chat});return{intent:'lookup',terms:['Alex'],personName:'Alex',entityTypes:['tasks'],taskStatus:null}},
    async retrieveMemory(client,plan,exclude){assert.equal(client,supabase); calls.push({step:'retrieve',exclude});if(searchError)throw new Error('Memory search failed');return{plan,evidence}},
    async createAgentTurn(chat,memory){calls.push({step:'answer',memory});return{reply:'You promised a deck [M1]',proposals:[],grounding:{tier:'EXACT',citations:['M1']}}}};
  fixture.calls=calls; globalThis.memoryRouteFixture=fixture;return{rows,calls,writes};
}
let code=stripTypeScriptTypes(await readFile(new URL('../routes/conversations/[conversationId]/messages/route.ts',import.meta.url),'utf8'));
code=code.replace(/import[^;]+from "next\/server";/,'const NextResponse={json:(value,options)=>Response.json(value,options)};');
code=code.replace(/import[^;]+from "@\/lib\/http";/,'const getAuthenticatedUser=async()=>globalThis.memoryRouteFixture;const apiError=(error,status=400)=>Response.json({error},{status});');
code=code.replace(/import[^;]+from "@\/lib\/deepseek";/,'const verifyAgentTurn=(turn)=>{globalThis.memoryRouteFixture.calls.push({step:"verify"});if(globalThis.memoryRouteFixture.verificationError)throw new Error("Evidence verification unavailable");return turn};const createMemoryPlan=(...args)=>globalThis.memoryRouteFixture.createMemoryPlan(...args);const createAgentTurn=(...args)=>globalThis.memoryRouteFixture.createAgentTurn(...args);');
code=code.replace(/import[^;]+from "@\/lib\/memory";/,'const retrieveMemory=(...args)=>globalThis.memoryRouteFixture.retrieveMemory(...args);');
code=code.replace('"@/lib/person-memory"',JSON.stringify(new URL('../lib/person-memory.ts',import.meta.url).href));
code=code.replace(/import[^;]+from '\@\/lib\/google-proposals';/,'const bindGoogleProposals=turn=>turn;');
code=code.replace(/import[^;]+from '\@\/lib\/google-service';/,'const googleConfigured=()=>false;const prepareGmailDraft=async()=>{};');
code=code.replace(/import[^;]+from '\@\/lib\/google-api';/,'const validZone=value=>value;');
const { POST }=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const post=()=>POST(new Request('http://localhost/api/messages',{method:'POST',body:JSON.stringify({content:'What did I promise Alex?'})}),{params:Promise.resolve({conversationId:'conversation'})});
const originalKey=process.env.DEEPSEEK_API_KEY;process.env.DEEPSEEK_API_KEY='mock-key';
test('chat retrieves before answering and persists evidence metadata',async()=>{
  const {rows,calls}=setup();const result=await post();const body=await result.json();
  assert.equal(result.status,201);assert.deepEqual(calls.map(call=>call.step),['plan','retrieve','answer','verify']);assert.equal(calls[1].exclude,body.userMessage.id);
  assert.equal(rows.at(-1).metadata.memory.tier,'EXACT');assert.equal(rows.at(-1).metadata.memory.evidence[0].sources[0].id,'original');assert.deepEqual(body.pendingChanges,[]);
});
test('search failure preserves user message but writes no invented answer',async()=>{
  const {rows,calls}=setup({searchError:true});const body=await(await post()).json();assert.equal(body.assistantMessage,null);assert.match(body.warning,/Memory search failed/);assert.equal(rows.length,2);assert.ok(!calls.some(call=>call.step==='answer'));
});
test('unauthenticated chat performs no memory lookup',async()=>{
  const {calls}=setup({guest:true});assert.equal((await post()).status,401);assert.equal(calls.length,0);
});
test('evidence-verifier outage retains user input but creates no assistant or proposals',async()=>{
  const {rows}=setup();globalThis.memoryRouteFixture.verificationError=true;
  const body=await(await post()).json();assert.equal(body.assistantMessage,null);assert.equal(rows.length,2);assert.match(body.warning,/verification/);
});
test.after(()=>{if(originalKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=originalKey});



test('conversation binds the existing person before verification and stages an update without writing people',async()=>{
 const {writes}=setup();const fixture=globalThis.memoryRouteFixture;
 fixture.createMemoryPlan=async()=>({intent:'conversation',terms:['Alex'],personName:'Alex',entityTypes:['people'],taskStatus:null});
 fixture.createAgentTurn=async()=>({reply:'Review this',proposals:[{changeType:'create_person',targetEntityType:'people',confidence:0.9,payload:{name:'Alex',mode:'correct',company:'New company'},sourceQuotes:[{messageId:'saved-1',quote:'New company'}]}]});
 fixture.supabase.rpc=async(name,args)=>{assert.equal(name,'resolve_person_name');assert.equal(args.p_name,'Alex');return{data:[{id:'existing-person',name:'Alex',company:'Old company',updated_at:'2026-10-10T01:00:00Z',attributes:{}}],error:null}};
 const response=await post();const body=await response.json();assert.equal(body.warning,null);
 const pending=writes.find(write=>write.table==='pending_changes').value[0];
 assert.equal(pending.change_type,'update_person');assert.equal(pending.target_entity_id,'existing-person');
 assert.deepEqual(pending.payload_json.fields,{company:'New company'});
 assert.ok(!writes.some(write=>write.table==='people'));
 assert.deepEqual(pending.payload_json.provenance.source_message_ids,['saved-1']);
});

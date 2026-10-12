import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMemoryPlan, retrieveMemory, validateMemoryAnswer, validateCitationSupport, scopeMemoryForLookup } from '../lib/memory.ts';
const value = {intent:'lookup',needs_memory:true,allow_proposals:false,terms:['Alex'],person_name:'Alex',entity_types:['tasks'],task_status:null};
const plan = parseMemoryPlan(value);
const row = {entity_type:'tasks',entity_id:'task-1',record:{title:'Send deck',status:'pending'},sources:[{id:'source-1',content:'I promised Alex a deck',conversation_id:'c',created_at:'2026-10-10'}],score:10};
test('query plan allowlists filters and bounds input', () => {
  assert.deepEqual(plan.terms,['Alex']);
  for (const bad of [{...value,entity_types:['profiles']},{...value,terms:['x'.repeat(101)]},{...value,person_name:5},{...value,task_status:'hacked'},{...value,intent:'unknown'}]) assert.throws(()=>parseMemoryPlan(bad));
});

test('retrieval preserves candidates and full source context across subject patterns',()=>{
  const ctx=[{id:'anchor',content:'I met Morgan',sequence_number:1},{id:'aside',content:'The cafe was noisy',sequence_number:2}];
  for(const content of ['He works at a lab','About him: he works at a lab','他的公司在这里','23 works at a lab']) {
    const evidence=[{citationId:'M1',entityType:'messages',entityId:'career',record:{},sources:[{id:'career',content,context:ctx}]}];
    const input={plan:{...plan,personName:'Morgan'},evidence};
    const memory=scopeMemoryForLookup(input);
    assert.deepEqual(memory,input);assert.deepEqual(memory.evidence[0].sources[0].context,ctx);
    validateCitationSupport([{citation_id:'M1',message_id:'career',quote:content}],['M1'],memory);
  }
});

test('task completion uses exact saved state rather than pretending it was in the original quote',()=>{
  const memory={plan,evidence:[{citationId:'M4',entityType:'tasks',entityId:'task-4',record:{status:'completed',completed_at:'2026-10-10T12:00:00Z'},sources:row.sources}]};
  const state={kind:'record',citation_id:'M4',entity_id:'task-4',field:'status',value:'completed'};
  assert.equal(validateCitationSupport([state],['M4'],memory)[0].kind,'record');
  for(const bad of [{...state,entity_id:'wrong'},{...state,field:'title'},{...state,value:'pending'},{...state,field:'completed_at',value:null}])assert.throws(()=>validateCitationSupport([bad],['M4'],memory),/Current task state/);
  assert.throws(()=>validateCitationSupport([state],['M4'],{...memory,evidence:[{...memory.evidence[0],entityType:'people'}]}));
});
test('retrieval uses parameterized RPC, excludes current message and preserves sources', async () => {
  const calls=[]; const memory=await retrieveMemory({rpc:async(name,args)=>{calls.push({name,args});return{data:[row],error:null}}},plan,'current-question');
  assert.equal(calls[0].name,'search_personal_memory'); assert.equal(calls[0].args.p_exclude_message_id,'current-question');
  assert.equal(memory.evidence[0].citationId,'M1'); assert.equal(memory.evidence[0].sources[0].id,'source-1');
});
test('retrieval failure or missing migration never becomes no-evidence success', async () => {
  await assert.rejects(retrieveMemory({rpc:async()=>({data:null,error:{message:'function search_personal_memory missing'}})},plan,'x'),/Run migration/);
  await assert.rejects(retrieveMemory({rpc:async()=>({data:null,error:{message:'network error'}})},plan,'x'),/Memory search failed/);
  await assert.rejects(retrieveMemory({rpc:async()=>({data:{},error:null})},plan,'x'),/invalid result/);
});
test('citation gate rejects invented records and unsupported exact claims', async () => {
  const memory=await retrieveMemory({rpc:async()=>({data:[row],error:null})},plan,'x');
  assert.deepEqual(validateMemoryAnswer({reply:'Deck [M1]',evidence_tier:'EXACT',citations:['M1']},memory),{tier:'EXACT',citations:['M1']});
  for (const value of [{reply:'Fake [M9]',evidence_tier:'EXACT',citations:['M1']},{evidence_tier:'EXACT',citations:['M9']},{evidence_tier:'EXACT',citations:[]},{evidence_tier:'NONE',citations:['M1']},{citations:[]}]) assert.throws(()=>validateMemoryAnswer(value,memory));
});
test('lookup includes canonical messages even when planner only selects structured types',async()=>{
  let args;
  const raw={...row,entity_type:'messages',entity_id:'original',record:{content:'Alex promised a deck'},score:1};
  const memory=await retrieveMemory({rpc:async(_name,value)=>{args=value;return{data:[raw,row],error:null}}},plan,'x');
  assert.ok(args.p_entity_types.includes('messages'));assert.equal(memory.evidence[0].entityType,'messages');
});

test('citation quotes cannot borrow facts from surrounding context or another source', () => {
  const memory={plan,evidence:[{citationId:'M1',entityType:'messages',entityId:'q',record:{content:'What did I promise Alex?'},sources:[{id:'q',content:'What did I promise Alex?',context:[{id:'fact',content:'I promised Alex a deck'}]}]}, {citationId:'M2',entityType:'messages',entityId:'fact',record:{},sources:[{id:'fact',content:'I promised Alex a deck'}]}]};
  const quote={citation_id:'M2',message_id:'fact',quote:'I promised Alex a deck'};
  assert.equal(validateCitationSupport([quote],['M2'],memory)[0].messageId,'fact');
  assert.throws(()=>validateCitationSupport([{...quote,citation_id:'M1'}],['M1'],memory),/original supporting/);
  assert.throws(()=>validateCitationSupport([{...quote,quote:'Alex works at CMU'}],['M2'],memory));
  assert.throws(()=>validateCitationSupport([],['M2'],memory),/no precise/);
});

test('valid excess keywords normalize without blocking a multi-person input',()=>{
 const terms=['Mira','Cedar','工程师','面条','Niko','Harbor','设计师','米饭','58','Maple','实习'];
 const normalized=parseMemoryPlan({...value,terms});
 assert.deepEqual(normalized.terms,terms.slice(0,8));
 assert.deepEqual(parseMemoryPlan({...value,terms:[' Mira ','','Mira','  ','Niko']}).terms,['Mira','Niko']);
 assert.throws(()=>parseMemoryPlan({...value,terms:[58]}));
 assert.throws(()=>parseMemoryPlan({...value,terms:Array(33).fill('x')}));
});

test('raw source UUIDs and malformed memory labels cannot pass as inline citations',()=>{
 const memory={plan,evidence:[{citationId:'M1',entityType:'messages',entityId:'x',record:{},sources:[]}]};
 for(const label of ['1d7b5659-fc40-4577-8ab2-99ded60cc4a5','M99','M1 M9']) {
  assert.throws(()=>validateMemoryAnswer({reply:'Claim ['+label+']',evidence_tier:'EXACT',citations:['M1']},memory),/unverified/);
 }
});

test('retrieval and proposal permissions are independent and malformed flags fail closed',()=>{
  for(const needs_memory of [false,true])for(const allow_proposals of [false,true]){
    const parsed=parseMemoryPlan({...value,needs_memory,allow_proposals});
    assert.equal(parsed.needsMemory,needs_memory);assert.equal(parsed.allowProposals,allow_proposals);
  }
  for(const bad of [{...value,needs_memory:undefined},{...value,allow_proposals:undefined},{...value,allow_proposals:'true'}])assert.throws(()=>parseMemoryPlan(bad),/independently/);
});
test('fully specified new action does not search unrelated private history',async()=>{
  const actionPlan=parseMemoryPlan({...value,needs_memory:false,allow_proposals:true,terms:[],person_name:null,entity_types:[]});
  const context=await retrieveMemory({rpc:()=>{throw new Error('Unexpected history search')}},actionPlan,'latest');
  assert.deepEqual(context.evidence,[]);assert.equal(context.plan.allowProposals,true);
});

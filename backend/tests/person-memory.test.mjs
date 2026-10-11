import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindPersonProposals } from '../lib/person-memory.ts';
const person={id:'saved-person',name:'Alex',updated_at:'2026-10-10T01:00:00Z',company:'Old company',notes:'Robotics',attributes:{hobby:'Chess'}};
const turn=(type,payload)=>({reply:'Review this',proposals:[{changeType:type,targetEntityType:'people',confidence:0.9,payload,sourceQuotes:[{messageId:'source',quote:'Alex joined New company'}]}]});
const client=(rows)=>({rpc:async(name,args)=>{assert.equal(name,'resolve_person_name');assert.equal(args.p_name,'alex');return{data:rows,error:null}}});
test('existing exact person becomes an update with server ID/version and before values',async()=>{
 const result=await bindPersonProposals(turn('create_person',{name:' alex ',mode:'correct',company:'New company',person_binding:{id:'forged'}}),client([person]));
 const proposal=result.proposals[0]; assert.equal(proposal.changeType,'update_person');assert.equal(proposal.targetEntityId,person.id);
 assert.deepEqual(proposal.payload.fields,{company:'New company'});assert.equal(proposal.payload.person_binding.expected_updated_at,person.updated_at);
 assert.deepEqual(proposal.payload.person_binding.before,{company:'Old company'});
});
test('same-name ambiguity withholds writes, never selects the first row',async()=>{
 const result=await bindPersonProposals(turn('create_person',{name:'alex',company:'New company'}),client([person,{...person,id:'other'}]));
 assert.equal(result.proposals.length,0);assert.match(result.warning,/多个人/);
});
test('new people can be created; missing update target cannot',async()=>{
 assert.equal((await bindPersonProposals(turn('create_person',{name:'alex'}),client([]))).proposals[0].changeType,'create_person');
 assert.equal((await bindPersonProposals(turn('update_person',{name:'alex',fields:{company:'New company'}}),client([]))).proposals.length,0);
});
test('additive notes retain old facts; explicit correction replaces notes',async()=>{
 let result=await bindPersonProposals(turn('create_person',{name:'alex',notes:'Climbing'}),client([person]));
 assert.equal(result.proposals[0].payload.fields.notes,'Robotics\nClimbing');
 result=await bindPersonProposals(turn('update_person',{name:'alex',mode:'correct',fields:{notes:'Climbing'}}),client([person]));
 assert.equal(result.proposals[0].payload.fields.notes,'Climbing');
});
test('unchanged facts are not re-proposed; attributes preserve before snapshot',async()=>{
 assert.equal((await bindPersonProposals(turn('create_person',{name:'alex',company:'Old company',attributes:{hobby:'Chess'}}),client([person]))).proposals.length,0);
 const result=await bindPersonProposals(turn('create_person',{name:'alex',attributes:{hobby:'Climbing'}}),client([person]));
 assert.deepEqual(result.proposals[0].payload.person_binding.before_attributes,{hobby:'Chess'});
});
test('interaction IDs are resolved by server, not model output',async()=>{
 const result=await bindPersonProposals(turn('create_interaction',{person_name:'alex',person_id:'forged'}),client([person]));
 assert.equal(result.proposals[0].payload.person_id,person.id);
});
test('database failure never falls back to creating a duplicate',async()=>{
 await assert.rejects(bindPersonProposals(turn('create_person',{name:'alex'}),{rpc:async()=>({data:null,error:{message:'offline'}})}),/offline/);
});

test('attribute-only update does not require a redundant empty fields envelope',async()=>{
 const source=turn('update_person',{name:'alex',attributes:{hobby:'Photography'}});
 const result=await bindPersonProposals(source,client([person]));
 assert.equal(result.proposals.length,1);assert.deepEqual(result.proposals[0].payload.fields,{});
 assert.deepEqual(result.proposals[0].payload.attributes,{hobby:['Chess','Photography']});
 assert.equal(result.proposals[0].targetEntityId,person.id);
 assert.deepEqual(result.proposals[0].sourceQuotes,source.proposals[0].sourceQuotes);
});
test('flat and nested person fields normalize to the same reviewed update',async()=>{
 const flat=await bindPersonProposals(turn('update_person',{name:'alex',notes:'Photography',attributes:{hobby:'Photography'}}),client([person]));
 const nested=await bindPersonProposals(turn('create_person',{name:'alex',fields:{notes:'Photography'},attributes:{hobby:'Photography'}}),client([person]));
 assert.deepEqual(flat.proposals[0].payload,nested.proposals[0].payload);
 assert.equal(flat.proposals[0].payload.fields.notes,'Robotics\nPhotography');
});
test('malformed envelopes and conflicting values remain blocked',async()=>{
 for(const extra of [{fields:null},{fields:[]},{fields:'Photography'},{attributes:[]},{notes:23},{company:'One',fields:{company:'Two'}}]) {
  const result=await bindPersonProposals(turn('update_person',{name:'alex',...extra}),client([person]));
  assert.equal(result.proposals.length,0);assert.ok(result.warning);
 }
});

test('independent facts survive additions, deduplicate on repetition, and only corrections replace',async()=>{
 const mira={...person,name:'Mira',attributes:{likes:'面条'}};
 const rpc={rpc:async()=>({data:[mira],error:null})};
 const incoming=turn('update_person',{name:'Mira',mode:'add',attributes:{likes:'陶艺'}});
 const result=await bindPersonProposals(incoming,rpc);
 assert.deepEqual(result.proposals[0].payload.attributes.likes,['面条','陶艺']);
 assert.deepEqual(result.proposals[0].sourceQuotes,incoming.proposals[0].sourceQuotes);
 mira.attributes=result.proposals[0].payload.attributes;
 assert.equal((await bindPersonProposals(incoming,rpc)).proposals.length,0);
 assert.deepEqual((await bindPersonProposals(turn('update_person',{name:'Mira',mode:'correct',attributes:{likes:'米饭'}}),rpc)).proposals[0].payload.attributes,{likes:'米饭'});
});
test('additions cannot clear existing attributes or replace current core state',async()=>{
 assert.equal((await bindPersonProposals(turn('update_person',{name:'alex',attributes:{hobby:null}}),client([person]))).proposals.length,0);
 const result=await bindPersonProposals(turn('update_person',{name:'alex',mode:'add',fields:{company:'Future employer'}}),client([person]));
 assert.equal(result.proposals.length,0);assert.ok(result.warning);
});
test('cancellation corrects the plan while leaving unrelated core facts untouched',async()=>{
 const current={...person,attributes:{future_plan:'Join Example next month',unresolved_time:'next month',hobby:'Chess'}};
 const result=await bindPersonProposals(turn('update_person',{name:'alex',mode:'correct',attributes:{future_plan:'Cancelled',unresolved_time:null}}),client([current]));
 assert.deepEqual(result.proposals[0].payload.fields,{});
 assert.deepEqual(result.proposals[0].payload.attributes,{future_plan:'Cancelled',unresolved_time:null});
});
test('structured attribute deduplication is independent of object key order',async()=>{
 const current={...person,attributes:{preference:{kind:'food',value:'noodles'}}};
 const result=await bindPersonProposals(turn('update_person',{name:'alex',attributes:{preference:{value:'noodles',kind:'food'}}}),client([current]));
 assert.equal(result.proposals.length,0);
});

test('new-person nested fields normalize to the actual create envelope without losing seed facts',async()=>{
 const result=await bindPersonProposals(turn('create_person',{name:'alex',fields:{company:'Example',role:'Engineer'},attributes:{likes:'Noodles'}}),client([]));
 assert.equal(result.proposals[0].payload.company,'Example');assert.equal(result.proposals[0].payload.role,'Engineer');
 assert.equal(result.proposals[0].payload.fields,undefined);assert.equal(result.proposals[0].payload.attributes.likes,'Noodles');
 for(const fields of [[],null,{company:58}]) assert.equal((await bindPersonProposals(turn('create_person',{name:'alex',fields}),client([]))).proposals.length,0);
});

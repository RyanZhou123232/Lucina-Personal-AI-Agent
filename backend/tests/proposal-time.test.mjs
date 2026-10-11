import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProposalTime} from '../lib/proposal-time.ts';
test('today cannot reach a timestamp field and its original wording survives',()=>{
 const original={date:'今天',summary:'Writing class with Leon',attributes:{topic:'Writing'}};
 const result=normalizeProposalTime('create_interaction',original);
 assert.equal(result.date,null);assert.equal(original.date,'今天');
 assert.deepEqual(result.attributes,{topic:'Writing',unresolved_time:{date:'今天'}});
});
test('exact dates and zoned timestamps survive without timezone conversion',()=>{
 for(const date of ['2026-10-10','2024-02-29','2026-10-10T12:30:00-04:00','2026-10-10T16:30:00.123456Z']){
  assert.equal(normalizeProposalTime('create_interaction',{occurred_at:date}).occurred_at,date);
 }
});
test('impossible dates, natural-language dates and timezone-free times are unresolved',()=>{
 for(const date of ['2026-02-29','2026-02-30','2026-13-10','tomorrow','next week','今天','2026-10-10T12:30:00','2026-10-10T25:00:00Z',123]){
  const result=normalizeProposalTime('create_task',{due_at:date});assert.equal(result.due_at,null);assert.equal(result.attributes.unresolved_time.due_at,date);
 }
});
test('all commit timestamp fields are covered while unrelated person data is untouched',()=>{
 for(const [type,fields] of Object.entries({create_event:['date','started_at','ended_at'],create_belief:['first_formed_at','last_reinforced_at'],create_decision:['decided_at']})){
  for(const field of fields) assert.equal(normalizeProposalTime(type,{[field]:'昨天'})[field],null);
 }
 assert.deepEqual(normalizeProposalTime('create_person',{notes:'今天毕业',attributes:{date:'今天'}}),{notes:'今天毕业',attributes:{date:'今天'}});
 assert.deepEqual(normalizeProposalTime('create_interaction',{date:null}),{date:null});
});

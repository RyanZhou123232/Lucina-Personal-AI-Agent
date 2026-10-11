import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareReviewEdit } from '../lib/review.ts';

test('corrected values keep saved evidence even when browser changes or omits it', () => {
  const original = { name: 'Test', provenance: { source_message_ids: ['source-1'], provider: 'deepseek' } };
  for (const proposed of [{ name: 'Corrected' }, { name: 'Corrected', provenance: { source_message_ids: ['forged'] } }]) {
    const edited = prepareReviewEdit(original, proposed);
    assert.equal(edited.name, 'Corrected');
    assert.deepEqual(edited.provenance, original.provenance);
    assert.equal(original.name, 'Test');
  }
});
test('an edit cannot introduce evidence that was not on the saved proposal', () => {
  assert.deepEqual(prepareReviewEdit({ title: 'Task' }, { title: 'Corrected', provenance: { source_message_ids: ['forged'] } }), { title: 'Corrected' });
});
test('arrays, null, primitive and oversized edits are rejected', () => {
  for (const proposed of [[], null, 'text', 10, { title: 'x'.repeat(50001) }]) {
    assert.throws(() => prepareReviewEdit({}, proposed));
  }
});

test('review edits cannot retarget a bound person or reset its optimistic version',()=>{
 const binding={id:'original',expected_updated_at:'old',before:{company:'Old company'}};
 const original={name:'Alex',person_binding:binding,person_id:'original',fields:{company:'New company'}};
 const edited=prepareReviewEdit(original,{name:'Kevin',person_binding:{id:'forged',expected_updated_at:'new'},person_id:'forged',fields:{company:'Edited company'}});
 assert.equal(edited.name,'Alex');assert.deepEqual(edited.person_binding,binding);assert.equal(edited.person_id,'original');
 assert.deepEqual(edited.fields,{company:'Edited company'});
});

test('empty date controls and legacy null text become true JSON null while sources stay unchanged',()=>{
 const original={date:'今天',summary:'Writing class',provenance:{source_message_ids:['original-user']}};
 for(const value of ['', '  ', 'null', ' NULL ', null]){
  const edited=prepareReviewEdit(original,{date:value,summary:'Writing class'});
  assert.equal(edited.date,null);assert.deepEqual(edited.provenance,original.provenance);
 }
 assert.equal(prepareReviewEdit(original,{date:'2026-10-10'}).date,'2026-10-10');
 assert.equal(prepareReviewEdit(original,{summary:'null'}).summary,'null');
});

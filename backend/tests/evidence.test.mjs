import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateProposalSources} from '../lib/evidence.ts';
const history=[{id:'23-context',role:'user',content:'我和23chat了'},{id:'incorrect-assistant',role:'assistant',content:'Kevin 在 CMU'},{id:'career',role:'user',content:'他在 CMU 做部署'}];
test('pronoun proposal can preserve both antecedent and current exact message quotes',()=>{
  assert.deepEqual(validateProposalSources([{message_id:'23-context',quote:'我和23chat了'},{message_id:'career',quote:'他在 CMU 做部署'}],history).map(source=>source.messageId),['23-context','career']);
});
test('assistant evidence, fabricated quote, absent IDs and old-only evidence are rejected',()=>{
  for(const sources of [[{message_id:'incorrect-assistant',quote:'Kevin 在 CMU'}],[{message_id:'career',quote:'Alex 在 CMU'}],[{message_id:'missing',quote:'他在 CMU 做部署'}],[{message_id:'23-context',quote:'我和23chat了'}]]) assert.throws(()=>validateProposalSources(sources,history));
});

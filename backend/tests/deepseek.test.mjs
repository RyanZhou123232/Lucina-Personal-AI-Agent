import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
let code = stripTypeScriptTypes(await readFile(new URL('../lib/deepseek.ts',import.meta.url),'utf8'));
code = code.replace('"@/lib/memory"',JSON.stringify(new URL('../lib/memory.ts',import.meta.url).href));
code = code.replace('"@/lib/evidence"',JSON.stringify(new URL('../lib/evidence.ts',import.meta.url).href));
code = code.replace('"@/lib/proposal-time"',JSON.stringify(new URL('../lib/proposal-time.ts',import.meta.url).href));
const { createAgentTurn, createMemoryPlan, verifyAgentTurn } = await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));

const messages = [{ role: 'user', content: 'A fictional test person studies robotics.' }, { role: 'assistant', content: 'Understood.' }];
const valid = { reply: 'Ready for review.', proposals: [{ change_type: 'create_person', confidence: 0.9, payload: { name: 'Test Person' }, sources: [{message_id:'U0',quote:'A fictional test person studies robotics.'}] }] };
const completion = (content, finish_reason = 'stop') => ({ choices: [{ message: { content }, finish_reason }] });

async function withResponses(responses, run) {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  const calls = [];
  process.env.DEEPSEEK_API_KEY = 'mock-key';
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    assert.ok(calls.length <= responses.length, 'unexpected provider request');
    const result = responses[calls.length - 1];
    if (result instanceof Error) throw result;
    return new Response(JSON.stringify(result.body ?? result), { status: result.status ?? 200 });
  };
  try { await run(calls); } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
  }
}

test('valid output needs one request and retains user evidence', async () => {
  await withResponses([completion(JSON.stringify(valid))], async calls => {
    const turn = await createAgentTurn(messages);
    assert.equal(turn.reply, valid.reply);
    assert.deepEqual(turn.proposals[0].sourceQuotes.map(source=>source.messageId), ['U0']);
    assert.equal(calls.length, 1);
  });
});

test('complete JSON fence and escaped strings are accepted without repair', async () => {
  const value = { ...valid, reply: 'Line one\nHe said "hello". Path: C:\\test' };
  await withResponses([completion('```json\n' + JSON.stringify(value) + '\n```')], async calls => {
    assert.equal((await createAgentTurn(messages)).reply, value.reply);
    assert.equal(calls.length, 1);
  });
});

for (const [name, first] of [
  ['malformed JSON', completion('{"reply":"unfinished')],
  ['empty output', completion('   ')],
  ['wrong root', completion('[]')],
  ['missing proposals', completion('{"reply":"Hello"}')],
  ['interrupted output', completion(JSON.stringify(valid), 'insufficient_system_resource')],
]) {
  test(name + ' retries once with unchanged user history', async () => {
    await withResponses([first, completion(JSON.stringify(valid))], async calls => {
      assert.equal((await createAgentTurn(messages)).reply, valid.reply);
      assert.equal(calls.length, 2);
      assert.deepEqual(calls[0].messages.slice(1).map(message=>JSON.parse(message.content).text), messages.map(message=>message.content));
      assert.deepEqual(calls[1].messages.slice(1,-1).map(message=>JSON.parse(message.content).text), messages.map(message=>message.content));
    });
  });
}

test('truncation retries with a larger limit even when content parses', async () => {
  await withResponses([completion(JSON.stringify(valid), 'length'), completion(JSON.stringify(valid))], async calls => {
    await createAgentTurn(messages);
    assert.equal(calls[0].max_tokens, 4096);
    assert.equal(calls[1].max_tokens, 8192);
  });
});

test('two malformed responses fail without inventing an answer', async () => {
  await withResponses([completion('{'), completion('{')], async calls => {
    await assert.rejects(createAgentTurn(messages), /no reply or review items were created after two attempts/);
    assert.equal(calls.length, 2);
  });
});

test('provider HTTP and network errors are not format retries', async () => {
  for (const response of [{ status: 401, body: { error: { message: 'Unauthorized' } } }, new Error('Connection failed')]) {
    await withResponses([response], async calls => {
      await assert.rejects(createAgentTurn(messages), /Unauthorized|Connection failed/);
      assert.equal(calls.length, 1);
    });
  }
});

test('unsafe suggestions are filtered: assistant evidence, unsupported type, invalid confidence', async () => {
  const proposal = valid.proposals[0];
  const value = { reply: 'Ready.', proposals: [
    proposal,
    { ...proposal, sources:[{message_id:'U1',quote:'Understood.'}] },
    { ...proposal, change_type: 'send_email' },
    { ...proposal, confidence: 1.2 },
    { ...proposal, confidence: 0.2 },
  ] };
  await withResponses([completion(JSON.stringify(value))], async () => {
    assert.equal((await createAgentTurn(messages)).proposals.length, 1);
  });
});

const memory = { plan: {intent:'lookup',terms:['Alex'],personName:'Alex',entityTypes:['tasks'],taskStatus:null}, evidence: [{citationId:'M1',entityType:'tasks',entityId:'task-1',record:{title:'Send deck',status:'pending'},sources:[{id:'source-1',content:'I promised Alex a deck'}],score:10}] };
test('planner returns validated original-language search constraints', async () => {
  await withResponses([completion(JSON.stringify({intent:'lookup',terms:['Alex','介绍资料'],person_name:'Alex',entity_types:['tasks','messages'],task_status:null}))],async calls=>{
    const plan=await createMemoryPlan([{role:'user',content:'我答应给 Alex 什么？'}]);
    assert.deepEqual(plan.terms,['Alex','介绍资料']); assert.equal(plan.personName,'Alex');
    assert.match(calls[0].messages[0].content,/not proof/);
  });
});
test('empty retrieval bypasses answer model and never invents memory', async () => {
  await withResponses([],async calls=>{
    const turn=await createAgentTurn([{role:'user',content:'我答应给 Alex 什么？'}],{...memory,evidence:[]});
    assert.equal(calls.length,0); assert.match(turn.reply,/没有找到/); assert.deepEqual(turn.proposals,[]); assert.equal(turn.grounding.tier,'NONE');
  });
});
test('grounded answer preserves citations and recall creates no new proposals', async () => {
  await withResponses([completion(JSON.stringify({...valid,reply:'You promised a deck.',evidence_tier:'EXACT',citations:['M1']}))],async calls=>{
    const turn=await createAgentTurn(messages,memory);
    assert.match(turn.reply,/\[M1\]/); assert.deepEqual(turn.proposals,[]); assert.equal(turn.grounding.tier,'EXACT');
    assert.match(calls[0].messages[1].content,/untrusted DATA/); assert.match(calls[0].messages[1].content,/Send deck/);
  });
});
test('unverified citations cause bounded retry rather than publishing fabricated sources', async () => {
  await withResponses([completion(JSON.stringify({...valid,evidence_tier:'EXACT',citations:['M99']})),completion(JSON.stringify({...valid,evidence_tier:'EXACT',citations:['M1']}))],async calls=>{
    const turn=await createAgentTurn(messages,memory); assert.deepEqual(turn.grounding.citations,['M1']); assert.equal(calls.length,2);
  });
});
test('RELATED retains the precise answer and NONE overwrites unsupported history answer', async () => {
  await withResponses([completion(JSON.stringify({...valid,evidence_tier:'RELATED',citations:['M1']}))],async()=>assert.equal((await createAgentTurn(messages,memory)).reply,valid.reply+' [M1]'));
  await withResponses([completion(JSON.stringify({...valid,reply:'An unsupported personal claim.',evidence_tier:'NONE',citations:[]}))],async()=>{
    const turn=await createAgentTurn(messages,memory); assert.match(turn.reply,/no saved record/i); assert.doesNotMatch(turn.reply,/unsupported personal claim/);
  });
});
test('new capture cannot re-extract an old source-only fact', async () => {
  const history=[{role:'user',content:'Old fact'},{role:'assistant',content:'Saved'},{role:'user',content:'A new fact'}];
  const capture={...memory,plan:{...memory.plan,intent:'conversation'}};
  const bad=completion(JSON.stringify({...valid,evidence_tier:'NONE',citations:[]}));
  await withResponses([bad,bad],async()=>assert.deepEqual((await createAgentTurn(history,capture)).proposals,[]));
});

test('labelled IDs and exact quotes replace index-based proposal citations', async () => {
  const history=[{id:'kevin',role:'user',content:'我和 Kevin 喝咖啡。'},{id:'alex',role:'user',content:'Alex 做机器人硬件。'}];
  const candidate={reply:'收到。',proposals:[{change_type:'create_person',confidence:0.9,payload:{name:'Alex'},sources:[{message_id:'alex',quote:'Alex 做机器人硬件。'}]}]};
  await withResponses([completion(JSON.stringify(candidate))],async calls=>{
    const turn=await createAgentTurn(history);assert.deepEqual(turn.proposals[0].sourceQuotes,[{messageId:'alex',quote:'Alex 做机器人硬件。'}]);
    assert.equal(JSON.parse(calls[0].messages[2].content).message_id,'alex');
  });
  for(const sources of [[{message_id:'kevin',quote:'Alex 做机器人硬件。'}],[{message_id:'missing',quote:'Alex 做机器人硬件。'}]]) {
    await withResponses([completion(JSON.stringify({...candidate,proposals:[{...candidate.proposals[0],sources}]}))],async()=>assert.equal((await createAgentTurn(history)).proposals.length,0));
  }
});
test('wrong Alex career attribution is withheld by semantic checking with the original context',async()=>{
  const broken={...memory,evidence:[{...memory.evidence[0],entityType:'people',record:{name:'Alex'},sources:[{id:'career',content:'他在 CMU 部署 AI Agent。',context:[{id:'chat23',content:'我今天和23chat了',sequence_number:2}]}]}]};
  const turn={reply:'Alex 在 CMU 部署 AI Agent [M1]',proposals:[],grounding:{tier:'EXACT',citations:['M1']}};
  await withResponses([completion(JSON.stringify({reply_supported:false,reason:'Original user context identifies 23, not Alex',proposals:[],citation_support:[]}))],async()=>{
    const checked=await verifyAgentTurn(turn,[{role:'user',content:'Alex 在做什么？'}],broken);
    assert.equal(checked.verification.replySupported,false);assert.equal(checked.grounding.tier,'NONE');assert.doesNotMatch(checked.reply,/Alex 在 CMU/);
  });
});
test('semantic verdict can block existent but unrelated source quotes and preserve supported proposals',async()=>{
  const proposed={changeType:'create_person',targetEntityType:'people',confidence:0.9,payload:{name:'Kevin',notes:'CMU'},sourceQuotes:[{messageId:'career',quote:'他在 CMU'}]};
  const candidate={reply:'Kevin 在 CMU',proposals:[proposed,{...proposed,payload:{name:'23',notes:'CMU'}}],grounding:{tier:'NONE',citations:[]}};
  await withResponses([completion(JSON.stringify({reply_supported:false,reason:'Pronoun refers to 23, not Kevin',proposals:[{index:0,supported:false,reason:'Wrong subject'},{index:1,supported:true,reason:'Supported by user context'}]}))],async()=>{
    const checked=await verifyAgentTurn(candidate,[{role:'user',content:'我和23聊了'},{role:'user',content:'他在 CMU'}],{...memory,plan:{...memory.plan,intent:'conversation'}});
    assert.equal(checked.proposals.length,1);assert.equal(checked.proposals[0].payload.name,'23');assert.equal(checked.verification.rejectedProposals,1);assert.match(checked.warning,/未进入 Review/);
  });
});
test('verifier failure never publishes an unchecked answer',async()=>{
  for(const result of [completion('{'),completion(JSON.stringify({reply_supported:true,reason:'Missing verdicts'})),{status:503,body:{error:'Unavailable'}}]) {
    await withResponses([result],async()=>await assert.rejects(verifyAgentTurn({reply:'A claim',proposals:[]},messages,memory),/verification/i));
  }
});

test('lookup generation retains user follow-up context while excluding assistant assertions',async()=>{
  const history=[{id:'anchor',role:'user',content:'我想了解 Alex。'},{id:'bad',role:'assistant',content:'Alex worked at CMU'},{id:'question',role:'user',content:'他在做什么？'}];
  await withResponses([completion(JSON.stringify({reply:'Alex 做机器人硬件 [M1]',proposals:[],evidence_tier:'EXACT',citations:['M1']}))],async calls=>{
    await createAgentTurn(history,memory);
    const userMessages=calls[0].messages.filter(m=>m.role==='user');
    assert.equal(userMessages.length,2);assert.equal(JSON.parse(userMessages[0].content).message_id,'anchor');assert.equal(JSON.parse(userMessages[1].content).message_id,'question');
    assert.ok(!calls[0].messages.some(m=>m.role==='assistant'));
  });
});

const quoteVerdict=(supported,reason='Supported')=>completion(JSON.stringify({reply_supported:supported,reason,citation_support:supported?[{citation_id:'M1',message_id:'source-1',quote:'I promised Alex a deck'}]:[],proposals:[]}));

test('precise supporting quote is required even if semantic checker approves',async()=>{
  const candidate={reply:'A deck [M1]',proposals:[],grounding:{tier:'EXACT',citations:['M1']}};
  await withResponses([completion(JSON.stringify({reply_supported:true,reason:'Approved without quote',citation_support:[],proposals:[]}))],async()=>{
    const checked=await verifyAgentTurn(candidate,messages,memory);assert.equal(checked.verification.replySupported,false);
  });
});

test('context-only support is rejected even when examiner approves it',async()=>{
  const questionMemory={...memory,evidence:[{...memory.evidence[0],entityType:'messages',sources:[{id:'question',content:'What did I promise Alex?',context:[{id:'source-1',content:'I promised Alex a deck'}]}]}]};
  await withResponses([quoteVerdict(true)],async()=>{
    const checked=await verifyAgentTurn({reply:'A deck [M1]',proposals:[],grounding:{tier:'EXACT',citations:['M1']}},messages,questionMemory);
    assert.equal(checked.verification.replySupported,false);assert.match(checked.verification.reason,/original supporting/);
  });
});

test('a rejected lookup gets one checked revision with correct original quote',async()=>{
  const candidate={reply:'Wrong citation [M1]',proposals:[],grounding:{tier:'EXACT',citations:['M1']}};
  const revised={reply:'You promised a deck [M1]',proposals:[],evidence_tier:'EXACT',citations:['M1']};
  await withResponses([quoteVerdict(false,'Wrong source'),completion(JSON.stringify(revised)),quoteVerdict(true)],async calls=>{
    const checked=await verifyAgentTurn(candidate,[{role:'user',content:'What did I promise Alex?'}],memory,true);
    assert.equal(checked.verification.replySupported,true);assert.equal(checked.reply,revised.reply);assert.equal(calls.length,3);
    assert.equal(checked.verification.retry.initialReason,'Wrong source');assert.equal(checked.verification.citationSupport[0].messageId,'source-1');
    assert.ok(calls[1].messages.some(m=>m.content.includes('Checker feedback')));
  });
});

test('a second failed revision is withheld without an unbounded retry',async()=>{
  await withResponses([quoteVerdict(false),completion(JSON.stringify({reply:'Wrong again [M1]',proposals:[],evidence_tier:'EXACT',citations:['M1']})),quoteVerdict(false)],async calls=>{
    const checked=await verifyAgentTurn({reply:'Wrong [M1]',proposals:[],grounding:{tier:'EXACT',citations:['M1']}},messages,memory,true);
    assert.equal(checked.verification.replySupported,false);assert.equal(checked.grounding.tier,'NONE');assert.equal(calls.length,3);
  });
});

test('nonadjacent subject resolution reaches generation and checking without a positional veto',async()=>{
  const ctx=[{id:'morgan',content:'I met Morgan',sequence_number:1},{id:'aside',content:'The cafe was noisy',sequence_number:2}];
  const scoped={plan:{...memory.plan,personName:'Morgan'},evidence:[{citationId:'M1',entityType:'messages',entityId:'career',record:{},sources:[{id:'career',content:'He works at a lab',context:ctx}],score:10}]};
  const answer={reply:'Morgan works at a lab [M1]',proposals:[],evidence_tier:'EXACT',citations:['M1']};
  const verdict={reply_supported:true,reason:'The aside does not change the subject',proposals:[],citation_support:[{kind:'message',citation_id:'M1',message_id:'career',quote:'He works at a lab',subject_name:'Morgan'}]};
  await withResponses([completion(JSON.stringify(answer)),completion(JSON.stringify(verdict))],async calls=>{
    const chat=[{id:'q',role:'user',content:'What does Morgan do?'}];
    const turn=await createAgentTurn(chat,scoped);
    assert.match(calls[0].messages[1].content,/The cafe was noisy/);
    const checked=await verifyAgentTurn(turn,chat,scoped);
    assert.equal(checked.verification.replySupported,true);assert.equal(checked.reply,answer.reply);
    const input=JSON.parse(calls[1].messages[1].content);
    assert.deepEqual(input.memory.evidence[0].sources[0].context,ctx);
    assert.equal(input.userTimeline[0].content,chat[0].content);
  });
});

test('correct promise plus current completion can pass with different evidence kinds',async()=>{
  const completed={...memory,evidence:[memory.evidence[0],{...memory.evidence[0],citationId:'M4',entityId:'task-4',record:{status:'completed'}}]};
  const verdict={reply_supported:true,reason:'Historical promise and current state supported separately',proposals:[],citation_support:[{kind:'message',citation_id:'M1',message_id:'source-1',quote:'I promised Alex a deck'},{kind:'record',citation_id:'M4',entity_id:'task-4',field:'status',value:'completed'}]};
  await withResponses([completion(JSON.stringify(verdict))],async()=>{
    const checked=await verifyAgentTurn({reply:'You promised a deck [M1]. The task is marked completed [M4].',proposals:[],grounding:{tier:'EXACT',citations:['M1','M4']}},[{role:'user',content:'What did I promise Alex?'}],completed);
    assert.equal(checked.verification.replySupported,true);assert.equal(checked.verification.citationSupport[1].kind,'record');
  });
});


test('generated interaction with 今天 is normalized before Review and evidence checking',async()=>{
 const chat=[{id:'source',role:'user',content:'我今天和 Leon 上了写作课。'}];
 const value={reply:'Ready for review',proposals:[{change_type:'create_interaction',confidence:0.9,payload:{date:'今天',person_name:'Leon',summary:'和 Leon 上写作课'},sources:[{message_id:'source',quote:chat[0].content}]}]};
 await withResponses([completion(JSON.stringify(value))],async()=>{
  const turn=await createAgentTurn(chat);assert.equal(turn.proposals[0].payload.date,null);
  assert.deepEqual(turn.proposals[0].payload.attributes.unresolved_time,{date:'今天'});
  assert.equal(turn.proposals[0].sourceQuotes[0].messageId,'source');
 });
});

test('new-person update survives bad reply citations only via neutral fallback and independent verification',async()=>{
 const chat=[{id:'update',role:'user',content:'更新一下：Test Person 现在在 New company 工作。'},{id:'old-assistant',role:'assistant',content:'Old unrelated citation [M99]'}];
 const captureMemory={...memory,plan:{...memory.plan,intent:'conversation'},evidence:[]};
 const bad={reply:'Test Person already updated to New company [M99]',evidence_tier:'EXACT',citations:['M99'],proposals:[{change_type:'update_person',confidence:0.9,payload:{name:'Test Person',mode:'correct',fields:{company:'New company'},attributes:{}},sources:[{message_id:'update',quote:chat[0].content}]}]};
 const verdict={reply_supported:true,reason:'Neutral acknowledgement; proposal states latest user facts',citation_support:[],proposals:[{index:0,supported:true,reason:'Latest user quote supports update'}]};
 await withResponses([completion(JSON.stringify(bad)),completion(JSON.stringify(bad)),completion(JSON.stringify(verdict))],async calls=>{
  const candidate=await createAgentTurn(chat,captureMemory);
  assert.doesNotMatch(candidate.reply,/M99|already updated|New company/);
  assert.deepEqual(candidate.grounding,{tier:'NONE',citations:[]});assert.equal(candidate.proposals.length,1);
  assert.equal(candidate.generationIssue.candidateReply,bad.reply);
  assert.ok(!calls[0].messages.some(m=>m.role==='assistant'));
  assert.match(calls[1].messages.at(-1).content,/Current allowed memory citation IDs: \[\]/);
  const checked=await verifyAgentTurn(candidate,chat,captureMemory);assert.equal(checked.proposals.length,1);assert.equal(checked.verification.replySupported,true);
 });
});
test('citation fallback never publishes a proposal with an invalid source',async()=>{
 const chat=[{id:'latest',role:'user',content:'New fact'}];
 const captureMemory={...memory,plan:{...memory.plan,intent:'conversation'},evidence:[]};
 const bad={reply:'Invented [M99]',evidence_tier:'EXACT',citations:['M99'],proposals:[{change_type:'create_person',confidence:0.9,payload:{name:'Wrong'},sources:[{message_id:'forged',quote:'New fact'}]}]};
 await withResponses([completion(JSON.stringify(bad)),completion(JSON.stringify(bad))],async()=>{
  const result=await createAgentTurn(chat,captureMemory);assert.equal(result.proposals.length,0);assert.match(result.warning,/withheld/);
 });
});
test('a repeated invalid lookup citation still fails, without capture fallback',async()=>{
 const bad={reply:'Invented fact [M99]',proposals:[],evidence_tier:'EXACT',citations:['M99']};
 await withResponses([completion(JSON.stringify(bad)),completion(JSON.stringify(bad))],async()=>{
  await assert.rejects(createAgentTurn([{role:'user',content:'What was saved?'}],memory),/not retrieved/);
 });
});
test('independent examiner can reject an update even after neutral citation fallback',async()=>{
 const captureMemory={...memory,plan:{...memory.plan,intent:'conversation'}};
 const candidate={reply:'Received. Review is required.',proposals:[{changeType:'update_person',targetEntityType:'people',confidence:0.9,payload:{name:'Wrong person',fields:{company:'New company'}},sourceQuotes:[{messageId:'source',quote:'He joined New company'}]}],grounding:{tier:'NONE',citations:[]}};
 const verdict={reply_supported:true,reason:'Neutral',citation_support:[],proposals:[{index:0,supported:false,reason:'Subject does not establish Wrong person'}]};
 await withResponses([completion(JSON.stringify(verdict))],async()=>{assert.equal((await verifyAgentTurn(candidate,[{id:'source',role:'user',content:'He joined New company'}],captureMemory)).proposals.length,0)});
});

test('capture retries an invalid proposal ID with the exact latest source anchor',async()=>{
 const chat=[{id:'old-update',role:'user',content:'Test Person works at New company.'},{id:'new-update',role:'user',content:'Test Person works at New company.'}];
 const captureMemory={...memory,plan:{...memory.plan,intent:'conversation'},evidence:[]};
 const proposal={change_type:'update_person',confidence:0.9,payload:{name:'Test Person',mode:'correct',fields:{company:'New company'},attributes:{}},sources:[{message_id:'old-update',quote:chat[1].content}]};
 const bad={reply:'Received.',evidence_tier:'NONE',citations:[],proposals:[proposal]};
 const fixed={...bad,proposals:[{...proposal,sources:[{message_id:'new-update',quote:chat[1].content}]}]};
 await withResponses([completion(JSON.stringify(bad)),completion(JSON.stringify(fixed))],async calls=>{
  const turn=await createAgentTurn(chat,captureMemory);assert.equal(turn.proposals[0].sourceQuotes[0].messageId,'new-update');
  assert.ok(calls[1].messages.at(-1).content.includes('Required latest source anchor'));
  assert.ok(calls[1].messages.at(-1).content.includes('new-update'));
  assert.equal(turn.proposalIssues,undefined);
 });
});
test('paraphrased sources remain withheld with diagnostics after bounded source retry',async()=>{
 const chat=[{id:'latest-user',role:'user',content:'Exact original words.'}];
 const captureMemory={...memory,plan:{...memory.plan,intent:'conversation'},evidence:[]};
 const bad={reply:'Received.',evidence_tier:'NONE',citations:[],proposals:[{change_type:'create_person',confidence:0.9,payload:{name:'Test'},sources:[{message_id:'latest-user',quote:'paraphrased words'}]}]};
 await withResponses([completion(JSON.stringify(bad)),completion(JSON.stringify(bad))],async calls=>{
  const turn=await createAgentTurn(chat,captureMemory);assert.equal(turn.proposals.length,0);assert.equal(calls.length,2);
  assert.match(turn.proposalIssues[0].reason,/exact substring/);assert.equal(turn.proposalIssues[0].sources[0].quote,'paraphrased words');
 });
});

test('old email plus new calendar cannot leave a two-item acknowledgement after source filtering',async()=>{
 const chat=[{id:'old-email',role:'user',content:'Write an email with subject Old mail.'},{id:'new-calendar',role:'user',content:'创建一个日程 Calendar Test。'}];
 const captureMemory={...memory,plan:{...memory.plan,intent:'conversation'},evidence:[]};
 const candidate={reply:'已准备两项：Old mail 和 Calendar Test。',evidence_tier:'NONE',citations:[],proposals:[
  {change_type:'draft_email',confidence:0.9,payload:{subject:'Old mail'},sources:[{message_id:'old-email',quote:chat[0].content}]},
  {change_type:'create_calendar_event',confidence:0.9,payload:{title:'Calendar Test'},sources:[{message_id:'new-calendar',quote:chat[1].content}]}
 ]};
 await withResponses([completion(JSON.stringify(candidate)),completion(JSON.stringify(candidate))],async calls=>{
  const result=await createAgentTurn(chat,captureMemory);assert.equal(result.proposals.length,1);assert.match(result.reply,/1 项/);assert.match(result.reply,/Calendar Test/);assert.doesNotMatch(result.reply,/Old mail|两项/);assert.equal(result.grounding.tier,'NONE');assert.equal(calls.length,2);
 });
});

test('semantic rejection also rebuilds the review acknowledgement from surviving proposals',async()=>{
 const candidate={reply:'Two proposals: Old mail and Calendar Test.',proposals:[
  {changeType:'draft_email',targetEntityType:'email_drafts',confidence:0.9,payload:{subject:'Old mail'},sourceQuotes:[]},
  {changeType:'create_calendar_event',targetEntityType:'calendar_events',confidence:0.9,payload:{title:'Calendar Test'},sourceQuotes:[]}
 ],grounding:{tier:'NONE',citations:[]}};
 const verdict={reply_supported:true,reason:'Acknowledgement',citation_support:[],proposals:[{index:0,supported:false,reason:'Old action'},{index:1,supported:true,reason:'Current request'}]};
 await withResponses([completion(JSON.stringify(verdict))],async()=>{
  const result=await verifyAgentTurn(candidate,[{role:'user',content:'Create Calendar Test'}],{...memory,plan:{...memory.plan,intent:'conversation'}});
  assert.equal(result.proposals.length,1);assert.match(result.reply,/1 validated proposal/);assert.doesNotMatch(result.reply,/Old mail|Two proposals/);
 });
});

test('ambiguous capture gets one checked clarification instead of a guessed person update',async()=>{
 const chat=[{id:'meal',role:'user',content:'I ate with Morgan and Riley'},{id:'plan',role:'user',content:'He will join Example next month'}];
 const capture={...memory,plan:{...memory.plan,intent:'conversation'}};
 const candidate={reply:'Morgan will join Example',proposals:[{changeType:'update_person',targetEntityType:'people',confidence:0.9,payload:{name:'Morgan',fields:{company:'Example'}},sourceQuotes:[{messageId:'plan',quote:chat[1].content}]}],grounding:{tier:'NONE',citations:[]}};
 const rejected={reply_supported:false,reason:'The pronoun could mean Morgan or Riley; future plans do not establish current company',citation_support:[],proposals:[{index:0,supported:false,reason:'Ambiguous subject'}]};
 const clarification={reply:'Do you mean Morgan or Riley?',proposals:[],evidence_tier:'NONE',citations:[]};
 let binds=0;
 await withResponses([completion(JSON.stringify(rejected)),completion(JSON.stringify(clarification)),quoteVerdict(true,'Clarification asserts no personal fact')],async calls=>{
  const result=await verifyAgentTurn(candidate,chat,capture,true,async revised=>{binds++;return revised;});
  assert.equal(result.reply,clarification.reply);assert.deepEqual(result.proposals,[]);assert.equal(binds,1);assert.equal(calls.length,3);
  assert.equal(result.verification.retry.initialCandidateReply,candidate.reply);assert.equal(result.verification.retry.initialRejectedProposals,1);
  assert.ok(calls[1].messages.some(m=>m.content.includes('ask a concise clarification question')));
 });
});
test('capture repair cannot publish new proposals without server binding',async()=>{
 const capture={...memory,plan:{...memory.plan,intent:'conversation'}};
 const candidate={reply:'Wrong',proposals:[],grounding:{tier:'NONE',citations:[]}};
 const revised={...valid,evidence_tier:'NONE',citations:[]};
 await withResponses([quoteVerdict(false),completion(JSON.stringify(revised))],async()=>{
  await assert.rejects(verifyAgentTurn(candidate,messages,capture,true),/server identity binding/);
 });
});
test('second capture rejection stops without publishing the unsafe proposal',async()=>{
 const capture={...memory,plan:{...memory.plan,intent:'conversation'}};
 const candidate={reply:'Wrong',proposals:[],grounding:{tier:'NONE',citations:[]}};
 const revised={reply:'Still wrong',proposals:[],evidence_tier:'NONE',citations:[]};
 await withResponses([quoteVerdict(false),completion(JSON.stringify(revised)),quoteVerdict(false)],async calls=>{
  const result=await verifyAgentTurn(candidate,messages,capture,true,async turn=>turn);
  assert.equal(result.verification.replySupported,false);assert.deepEqual(result.proposals,[]);assert.notEqual(result.reply,revised.reply);assert.equal(calls.length,3);
 });
});

test('invalid search plan gets one repair with actual validation feedback',async()=>{
 const bad={intent:'conversation',terms:[58],person_name:null,entity_types:[],task_status:null};
 const fixed={...bad,terms:['58','Maple']};
 await withResponses([completion(JSON.stringify(bad)),completion(JSON.stringify(fixed))],async calls=>{
  const result=await createMemoryPlan([{role:'user',content:'58 currently interns at Maple'}]);
  assert.deepEqual(result.terms,fixed.terms);assert.equal(calls.length,2);
  assert.ok(calls[1].messages.some(m=>m.content.includes('Invalid memory search terms')));
 });
});
test('two invalid plans stop and provider errors do not become schema retries',async()=>{
 await withResponses([completion('{'),completion('{')],async calls=>{
  await assert.rejects(createMemoryPlan(messages),/after one repair/);assert.equal(calls.length,2);
 });
 await withResponses([{status:503,body:{error:{message:'Unavailable'}}}],async calls=>{
  await assert.rejects(createMemoryPlan(messages),/Unavailable/);assert.equal(calls.length,1);
 });
});

test('a no-evidence refusal is examined when retrieval actually contains candidates',async()=>{
 const turn={reply:'No saved fact',proposals:[],grounding:{tier:'NONE',citations:[]}};
 await withResponses([quoteVerdict(false,'Retrieved primary source answers the question')],async calls=>{
  const result=await verifyAgentTurn(turn,messages,memory);
  assert.equal(calls.length,1);assert.equal(result.verification.replySupported,false);
 });
});
test('proposal rejection triggers a bounded clarification repair even with a neutral valid reply',async()=>{
 const capture={...memory,plan:{...memory.plan,intent:'conversation'}};
 const candidate={reply:'Received.',grounding:{tier:'NONE',citations:[]},proposals:[{changeType:'update_person',targetEntityType:'people',confidence:0.9,payload:{name:'Morgan',attributes:{future_plan:'Join Example'}},sourceQuotes:[{messageId:'U0',quote:messages[0].content}]}]};
 const rejected={reply_supported:true,reason:'Neutral acknowledgement',citation_support:[],proposals:[{index:0,supported:false,reason:'Identity is ambiguous'}]};
 const revised={reply:'Who do you mean?',proposals:[],evidence_tier:'NONE',citations:[]};
 await withResponses([completion(JSON.stringify(rejected)),completion(JSON.stringify(revised)),quoteVerdict(true)],async calls=>{
  const result=await verifyAgentTurn(candidate,messages,capture,true,async turn=>turn);
  assert.equal(result.reply,revised.reply);assert.equal(calls.length,3);
  assert.ok(calls[1].messages.some(m=>m.content.includes('Identity is ambiguous')));
 });
});

test('historical citations in a conversation use the same exact source check as lookup',async()=>{
 const capture={...memory,plan:{...memory.plan,intent:'conversation'}};
 const turn={reply:'Saved fact [M1]',proposals:[],grounding:{tier:'EXACT',citations:['M1']}};
 const verdict={reply_supported:true,reason:'Claimed support',citation_support:[{citation_id:'M1',message_id:'forged',quote:'Saved fact'}],proposals:[]};
 await withResponses([completion(JSON.stringify(verdict))],async()=>{
  assert.equal((await verifyAgentTurn(turn,messages,capture)).verification.replySupported,false);
 });
});
test('a binding warning is fed into one bounded repair rather than silently losing the intended update',async()=>{
 const capture={...memory,plan:{...memory.plan,intent:'conversation'}};
 const turn={reply:'Received',proposals:[],grounding:{tier:'NONE',citations:[]},warning:'An addition cannot replace current company'};
 const revised={reply:'Please clarify the company change.',proposals:[],evidence_tier:'NONE',citations:[]};
 await withResponses([quoteVerdict(true),completion(JSON.stringify(revised)),quoteVerdict(true)],async calls=>{
  const result=await verifyAgentTurn(turn,messages,capture,true,async turn=>turn);
  assert.equal(result.reply,revised.reply);assert.equal(calls.length,3);
  assert.ok(calls[1].messages.some(m=>m.content.includes(turn.warning)));
 });
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { preparePersonUpdate } from '../lib/person.ts';
const id = '00000000-0000-0000-0000-000000000001';
const otherId = '00000000-0000-0000-0000-000000000002';
function setup(user = { id: 'a' }) {
  const people = [{ id, owner_id: 'a', name: 'Alex', notes: 'hardware', updated_at: '2026-10-10T12:00:00Z' }, { id: otherId, owner_id: 'b', name: 'Private', updated_at: '2026-10-10T12:00:00Z' }];
  const links = [{ owner_id: 'a', person_id: id, interactions: { id: 'interaction-a', title: 'Coffee' } }, { owner_id: 'b', person_id: otherId, interactions: { id: 'interaction-b', title: 'Secret' } }];
  const calls = [];
  const supabase = { from(table) {
    const filters = []; let update;
    const rows = table === 'people' ? people : links;
    const builder = {
      select() { return builder; }, order() { return builder; },
      eq(k, v) { filters.push([k,v]); return builder; },
      update(value) { update = value; return builder; },
      async range(start,end) { calls.push({table, filters}); return { data: rows.filter(row => filters.every(([k,v]) => row[k] === v)).slice(start,end+1), error: null }; },
      async maybeSingle() { calls.push({table, filters, update}); const row = rows.find(row => filters.every(([k,v]) => row[k] === v)); if (row && update) Object.assign(row, update, {updated_at:'2026-10-10T12:01:00Z'}); return {data:row ? {...row}:null,error:null}; }
    }; return builder;
  }};
  globalThis.personFixture = { user, supabase }; return { people, links, calls };
}
async function loadRoute(file) {
  let code = stripTypeScriptTypes(await readFile(new URL(file, import.meta.url), 'utf8'));
  code = code.replace(/import[^;]+from "next\/server";/, 'const NextResponse = { json: value => Response.json(value) };');
  code = code.replace(/import[^;]+from "@\/lib\/http";/, 'const getAuthenticatedUser = async () => globalThis.personFixture; const apiError = (error,status=400) => Response.json({error},{status});');
  code = code.replace('"@/lib/person"', JSON.stringify(new URL('../lib/person.ts',import.meta.url).href));
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}
const { GET } = await loadRoute('../routes/people/route.ts');
const { PATCH } = await loadRoute('../routes/people/[personId]/route.ts');
const patch = (personId, body) => PATCH(new Request('http://localhost/api/people/'+personId, {method:'PATCH',body:JSON.stringify(body)}), {params:Promise.resolve({personId})});
test('people and linked interactions are isolated by owner', async () => {
  const { calls } = setup(); const response = await GET(); const data = await response.json();
  assert.equal(response.status,200); assert.deepEqual(data.people.map(p => p.name),['Alex']);
  assert.deepEqual(data.people[0].interactions.map(i => i.title),['Coffee']);
  assert.ok(calls.every(call => call.filters.some(([k,v]) => k === 'owner_id' && v === 'a')));
});
test('guest cannot read or edit and another owner remains private', async () => {
  const { calls } = setup(null); assert.equal((await GET()).status,401); assert.equal((await patch(id,{name:'X'})).status,401); assert.equal(calls.length,0);
  const { people } = setup(); assert.equal((await patch(otherId,{name:'Attack'})).status,404); assert.equal(people[1].name,'Private');
});
test('edit preserves IDs and links; stale update cannot overwrite', async () => {
  const { people, links } = setup(); assert.equal((await patch(id,{name:' Alex Smith ',notes:' New notes ',expectedUpdatedAt:people[0].updated_at})).status,200);
  assert.equal(people[0].name,'Alex Smith'); assert.equal(people[0].id,id); assert.equal(links[0].person_id,id);
  assert.equal((await patch(id,{name:'Stale',expectedUpdatedAt:'2026-10-10T12:00:00Z'})).status,409); assert.equal(people[0].name,'Alex Smith');
});
test('invalid and protected fields are rejected', async () => {
  setup(); assert.equal((await patch('bad',{name:'X'})).status,400);
  assert.equal((await patch(id,{owner_id:'b',name:'X'})).status,400);
  for (const body of [null,[],{name:' '},{notes:12},{notes:'x'.repeat(20001)},{expectedUpdatedAt:'bad',name:'A'},{}]) assert.throws(() => preparePersonUpdate(body));
  assert.deepEqual(preparePersonUpdate({notes:''}),{notes:null});
});


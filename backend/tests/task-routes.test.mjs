import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const taskId = '00000000-0000-0000-0000-000000000001';
const otherId = '00000000-0000-0000-0000-000000000002';

function setup(user = { id: 'owner-a' }) {
  const rows = [
    { id: taskId, owner_id: 'owner-a', title: 'Task A', status: 'pending', completed_at: null, updated_at: '2026-10-10T12:00:00Z', source_conversation_id: 'source-a' },
    { id: otherId, owner_id: 'owner-b', title: 'Private B', status: 'pending', completed_at: null, updated_at: '2026-10-10T12:00:00Z' },
  ];
  const calls = [];
  const supabase = { from(table) {
    assert.equal(table, 'tasks');
    const filters = [];
    let update;
    const builder = {
      select() { return builder; },
      order() { return builder; },
      eq(key, value) { filters.push([key, value]); return builder; },
      update(value) { update = value; return builder; },
      async range(start, end) {
        calls.push({ filters: [...filters] });
        return { data: rows.filter(row => filters.every(([k,v]) => row[k] === v)).slice(start, end + 1), error: null };
      },
      async maybeSingle() {
        calls.push({ filters: [...filters], update });
        const row = rows.find(row => filters.every(([k,v]) => row[k] === v));
        if (row && update) Object.assign(row, update, { updated_at: '2026-10-10T12:01:00Z' });
        return { data: row ? { ...row } : null, error: null };
      },
    };
    return builder;
  } };
  globalThis.taskRouteFixture = { user, supabase };
  return { rows, calls };
}
async function loadRoute(name) {
  let code = stripTypeScriptTypes(await readFile(new URL(name, import.meta.url), 'utf8'));
  code = code.replace(/import[^;]+from "next\/server";/, 'const NextResponse = { json: value => Response.json(value) };');
  code = code.replace(/import[^;]+from "@\/lib\/http";/, 'const getAuthenticatedUser = async () => globalThis.taskRouteFixture; const apiError = (error, status = 400) => Response.json({error}, {status});');
  code = code.replace('"@/lib/task"', JSON.stringify(new URL('../lib/task.ts', import.meta.url).href));
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}
const { GET } = await loadRoute('../routes/tasks/route.ts');
const { PATCH } = await loadRoute('../routes/tasks/[taskId]/route.ts');
const patch = (id, body) => PATCH(new Request('http://localhost/api/tasks/' + id, { method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }), { params: Promise.resolve({ taskId: id }) });

test('list and update require authentication', async () => {
  const { calls } = setup(null);
  assert.equal((await GET()).status, 401);
  assert.equal((await patch(taskId, { title: 'Changed' })).status, 401);
  assert.equal(calls.length, 0);
});
test('list returns only signed-in owner tasks', async () => {
  const { calls } = setup();
  const response = await GET();
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).tasks.map(task => task.id), [taskId]);
  assert.ok(calls[0].filters.some(([k,v]) => k === 'owner_id' && v === 'owner-a'));
});
test('another owner task cannot be changed or disclosed', async () => {
  const { rows } = setup();
  assert.equal((await patch(otherId, { title: 'Attack' })).status, 404);
  assert.equal(rows[1].title, 'Private B');
});
test('edit updates only intended fields and completion/reopen persist correctly', async () => {
  const { rows, calls } = setup();
  assert.equal((await patch(taskId, { title: 'Corrected', expectedUpdatedAt: rows[0].updated_at })).status, 200);
  assert.equal(rows[0].source_conversation_id, 'source-a');
  assert.ok(calls.at(-1).filters.some(([k]) => k === 'updated_at'));
  assert.equal((await patch(taskId, { status: 'completed' })).status, 200);
  assert.ok(rows[0].completed_at);
  assert.equal((await patch(taskId, { status: 'pending' })).status, 200);
  assert.equal(rows[0].completed_at, null);
});
test('stale edits, malformed ID and forbidden fields do not overwrite data', async () => {
  const { rows } = setup();
  assert.equal((await patch(taskId, { title: 'Stale', expectedUpdatedAt: '2026-10-09T12:00:00Z' })).status, 409);
  assert.equal((await patch('invalid', { title: 'Invalid' })).status, 400);
  assert.equal((await patch(taskId, { title: 'Forged', owner_id: 'owner-b' })).status, 400);
  assert.equal(rows[0].title, 'Task A');
});


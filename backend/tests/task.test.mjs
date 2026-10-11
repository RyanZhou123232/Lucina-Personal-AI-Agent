import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareTaskUpdate } from '../lib/task.ts';

test('editing title and description does not alter owner, source or completion', () => {
  assert.deepEqual(prepareTaskUpdate({ title: '  Corrected task  ', description: 'Updated' }, { status: 'pending', completed_at: null }), { title: 'Corrected task', description: 'Updated' });
});
test('complete records time, repeated completion keeps time, reopening clears time', () => {
  const date = '2026-10-10T12:00:00.000Z';
  assert.deepEqual(prepareTaskUpdate({ status: 'completed' }, { status: 'pending', completed_at: null }, date), { status: 'completed', completed_at: date });
  assert.deepEqual(prepareTaskUpdate({ status: 'completed' }, { status: 'completed', completed_at: date }, '2026-10-11T12:00:00.000Z'), { status: 'completed', completed_at: date });
  assert.deepEqual(prepareTaskUpdate({ status: 'pending' }, { status: 'completed', completed_at: date }), { status: 'pending', completed_at: null });
});
test('invalid or forbidden changes fail before a database update', () => {
  for (const body of [null, [], {}, { title: ' ' }, { title: 'x'.repeat(501) }, { description: 42 }, { status: 'invented' }, { owner_id: 'another-user' }, { source_conversation_id: 'forged' }, { completed_at: 'forged' }, { title: 'OK', expectedUpdatedAt: 'bad' }]) {
    assert.throws(() => prepareTaskUpdate(body, { status: 'pending', completed_at: null }));
  }
});
test('empty description clears it; concurrency token stays out of written fields', () => {
  assert.deepEqual(prepareTaskUpdate({ description: ' ', expectedUpdatedAt: '2026-10-10T12:00:00Z' }, { status: 'pending', completed_at: null }), { description: null });
});

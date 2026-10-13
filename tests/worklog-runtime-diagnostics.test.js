const test = require('node:test');
const assert = require('node:assert/strict');

const { describeWorkItemsRuntime } = require('../jira-migration/worklog-runtime-diagnostics');

test('YOU-40 reports collection capabilities and safe work-item metadata without descriptions', () => {
  const result = describeWorkItemsRuntime({
    size: 1,
    get: index => index === 0 ? {
      id: '199-10',
      date: '2026-10-13',
      duration: { minutes: 1 },
      text: 'must not appear in diagnostics'
    } : null,
    forEach: () => {}
  });

  assert.match(result.collection, /size=1/);
  assert.match(result.collection, /get=function/);
  assert.match(result.items[0], /source=get\[0\]/);
  assert.match(result.items[0], /id=199-10/);
  assert.match(result.items[0], /durationMinutes=1/);
  assert.doesNotMatch(result.items[0], /must not appear/);
});

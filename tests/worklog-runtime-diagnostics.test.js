const test = require('node:test');
const assert = require('node:assert/strict');

const { describeWorkItemsRuntime } = require('../jira-migration/worklog-runtime-diagnostics');

test('YOU-40 reports collection capabilities and safe work-item metadata without descriptions', () => {
  const result = describeWorkItemsRuntime({
    size: 1,
    get: index => index === 0 ? {
      id: '199-10',
      date: '2026-10-13',
      created: 1791849660000,
      updated: 1791849720000,
      duration: { minutes: 1 },
      author: { login: 'christian' },
      creator: { login: 'christian' },
      type: { name: 'Development' },
      text: 'must not appear in diagnostics',
      $$type: 'IssueWorkItem',
      toString: () => 'IssueWorkItem(199-10)',
      toShortString: () => 'Testes'
    } : null,
    forEach: () => {}
  });

  assert.match(result.collection, /size=1/);
  assert.match(result.collection, /get=function/);
  assert.match(result.items[0], /source=get\[0\]/);
  assert.match(result.items[0], /id=199-10/);
  assert.match(result.items[0], /durationMinutes=1/);
  assert.match(result.items[0], /created=1791849660000/);
  assert.match(result.items[0], /updated=1791849720000/);
  assert.match(result.items[0], /authorLogin=christian/);
  assert.match(result.items[0], /creatorLogin=christian/);
  assert.match(result.items[0], /typeName=Development/);
  assert.match(result.items[0], /\$\$type=IssueWorkItem/);
  assert.match(result.items[0], /toStringId=199-10/);
  assert.match(result.items[0], /toShortStringId=non-id\(length=6\)/);
  assert.doesNotMatch(result.items[0], /must not appear/);
});

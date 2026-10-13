const test = require('node:test');
const assert = require('node:assert/strict');

const { syncWorklogs } = require('../jira-migration/worklog-sync-service');
const { describeError } = require('../jira-migration/error-message');

const workItem = (id, overrides = {}) => ({
  id,
  duration: { minutes: 90 },
  date: Date.UTC(2026, 9, 13),
  description: 'Implemented the synchronization.',
  author: { login: 'christian' },
  type: { name: 'Development' },
  ...overrides
});

const fakeDependencies = overrides => {
  const calls = { fetch: [], create: [] };
  return {
    calls,
    fetchJiraWorklogs: jiraKey => {
      calls.fetch.push(jiraKey);
      return [];
    },
    createJiraWorklog: (jiraKey, payload) => calls.create.push({ jiraKey, payload }),
    ...overrides
  };
};

test('YOU-40 preserves exceptions without a JavaScript message for workflow diagnostics', () => {
  const runtimeException = { toString: () => 'java.net.SocketTimeoutException: Read timed out' };

  assert.equal(describeError(runtimeException), 'java.net.SocketTimeoutException: Read timed out');
  assert.equal(describeError(new Error('Forbidden')), 'Forbidden');
});

test('YOU-40 exports YouTrack work items with duration, date, description and source marker', () => {
  const dependencies = fakeDependencies();
  const logs = [];

  const result = syncWorklogs({ workItems: { forEach: visit => [workItem('90-1')].forEach(visit) } }, 'PRJ-1', dependencies, message => logs.push(message));

  assert.deepEqual(result, { exported: 1, skipped: 0, failed: 0 });
  assert.deepEqual(dependencies.calls.fetch, ['PRJ-1']);
  assert.deepEqual(dependencies.calls.create, [{
    jiraKey: 'PRJ-1',
    payload: {
      timeSpentSeconds: 5400,
      started: '2026-10-13T00:00:00.000+0000',
      comment: 'Implemented the synchronization.',
      properties: [{
        key: 'youtrack-work-item',
        value: { id: '90-1', author: 'christian', type: 'Development' }
      }]
    }
  }]);
  assert.match(logs[0], /exported 1/);
});

test('YOU-40 skips work items whose source ID is already present on Jira', () => {
  const dependencies = fakeDependencies({
    fetchJiraWorklogs: () => [{
      properties: [{ key: 'youtrack-work-item', value: { id: '90-1' } }]
    }]
  });

  const result = syncWorklogs({ workItems: { forEach: visit => [workItem('90-1')].forEach(visit) } }, 'PRJ-1', dependencies, () => {});

  assert.deepEqual(result, { exported: 0, skipped: 1, failed: 0 });
  assert.deepEqual(dependencies.calls.create, []);
});

test('YOU-40 continues exporting other work items when one Jira worklog request fails', () => {
  const dependencies = fakeDependencies({
    createJiraWorklog: (jiraKey, payload) => {
      dependencies.calls.create.push({ jiraKey, payload });
      if (payload.properties[0].value.id === '90-1') throw new Error('Forbidden');
    }
  });
  const logs = [];
  const issue = { workItems: { forEach: visit => [workItem('90-1'), workItem('90-2')].forEach(visit) } };

  const result = syncWorklogs(issue, 'PRJ-1', dependencies, message => logs.push(message));

  assert.deepEqual(result, { exported: 1, skipped: 0, failed: 1 });
  assert.equal(dependencies.calls.create.length, 2);
  assert.match(logs.find(log => /90-1/.test(log)), /failed/);
});

test('YOU-40 skips invalid zero-duration work items without preventing valid exports', () => {
  const dependencies = fakeDependencies();
  const issue = {
    workItems: { forEach: visit => [workItem('90-1', { duration: { minutes: 0 } }), workItem('90-2')].forEach(visit) }
  };

  const result = syncWorklogs(issue, 'PRJ-1', dependencies, () => {});

  assert.deepEqual(result, { exported: 1, skipped: 1, failed: 0 });
  assert.equal(dependencies.calls.create.length, 1);
});

test('YOU-40 retains source author and work type as Jira worklog metadata', () => {
  const payload = require('../jira-migration/worklog-sync-service').buildJiraWorklog(workItem('90-3', {
    author: { login: 'ana' },
    type: { name: 'Code review' }
  }));

  assert.deepEqual(payload.properties[0].value, {
    id: '90-3', author: 'ana', type: 'Code review'
  });
});

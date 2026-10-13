const test = require('node:test');
const assert = require('node:assert/strict');

const { syncWorklogs, toArray, buildJiraWorklog } = require('../jira-migration/worklog-sync-service');
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

test('YOU-40 traverses workflow sets with a standard visitor function', () => {
  const item = workItem('90-0');
  const workflowSet = {
    forEach(visitor) {
      assert.ok(Object.prototype.hasOwnProperty.call(visitor, 'prototype'));
      visitor(item);
    }
  };

  assert.deepEqual(toArray(workflowSet), [item]);
});

test('YOU-40 reads indexed workflow sets without relying on visitor arguments', () => {
  const first = workItem('90-4');
  const second = workItem('90-5');
  const workflowSet = {
    size: 2,
    get(index) { return [first, second][index]; },
    forEach(visitor) { visitor(); visitor(); }
  };

  assert.deepEqual(toArray(workflowSet), [first, second]);
});

test('YOU-40 accepts the YouTrack work-item text and ISO-date representation', () => {
  const payload = buildJiraWorklog({
    id: '199-10',
    duration: { minutes: 1 },
    date: '2026-10-13',
    text: 'Testes',
    author: { login: 'christian.bewzenko' },
    type: { name: 'Development' }
  });

  assert.equal(payload.timeSpentSeconds, 60);
  assert.equal(payload.started, '2026-10-13T00:00:00.000+0000');
  assert.equal(payload.comment, 'Testes');
});

test('YOU-40 exports a work item in the representation returned for E3-381', () => {
  const dependencies = fakeDependencies();
  const issue = {
    workItems: {
      forEach(visitor) {
        visitor({
          id: '199-10',
          duration: { minutes: 1 },
          date: '2026-10-13',
          text: 'Testes',
          author: { login: 'christian.bewzenko' },
          type: { name: 'Development' }
        });
      }
    }
  };

  assert.deepEqual(syncWorklogs(issue, 'WTDE3-225', dependencies, () => {}), {
    exported: 1, skipped: 0, failed: 0
  });
  assert.equal(dependencies.calls.create[0].payload.comment, 'Testes');
});

test('YOU-40 diagnostic-only runs do not read or create Jira worklogs', () => {
  const dependencies = fakeDependencies();
  const logs = [];

  const result = syncWorklogs({ workItems: { size: 0, get: () => null } }, 'WTDE3-225', dependencies, message => logs.push(message), {
    diagnostics: true,
    diagnosticOnly: true
  });

  assert.deepEqual(result, { diagnostic: true });
  assert.deepEqual(dependencies.calls.fetch, []);
  assert.deepEqual(dependencies.calls.create, []);
  assert.match(logs.at(-1), /no Jira worklogs were read or created/);
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

const test = require('node:test');
const assert = require('node:assert/strict');

const { getWorklogSyncDecision } = require('../jira-migration/worklog-sync-decision');
const { canShowWorklogSyncAction } = require('../jira-migration/worklog-action-visibility');

const issue = jiraId => ({ fields: { 'Jira ID': jiraId } });
const settings = { worklogSyncMode: 'Enabled', jiraEndpointUrl: 'https://jira.example', jiraApiToken: 'token' };

test('YOU-40 allows a dedicated worklog sync only for configured Jira-linked issues', () => {
  assert.deepEqual(getWorklogSyncDecision(issue('PRJ-1'), settings, { shouldSync: true, isDryRun: false }), {
    canSync: true,
    isDryRun: false,
    jiraKey: 'PRJ-1'
  });
});

test('YOU-40 keeps the dedicated action safe when worklog sync is disabled or Jira linkage is missing', () => {
  assert.equal(getWorklogSyncDecision(issue('PRJ-1'), { ...settings, worklogSyncMode: 'Disabled' }, { shouldSync: true }).canSync, false);
  assert.equal(getWorklogSyncDecision(issue(null), settings, { shouldSync: true }).canSync, false);
});

test('YOU-40 preserves Jira Sync dry-run mode for a dedicated worklog sync', () => {
  assert.deepEqual(getWorklogSyncDecision(issue('PRJ-1'), settings, { shouldSync: true, isDryRun: true }), {
    canSync: true,
    isDryRun: true,
    jiraKey: 'PRJ-1'
  });
});

test('YOU-40 keeps the manual worklog action visible for every reported issue', () => {
  assert.equal(canShowWorklogSyncAction({ isReported: true }), true);
  assert.equal(canShowWorklogSyncAction({ isReported: false }), false);
});

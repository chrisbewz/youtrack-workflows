const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateSyncDecision, getSubtasksToSync } = require('../jira-migration/sync-decisions');

const linkedParent = fields => ({
  links: {
    'subtask of': {
      first: () => ({ fields })
    }
  }
});

test('YOU-1 suppresses an issue disabled by its Jira Sync field', () => {
  const issue = { fields: { 'Jira Sync': { presentation: 'Disabled' } } };

  assert.deepEqual(evaluateSyncDecision(issue, { syncMode: 'Enabled' }), {
    shouldSync: false,
    isDryRun: false,
    reason: 'sync desabilitado para a issue'
  });
});

test('YOU-1 keeps project and issue dry-run modes free of real writes', () => {
  const enabledIssue = { fields: { 'Jira Sync': { presentation: 'Enabled' } } };
  const dryRunIssue = { fields: { 'Jira Sync': { presentation: 'Dry-Run' } } };

  assert.equal(evaluateSyncDecision(enabledIssue, { syncMode: 'Dry-Run' }).isDryRun, true);
  assert.equal(evaluateSyncDecision(dryRunIssue, { syncMode: 'Enabled' }).isDryRun, true);
  assert.equal(evaluateSyncDecision(enabledIssue, { syncMode: 'Enabled' }).shouldSync, true);
});

test('YOU-1 handles a missing optional Jira Sync field without throwing', () => {
  assert.equal(evaluateSyncDecision({ fields: {} }, { syncMode: 'Enabled' }).shouldSync, true);
});

test('YOU-2 suppresses a subtask when its parent disables subtask sync', () => {
  const issue = {
    fields: { 'Jira Sync': { presentation: 'Enabled' } },
    ...linkedParent({ 'Sync Subtasks': { name: 'Disabled' } })
  };

  assert.deepEqual(evaluateSyncDecision(issue, { syncMode: 'Enabled' }), {
    shouldSync: false,
    isDryRun: false,
    reason: 'sync de subtasks desabilitado na issue pai'
  });
});

test('YOU-2 preserves sync when there is no parent or optional parent field', () => {
  const rootIssue = { fields: { 'Jira Sync': { presentation: 'Enabled' } }, links: {} };
  const childWithoutField = {
    fields: { 'Jira Sync': { presentation: 'Enabled' } },
    ...linkedParent({})
  };

  assert.equal(evaluateSyncDecision(rootIssue, { syncMode: 'Enabled' }).shouldSync, true);
  assert.equal(evaluateSyncDecision(childWithoutField, { syncMode: 'Enabled' }).shouldSync, true);
});

test('YOU-2 returns existing children only when subtask sync is enabled', () => {
  const children = [
    { id: 'YOU-101', project: { id: '0-5' } },
    { id: 'YOU-102', project: { id: '0-5' } },
    { id: 'OTHER-1', project: { id: '0-9' } }
  ];
  const issue = {
    project: { id: '0-5' },
    fields: { 'Sync Subtasks': { name: 'Enabled' } },
    links: {
      'parent for': {
        forEach: visitor => children.forEach(visitor)
      }
    }
  };

  assert.deepEqual(getSubtasksToSync(issue), children.slice(0, 2));
  issue.fields['Sync Subtasks'] = { name: 'Disabled' };
  assert.deepEqual(getSubtasksToSync(issue), []);
});

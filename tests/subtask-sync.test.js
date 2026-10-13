const test = require('node:test');
const assert = require('node:assert/strict');

const { getSubtaskParentSyncPlan } = require('../jira-migration/sync-decisions');

const issue = (overrides = {}) => ({
  id: 'YOU-42',
  project: { id: '0-5' },
  fields: { Type: { name: 'Subtask' } },
  links: {},
  ...overrides
});

const parentLink = parent => ({
  'subtask of': { first: () => parent }
});

test('YOU-41 requires a parent before a Jira subtask can be created', () => {
  assert.deepEqual(getSubtaskParentSyncPlan(issue(), {}), {
    isSubtask: true,
    parent: null,
    parentJiraKey: null,
    needsParentSync: false,
    reason: 'subtarefa sem issue pai'
  });
});

test('YOU-41 requests parent synchronization before creating an unresolved subtask', () => {
  const parent = issue({
    id: 'YOU-41',
    fields: { Type: { name: 'Task' }, 'Jira ID': '' }
  });

  assert.deepEqual(getSubtaskParentSyncPlan(issue({ links: parentLink(parent) }), {}), {
    isSubtask: true,
    parent,
    parentJiraKey: null,
    needsParentSync: true,
    reason: null
  });
});

test('YOU-41 uses the parent Jira key for an already synchronized parent', () => {
  const parent = issue({
    id: 'YOU-41',
    fields: { Type: { name: 'Task' }, 'Jira ID': 'PROJ-41' }
  });

  assert.deepEqual(getSubtaskParentSyncPlan(issue({ links: parentLink(parent) }), {}), {
    isSubtask: true,
    parent,
    parentJiraKey: 'PROJ-41',
    needsParentSync: false,
    reason: null
  });
});

test('YOU-41 rejects cross-project parent links because Jira subtasks share their parent project', () => {
  const parent = issue({
    id: 'OTHER-41',
    project: { id: '0-9' },
    fields: { Type: { name: 'Task' }, 'Jira ID': 'OTHER-41' }
  });

  assert.deepEqual(getSubtaskParentSyncPlan(issue({ links: parentLink(parent) }), {}), {
    isSubtask: true,
    parent,
    parentJiraKey: null,
    needsParentSync: false,
    reason: 'issue pai pertence a outro projeto'
  });
});

const test = require('node:test');
const assert = require('node:assert/strict');

const { syncIssueLinks, getIssueTree } = require('../jira-migration/link-sync-service');

const mappingJson = JSON.stringify({
  'relates to': { jiraType: 'Relates', symmetric: true }
});

const enabledIssue = (jiraId, fields = {}, links = {}) => ({
  id: 'YOU-' + jiraId,
  fields: {
    'Jira ID': jiraId,
    'Jira Sync': { presentation: 'Enabled' },
    ...fields
  },
  links
});

const fakeDependencies = overrides => {
  const calls = { create: [], remove: [], addYouTrack: [], removeYouTrack: [], snapshots: [] };
  return {
    calls,
    fetchJiraLinks: () => [],
    createJiraLink: payload => calls.create.push(payload),
    deleteJiraLink: id => calls.remove.push(id),
    findYouTrackIssuesByJiraId: () => [],
    addYouTrackLink: (issue, linkName, target) => calls.addYouTrack.push({ issue, linkName, target }),
    removeYouTrackLink: (issue, linkName, target) => calls.removeYouTrack.push({ issue, linkName, target }),
    saveSnapshot: (issue, snapshot) => calls.snapshots.push({ issue, snapshot }),
    ...overrides
  };
};

test('YOU-16 creates a missing Jira link and saves the converged snapshot', () => {
  const target = enabledIssue('PRJ-2');
  const issue = enabledIssue('PRJ-1', {}, {
    'relates to': { forEach: visitor => visitor(target) }
  });
  const dependencies = fakeDependencies();

  const result = syncIssueLinks(issue, {
    linkSyncMode: 'Additive',
    linkTypeMappingJson: mappingJson
  }, dependencies);

  assert.equal(result.status, 'applied');
  assert.deepEqual(dependencies.calls.create, [{
    type: { name: 'Relates' },
    outwardIssue: { key: 'PRJ-1' },
    inwardIssue: { key: 'PRJ-2' }
  }]);
  assert.equal(dependencies.calls.snapshots.length, 1);
});

test('YOU-16 dry-run returns the plan without writes or snapshot mutation', () => {
  const target = enabledIssue('PRJ-2');
  const issue = enabledIssue('PRJ-1', { 'Jira Link Sync': { presentation: 'Dry-Run' } }, {
    'relates to': { forEach: visitor => visitor(target) }
  });
  const dependencies = fakeDependencies();

  const result = syncIssueLinks(issue, {
    linkSyncMode: 'Bidirectional',
    linkTypeMappingJson: mappingJson
  }, dependencies);

  assert.equal(result.status, 'dry-run');
  assert.equal(result.plan.jira.add.length, 1);
  assert.deepEqual(dependencies.calls.create, []);
  assert.deepEqual(dependencies.calls.snapshots, []);
});

test('YOU-21 global dry-run also prevents structured link writes', () => {
  const target = enabledIssue('PRJ-2');
  const dependencies = fakeDependencies();
  const issue = enabledIssue('PRJ-1', {}, {
    'relates to': { forEach: visitor => visitor(target) }
  });

  const result = syncIssueLinks(issue, {
    syncMode: 'Dry-Run',
    linkSyncMode: 'Bidirectional',
    linkTypeMappingJson: mappingJson
  }, dependencies);

  assert.equal(result.status, 'dry-run');
  assert.equal(result.plan.jira.add.length, 1);
  assert.deepEqual(dependencies.calls.create, []);
  assert.deepEqual(dependencies.calls.snapshots, []);
});

test('YOU-16 applies a Jira link to every eligible duplicate Jira ID in YouTrack', () => {
  const issue = enabledIssue('PRJ-1');
  const duplicateA = enabledIssue('PRJ-2');
  const duplicateB = enabledIssue('PRJ-2');
  const dependencies = fakeDependencies({
    fetchJiraLinks: () => [{
      id: '10001',
      type: { name: 'Relates' },
      inwardIssue: { key: 'PRJ-2' }
    }],
    findYouTrackIssuesByJiraId: () => [duplicateA, duplicateB]
  });

  const result = syncIssueLinks(issue, {
    linkSyncMode: 'Bidirectional',
    linkTypeMappingJson: mappingJson
  }, dependencies);

  assert.equal(result.status, 'applied');
  assert.equal(dependencies.calls.addYouTrack.length, 2);
  assert.deepEqual(dependencies.calls.addYouTrack.map(call => call.target), [duplicateA, duplicateB]);
});

test('YOU-16 skips issues that are not eligible for link synchronization', () => {
  const issue = enabledIssue('PRJ-1', {
    'Jira Sync': { presentation: 'Disabled' }
  });
  const dependencies = fakeDependencies();

  const result = syncIssueLinks(issue, {
    linkSyncMode: 'Bidirectional',
    linkTypeMappingJson: mappingJson
  }, dependencies);

  assert.equal(result.status, 'skipped');
  assert.match(result.reason, /Jira Sync/);
});

test('YOU-16 collects the current issue and its immediate children once', () => {
  const childA = enabledIssue('PRJ-2');
  const childB = enabledIssue('PRJ-3');
  const issue = enabledIssue('PRJ-1', {}, {
    'parent for': { forEach: visitor => [childA, childB, childA].forEach(visitor) }
  });

  assert.deepEqual(getIssueTree(issue), [issue, childA, childB]);
});

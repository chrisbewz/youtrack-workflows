const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  isLabelSyncEligible,
  normalizeJiraLabels,
  syncJiraLabels
} = require('../jira-migration/label-sync-service');

test('YOU-17 only enables label sync for reported issues explicitly enabled for Jira sync', () => {
  assert.equal(isLabelSyncEligible({
    isReported: true,
    fields: { 'Jira Sync': { name: 'Enabled' }, 'Jira ID': 'ABC-12' }
  }), true);
  assert.equal(isLabelSyncEligible({
    isReported: true,
    fields: { 'Jira Sync': { name: 'Dry-Run' }, 'Jira ID': 'ABC-12' }
  }), false);
  assert.equal(isLabelSyncEligible({
    isReported: false,
    fields: { 'Jira Sync': { name: 'Enabled' }, 'Jira ID': 'ABC-12' }
  }), false);
  assert.equal(isLabelSyncEligible({
    isReported: true,
    fields: { 'Jira Sync': { name: 'Enabled' } }
  }), false);
});

test('YOU-17 normalizes Jira labels by removing blanks and exact duplicates', () => {
  assert.deepEqual(
    normalizeJiraLabels(['backend', '', ' backend ', 'Backend', null, 'api']),
    ['backend', 'Backend', 'api']
  );
});

test('YOU-17 reuses existing tags and creates only missing tags', () => {
  const existing = { id: '6-1', name: 'backend' };
  const created = [];
  const attached = [];

  const result = syncJiraLabels(['backend', 'api', 'api'], {
    hasTag: () => false,
    findTagByName: name => name === 'backend' ? existing : null,
    createTag: name => {
      const tag = { id: '6-new-' + name, name };
      created.push(tag);
      return tag;
    },
    attachTag: tag => attached.push(tag)
  });

  assert.deepEqual(created, [{ id: '6-new-api', name: 'api' }]);
  assert.deepEqual(attached, [existing, { id: '6-new-api', name: 'api' }]);
  assert.deepEqual(result, { labels: 2, unchanged: 0, reused: 1, created: 1, attached: 2 });
});

test('YOU-17 is idempotent when the issue already has a matching tag', () => {
  const result = syncJiraLabels(['backend'], {
    hasTag: name => name === 'backend',
    findTagByName: () => { throw new Error('must not search'); },
    createTag: () => { throw new Error('must not create'); },
    attachTag: () => { throw new Error('must not attach'); }
  });

  assert.deepEqual(result, { labels: 1, unchanged: 1, reused: 0, created: 0, attached: 0 });
});

test('YOU-17 does not remove local tags when Jira has no labels', () => {
  let removed = false;
  const result = syncJiraLabels([], {
    hasTag: () => false,
    findTagByName: () => null,
    createTag: () => { throw new Error('must not create'); },
    attachTag: () => { throw new Error('must not attach'); },
    removeTag: () => { removed = true; }
  });

  assert.equal(removed, false);
  assert.deepEqual(result, { labels: 0, unchanged: 0, reused: 0, created: 0, attached: 0 });
});

test('YOU-17 rejects an invalid tag returned by the integration boundary', () => {
  assert.throws(() => syncJiraLabels(['api'], {
    hasTag: () => false,
    findTagByName: () => null,
    createTag: () => null,
    attachTag: () => {}
  }), /não retornou uma tag válida/);
});

test('YOU-17 exposes a global YouTrack token without making it mandatory for other syncs', () => {
  const settings = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'jira-migration', 'settings.json'),
    'utf8'
  ));
  const token = settings.properties.youtrackApiToken;

  assert.equal(token.type, 'string');
  assert.equal(token['x-scope'], 'GLOBAL');
  assert.equal(settings.required.includes('youtrackApiToken'), false);
});

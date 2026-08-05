const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getYouTrackVersionNames,
  buildVersionPlan
} = require('../jira-migration/version-mapping');

test('YOU-15 reads single and multi-value YouTrack version fields', () => {
  assert.deepEqual(getYouTrackVersionNames({ fields: { Release: { name: '1.2.0' } } }, 'Release'), ['1.2.0']);

  const multi = { forEach: visitor => [{ name: '1.2.0' }, { name: '2.0.0' }].forEach(visitor) };
  assert.deepEqual(getYouTrackVersionNames({ fields: { Release: multi } }, 'Release'), ['1.2.0', '2.0.0']);
  assert.deepEqual(getYouTrackVersionNames({ fields: {} }, ''), []);
});

test('YOU-15 prefers an available Jira version field over managed labels', () => {
  const plan = buildVersionPlan({
    versionNames: ['1.2.0'],
    jiraVersions: [{ id: '10001', name: '1.2.0' }],
    jiraFieldId: 'fixVersions',
    jiraFieldAvailable: true,
    existingLabels: ['backend', 'yt-version-old'],
    labelPrefix: 'yt-version-'
  });

  assert.deepEqual(plan.fields, {
    fixVersions: [{ id: '10001' }],
    labels: ['backend']
  });
  assert.deepEqual(plan.versionNamesInField, ['1.2.0']);
  assert.deepEqual(plan.versionNamesInLabels, []);
});

test('YOU-15 falls back to owned labels without deleting unrelated labels', () => {
  const plan = buildVersionPlan({
    versionNames: ['Release 3'],
    jiraVersions: [],
    jiraFieldId: 'fixVersions',
    jiraFieldAvailable: false,
    existingLabels: ['backend', 'yt-version-old'],
    labelPrefix: 'yt-version-'
  });

  assert.deepEqual(plan.fields, { labels: ['backend', 'yt-version-release-3'] });
  assert.deepEqual(plan.versionNamesInField, []);
  assert.deepEqual(plan.versionNamesInLabels, ['Release 3']);
});

test('YOU-15 uses labels only for versions missing from an available Jira field', () => {
  const plan = buildVersionPlan({
    versionNames: ['1.2.0', 'Future Release'],
    jiraVersions: [{ id: '10001', name: '1.2.0' }],
    jiraFieldId: 'customfield_12345',
    jiraFieldAvailable: true,
    existingLabels: [],
    labelPrefix: 'yt-version-'
  });

  assert.deepEqual(plan.fields.customfield_12345, [{ id: '10001' }]);
  assert.deepEqual(plan.fields.labels, ['yt-version-future-release']);
});

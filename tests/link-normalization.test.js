const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseLinkTypeMapping,
  normalizeJiraLinks,
  normalizeYouTrackLinks
} = require('../jira-migration/link-normalization');

const mappingJson = JSON.stringify({
  'relates to': { jiraType: 'Relates', symmetric: true },
  'depends on': { jiraType: 'Blocks', jiraSide: 'inward' },
  'is required for': { jiraType: 'Blocks', jiraSide: 'outward' }
});

test('YOU-16 parses and validates explicit link type mappings', () => {
  const mapping = parseLinkTypeMapping(mappingJson);

  assert.equal(mapping['relates to'].jiraType, 'Relates');
  assert.throws(() => parseLinkTypeMapping('{invalid'), /linkTypeMappingJson/);
  assert.throws(() => parseLinkTypeMapping('{"depends on":{"jiraType":"Blocks"}}'), /jiraSide/);
});

test('YOU-16 normalizes Jira links using stable Jira-key pairs', () => {
  const mapping = parseLinkTypeMapping(mappingJson);
  const jiraLinks = [
    { id: '10', type: { name: 'Relates' }, outwardIssue: { key: 'PRJ-2' } },
    { id: '11', type: { name: 'Blocks' }, inwardIssue: { key: 'PRJ-3' } },
    { id: '12', type: { name: 'Unknown' }, inwardIssue: { key: 'PRJ-4' } }
  ];

  const normalized = normalizeJiraLinks('PRJ-1', jiraLinks, mapping);

  assert.deepEqual(normalized.state, {
    'PRJ-1>PRJ-3': ['Blocks'],
    'PRJ-1|PRJ-2': ['Relates']
  });
  assert.deepEqual(normalized.linkIds, {
    'PRJ-1>PRJ-3\u0000Blocks': '11',
    'PRJ-1|PRJ-2\u0000Relates': '10'
  });
});

test('YOU-16 normalizes only eligible YouTrack links', () => {
  const mapping = parseLinkTypeMapping(mappingJson);
  const eligible = {
    fields: {
      'Jira ID': 'PRJ-2',
      'Jira Sync': { presentation: 'Enabled' }
    }
  };
  const withoutJiraId = {
    fields: { 'Jira Sync': { presentation: 'Enabled' } }
  };
  const disabled = {
    fields: {
      'Jira ID': 'PRJ-4',
      'Jira Sync': { presentation: 'Disabled' }
    }
  };
  const issue = {
    fields: { 'Jira ID': 'PRJ-1' },
    links: {
      'relates to': { forEach: visitor => [eligible, withoutJiraId, disabled].forEach(visitor) }
    }
  };

  const normalized = normalizeYouTrackLinks(issue, mapping);

  assert.deepEqual(normalized.state, { 'PRJ-1|PRJ-2': ['Relates'] });
  assert.equal(normalized.targets['PRJ-2'], eligible);
  assert.deepEqual(normalized.skipped, [
    { linkName: 'relates to', reason: 'target sem Jira ID' },
    { linkName: 'relates to', reason: 'target com Jira Sync diferente de Enabled' }
  ]);
});

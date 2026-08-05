const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseLinkTypeMapping,
  normalizeJiraLinks,
  normalizeYouTrackLinks,
  resolveLinkOperation,
  collectUnresolvedYouTrackLinkTargets
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

test('YOU-16 resolves canonical operations to Jira payload and YouTrack direction', () => {
  const mapping = parseLinkTypeMapping(mappingJson);
  const outward = resolveLinkOperation('PRJ-1', {
    pair: 'PRJ-1>PRJ-2',
    link: 'Blocks'
  }, mapping);
  const inward = resolveLinkOperation('PRJ-2', {
    pair: 'PRJ-1>PRJ-2',
    link: 'Blocks'
  }, mapping);
  const symmetric = resolveLinkOperation('PRJ-1', {
    pair: 'PRJ-1|PRJ-3',
    link: 'Relates'
  }, mapping);

  assert.deepEqual(outward, {
    linkName: 'is required for',
    targetJiraKey: 'PRJ-2',
    jiraPayload: {
      type: { name: 'Blocks' },
      outwardIssue: { key: 'PRJ-1' },
      inwardIssue: { key: 'PRJ-2' }
    }
  });
  assert.equal(inward.linkName, 'depends on');
  assert.equal(inward.targetJiraKey, 'PRJ-1');
  assert.equal(symmetric.linkName, 'relates to');
  assert.equal(symmetric.targetJiraKey, 'PRJ-3');
});

test('YOU-21 collects unique enabled linked targets that still need a Jira issue', () => {
  const mapping = parseLinkTypeMapping(mappingJson);
  const unresolved = { id: 'YOU-2', project: { id: 'P1' }, fields: {
    'Jira Sync': { name: 'Enabled' }, 'Jira ID': null
  } };
  const resolved = { id: 'YOU-3', project: { id: 'P1' }, fields: {
    'Jira Sync': { name: 'Enabled' }, 'Jira ID': 'APP-3'
  } };
  const otherProject = { id: 'OTHER-1', project: { id: 'P2' }, fields: {
    'Jira Sync': { name: 'Enabled' }, 'Jira ID': null
  } };
  const source = {
    project: { id: 'P1' },
    links: {
      'relates to': { forEach: visitor => [unresolved, resolved, unresolved, otherProject].forEach(visitor) }
    }
  };

  assert.deepEqual(collectUnresolvedYouTrackLinkTargets(source, mapping), [unresolved]);
});

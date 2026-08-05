const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  extractArticleIds,
  buildMarkdownFile,
  parseStoredMappings,
  buildReconciliationPlan,
  evaluateArticleSync
} = require('../jira-migration/article-sync-service');

test('YOU-20 extracts and deduplicates YouTrack article IDs from descriptions', () => {
  const description = [
    'See YOU-A-12 and [details](https://example.youtrack.cloud/articles/OPS-A-7/details).',
    'Repeated: YOU-A-12. Issue-like IDs such as YOU-20 are ignored.'
  ].join('\n');

  assert.deepEqual(extractArticleIds(description), ['YOU-A-12', 'OPS-A-7']);
  assert.deepEqual(extractArticleIds(''), []);
});

test('YOU-20 creates UTF-8 Markdown attachments named by article ID with an optional safe prefix', () => {
  const article = { id: 'YOU-A-12', summary: 'Runbook', content: '# Olá 👋', updated: 1234 };

  assert.deepEqual(buildMarkdownFile(article, ''), {
    articleId: 'YOU-A-12',
    updated: 1234,
    fileName: 'YOU-A-12.md',
    content: '# Runbook\n\n# Olá 👋\n',
    size: 23,
    mimeType: 'text/markdown; charset=utf-8'
  });
  assert.equal(buildMarkdownFile(article, '../kb:').fileName, '..kb-YOU-A-12.md');
});

test('YOU-20 respects project, issue and dry-run synchronization modes', () => {
  const issue = {
    isReported: true,
    fields: { 'Jira ID': 'APP-20', 'Jira Sync': { name: 'Enabled' } }
  };

  assert.deepEqual(evaluateArticleSync(issue, { syncMode: 'Enabled' }), {
    eligible: true, isDryRun: false, reason: null, jiraKey: 'APP-20'
  });
  assert.deepEqual(evaluateArticleSync(issue, { syncMode: 'Dry-Run' }), {
    eligible: true, isDryRun: true, reason: null, jiraKey: 'APP-20'
  });
  assert.equal(evaluateArticleSync(issue, { syncMode: 'Disabled' }).eligible, false);
  assert.equal(evaluateArticleSync({ ...issue, fields: {} }, { syncMode: 'Enabled' }).eligible, false);
});

test('YOU-20 treats missing or invalid stored mapping JSON as empty', () => {
  assert.deepEqual(parseStoredMappings(), {});
  assert.deepEqual(parseStoredMappings('{invalid'), {});
  assert.deepEqual(parseStoredMappings('[]'), {});
  assert.deepEqual(parseStoredMappings('{"YOU-A-1":{"attachmentId":"42"}}'), {
    'YOU-A-1': { attachmentId: '42' }
  });
});

test('YOU-20 plans creates, replacements, removals and unchanged articles deterministically', () => {
  const desired = [
    { articleId: 'YOU-A-1', updated: 100, fileName: 'YOU-A-1.md' },
    { articleId: 'YOU-A-2', updated: 201, fileName: 'YOU-A-2.md' },
    { articleId: 'YOU-A-4', updated: 400, fileName: 'YOU-A-4.md' }
  ];
  const stored = {
    'YOU-A-1': { attachmentId: '11', updated: 100, fileName: 'YOU-A-1.md' },
    'YOU-A-2': { attachmentId: '22', updated: 200, fileName: 'YOU-A-2.md' },
    'YOU-A-3': { attachmentId: '33', updated: 300, fileName: 'YOU-A-3.md' }
  };

  assert.deepEqual(buildReconciliationPlan(desired, stored), {
    uploads: [
      { articleId: 'YOU-A-2', updated: 201, fileName: 'YOU-A-2.md', previousAttachmentId: '22' },
      { articleId: 'YOU-A-4', updated: 400, fileName: 'YOU-A-4.md', previousAttachmentId: null }
    ],
    removals: [{ articleId: 'YOU-A-3', attachmentId: '33' }],
    unchanged: ['YOU-A-1']
  });
});

test('YOU-20 exposes an optional project-level attachment prefix', () => {
  const settings = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'jira-migration', 'settings.json'), 'utf8'
  ));

  assert.equal(settings.properties.articleAttachmentPrefix.default, '');
  assert.equal(settings.properties.articleAttachmentPrefix['x-scope'], 'PROJECT');
});

test('YOU-20 declares app-owned mappings and a compatible minimum YouTrack version', () => {
  const root = path.join(__dirname, '..', 'jira-migration');
  const extensions = JSON.parse(fs.readFileSync(path.join(root, 'entity-extensions.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const byType = Object.fromEntries(
    extensions.entityTypeExtensions.map(item => [item.entityType, item.properties])
  );

  assert.equal(byType.Issue.jiraArticleAttachments.type, 'string');
  assert.deepEqual(byType.Article.jiraMarkdownConsumers, { type: 'Issue', multi: true });
  assert.equal(manifest.minYouTrackVersion, '2024.3.0');
});

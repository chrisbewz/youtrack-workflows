const test = require('node:test');
const assert = require('node:assert/strict');

const { composeMarkdownDocuments } = require('../task-export/markdown-composer');

test('returns an empty artifact for no documents', () => {
  assert.equal(composeMarkdownDocuments([]), '');
});

test('separates multiple task documents with a Markdown divider', () => {
  assert.equal(
    composeMarkdownDocuments(['# Root\n', '# Child\n']),
    '# Root\n\n---\n\n# Child\n'
  );
});

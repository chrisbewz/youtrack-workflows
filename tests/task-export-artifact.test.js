const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildMarkdownFilename,
  buildMarkdownDownloadHeaders,
  slugify
} = require('../task-export/export-artifact');

test('slugifies titles into stable download-safe names', () => {
  assert.equal(slugify('Validar documento E3 — México!'), 'validar-documento-e3-mexico');
});

test('builds a Markdown filename from the readable issue id and title', () => {
  assert.equal(
    buildMarkdownFilename({
      idReadable: 'E3-374',
      summary: 'Validar documento E3'
    }),
    'E3-374-validar-documento-e3.md'
  );
});

test('falls back to the issue id when no readable id is available', () => {
  assert.equal(
    buildMarkdownFilename({
      id: '3-1067',
      summary: 'Task sem título seguro'
    }),
    '3-1067-task-sem-titulo-seguro.md'
  );
});

test('builds attachment headers for a Markdown download', () => {
  assert.deepEqual(
    buildMarkdownDownloadHeaders({
      idReadable: 'E3-374',
      summary: 'Validar documento E3'
    }),
    {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': 'attachment; filename="E3-374-validar-documento-e3.md"'
    }
  );
});

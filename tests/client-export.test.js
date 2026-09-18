const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createPdfBytes,
  createZipBytes,
  createDownload
} = require('../task-export/widgets/task-export/client-export');

test('creates a PDF document with a valid header and trailer', () => {
  const bytes = createPdfBytes('# Título\n\nDescrição com ação');
  const text = Buffer.from(bytes).toString('latin1');

  assert.equal(text.slice(0, 8), '%PDF-1.4');
  assert.match(text, /xref/);
  assert.match(text, /%%EOF/);
});

test('keeps long Markdown content across multiple PDF pages', () => {
  const markdown = Array.from({ length: 120 }, (_, index) => 'Linha ' + index).join('\n');
  const text = Buffer.from(createPdfBytes(markdown)).toString('latin1');

  assert.ok((text.match(/\/Type \/Page /g) || []).length >= 2);
});

test('creates a ZIP archive containing the requested Markdown files', () => {
  const bytes = createZipBytes([
    { fileName: 'E3-374.md', content: '# Root\n' },
    { fileName: 'E3-375.md', content: '# Child\n' }
  ]);
  const text = Buffer.from(bytes).toString('latin1');

  assert.deepEqual(Array.from(bytes.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04]);
  assert.match(text, /E3-374\.md/);
  assert.match(text, /E3-375\.md/);
  assert.deepEqual(Array.from(bytes.slice(-22, -18)), [0x50, 0x4b, 0x05, 0x06]);
});

test('creates browser download metadata for a generated artifact', () => {
  const download = createDownload('task.md', 'text/markdown; charset=utf-8', 'hello');

  assert.equal(download.fileName, 'task.md');
  assert.equal(download.mimeType, 'text/markdown; charset=utf-8');
  assert.equal(download.content, 'hello');
});

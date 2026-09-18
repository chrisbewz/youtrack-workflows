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

test('preserves Markdown hierarchy when generating a PDF', () => {
  const markdown = [
    '# E3-374 Root task',
    '',
    '## Description',
    '',
    '**Proposal:** Fix the import.',
    '',
    '- First step',
    '- Second step',
    '',
    '---',
    '',
    '```text',
    'const answer = 42;',
    '```'
  ].join('\n');
  const text = Buffer.from(createPdfBytes(markdown)).toString('latin1');

  assert.match(text, /\/F2 18 Tf/);
  assert.match(text, /\/F2 15 Tf/);
  assert.match(text, /\/F3 10 Tf/);
  assert.match(text, /BT 50 790 Td 0 0 0 rg \/F2 18 Tf/);
  assert.match(text, /\/F2 11 Tf \(Proposal:\) Tj/);
  assert.match(text, /First step/);
  assert.match(text, /const answer = 42;/);
  assert.doesNotMatch(text, /\# E3-374 Root task/);
  assert.doesNotMatch(text, /NaN/);
});

test('keeps common Unicode checklist and list markers readable in PDFs', () => {
  const text = Buffer.from(createPdfBytes('• Bullet\n☑ Done\n🔹 Detail')).toString('latin1');

  assert.match(text, /\x95 Bullet/);
  assert.match(text, /\[x\] Done/);
  assert.match(text, /- Detail/);
  assert.doesNotMatch(text, /\? Bullet/);
});

test('preserves Markdown links as clickable PDF annotations', () => {
  const text = Buffer.from(createPdfBytes('Read [the documentation](https://example.com/docs).')).toString('latin1');

  assert.match(text, /the documentation/);
  assert.match(text, /\/Subtype \/Link/);
  assert.match(text, /\/URI \(https:\/\/example\.com\/docs\)/);
  assert.doesNotMatch(text, /0\.5 w/);
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

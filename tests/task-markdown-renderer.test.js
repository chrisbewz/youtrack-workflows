const test = require('node:test');
const assert = require('node:assert/strict');

const { renderTaskMarkdown } = require('../task-export/markdown-renderer');

test('renders the issue title as H1 and preserves the Markdown description', () => {
  const markdown = renderTaskMarkdown({
    summary: 'E3-374 — Validar documento',
    description: '**Proposta:** validar a planilha.'
  });

  assert.equal(
    markdown,
    '# E3-374 — Validar documento\n\n## Descrição\n\n**Proposta:** validar a planilha.\n'
  );
});

test('emits an empty description body when the issue has no description', () => {
  const markdown = renderTaskMarkdown({
    summary: 'Task sem descrição',
    description: null
  });

  assert.equal(markdown, '# Task sem descrição\n\n## Descrição\n\n');
});

test('escapes Markdown syntax in the issue title without changing the description', () => {
  const markdown = renderTaskMarkdown({
    summary: 'Checklist [México] #1',
    description: 'Texto *preservado*.'
  });

  assert.equal(
    markdown,
    '# Checklist \\[México\\] \\#1\n\n## Descrição\n\nTexto *preservado*.\n'
  );
});

test('rejects issues without a usable title', () => {
  assert.throws(
    () => renderTaskMarkdown({ summary: '  ', description: 'Descrição' }),
    /summary must be a non-empty string/
  );
});

test('renders optional fields and tags only when requested', () => {
  const markdown = renderTaskMarkdown({
    summary: 'Task com metadados',
    description: 'Descrição',
    fields: {
      State: { name: 'In Progress' },
      Priority: { name: 'Critical' },
      Empty: null
    },
    tags: [{ name: 'mexico' }, { name: 'export' }]
  }, {
    includeFields: true,
    includeTags: true
  });

  assert.equal(
    markdown,
    '# Task com metadados\n\n' +
    '## Descrição\n\n' +
    'Descrição\n\n' +
    '## Campos\n\n' +
    '| Campo | Valor |\n' +
    '| --- | --- |\n' +
    '| Priority | Critical |\n' +
    '| State | In Progress |\n\n' +
    '## Tags\n\n' +
    '\x60mexico\x60, \x60export\x60\n'
  );
});

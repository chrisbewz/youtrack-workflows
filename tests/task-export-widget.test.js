const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('widget calls the data endpoint through its HTTP handler', () => {
  const widget = fs.readFileSync(
    path.join(__dirname, '..', 'task-export', 'widgets', 'task-export', 'index.html'),
    'utf8'
  );

  assert.match(widget, /host\.fetchApp\('markdown-export-http\/data', \{ scope: true \}\)/);
  assert.match(widget, /Não foi possível preparar a exportação/);
  assert.match(widget, /@media \(prefers-color-scheme: dark\)/);
  assert.match(widget, /const locale = String\(host\.locale \|\| 'en'\)/);
});

test('widget uses a neutral label and an export icon in the issue menu', () => {
  const manifest = require('../task-export/manifest.json');
  const widget = manifest.widgets.find(item => item.key === 'task-export-menu');

  assert.equal(widget.name, 'Export task');
  assert.equal(widget.iconPath, 'icons/export.svg');
});

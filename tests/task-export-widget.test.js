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
  assert.match(widget, /<script src="client-export\.js"><\/script>/);
  assert.match(widget, /Download failed\. Please try again\./);
  assert.match(widget, /id="task-list"/);
  assert.match(widget, /id="export-menu"/);
  assert.match(widget, /Copy Markdown/);
  assert.match(widget, /navigator\.clipboard\.writeText/);
  assert.match(widget, /const task = document\.task \|\| \{\}/);
  assert.match(widget, /: document\.fileName/);
});

test('widget uses a neutral label and an export icon in the issue menu', () => {
  const manifest = require('../task-export/manifest.json');
  const widget = manifest.widgets.find(item => item.key === 'task-export-menu');

  assert.equal(widget.name, 'Export task');
  assert.equal(widget.iconPath, 'widgets/task-export/icons/export.svg');
});

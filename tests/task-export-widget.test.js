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
  assert.match(widget, /id="export-primary"/);
  assert.match(widget, /id="export-format"/);
  assert.match(widget, /class="export-split"/);
  assert.match(widget, /let selectedExportFormat = 'markdown'/);
  assert.match(widget, /exportPrimary\.onclick = \(\) => runExport\(selectedExportFormat\)/);
  assert.match(widget, /Copy Markdown/);
  assert.match(widget, /navigator\.clipboard\.writeText/);
  assert.match(widget, /className = 'task-item'/);
  assert.match(widget, /className = 'task-id'/);
  assert.match(widget, /className = 'task-title'/);
  assert.match(widget, /item\.append\(taskId, taskTitle\)/);
  assert.match(widget, /item\.draggable = true/);
  assert.match(widget, /addEventListener\('drop'/);
  assert.match(widget, /let orderedDocuments = payload\.documents\.slice\(\)/);
  assert.match(widget, /const taskDetails = exportDocument =>/);
  assert.match(widget, /match\(\/\^#\\s\+\(\.\+\)\$\/m\)/);
  assert.match(widget, /replace\(\/\^\.\*\\\.md\\s\+—\\s\+\//);
  assert.match(widget, /typeof exportDocument\.originalTitle === 'string'/);
  assert.match(widget, /exportDocument\.idReadable \|\| task\.idReadable/);
  assert.match(widget, /match\(\/\[A-Za-z\]\[A-Za-z0-9\]\*-\\d\+\//);
  assert.match(widget, /fileId \? fileId\[0\] : ''/);
  assert.match(widget, /: leftTask\.title/);
  assert.match(widget, /const orderedMarkdown/);
  assert.match(widget, /createZipBytes\(orderedDocuments\)/);
  assert.match(widget, /id="export-options"/);
  assert.match(widget, /id="include-fields"/);
  assert.match(widget, /class="option-help"/);
  assert.match(widget, /payload\.projectOptions\[key\]/);
  assert.match(widget, /host\.fetchApp\('markdown-export-http\/data', \{ scope: true, query \}\)/);
  assert.match(widget, /id="task-sort"/);
  assert.match(widget, /new Intl\.Collator\(locale, \{ numeric: true/);
  assert.match(widget, /taskList\.focus\(\)/);
});

test('widget uses a neutral label and an export icon in the issue menu', () => {
  const manifest = require('../task-export/manifest.json');
  const widget = manifest.widgets.find(item => item.key === 'task-export-menu');

  assert.equal(widget.name, 'Export task');
  assert.equal(widget.iconPath, 'widgets/task-export/icons/export.svg');
});

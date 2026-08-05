const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { copyWorkflowPackage } = require('../scripts/upload-workflow');

test('workflow upload staging excludes local dependency and IDE directories', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-upload-test-'));
  const source = path.join(tempRoot, 'jira-migration');
  const destination = path.join(tempRoot, 'staged', 'jira-migration');

  try {
    fs.mkdirSync(path.join(source, 'node_modules', 'dependency'), { recursive: true });
    fs.mkdirSync(path.join(source, '.idea'), { recursive: true });
    fs.mkdirSync(path.join(source, 'nested', 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(source, 'manifest.json'), '{}');
    fs.writeFileSync(path.join(source, 'workflow.js'), 'module.exports = {};');
    fs.writeFileSync(path.join(source, 'node_modules', 'dependency', 'index.js'), 'ignored');
    fs.writeFileSync(path.join(source, '.idea', 'workspace.xml'), 'ignored');
    fs.writeFileSync(path.join(source, 'nested', 'node_modules', 'index.js'), 'ignored');

    const copiedFiles = copyWorkflowPackage(source, destination);

    assert.deepEqual(copiedFiles.sort(), ['manifest.json', 'workflow.js']);
    assert.equal(fs.existsSync(path.join(destination, 'node_modules')), false);
    assert.equal(fs.existsSync(path.join(destination, '.idea')), false);
    assert.equal(fs.existsSync(path.join(destination, 'nested', 'node_modules')), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

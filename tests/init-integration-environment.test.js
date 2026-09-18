const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { initializeIntegrationEnvironment } = require('../scripts/init-integration-environment');

test('initializes an integration environment without overwriting local configuration', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-environment-test-'));
  const workflowDirectory = path.join(root, 'tests', 'integration', 'task-export');
  const examplePath = path.join(workflowDirectory, '.env.example');
  const localPath = path.join(workflowDirectory, '.env.local');

  try {
    fs.mkdirSync(workflowDirectory, { recursive: true });
    fs.writeFileSync(examplePath, 'YOUTRACK_TEST_TOKEN=\n');

    assert.equal(initializeIntegrationEnvironment('task-export', root), localPath);
    assert.equal(fs.readFileSync(localPath, 'utf8'), 'YOUTRACK_TEST_TOKEN=\n');
    assert.throws(
      () => initializeIntegrationEnvironment('task-export', root),
      /already exists/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects unsupported workflow names', () => {
  assert.throws(
    () => initializeIntegrationEnvironment('unknown-workflow', process.cwd()),
    /Unsupported integration workflow/
  );
});

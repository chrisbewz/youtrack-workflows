const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  getIntegrationProfile,
  getIntegrationEnvironmentPath
} = require('../scripts/integration-profile');
const { buildDockerComposeArguments } = require('../scripts/run-integration-compose');
const fs = require('node:fs');
const os = require('node:os');

test('uses the local profile when no integration profile is selected', () => {
  assert.equal(getIntegrationProfile({}), 'local');
});

test('accepts named integration profiles and resolves their environment file', () => {
  const root = path.join('repo', 'root');
  const environment = { INTEGRATION_PROFILE: 'ci' };

  assert.equal(getIntegrationProfile(environment), 'ci');
  assert.equal(
    getIntegrationEnvironmentPath('task-export', root, environment),
    path.join(root, 'tests', 'integration', 'task-export', '.env.ci')
  );
});

test('rejects unsafe integration profile names', () => {
  assert.throws(() => getIntegrationProfile({ INTEGRATION_PROFILE: '../secret' }), /Invalid integration profile/);
  assert.throws(() => getIntegrationProfile({ INTEGRATION_PROFILE: 'corp profile' }), /Invalid integration profile/);
});

test('builds Docker Compose arguments from the selected profile', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-compose-profile-test-'));
  const environmentPath = path.join(root, 'tests', 'integration', 'task-export', '.env.ci');

  try {
    fs.mkdirSync(path.dirname(environmentPath), { recursive: true });
    fs.writeFileSync(environmentPath, 'YOUTRACK_IMAGE_TAG=2026.1.1\n');

    assert.deepEqual(
      buildDockerComposeArguments('task-export', ['up', '-d', 'youtrack'], root, { INTEGRATION_PROFILE: 'ci' }),
      [
        'compose', '--env-file', 'tests/integration/task-export/.env.ci',
        '-f', 'tests/integration/task-export/compose.yml', 'up', '-d', 'youtrack'
      ]
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

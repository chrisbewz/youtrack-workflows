const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

test('integration Compose environments support overriding registry image repositories', () => {
  ['task-export', 'jira-migration'].forEach(workflow => {
    const compose = read('tests/integration/' + workflow + '/compose.yml');

    assert.match(compose, /YOUTRACK_IMAGE_REPOSITORY:-jetbrains\/youtrack/);
    assert.match(compose, /RUNNER_NODE_IMAGE:-node:22-alpine/);
  });
});

test('integration environment examples retain public registry defaults', () => {
  ['task-export', 'jira-migration'].forEach(workflow => {
    const environment = read('tests/integration/' + workflow + '/.env.example');

    assert.match(environment, /^YOUTRACK_IMAGE_REPOSITORY=jetbrains\/youtrack\r?$/m);
    assert.match(environment, /^RUNNER_NODE_IMAGE=node:22-alpine\r?$/m);
  });
});

test('integration runner accepts a mirrored Node base image', () => {
  const dockerfile = read('tests/integration/runner/Dockerfile');

  assert.match(dockerfile, /^ARG NODE_IMAGE=node:22-alpine$/m);
  assert.match(dockerfile, /^FROM \$\{NODE_IMAGE\}$/m);
});

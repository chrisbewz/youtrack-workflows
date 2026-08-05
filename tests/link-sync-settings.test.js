const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const settings = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'jira-migration', 'settings.json'),
  'utf8'
));

test('YOU-16 exposes safe project-level link synchronization settings', () => {
  const mode = settings.properties.linkSyncMode;
  const mapping = settings.properties.linkTypeMappingJson;

  assert.deepEqual(mode.enum, ['Disabled', 'Dry-Run', 'Additive', 'Bidirectional']);
  assert.equal(mode.default, 'Disabled');
  assert.equal(mode['x-scope'], 'PROJECT');
  assert.equal(mapping.type, 'string');
  assert.equal(mapping.default, '{}');
  assert.equal(mapping['x-scope'], 'PROJECT');
});

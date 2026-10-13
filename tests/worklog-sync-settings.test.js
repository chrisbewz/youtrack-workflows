const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const settings = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'jira-migration', 'settings.json'),
  'utf8'
));

test('YOU-40 exposes opt-in project-level worklog synchronization', () => {
  const setting = settings.properties.worklogSyncMode;

  assert.equal(setting.default, 'Disabled');
  assert.equal(setting['x-scope'], 'PROJECT');
  assert.deepEqual(setting.enum, ['Disabled', 'Enabled']);
  assert.equal(settings.required.includes('worklogSyncMode'), false);
});

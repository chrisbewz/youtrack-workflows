const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const settings = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'jira-migration', 'settings.json'),
  'utf8'
));

test('YOU-15 exposes optional and safely disabled version settings', () => {
  const properties = settings.properties;

  assert.equal(properties.youtrackVersionFieldName.default, '');
  assert.equal(properties.youtrackVersionFieldName['x-scope'], 'PROJECT');
  assert.equal(properties.jiraVersionFieldId.default, 'fixVersions');
  assert.equal(properties.versionLabelPrefix.default, 'yt-version-');
  assert.equal(settings.required.includes('youtrackVersionFieldName'), false);
});

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildWorklogQuery } = require('../jira-migration/worklog-request');

test('YOU-40 serializes worklog pagination query values for the YouTrack HTTP runtime', () => {
  assert.deepEqual(buildWorklogQuery(0), {
    expand: 'properties',
    startAt: '0',
    maxResults: '1000'
  });
});

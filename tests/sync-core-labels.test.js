const test = require('node:test');
const assert = require('node:assert/strict');

const { getJiraLabels } = require('../jira-migration/jira-label-mapping');

test('YOU-5 excludes reserved YouTrack labels from the Jira issue payload', () => {
  const issue = {
    tags: {
      forEach(visitor) {
        [{ name: 'backend team' }, { name: 'jira:no-attachments' }, { name: 'release' }].forEach(visitor);
      }
    }
  };

  assert.deepEqual(getJiraLabels(issue, { reservedLabelNames: 'jira:no-attachments,private' }), [
    'backend-team',
    'release'
  ]);
});

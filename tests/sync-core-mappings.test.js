const test = require('node:test');
const assert = require('node:assert/strict');

const mappings = require('../jira-migration/sync-mappings');

const issueWith = ({ state = 'Open', type = 'Task', priority = 'Normal' } = {}) => ({
  fields: {
    State: { name: state },
    Type: { name: type },
    Priority: { name: priority }
  }
});

test('YOU-4 maps configured states and preserves default fallback', () => {
  const { getJiraStatus } = mappings;

  assert.equal(getJiraStatus(issueWith({ state: 'Doing' }), {
    statusDoneStates: 'Released, Closed',
    statusInProgressStates: 'Doing, Reviewing'
  }), 'In Progress');
  assert.equal(getJiraStatus(issueWith({ state: 'Released' }), {
    statusDoneStates: 'Released, Closed',
    statusInProgressStates: 'Doing, Reviewing'
  }), 'Done');
  assert.equal(getJiraStatus(issueWith({ state: 'Open' }), {}), 'To Do');
});

test('YOU-4 maps configured priorities and preserves legacy Major fallback', () => {
  const { getJiraPriority } = mappings;
  const settings = {
    priorityHighestName: 'Urgent',
    priorityHighestNameJira: 'Blocker',
    priorityMediumNameJira: 'Medium'
  };

  assert.equal(getJiraPriority(issueWith({ priority: 'Urgent' }), settings), 'Blocker');
  assert.equal(getJiraPriority(issueWith({ priority: 'Major' }), settings), 'Medium');
});

test('YOU-8 maps configured types and preserves legacy and unknown fallbacks', () => {
  const { getJiraIssueType } = mappings;
  const settings = {
    epicItemType: 'Initiative',
    storyItemType: 'Story',
    taskItemType: 'Work',
    subTaskItemType: 'Child Work'
  };

  assert.equal(getJiraIssueType(issueWith({ type: 'Initiative' }), settings), 'Epic');
  assert.equal(getJiraIssueType(issueWith({ type: 'Child Work' }), settings), 'Sub-task');
  assert.equal(getJiraIssueType(issueWith({ type: 'Bug' }), settings), 'Bug');
  assert.equal(getJiraIssueType(issueWith({ type: 'Unknown' }), settings), 'Task');
});

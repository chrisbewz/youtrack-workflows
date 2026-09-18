const test = require('node:test');
const assert = require('node:assert/strict');

const { collectIssues } = require('../task-export/issue-export-collector');

const issue = (id, children = []) => ({
  id,
  links: {
    'parent for': {
      forEach: callback => children.forEach(callback)
    }
  }
});

test('collects the root issue only when subtasks are disabled', () => {
  const root = issue('root', [issue('child')]);

  const result = collectIssues(root, { includeSubtasks: false });

  assert.deepEqual(result.issues.map(item => item.id), ['root']);
  assert.deepEqual(result.warnings, []);
});

test('collects descendants in deterministic pre-order', () => {
  const root = issue('root', [
    issue('first', [issue('first-child')]),
    issue('second')
  ]);

  const result = collectIssues(root, { includeSubtasks: true });

  assert.deepEqual(
    result.issues.map(item => item.id),
    ['root', 'first', 'first-child', 'second']
  );
});

test('emits each issue once and records repeated references', () => {
  const repeated = issue('repeated');
  const root = issue('root', [repeated, issue('branch', [repeated])]);

  const result = collectIssues(root, { includeSubtasks: true });

  assert.deepEqual(result.issues.map(item => item.id), ['root', 'repeated', 'branch']);
  assert.deepEqual(result.warnings, ['Skipped repeated issue repeated.']);
});

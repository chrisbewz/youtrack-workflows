const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractIssueReferences,
  collectReferenceTargets,
  resolveDescriptionReferences,
  syncReferencedTargets
} = require('../jira-migration/issue-reference-sync');

const issue = (id, jiraId, sync = 'Enabled') => ({
  id,
  fields: {
    'Jira ID': jiraId || null,
    'Jira Sync': { name: sync }
  }
});

test('YOU-21 extracts unique issue IDs but ignores articles and protected code', () => {
  const text = [
    'Depends on YOU-12 and [the same issue](https://yt.example/issue/YOU-12).',
    'Article YOU-A-4 is not an issue reference.',
    '`inline OPS-3`',
    '```text\nBLOCK-9\n```',
    'Also OPS_2-7.'
  ].join('\n');

  assert.deepEqual(extractIssueReferences(text), ['YOU-12', 'OPS_2-7']);
});

test('YOU-21 collects only enabled unresolved targets for preflight creation', () => {
  const targets = {
    'YOU-2': issue('YOU-2', null),
    'YOU-3': issue('YOU-3', 'APP-3'),
    'YOU-4': issue('YOU-4', null, 'Disabled')
  };

  const result = collectReferenceTargets(
    'YOU-1 depends on YOU-2, YOU-3, YOU-4 and UNKNOWN-5',
    'YOU-1',
    id => targets[id] || null
  );

  assert.deepEqual(result.targets, [targets['YOU-2']]);
  assert.deepEqual(result.resolved, ['YOU-3']);
  assert.deepEqual(result.skipped, ['YOU-4', 'UNKNOWN-5']);
});

test('YOU-21 converts bare IDs and YouTrack Markdown links to Jira references', () => {
  const targets = {
    'YOU-2': issue('YOU-2', 'APP-22'),
    'OPS-7': issue('OPS-7', 'APP-70')
  };
  const source = [
    'Depends on YOU-2.',
    '[YOU-2](https://yt.example/issue/YOU-2)',
    '[custom label](https://yt.example/issue/OPS-7/details)',
    'Unknown YOU-9 stays.',
    '`YOU-2` stays code.'
  ].join('\n');

  assert.equal(resolveDescriptionReferences(source, id => targets[id] || null, 'https://jira.example/'), [
    'Depends on APP-22.',
    '[APP-22](https://jira.example/browse/APP-22)',
    '[custom label](https://jira.example/browse/APP-70)',
    'Unknown YOU-9 stays.',
    '`YOU-2` stays code.'
  ].join('\n'));
});

test('YOU-21 leaves unresolved and disabled references unchanged', () => {
  const targets = {
    'YOU-2': issue('YOU-2', null),
    'YOU-3': issue('YOU-3', 'APP-3', 'Disabled')
  };
  const source = 'YOU-2 YOU-3 YOU-4';

  assert.equal(resolveDescriptionReferences(source, id => targets[id] || null, 'https://jira.example'), source);
});

test('YOU-21 creates referenced targets before the source and stops circular recursion', () => {
  const source = issue('YOU-1', null);
  source.description = 'Depends on YOU-2';
  const target = issue('YOU-2', null);
  target.description = 'Related back to YOU-1';
  const issues = { 'YOU-1': source, 'YOU-2': target };
  const calls = [];
  const context = { visiting: {} };
  const sync = current => {
    syncReferencedTargets(current, {
      lookup: id => issues[id] || null,
      syncTarget: sync,
      isDryRun: false,
      context
    });
    calls.push(current.id);
    current.fields['Jira ID'] = 'APP-' + current.id.split('-')[1];
  };

  sync(source);

  assert.deepEqual(calls, ['YOU-2', 'YOU-1']);
  assert.deepEqual(context.visiting, {});
});

test('YOU-21 dry-run plans unresolved targets without invoking synchronization', () => {
  const source = issue('YOU-1', null);
  source.description = 'YOU-2';
  const target = issue('YOU-2', null);
  let calls = 0;

  const result = syncReferencedTargets(source, {
    lookup: id => id === 'YOU-2' ? target : null,
    syncTarget: () => { calls += 1; },
    isDryRun: true,
    context: { visiting: {} }
  });

  assert.deepEqual(result.planned, ['YOU-2']);
  assert.equal(calls, 0);
});

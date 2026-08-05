const test = require('node:test');
const assert = require('node:assert/strict');

const { buildReconciliationPlan } = require('../jira-migration/link-reconciliation');

const state = entries => entries.reduce((result, [pair, ...links]) => {
  result[pair] = links;
  return result;
}, {});

test('YOU-16 propagates a YouTrack-only link change to Jira', () => {
  const plan = buildReconciliationPlan({
    snapshot: {},
    youtrack: state([['YOU-1|YOU-2', 'Relates']]),
    jira: {},
    mode: 'Bidirectional'
  });

  assert.deepEqual(plan.jira, { add: [{ pair: 'YOU-1|YOU-2', link: 'Relates' }], remove: [] });
  assert.deepEqual(plan.youtrack, { add: [], remove: [] });
  assert.deepEqual(plan.nextSnapshot, state([['YOU-1|YOU-2', 'Relates']]));
});

test('YOU-16 propagates a Jira-only removal to YouTrack', () => {
  const previous = state([['YOU-1|YOU-2', 'Relates']]);
  const plan = buildReconciliationPlan({
    snapshot: previous,
    youtrack: previous,
    jira: {},
    mode: 'Bidirectional'
  });

  assert.deepEqual(plan.youtrack, { add: [], remove: [{ pair: 'YOU-1|YOU-2', link: 'Relates' }] });
  assert.deepEqual(plan.nextSnapshot, {});
});

test('YOU-16 resolves simultaneous conflicting corrections in favor of Jira', () => {
  const pair = 'YOU-1|YOU-2';
  const plan = buildReconciliationPlan({
    snapshot: state([[pair, 'Relates']]),
    youtrack: state([[pair, 'Blocks']]),
    jira: state([[pair, 'Duplicates']]),
    mode: 'Bidirectional'
  });

  assert.deepEqual(plan.conflicts, [pair]);
  assert.deepEqual(plan.youtrack, {
    add: [{ pair, link: 'Duplicates' }],
    remove: [{ pair, link: 'Blocks' }]
  });
  assert.deepEqual(plan.jira, { add: [], remove: [] });
  assert.deepEqual(plan.nextSnapshot, state([[pair, 'Duplicates']]));
});

test('YOU-16 additive mode creates the union and never removes links', () => {
  const pair = 'YOU-1|YOU-2';
  const plan = buildReconciliationPlan({
    snapshot: {},
    youtrack: state([[pair, 'Blocks']]),
    jira: state([[pair, 'Relates']]),
    mode: 'Additive'
  });

  assert.deepEqual(plan.youtrack, { add: [{ pair, link: 'Relates' }], remove: [] });
  assert.deepEqual(plan.jira, { add: [{ pair, link: 'Blocks' }], remove: [] });
  assert.deepEqual(plan.nextSnapshot, state([[pair, 'Blocks', 'Relates']]));
});

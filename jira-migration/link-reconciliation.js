const normalizeLinks = links => Array.from(new Set(links || [])).sort();

const normalizeState = state => Object.keys(state || {}).sort().reduce((result, pair) => {
  const links = normalizeLinks(state[pair]);
  if (links.length > 0) result[pair] = links;
  return result;
}, {});

const sameLinks = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const unionLinks = (left, right) => normalizeLinks(left.concat(right));

const diffSide = (current, desired, pairs) => {
  const add = [];
  const remove = [];

  pairs.forEach(pair => {
    const currentLinks = current[pair] || [];
    const desiredLinks = desired[pair] || [];
    desiredLinks.filter(link => currentLinks.indexOf(link) === -1)
      .forEach(link => add.push({ pair, link }));
    currentLinks.filter(link => desiredLinks.indexOf(link) === -1)
      .forEach(link => remove.push({ pair, link }));
  });

  return { add, remove };
};

const buildReconciliationPlan = ({ snapshot, youtrack, jira, mode }) => {
  const baseState = normalizeState(snapshot);
  const youtrackState = normalizeState(youtrack);
  const jiraState = normalizeState(jira);
  const pairs = Array.from(new Set(
    Object.keys(baseState).concat(Object.keys(youtrackState), Object.keys(jiraState))
  )).sort();

  if (mode === 'Disabled') {
    return {
      jira: { add: [], remove: [] },
      youtrack: { add: [], remove: [] },
      conflicts: [],
      nextSnapshot: baseState
    };
  }

  const desired = {};
  const conflicts = [];

  pairs.forEach(pair => {
    const baseLinks = baseState[pair] || [];
    const youtrackLinks = youtrackState[pair] || [];
    const jiraLinks = jiraState[pair] || [];
    let desiredLinks;

    if (mode === 'Additive') {
      desiredLinks = unionLinks(youtrackLinks, jiraLinks);
    } else if (sameLinks(youtrackLinks, jiraLinks)) {
      desiredLinks = youtrackLinks;
    } else if (sameLinks(youtrackLinks, baseLinks)) {
      desiredLinks = jiraLinks;
    } else if (sameLinks(jiraLinks, baseLinks)) {
      desiredLinks = youtrackLinks;
    } else {
      desiredLinks = jiraLinks;
      conflicts.push(pair);
    }

    if (desiredLinks.length > 0) desired[pair] = desiredLinks;
  });

  return {
    jira: diffSide(jiraState, desired, pairs),
    youtrack: diffSide(youtrackState, desired, pairs),
    conflicts,
    nextSnapshot: normalizeState(desired)
  };
};

module.exports = { buildReconciliationPlan, normalizeState };

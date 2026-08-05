const { getFieldValueName } = require('./sync-decisions');
const { buildReconciliationPlan } = require('./link-reconciliation');
const {
  parseLinkTypeMapping,
  normalizeJiraLinks,
  normalizeYouTrackLinks,
  resolveLinkOperation
} = require('./link-normalization');

const parseSnapshot = raw => {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error('Jira Link Snapshot inválido: ' + error.message);
  }
};

const getIssueTree = issue => {
  const issues = [issue];
  const seen = new Set([issue.id || issue]);
  const children = issue.links && issue.links['parent for'];

  if (children && typeof children.forEach === 'function') {
    children.forEach(child => {
      const identity = child.id || child;
      if (!seen.has(identity)) {
        seen.add(identity);
        issues.push(child);
      }
    });
  }

  return issues;
};

const eligibleTargets = targets => (targets || []).filter(target =>
  getFieldValueName(target.fields && target.fields['Jira ID']) &&
  getFieldValueName(target.fields && target.fields['Jira Sync']) === 'Enabled'
);

const applyYouTrackOperations = (issue, currentJiraKey, operations, mapping, dependencies) => {
  const apply = (operation, action) => {
    const resolved = resolveLinkOperation(currentJiraKey, operation, mapping);
    const targets = eligibleTargets(dependencies.findYouTrackIssuesByJiraId(resolved.targetJiraKey));
    targets.forEach(target => action(issue, resolved.linkName, target));
    return targets.length;
  };

  let applied = 0;
  operations.add.forEach(operation => {
    applied += apply(operation, dependencies.addYouTrackLink);
  });
  operations.remove.forEach(operation => {
    applied += apply(operation, dependencies.removeYouTrackLink);
  });
  return applied;
};

const syncIssueLinks = (issue, settings, dependencies) => {
  const jiraKey = getFieldValueName(issue.fields && issue.fields['Jira ID']);
  const issueSyncMode = getFieldValueName(issue.fields && issue.fields['Jira Sync']);
  const issueLinkMode = getFieldValueName(issue.fields && issue.fields['Jira Link Sync']);
  const effectiveMode = issueLinkMode || settings.linkSyncMode || 'Disabled';

  if (!jiraKey) return { status: 'skipped', reason: 'issue sem Jira ID' };
  if (issueSyncMode !== 'Enabled') {
    return { status: 'skipped', reason: 'Jira Sync deve estar Enabled' };
  }
  if (effectiveMode === 'Disabled') {
    return { status: 'skipped', reason: 'sincronização de links desabilitada' };
  }

  const mapping = parseLinkTypeMapping(settings.linkTypeMappingJson);
  const jiraLinks = dependencies.fetchJiraLinks(jiraKey);
  const jiraNormalized = normalizeJiraLinks(jiraKey, jiraLinks, mapping);
  const youtrackNormalized = normalizeYouTrackLinks(issue, mapping);
  const snapshot = parseSnapshot(getFieldValueName(issue.fields['Jira Link Snapshot']));
  const dryRun = effectiveMode === 'Dry-Run';
  const plan = buildReconciliationPlan({
    snapshot,
    youtrack: youtrackNormalized.state,
    jira: jiraNormalized.state,
    mode: dryRun ? 'Bidirectional' : effectiveMode
  });

  if (dryRun) {
    return { status: 'dry-run', plan, skipped: youtrackNormalized.skipped };
  }

  plan.jira.add.forEach(operation => {
    const resolved = resolveLinkOperation(jiraKey, operation, mapping);
    dependencies.createJiraLink(resolved.jiraPayload);
  });
  plan.jira.remove.forEach(operation => {
    const linkId = jiraNormalized.linkIds[operation.pair + '\u0000' + operation.link];
    if (!linkId) throw new Error('ID do link Jira não encontrado para remoção: ' + operation.pair);
    dependencies.deleteJiraLink(linkId);
  });

  const youtrackUpdates = applyYouTrackOperations(
    issue,
    jiraKey,
    plan.youtrack,
    mapping,
    dependencies
  );
  dependencies.saveSnapshot(issue, JSON.stringify(plan.nextSnapshot));

  return {
    status: 'applied',
    plan,
    jiraUpdates: plan.jira.add.length + plan.jira.remove.length,
    youtrackUpdates,
    skipped: youtrackNormalized.skipped
  };
};

module.exports = { getIssueTree, syncIssueLinks, parseSnapshot };

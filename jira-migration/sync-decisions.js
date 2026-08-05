const getFieldValueName = value => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.presentation || value.name || '';
};

const getParentIssue = issue => {
  const parentLink = issue.links && issue.links['subtask of'];
  return parentLink && typeof parentLink.first === 'function' ? parentLink.first() : null;
};

const evaluateSyncDecision = (issue, settings) => {
  const syncMode = settings.syncMode || 'Disabled';
  const issueSyncMode = getFieldValueName(issue.fields && issue.fields['Jira Sync']) || 'Enabled';
  const isDryRun = syncMode === 'Dry-Run' || issueSyncMode === 'Dry-Run';

  if (syncMode === 'Disabled') {
    return { shouldSync: false, isDryRun: false, reason: 'sync desabilitado para o projeto' };
  }

  if (issueSyncMode === 'Disabled') {
    return { shouldSync: false, isDryRun, reason: 'sync desabilitado para a issue' };
  }

  const parent = getParentIssue(issue);
  const parentSubtaskMode = getFieldValueName(
    parent && parent.fields && parent.fields['Sync Subtasks']
  );
  if (parentSubtaskMode === 'Disabled') {
    return { shouldSync: false, isDryRun, reason: 'sync de subtasks desabilitado na issue pai' };
  }

  return { shouldSync: true, isDryRun, reason: null };
};

const getSubtasksToSync = issue => {
  const syncSubtasksMode = getFieldValueName(issue.fields && issue.fields['Sync Subtasks']);
  const childLink = issue.links && issue.links['parent for'];
  if (syncSubtasksMode !== 'Enabled' || !childLink || typeof childLink.forEach !== 'function') {
    return [];
  }

  const children = [];
  childLink.forEach(child => {
    const sameProject = !issue.project || !child.project || issue.project.id === child.project.id;
    if (sameProject) children.push(child);
  });
  return children;
};

module.exports = { evaluateSyncDecision, getFieldValueName, getSubtasksToSync };

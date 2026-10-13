const getWorklogSyncDecision = (issue, settings, syncDecision) => {
  const jiraKey = issue.fields && issue.fields['Jira ID'];

  if (settings.worklogSyncMode !== 'Enabled') {
    return { canSync: false, reason: 'sincronização de worklogs desabilitada no projeto' };
  }
  if (!syncDecision.shouldSync) {
    return { canSync: false, reason: syncDecision.reason || 'sincronização da issue desabilitada' };
  }
  if (!jiraKey) {
    return { canSync: false, reason: 'Jira ID não preenchido' };
  }
  if (!settings.jiraEndpointUrl || !settings.jiraApiToken) {
    return { canSync: false, reason: 'configurações do Jira ausentes' };
  }

  return { canSync: true, isDryRun: !!syncDecision.isDryRun, jiraKey };
};

module.exports = { getWorklogSyncDecision };

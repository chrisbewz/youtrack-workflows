const valueName = value => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  return String(value.name || value.presentation || '').trim();
};

const getYouTrackVersionNames = (issue, fieldName) => {
  if (!fieldName || !issue || !issue.fields) return [];
  const value = issue.fields[fieldName];
  if (!value) return [];

  const names = [];
  if (typeof value.forEach === 'function') {
    value.forEach(item => names.push(valueName(item)));
  } else {
    names.push(valueName(value));
  }
  return names.filter((name, index) => name && names.indexOf(name) === index);
};

const hasVersionFieldChanged = (issue, settings) => {
  const fieldName = settings && String(settings.youtrackVersionFieldName || '').trim();
  const field = fieldName && issue && issue.fields && issue.fields[fieldName];
  return !!(field && field.isChanged);
};

const versionLabel = (name, prefix) => {
  const slug = name.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug ? prefix + slug : '';
};

const buildVersionPlan = options => {
  const versionNames = options.versionNames || [];
  const jiraVersions = options.jiraVersions || [];
  const prefix = options.labelPrefix || 'yt-version-';
  const available = options.jiraFieldAvailable && options.jiraFieldId;
  const byName = {};
  jiraVersions.forEach(version => {
    byName[String(version.name || '').trim().toLowerCase()] = version;
  });

  const matches = [];
  const fallbackNames = [];
  versionNames.forEach(name => {
    const match = available && byName[name.toLowerCase()];
    if (match) matches.push(match);
    else fallbackNames.push(name);
  });

  const labels = (options.existingLabels || []).filter(label => label.indexOf(prefix) !== 0);
  fallbackNames.forEach(name => {
    const label = versionLabel(name, prefix);
    if (label && labels.indexOf(label) === -1) labels.push(label);
  });

  const fields = { labels };
  if (available) fields[options.jiraFieldId] = matches.map(version => ({ id: version.id }));

  return {
    fields,
    versionNamesInField: matches.map(version => version.name),
    versionNamesInLabels: fallbackNames
  };
};

const parseResponse = (response, log, subject) => {
  try {
    return JSON.parse(response.response || 'null');
  } catch (error) {
    log('[Jira Sync] Resposta inválida ao ler ' + subject + ': ' + error.message);
    return null;
  }
};

// Jira Cloud REST API v2 project versions and edit metadata:
// https://developer.atlassian.com/cloud/jira/platform/rest/v2/api-group-project-versions/
// https://developer.atlassian.com/cloud/jira/platform/rest/v2/api-group-issues/#api-rest-api-2-issue-issueidorkey-editmeta-get
const loadJiraVersionContext = (connection, projectKey, jiraKey, jiraFieldId, log) => {
  const context = { jiraVersions: [], existingLabels: [], jiraFieldAvailable: false };
  const versionsResponse = connection.getSync('/project/' + encodeURIComponent(projectKey) + '/versions');
  if (versionsResponse && versionsResponse.code === 200) {
    context.jiraVersions = parseResponse(versionsResponse, log, 'versões do Jira') || [];
  } else {
    log('[Jira Sync] Não foi possível listar versões do projeto; usando labels como fallback.');
  }

  if (!jiraKey) return context;

  const issueResponse = connection.getSync(
    '/issue/' + encodeURIComponent(jiraKey),
    { fields: 'labels' }
  );
  if (issueResponse && issueResponse.code === 200) {
    const jiraIssue = parseResponse(issueResponse, log, 'labels do Jira') || {};
    context.existingLabels = jiraIssue.fields && jiraIssue.fields.labels || [];
  } else {
    log('[Jira Sync] Não foi possível ler labels existentes para sincronização de versão.');
  }

  const metadataResponse = connection.getSync('/issue/' + encodeURIComponent(jiraKey) + '/editmeta');
  if (metadataResponse && metadataResponse.code === 200) {
    const metadata = parseResponse(metadataResponse, log, 'metadados de edição do Jira') || {};
    context.jiraFieldAvailable = !!(metadata.fields && metadata.fields[jiraFieldId]);
  } else {
    log('[Jira Sync] Não foi possível validar o campo de versão no Jira; usando labels como fallback.');
  }
  return context;
};

module.exports = {
  getYouTrackVersionNames,
  hasVersionFieldChanged,
  buildVersionPlan,
  loadJiraVersionContext,
  versionLabel
};

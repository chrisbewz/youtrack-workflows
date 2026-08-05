const entities = require('@jetbrains/youtrack-scripting-api/entities');
const http = require('@jetbrains/youtrack-scripting-api/http');
const workflow = require('@jetbrains/youtrack-scripting-api/workflow');
const { getFieldValueName } = require('./sync-decisions');
const { isLabelSyncEligible, syncJiraLabels } = require('./label-sync-service');

// Jira Get issue endpoint and YouTrack tag endpoints:
// https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-get
// https://www.jetbrains.com/help/youtrack/devportal/api-usecase-work-with-tags.html
// https://www.jetbrains.com/help/youtrack/devportal/api-usecase-add-remove-tags.html
const createConnection = (baseUrl, authorization) => {
  const connection = new http.Connection(baseUrl, null, 5000);
  connection.addHeader('Authorization', authorization);
  connection.addHeader('Accept', 'application/json');
  connection.addHeader('Content-Type', 'application/json');
  return connection;
};

const parseResponse = (response, acceptedCodes, operation) => {
  if (!response || acceptedCodes.indexOf(response.code) === -1) {
    throw new Error(operation + ' falhou. HTTP ' + (response ? response.code : 'sem resposta') +
      (response && response.response ? ': ' + response.response : ''));
  }
  return response.response ? JSON.parse(response.response) : null;
};

const createDependencies = ctx => {
  const settings = ctx.settings;
  const jira = createConnection(settings.jiraEndpointUrl + '/rest/api/3', 'Basic ' + settings.jiraApiToken);
  const youtrack = createConnection(settings.youtrackBaseUrl + '/api', 'Bearer ' + settings.youtrackApiToken);
  const issueId = ctx.issue.id;
  const currentTagNames = [];
  ctx.issue.tags.forEach(tag => currentTagNames.push(tag.name));

  return {
    fetchLabels: jiraKey => {
      const response = jira.getSync('/issue/' + encodeURIComponent(jiraKey), { fields: 'labels' });
      const jiraIssue = parseResponse(response, [200], 'Leitura de labels do Jira') || {};
      return jiraIssue.fields && jiraIssue.fields.labels || [];
    },
    hasTag: name => currentTagNames.indexOf(name) !== -1,
    findTagByName: name => {
      const response = youtrack.getSync('/tags', { fields: 'id,name', query: name, '$top': 100 });
      const tags = parseResponse(response, [200], 'Busca de tags no YouTrack') || [];
      return tags.find(tag => tag.name === name) || null;
    },
    createTag: name => parseResponse(
      youtrack.postSync('/tags', { fields: 'id,name' }, JSON.stringify({ name })),
      [200, 201],
      'Criação da tag "' + name + '" no YouTrack'
    ),
    attachTag: tag => parseResponse(
      youtrack.postSync(
        '/issues/' + encodeURIComponent(issueId) + '/tags',
        { fields: 'id,name' },
        JSON.stringify({ id: tag.id })
      ),
      [200, 201],
      'Associação da tag "' + tag.name + '" à issue'
    )
  };
};

exports.rule = entities.Issue.action({
  title: 'Jira Label Sync',
  command: 'Sync Jira Labels',
  guard: ctx => isLabelSyncEligible(ctx.issue),
  action: ctx => {
    try {
      workflow.check(!!ctx.settings.jiraEndpointUrl && !!ctx.settings.jiraApiToken,
        'Configure jiraEndpointUrl e jiraApiToken antes de sincronizar labels.');
      workflow.check(!!ctx.settings.youtrackBaseUrl && !!ctx.settings.youtrackApiToken,
        'Configure youtrackBaseUrl e youtrackApiToken antes de sincronizar labels.');

      const dependencies = createDependencies(ctx);
      const jiraKey = getFieldValueName(ctx.issue.fields['Jira ID']);
      const result = syncJiraLabels(dependencies.fetchLabels(jiraKey), dependencies);

      workflow.message('Jira Label Sync | labels: ' + result.labels +
        ' | já associadas: ' + result.unchanged +
        ' | reutilizadas: ' + result.reused +
        ' | criadas: ' + result.created +
        ' | associadas: ' + result.attached);
    } catch (error) {
      console.log('[Jira Label Sync] ' + error);
      workflow.check(false, 'Jira Label Sync falhou: ' + error.message);
    }
  },
  requirements: {
    'Jira ID': {
      type: entities.Field.stringType,
      name: 'Jira ID'
    }
  }
});

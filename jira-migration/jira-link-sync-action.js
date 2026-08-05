const entities = require('@jetbrains/youtrack-scripting-api/entities');
const http = require('@jetbrains/youtrack-scripting-api/http');
const search = require('@jetbrains/youtrack-scripting-api/search');
const workflow = require('@jetbrains/youtrack-scripting-api/workflow');
const { getIssueTree, syncIssueLinks } = require('./link-sync-service');
const { getFieldValueName } = require('./sync-decisions');

// Jira Cloud issue-link endpoints:
// https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-links/
const createJiraConnection = settings => {
  const connection = new http.Connection(settings.jiraEndpointUrl + '/rest/api/3', null, 5000);
  connection.addHeader('Authorization', 'Basic ' + settings.jiraApiToken);
  connection.addHeader('Content-Type', 'application/json');
  connection.addHeader('Accept', 'application/json');
  return connection;
};

const assertResponse = (response, acceptedCodes, operation) => {
  if (!response || acceptedCodes.indexOf(response.code) === -1) {
    throw new Error(operation + ' falhou. HTTP ' + (response ? response.code : 'sem resposta') +
      (response && response.response ? ': ' + response.response : ''));
  }
  return response;
};

const createDependencies = (ctx, project) => {
  const connection = createJiraConnection(ctx.settings);

  return {
    fetchJiraLinks: jiraKey => {
      const response = assertResponse(
        connection.getSync('/issue/' + encodeURIComponent(jiraKey), { fields: 'issuelinks' }),
        [200],
        'Leitura de links do Jira'
      );
      const jiraIssue = JSON.parse(response.response);
      return jiraIssue.fields && jiraIssue.fields.issuelinks || [];
    },
    createJiraLink: payload => assertResponse(
      connection.postSync('/issueLink', {}, JSON.stringify(payload)),
      [200, 201],
      'Criação de link no Jira'
    ),
    deleteJiraLink: linkId => assertResponse(
      connection.deleteSync('/issueLink/' + encodeURIComponent(linkId), {}),
      [200, 204],
      'Remoção de link no Jira'
    ),
    // Workflow search API:
    // https://www.jetbrains.com/help/youtrack/devportal/using-workflow-api.html#finding-multiple-issues
    findYouTrackIssuesByJiraId: jiraKey => {
      if (!/^[A-Z][A-Z0-9_]*-\d+$/i.test(jiraKey)) {
        throw new Error('Jira ID inválido para busca: ' + jiraKey);
      }
      const query = '"Jira ID": {' + jiraKey + '} "Jira Sync": Enabled';
      const matches = search.search(project, query, ctx.currentUser);
      const result = [];
      matches.forEach(match => result.push(match));
      return result;
    },
    addYouTrackLink: (source, linkName, target) => {
      const links = source.links[linkName];
      if (!links) throw new Error('Tipo de link YouTrack não encontrado: ' + linkName);
      links.add(target);
    },
    removeYouTrackLink: (source, linkName, target) => {
      const links = source.links[linkName];
      if (!links) throw new Error('Tipo de link YouTrack não encontrado: ' + linkName);
      links.delete(target);
    },
    saveSnapshot: (source, snapshot) => {
      source.fields['Jira Link Snapshot'] = snapshot;
    }
  };
};

exports.rule = entities.Issue.action({
  title: 'Jira Link Sync',
  command: 'Sync Jira Links',
  guard: ctx => {
    const issue = ctx.issue;
    const projectMode = ctx.settings.linkSyncMode || 'Disabled';
    const issueMode = getFieldValueName(issue.fields['Jira Link Sync']);
    const effectiveMode = issueMode || projectMode;
    return issue.isReported &&
      effectiveMode !== 'Disabled' &&
      getFieldValueName(issue.fields['Jira Sync']) === 'Enabled' &&
      !!getFieldValueName(issue.fields['Jira ID']);
  },
  action: ctx => {
    try {
      const results = [];
      getIssueTree(ctx.issue).forEach(issue => {
        const issueMode = getFieldValueName(issue.fields['Jira Link Sync']);
        const effectiveMode = issueMode || ctx.settings.linkSyncMode || 'Disabled';
        const snapshotField = issue.project.findFieldByName('Jira Link Snapshot');
        workflow.check(
          effectiveMode === 'Dry-Run' || effectiveMode === 'Disabled' || !!snapshotField,
          'Adicione o campo string opcional "Jira Link Snapshot" ao projeto antes da sincronização de links.'
        );
        results.push(syncIssueLinks(issue, ctx.settings, createDependencies(ctx, issue.project)));
      });

      const processed = results.filter(result => result.plan);
      const total = (side, operation) => processed.reduce(
        (sum, result) => sum + result.plan[side][operation].length,
        0
      );
      const conflicts = processed.reduce((sum, result) => sum + result.plan.conflicts.length, 0);
      workflow.message('Jira Link Sync | itens: ' + processed.length +
        ' | Jira +' + total('jira', 'add') + '/-' + total('jira', 'remove') +
        ' | YouTrack +' + total('youtrack', 'add') + '/-' + total('youtrack', 'remove') +
        ' | conflitos: ' + conflicts);
    } catch (error) {
      console.log('[Jira Link Sync] ' + error);
      workflow.check(false, 'Jira Link Sync falhou: ' + error.message);
    }
  },
  requirements: {
    'Jira ID': {
      type: entities.Field.stringType,
      name: 'Jira ID'
    }
  }
});

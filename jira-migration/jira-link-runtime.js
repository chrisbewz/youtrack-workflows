const http = require('@jetbrains/youtrack-scripting-api/http');
const search = require('@jetbrains/youtrack-scripting-api/search');

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

const createLinkDependencies = (ctx, project) => {
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
    findYouTrackIssuesByJiraId: jiraKey => {
      if (!/^[A-Z][A-Z0-9_]*-\d+$/i.test(jiraKey)) {
        throw new Error('Jira ID inválido para busca: ' + jiraKey);
      }
      const matches = search.search(
        project,
        '"Jira ID": {' + jiraKey + '} "Jira Sync": Enabled',
        ctx.currentUser
      );
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

module.exports = { createLinkDependencies };


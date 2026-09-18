const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getJiraApiBaseUrl,
  getJiraAuthorization,
  getJiraConfigurationError
} = require('../jira-migration/jira-auth');

test('Basic Jira authentication preserves the existing site endpoint and credential format', () => {
  const settings = {
    jiraEndpointUrl: 'https://sandbox.atlassian.net/',
    jiraApiToken: 'encoded-basic-credential'
  };

  assert.equal(getJiraApiBaseUrl(settings), 'https://sandbox.atlassian.net/rest/api/3');
  assert.equal(getJiraAuthorization(settings), 'Basic encoded-basic-credential');
  assert.equal(getJiraConfigurationError(settings), null);
});

test('scoped token authentication uses the Atlassian API gateway and a bearer credential', () => {
  const settings = {
    jiraAuthMode: 'Scoped token',
    jiraCloudId: '123e4567-e89b-12d3-a456-426614174000',
    jiraApiToken: 'scoped-token'
  };

  assert.equal(
    getJiraApiBaseUrl(settings),
    'https://api.atlassian.com/ex/jira/123e4567-e89b-12d3-a456-426614174000/rest/api/3'
  );
  assert.equal(getJiraAuthorization(settings), 'Bearer scoped-token');
  assert.equal(getJiraConfigurationError(settings), null);
});

test('scoped token authentication identifies a missing cloud ID without exposing the token', () => {
  const error = getJiraConfigurationError({
    jiraAuthMode: 'Scoped token',
    jiraApiToken: 'do-not-display'
  });

  assert.equal(error, 'Configure jiraCloudId when Jira Authentication Mode is Scoped token.');
  assert.equal(error.includes('do-not-display'), false);
});

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildJiraCloudRequest,
  buildJiraProjectRequest,
  buildYouTrackRequest,
  isSuccessfulResponse
} = require('./integration/run-workflow-integration');

test('Jira Cloud smoke request uses Basic authentication when selected without exposing the token in the URL', () => {
  const request = buildJiraCloudRequest({
    JIRA_CLOUD_BASE_URL: 'https://sandbox.atlassian.net',
    JIRA_CLOUD_EMAIL: 'automation@example.test',
    JIRA_CLOUD_API_TOKEN: 'secret-token'
  });

  assert.equal(request.url, 'https://sandbox.atlassian.net/rest/api/3/myself');
  assert.equal(request.headers.Authorization, 'Basic ' + Buffer.from('automation@example.test:secret-token').toString('base64'));
  assert.equal(request.url.includes('secret-token'), false);
});

test('Jira Cloud smoke request uses the API gateway and bearer authentication for scoped service-account tokens', () => {
  const request = buildJiraCloudRequest({
    JIRA_CLOUD_AUTH_MODE: 'scoped-token',
    JIRA_CLOUD_ID: '123e4567-e89b-12d3-a456-426614174000',
    JIRA_CLOUD_API_TOKEN: 'secret-token'
  });

  assert.equal(request.url, 'https://api.atlassian.com/ex/jira/123e4567-e89b-12d3-a456-426614174000/rest/api/3/myself');
  assert.equal(request.headers.Authorization, 'Bearer secret-token');
  assert.equal(request.url.includes('secret-token'), false);
});

test('Jira Cloud project smoke request targets only the configured sandbox project', () => {
  const request = buildJiraProjectRequest({
    JIRA_CLOUD_BASE_URL: 'https://sandbox.atlassian.net',
    JIRA_CLOUD_EMAIL: 'automation@example.test',
    JIRA_CLOUD_API_TOKEN: 'secret-token',
    JIRA_CLOUD_PROJECT_KEY: 'YTTEST'
  });

  assert.equal(request.url, 'https://sandbox.atlassian.net/rest/api/3/project/YTTEST');
  assert.equal(request.url.includes('secret-token'), false);
});

test('Jira Cloud scoped project smoke request targets the configured project through the API gateway', () => {
  const request = buildJiraProjectRequest({
    JIRA_CLOUD_AUTH_MODE: 'scoped-token',
    JIRA_CLOUD_ID: '123e4567-e89b-12d3-a456-426614174000',
    JIRA_CLOUD_API_TOKEN: 'secret-token',
    JIRA_CLOUD_PROJECT_KEY: 'YTTEST'
  });

  assert.equal(request.url, 'https://api.atlassian.com/ex/jira/123e4567-e89b-12d3-a456-426614174000/rest/api/3/project/YTTEST');
  assert.equal(request.headers.Authorization, 'Bearer secret-token');
});

test('YouTrack smoke request sends its permanent token only as a bearer header', () => {
  const request = buildYouTrackRequest('http://youtrack:8080', 'secret-token');

  assert.equal(request.url, 'http://youtrack:8080/api/users/me?fields=id');
  assert.equal(request.headers.Authorization, 'Bearer secret-token');
  assert.equal(request.url.includes('secret-token'), false);
});

test('only successful HTTP responses satisfy the smoke check', () => {
  assert.equal(isSuccessfulResponse({ ok: true }), true);
  assert.equal(isSuccessfulResponse({ ok: false }), false);
});

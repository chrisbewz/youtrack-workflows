const test = require('node:test');
const assert = require('node:assert/strict');

const { validateIntegrationConfiguration } = require('./integration/validate-configuration');

const youTrackEnvironment = {
  YOUTRACK_IMAGE_TAG: '2026.1.1',
  YOUTRACK_TEST_TOKEN: 'test-token'
};

test('task export integration accepts the required local YouTrack configuration', () => {
  assert.deepEqual(validateIntegrationConfiguration('task-export', youTrackEnvironment), []);
});

test('Jira migration integration requires a Jira Cloud HTTPS endpoint and sandbox credentials', () => {
  const errors = validateIntegrationConfiguration('jira-migration', {
    ...youTrackEnvironment,
    JIRA_CLOUD_BASE_URL: 'http://jira.example.test',
    JIRA_CLOUD_EMAIL: '',
    JIRA_CLOUD_API_TOKEN: '',
    JIRA_CLOUD_PROJECT_KEY: ''
  });

  assert.deepEqual(errors, [
    'JIRA_CLOUD_BASE_URL must use HTTPS.',
    'JIRA_CLOUD_BASE_URL must point to a Jira Cloud *.atlassian.net site.',
    'JIRA_CLOUD_EMAIL is required.',
    'JIRA_CLOUD_API_TOKEN is required.',
    'JIRA_CLOUD_PROJECT_KEY is required.'
  ]);
});

test('Jira migration scoped-token integration requires a cloud ID instead of an email address', () => {
  const errors = validateIntegrationConfiguration('jira-migration', {
    ...youTrackEnvironment,
    JIRA_CLOUD_AUTH_MODE: 'scoped-token',
    JIRA_CLOUD_BASE_URL: 'https://sandbox.atlassian.net',
    JIRA_CLOUD_ID: '',
    JIRA_CLOUD_API_TOKEN: 'token',
    JIRA_CLOUD_PROJECT_KEY: 'YTTEST'
  });

  assert.deepEqual(errors, ['JIRA_CLOUD_ID is required when JIRA_CLOUD_AUTH_MODE is scoped-token.']);
});

test('integration validation never includes secret values in its errors', () => {
  const errors = validateIntegrationConfiguration('jira-migration', {
    YOUTRACK_IMAGE_TAG: '2026.1.1',
    YOUTRACK_TEST_TOKEN: 'do-not-display',
    JIRA_CLOUD_BASE_URL: 'https://sandbox.atlassian.net',
    JIRA_CLOUD_EMAIL: 'automation@example.test',
    JIRA_CLOUD_API_TOKEN: 'do-not-display',
    JIRA_CLOUD_PROJECT_KEY: ''
  });

  assert.equal(errors.some(error => error.includes('do-not-display')), false);
});

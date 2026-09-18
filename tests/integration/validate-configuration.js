const { URL } = require('node:url');

const requireValue = (environment, name, errors) => {
  if (!environment[name]) errors.push(name + ' is required.');
};

const validateJiraCloudUrl = (value, errors) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    errors.push('JIRA_CLOUD_BASE_URL must be a valid URL.');
    return;
  }

  if (url.protocol !== 'https:') errors.push('JIRA_CLOUD_BASE_URL must use HTTPS.');
  if (!url.hostname.endsWith('.atlassian.net')) {
    errors.push('JIRA_CLOUD_BASE_URL must point to a Jira Cloud *.atlassian.net site.');
  }
};

const validateIntegrationConfiguration = (workflow, environment = process.env) => {
  const errors = [];
  requireValue(environment, 'YOUTRACK_IMAGE_TAG', errors);
  requireValue(environment, 'YOUTRACK_TEST_TOKEN', errors);

  if (workflow === 'task-export') return errors;
  if (workflow !== 'jira-migration') return ['Unknown workflow: ' + workflow + '.'];

  if (environment.JIRA_CLOUD_BASE_URL) {
    validateJiraCloudUrl(environment.JIRA_CLOUD_BASE_URL, errors);
  } else {
    errors.push('JIRA_CLOUD_BASE_URL is required.');
  }
  if (environment.JIRA_CLOUD_AUTH_MODE === 'scoped-token') {
    if (!environment.JIRA_CLOUD_ID) {
      errors.push('JIRA_CLOUD_ID is required when JIRA_CLOUD_AUTH_MODE is scoped-token.');
    }
  } else {
    requireValue(environment, 'JIRA_CLOUD_EMAIL', errors);
  }
  requireValue(environment, 'JIRA_CLOUD_API_TOKEN', errors);
  requireValue(environment, 'JIRA_CLOUD_PROJECT_KEY', errors);
  return errors;
};

if (require.main === module) {
  const workflow = process.argv[2];
  const errors = validateIntegrationConfiguration(workflow);
  if (errors.length > 0) {
    console.error('Integration configuration is invalid:');
    errors.forEach(error => console.error('- ' + error));
    process.exitCode = 1;
  } else {
    console.log('Integration configuration is valid for ' + workflow + '.');
  }
}

module.exports = { validateIntegrationConfiguration };

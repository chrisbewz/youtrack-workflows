const path = require('node:path');

const PROFILE_PATTERN = /^[a-z0-9][a-z0-9-]*$/i;

const getIntegrationProfile = (environment = process.env) => {
  const profile = environment.INTEGRATION_PROFILE || 'local';
  if (!PROFILE_PATTERN.test(profile)) {
    throw new Error('Invalid integration profile: ' + profile + '.');
  }
  return profile;
};

const getIntegrationEnvironmentPath = (workflow, repositoryRoot, environment = process.env) => {
  return path.join(
    repositoryRoot,
    'tests',
    'integration',
    workflow,
    '.env.' + getIntegrationProfile(environment)
  );
};

module.exports = { getIntegrationEnvironmentPath, getIntegrationProfile };

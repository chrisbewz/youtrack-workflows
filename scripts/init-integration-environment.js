const fs = require('node:fs');
const path = require('node:path');
const { getIntegrationEnvironmentPath } = require('./integration-profile');

const SUPPORTED_WORKFLOWS = new Set(['task-export', 'jira-migration']);

const initializeIntegrationEnvironment = (
  workflow,
  repositoryRoot = path.resolve(__dirname, '..'),
  environment = process.env
) => {
  if (!SUPPORTED_WORKFLOWS.has(workflow)) {
    throw new Error('Unsupported integration workflow: ' + workflow + '.');
  }

  const directory = path.join(repositoryRoot, 'tests', 'integration', workflow);
  const examplePath = path.join(directory, '.env.example');
  const profilePath = getIntegrationEnvironmentPath(workflow, repositoryRoot, environment);
  if (fs.existsSync(profilePath)) {
    throw new Error('Integration configuration already exists: ' + profilePath);
  }
  fs.copyFileSync(examplePath, profilePath, fs.constants.COPYFILE_EXCL);
  return profilePath;
};

if (require.main === module) {
  try {
    const localPath = initializeIntegrationEnvironment(process.argv[2]);
    console.log('Created integration configuration: ' + localPath);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { initializeIntegrationEnvironment };

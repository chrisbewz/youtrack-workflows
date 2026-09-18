const fs = require('node:fs');
const path = require('node:path');

const SUPPORTED_WORKFLOWS = new Set(['task-export', 'jira-migration']);

const initializeIntegrationEnvironment = (workflow, repositoryRoot = path.resolve(__dirname, '..')) => {
  if (!SUPPORTED_WORKFLOWS.has(workflow)) {
    throw new Error('Unsupported integration workflow: ' + workflow + '.');
  }

  const directory = path.join(repositoryRoot, 'tests', 'integration', workflow);
  const examplePath = path.join(directory, '.env.example');
  const localPath = path.join(directory, '.env.local');
  if (fs.existsSync(localPath)) {
    throw new Error('Local integration configuration already exists: ' + localPath);
  }
  fs.copyFileSync(examplePath, localPath, fs.constants.COPYFILE_EXCL);
  return localPath;
};

if (require.main === module) {
  try {
    const localPath = initializeIntegrationEnvironment(process.argv[2]);
    console.log('Created local integration configuration: ' + localPath);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { initializeIntegrationEnvironment };

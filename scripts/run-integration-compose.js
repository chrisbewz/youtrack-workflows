const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { getIntegrationEnvironmentPath } = require('./integration-profile');

const SUPPORTED_WORKFLOWS = new Set(['task-export', 'jira-migration']);

const buildDockerComposeArguments = (workflow, composeArguments, repositoryRoot, environment = process.env) => {
  if (!SUPPORTED_WORKFLOWS.has(workflow)) {
    throw new Error('Unsupported integration workflow: ' + workflow + '.');
  }
  const environmentPath = getIntegrationEnvironmentPath(workflow, repositoryRoot, environment);
  if (!fs.existsSync(environmentPath)) {
    throw new Error('Integration configuration does not exist: ' + environmentPath);
  }
  const relativeEnvironmentPath = path.relative(repositoryRoot, environmentPath).split(path.sep).join('/');
  return [
    'compose',
    '--env-file', relativeEnvironmentPath,
    '-f', 'tests/integration/' + workflow + '/compose.yml',
    ...composeArguments
  ];
};

if (require.main === module) {
  try {
    const workflow = process.argv[2];
    const composeArguments = process.argv.slice(3);
    if (composeArguments.length === 0) throw new Error('Docker Compose arguments are required.');

    const repositoryRoot = path.resolve(__dirname, '..');
    const argumentsToRun = buildDockerComposeArguments(
      workflow,
      composeArguments,
      repositoryRoot
    );
    const result = spawnSync('docker', argumentsToRun, {
      cwd: repositoryRoot,
      env: process.env,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exitCode = result.status || 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { buildDockerComposeArguments };

const { spawnSync } = require('node:child_process');
const { validateIntegrationConfiguration } = require('./validate-configuration');

const DEFAULT_YOUTRACK_URL = 'http://youtrack:8080';
const WAIT_ATTEMPTS = 120;
const WAIT_DELAY_MS = 5000;

const buildYouTrackRequest = (baseUrl, token) => ({
  url: new URL('/api/users/me?fields=id', baseUrl).toString(),
  headers: { Authorization: 'Bearer ' + token }
});

const buildJiraCloudRequest = environment => ({
  url: new URL('/rest/api/3/myself', environment.JIRA_CLOUD_BASE_URL).toString(),
  headers: {
    Authorization: 'Basic ' + Buffer.from(
      environment.JIRA_CLOUD_EMAIL + ':' + environment.JIRA_CLOUD_API_TOKEN
    ).toString('base64')
  }
});

const buildJiraProjectRequest = environment => ({
  url: new URL(
    '/rest/api/3/project/' + encodeURIComponent(environment.JIRA_CLOUD_PROJECT_KEY),
    environment.JIRA_CLOUD_BASE_URL
  ).toString(),
  headers: buildJiraCloudRequest(environment).headers
});

const isSuccessfulResponse = response => response.ok === true;

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const waitForYouTrack = async baseUrl => {
  for (let attempt = 1; attempt <= WAIT_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(10000) });
      if (response.status < 500) return;
    } catch {
      // YouTrack is still starting. Do not log connection details repeatedly.
    }
    await delay(WAIT_DELAY_MS);
  }
  throw new Error('YouTrack did not become available before the integration timeout.');
};

const assertAuthenticated = async (name, request) => {
  const response = await fetch(request.url, {
    headers: request.headers,
    signal: AbortSignal.timeout(15000)
  });
  if (!isSuccessfulResponse(response)) {
    throw new Error(name + ' authentication check failed with HTTP ' + response.status + '.');
  }
};

const run = (command, args, environment) => {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: environment,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(command + ' exited with code ' + result.status + '.');
};

const main = async () => {
  const workflow = process.argv[2];
  const shouldPublish = process.argv.includes('--publish');
  const errors = validateIntegrationConfiguration(workflow, process.env);
  if (errors.length > 0) throw new Error(errors.join(' '));

  const youTrackUrl = process.env.YOUTRACK_TEST_BASE_URL || DEFAULT_YOUTRACK_URL;
  await waitForYouTrack(youTrackUrl);
  await assertAuthenticated('YouTrack', buildYouTrackRequest(youTrackUrl, process.env.YOUTRACK_TEST_TOKEN));
  if (workflow === 'jira-migration') {
    await assertAuthenticated('Jira Cloud', buildJiraCloudRequest(process.env));
    await assertAuthenticated('Jira Cloud project', buildJiraProjectRequest(process.env));
  }

  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test'], process.env);
  if (shouldPublish) {
    run(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
      'run', 'upload-' + workflow + ':test'
    ], {
      ...process.env,
      npm_config_host_test: youTrackUrl,
      npm_config_token_test: process.env.YOUTRACK_TEST_TOKEN
    });
  }
};

if (require.main === module) {
  main().catch(error => {
    console.error('Workflow integration failed: ' + error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  buildJiraCloudRequest,
  buildJiraProjectRequest,
  buildYouTrackRequest,
  isSuccessfulResponse
};

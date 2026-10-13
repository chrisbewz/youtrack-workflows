# Container Integration Environments

Each workflow has its own Docker Compose project, local YouTrack state, and
test runner. The environments are designed for local development and CI. They
never use repository `.npmrc` values and never send a package to production.

## Profiles

Integration configuration is selected with `INTEGRATION_PROFILE` and always
uses `tests/integration/<workflow>/.env.<profile>`. The default profile is
`local`, so existing commands use `.env.local` without extra configuration.

```powershell
# Default: tests/integration/task-export/.env.local
mise run integration:task-export:up

# Explicit profile: tests/integration/task-export/.env.corp
$env:INTEGRATION_PROFILE = 'corp'
mise run integration:task-export:init
mise run integration:task-export:up
```

Use profiles such as `local`, `corp`, and `ci` to select different registry,
proxy, port, or sandbox settings. All `.env.<profile>` files are ignored by
Git. CI should create `.env.ci` from secret-store values at runtime rather than
commit it. Profile names may contain only letters, numbers, and hyphens.

## Prerequisites

- Docker Desktop configured for Linux containers.
- Node.js only when running the Node suite outside Docker.
- A YouTrack Server license suitable for the local test instance.
- A local YouTrack administrator permanent token, created after the initial
  setup wizard.

Select a full, pinned YouTrack image build tag from Docker Hub. Do not use
`latest`; a pinned tag makes a failed integration run reproducible.

## Corporate proxies and registries

The environment works both with public images and with an internal registry
mirror. Image locations are intentionally local configuration, so a developer
can switch networks without changing a tracked Compose file:

```dotenv
# Public internet defaults
YOUTRACK_IMAGE_REPOSITORY=jetbrains/youtrack
RUNNER_NODE_IMAGE=node:22-alpine

# Example internal mirror. Use the exact paths defined by your registry team.
YOUTRACK_IMAGE_REPOSITORY=registry.corp.example/third-party/jetbrains/youtrack
RUNNER_NODE_IMAGE=registry.corp.example/library/node:22-alpine
```

Keep the same pinned `YOUTRACK_IMAGE_TAG` in either case. Authenticate the
Docker client with `docker login registry.corp.example`; never put registry
credentials in `.env.<profile>`, `mise.toml`, or a Compose file.

Configure the proxy at the Docker layer, not in this repository. In Docker
Desktop, configure **Settings > Resources > Proxies** for image pulls and
container egress. In Docker Engine, configure the daemon proxy. Add
`localhost`, `127.0.0.1`, and `youtrack` to the proxy bypass list so the runner
can reach the local YouTrack service directly. The runner also needs permitted
egress to the npm registry during image build and, for Jira Migration, to the
Jira Cloud sandbox.

The YouTrack image stores data, configuration, logs, and backups in named
volumes. This follows the server installation model and preserves the initial
wizard configuration across normal Compose restarts.

## General workflow

From the repository root, create the ignored profile file with mise, fill in
the required values, then start YouTrack:

```powershell
mise run integration:<workflow>:init
mise run integration:<workflow>:up
mise run integration:<workflow>:logs
```

On a first run, open `http://localhost:<YOUTRACK_HOST_PORT>` using the one-time
wizard URL printed in the logs. Complete the YouTrack setup, set the base URL
to the same host port, enter the local license, create a permanent token for
the test administrator, and save it as `YOUTRACK_TEST_TOKEN` in the selected
`.env.<profile>` file.

Run the selected environment after the wizard is complete:

```powershell
mise run integration:<workflow>:verify
```

The runner waits for YouTrack, checks authenticated access, runs `npm test`,
and uploads the selected local package to this local YouTrack instance. It does
not modify any configured production or shared test environment.

Stop containers while preserving the wizard, license, and local data:

```powershell
mise run integration:<workflow>:down
```

Reset a workflow environment only when intentionally discarding its local
YouTrack configuration and data:

```powershell
mise run integration:<workflow>:reset
```

## Task Export

The Task Export environment uses only local YouTrack.

```powershell
mise run integration:task-export:init
```

Set `YOUTRACK_IMAGE_TAG`, `YOUTRACK_HOST_PORT`, and, after the wizard,
`YOUTRACK_TEST_TOKEN`. Then use the general workflow with `task-export` in
place of `<workflow>`.

## Jira Migration

The Jira Migration environment uses local YouTrack plus a dedicated Jira Cloud
Free sandbox. Create a separate automation account and a project used only for
these tests. Its credentials must never be a personal or production account.
The [Jira Cloud sandbox runbook](../../docs/runbooks/jira-cloud-sandbox-setup.md)
documents the full preparation sequence.

```powershell
mise run integration:jira-migration:init
```

Set the YouTrack variables plus these Jira values:

| Variable | Purpose |
|---|---|
| `JIRA_CLOUD_AUTH_MODE` | `scoped-token` (default) for a service account, or `basic` for the legacy compatibility path. |
| `JIRA_CLOUD_BASE_URL` | HTTPS URL of the `*.atlassian.net` sandbox. It remains useful for the workflow's Jira browse links. |
| `JIRA_CLOUD_ID` | Required for `scoped-token`; the value after `/s/` in the Atlassian Administration URL, not the organization ID. |
| `JIRA_CLOUD_EMAIL` | Required only for `basic`; dedicated sandbox automation-account email. |
| `JIRA_CLOUD_API_TOKEN` | Raw scoped service-account API token, or raw API token for `basic`. |
| `JIRA_CLOUD_PROJECT_KEY` | Project the runner is allowed to verify. |

The runner checks `/rest/api/3/myself` and the configured project before
uploading. In `scoped-token` mode it uses the Atlassian API Gateway and a
Bearer token; in `basic` mode it uses the site URL and Basic authentication.
It prints only endpoint names and HTTP status codes, never token values or
Authorization headers.

For the recommended service-account configuration, create a scoped token with
`read:jira-work` and `write:jira-work`, set `jiraAuthMode` to `Scoped token`,
set `jiraEndpointUrl` to `JIRA_CLOUD_BASE_URL`, set `jiraCloudId` to
`JIRA_CLOUD_ID`, and paste the raw `JIRA_CLOUD_API_TOKEN` as `jiraApiToken`.
Do not add Jira administration privileges.

For the legacy Basic compatibility mode, encode the separate Jira values
locally before pasting the result into YouTrack:

```powershell
$credential = "$env:JIRA_CLOUD_EMAIL`:$env:JIRA_CLOUD_API_TOKEN"
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($credential))
```

Set `jiraProjectSlug` to `JIRA_CLOUD_PROJECT_KEY` and `syncMode` to `Dry-Run`
while initially proving the connection. Do not enable notifications in the
sandbox configuration.

## CI and troubleshooting

CI uses the same Compose commands and injects values from its secret store; it
must create `.env.ci` only for the job, must not publish it as an artifact, and
must not print the environment. Use a
dedicated Jira project and delete only data marked as integration-test data.

- **The runner times out waiting for YouTrack:** inspect `docker compose ...
  logs youtrack`; complete the initial wizard if it is still displayed.
- **YouTrack authentication fails:** create or replace the local permanent
  token, update `YOUTRACK_TEST_TOKEN`, then restart the runner.
- **Jira Cloud authentication or project checks fail:** verify the API token,
  project membership, and project key for the sandbox account. Do not widen
  permissions on a production account.
- **A reset was accidental:** `down -v` removes the local named volumes. Start
  the environment again and repeat the wizard; use normal `down` for routine
  stops.

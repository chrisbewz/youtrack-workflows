# Container Integration Environments

Each workflow has its own Docker Compose project, local YouTrack state, and
test runner. The environments are designed for local development and CI. They
never use repository `.npmrc` values and never send a package to production.

## Prerequisites

- Docker Desktop configured for Linux containers.
- Node.js only when running the Node suite outside Docker.
- A YouTrack Server license suitable for the local test instance.
- A local YouTrack administrator permanent token, created after the initial
  setup wizard.

Select a full, pinned YouTrack image build tag from Docker Hub. Do not use
`latest`; a pinned tag makes a failed integration run reproducible.

The YouTrack image stores data, configuration, logs, and backups in named
volumes. This follows the server installation model and preserves the initial
wizard configuration across normal Compose restarts.

## General workflow

From the repository root, create the ignored local file with mise, fill in the
required values, then start YouTrack:

```powershell
mise run integration:<workflow>:init
mise run integration:<workflow>:up
mise run integration:<workflow>:logs
```

On a first run, open `http://localhost:<YOUTRACK_HOST_PORT>` using the one-time
wizard URL printed in the logs. Complete the YouTrack setup, set the base URL
to the same host port, enter the local license, create a permanent token for
the test administrator, and save it as `YOUTRACK_TEST_TOKEN` in `.env.local`.

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

```powershell
mise run integration:jira-migration:init
```

Set the YouTrack variables plus these Jira values:

| Variable | Purpose |
|---|---|
| `JIRA_CLOUD_BASE_URL` | HTTPS URL of the `*.atlassian.net` sandbox. |
| `JIRA_CLOUD_EMAIL` | Dedicated sandbox automation-account email. |
| `JIRA_CLOUD_API_TOKEN` | Raw API token for the automation account. |
| `JIRA_CLOUD_PROJECT_KEY` | Project the runner is allowed to verify. |

The runner checks `/rest/api/3/myself` and the configured project before
uploading. It prints only endpoint names and HTTP status codes, never token
values or Authorization headers.

For the existing workflow setting `jiraApiToken`, encode the separate Jira
values locally before pasting the result into YouTrack:

```powershell
$credential = "$env:JIRA_CLOUD_EMAIL`:$env:JIRA_CLOUD_API_TOKEN"
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($credential))
```

Set `jiraEndpointUrl` to `JIRA_CLOUD_BASE_URL`, `jiraProjectSlug` to
`JIRA_CLOUD_PROJECT_KEY`, and `syncMode` to `Dry-Run` while initially proving
the connection. Do not enable notifications in the sandbox configuration.

## CI and troubleshooting

CI uses the same Compose commands and injects values from its secret store; it
must not create `.env.local` in an artifact or print the environment. Use a
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

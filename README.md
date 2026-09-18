# YouTrack Workflows

Custom YouTrack workflows and apps maintained in this repository.

## Workflow Reference

| Workflow | YouTrack title | Purpose |
|---|---|---|
| [`jira-migration/README.md`](jira-migration/README.md) | Jira Synchronization Manager | Synchronizes eligible YouTrack issues with Jira. |
| [`task-export/README.md`](task-export/README.md) | Task Export | Exports an issue and optional subtasks as Markdown, PDF, or ZIP. |

## Prerequisites

- Node.js 18 or newer for local validation and uploads.
- A YouTrack permanent token with permission to upload the selected workflow.
- Workflow-specific external credentials, when applicable. See the reference for
  the Jira synchronization requirements.

Install dependencies once:

```powershell
npm install
```

## Local configuration

The upload scripts read the target host and token from local npm configuration.
Keep these values in an untracked `.npmrc` file:

```ini
host_test=https://your-test-instance.youtrack.cloud
token_test=perm:YOUR_TEST_TOKEN

host_prod=https://your-production-instance.youtrack.cloud
token_prod=perm:YOUR_PRODUCTION_TOKEN
```

Do not commit tokens, `.env` files, or local npm configuration.

## Commands

| Command | Description |
|---|---|
| `npm test` | Runs the repository test suite. |
| `npm run upload-jira-migration:test` | Uploads Jira Synchronization Manager to the test instance. |
| `npm run upload-jira-migration:prod` | Uploads Jira Synchronization Manager to production. |
| `npm run upload-task-export:test` | Uploads Task Export to the test instance. |
| `npm run upload-task-export:prod` | Uploads Task Export to production. |

Validate changes before uploading:

```powershell
npm test
git diff --check
```

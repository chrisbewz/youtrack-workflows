# Jira Cloud Sandbox Setup

Use this runbook to prepare a dedicated Jira Cloud sandbox for the Jira
Synchronization Manager integration environment. It is intentionally separate
from any production Jira site.

## Outcome

At the end of this procedure, you will have:

- a Jira Cloud sandbox site and a project reserved for integration tests;
- an Atlassian service account with no Jira administration access;
- a scoped API token limited to the required Jira work scopes;
- a local, ignored integration profile with the sandbox connection details;
- the values needed to configure the uploaded Jira workflow in `Dry-Run` mode.

## 1. Create the sandbox project

Create or select a Jira Cloud Free site used exclusively for testing. Create a
project such as `YTTEST`, and do not reuse a production project or credentials.

Give the project an issue type and workflow suitable for the test scenarios the
repository exercises. Mark all data created there as integration-test data so
it can be safely cleaned up later.

## 2. Create the service account

In [Atlassian Administration](https://admin.atlassian.com):

1. Select the organization, then **Directory** > **Service accounts**.
2. Create a service account for this integration, such as
   `youtrack-integration-bot`.
3. Give it the **Jira User** application role for the sandbox site.
4. Do not give it the **Jira Administration** role.
5. Add it to a dedicated group or project role that has access only to the
   sandbox project.

The service account needs Jira project permissions appropriate for the workflow
operations: browse projects, create and edit issues, add and delete attachments,
and create issue links. Do not grant global administration to compensate for a
missing project permission.

## 3. Create the scoped API token

From the service-account page, choose **Create credential** > **API token**.
Name it for this integration and choose an expiration date that is actively
maintained. Select only these Jira scopes:

```text
read:jira-work
write:jira-work
```

Copy the token to the approved local secret store when it is shown. It cannot
be recovered later. Do not paste it into a tracked file, an issue, or a commit.

## 4. Find the Jira Cloud ID

In Atlassian Administration, open the sandbox site. The Cloud ID is the value
after `/s/` in its administration URL. It is not the Organization ID.

For example, in this URL:

```text
https://admin.atlassian.com/s/123e4567-e89b-12d3-a456-426614174000/...
```

the Cloud ID is `123e4567-e89b-12d3-a456-426614174000`.

## 5. Configure the local integration profile

Initialize the Jira profile from the repository root if it does not already
exist:

```powershell
mise run integration:jira-migration:init
```

Edit the ignored `tests/integration/jira-migration/.env.local` file. Do not
commit it:

```dotenv
JIRA_CLOUD_AUTH_MODE=scoped-token
JIRA_CLOUD_BASE_URL=https://your-sandbox.atlassian.net
JIRA_CLOUD_ID=<Cloud ID>
JIRA_CLOUD_API_TOKEN=<scoped service-account token>
JIRA_CLOUD_PROJECT_KEY=YTTEST
```

`JIRA_CLOUD_EMAIL` is not used in `scoped-token` mode. The same pattern works
for `.env.corp` or `.env.ci` by setting `INTEGRATION_PROFILE` before running
the mise commands.

## 6. Start and configure local YouTrack

Start the isolated YouTrack test environment:

```powershell
mise run integration:jira-migration:up
mise run integration:jira-migration:logs
```

Complete the first-run YouTrack wizard at the local host port. Create a local
test-administrator permanent token and save it only as `YOUTRACK_TEST_TOKEN` in
the selected ignored profile. Then run:

```powershell
mise run integration:jira-migration:verify
```

The runner checks the local YouTrack token, the service-account API access, and
the configured sandbox project before it uploads the local package to the local
YouTrack instance. It does not send a workflow to a shared or production
YouTrack environment.

## 7. Configure the workflow in local YouTrack

After the local upload, set these global workflow settings:

| Setting | Value |
|---|---|
| `jiraAuthMode` | `Scoped token` |
| `jiraEndpointUrl` | The sandbox site URL from `JIRA_CLOUD_BASE_URL` |
| `jiraCloudId` | The Cloud ID from `JIRA_CLOUD_ID` |
| `jiraApiToken` | The raw scoped token from `JIRA_CLOUD_API_TOKEN` |

Set `jiraProjectSlug` to `JIRA_CLOUD_PROJECT_KEY` and start with `syncMode` set
to `Dry-Run`. Keep notifications disabled during initial verification. Only
enable real writes after the dry-run output and project permissions have been
reviewed.

## Troubleshooting

- **401 Unauthorized:** confirm that the token is active, has both Jira work
  scopes, and is sent to the API Gateway URL rather than the site URL.
- **404 or project is unavailable:** ensure `JIRA_CLOUD_ID` is the Cloud ID,
  not the Organization ID, and verify project membership for the service
  account.
- **403:** correct the sandbox project's permission scheme or project role;
  do not add Jira administration as a shortcut.
- **Token rotation:** create a replacement scoped token, update the ignored
  local profile and the relevant local YouTrack workflow setting, verify in
  `Dry-Run`, then revoke the old token.

## References

- [Manage API tokens for service accounts](https://support.atlassian.com/user-management/docs/manage-api-tokens-for-service-accounts/)
- [Jira Cloud REST API authentication](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro)
- [Repository integration environment guide](../../tests/integration/README.md#jira-migration)

# Jira Synchronization Manager

Jira Synchronization Manager mirrors eligible YouTrack issues to Jira through
the Jira REST API. It creates or updates issues, maps states, priorities, and
types, and provides optional synchronization for links, labels, attachments,
versions, and referenced YouTrack articles.

## Requirements

- YouTrack 2024.3 or newer.
- A Jira API token and base URL.
- A target Jira project key.
- The required YouTrack fields listed below.

Configure these settings in the YouTrack workflow settings UI after attaching
the workflow to a project. Exact setting names, defaults, and validation rules
are defined in [settings.json](settings.json).

## Required YouTrack fields

| Field | Type | Purpose |
|---|---|---|
| `Jira ID` | String | Stores the Jira issue key after the first sync. |
| `Jira State` | Enum | Stores `Open` or `Closed` from the Jira status category. |
| `Jira Sync` | Enum | Per-issue mode: `Enabled`, `Dry-Run`, or `Disabled`. |
| `State` | State | Maps to a Jira workflow status. |
| `Priority` | Enum | Maps to a Jira priority. |
| `Type` | Enum | Maps to a Jira issue type. |
| `Estimation` | Period | Maps to Jira time tracking data. |

`Subsystem` is optional and maps to a Jira component. Optional capabilities
also use `Sync Subtasks`, `Jira Link Sync`, and `Jira Link Snapshot` fields.

## Synchronization model

The project setting `syncMode` is the master switch. The issue-level `Jira
Sync` field can only restrict that setting.

| Project `syncMode` | Issue `Jira Sync` | Result |
|---|---|---|
| `Disabled` | Any | No synchronization. |
| `Dry-Run` | Any | Reports the plan without Jira writes. |
| `Enabled` | `Disabled` | Skips the issue. |
| `Enabled` | `Dry-Run` | Reports the plan without Jira writes. |
| `Enabled` | `Enabled` | Creates or updates the Jira issue. |

When Jira reports a done status category, the workflow sets `Jira State` to
`Closed` and suppresses later writes unless `overrideCompleted` is enabled.
Subtasks are evaluated independently.

### Subtask hierarchy

An issue whose `Type` matches `subTaskItemType` is created or updated as a Jira
`Sub-task`. Its YouTrack `subtask of` parent must belong to the same project.
When the parent has no `Jira ID`, the workflow synchronizes the parent first.
The child payload then sets `fields.parent.key` to that Jira key. If the parent
cannot be synchronized, the child is skipped for retry by a later change,
manual sync, or scheduled bulk sync. Cross-project parent links and circular
subtask hierarchies are skipped safely.

## Rules and actions

| Rule | Trigger or command | Behavior |
|---|---|---|
| `jira-migration.js` | Issue change | Syncs reported issues when a mapped field, tag, version field, or sync setting changes. |
| `jira-migration-action.js` | **Sync to Jira** | Runs a full manual sync for a reported issue, including eligible existing attachments when attachment sync is enabled. |
| `jira-worklog-sync-action.js` | **Sync Jira Worklogs** | Exports YouTrack work items without syncing other issue fields. |
| `jira-migration-check-action.js` | **Check Jira Status** | Reads the linked Jira status and updates `Jira State`. |
| `jira-link-sync-action.js` | **Sync Jira Links** | Reconciles mapped links for the selected issue and immediate children. |
| `jira-label-sync-action.js` | **Sync Jira Labels** | Adds Jira labels as YouTrack tags, creating missing tags when authorized. |
| `jira-attachment-sync.js` | New attachment | Uploads accepted attachments when attachment sync is enabled for the project. |
| `jira-article-sync.js` | Description or Jira ID change | Reconciles referenced YouTrack articles as Markdown attachments. |
| `jira-article-update-sync.js` | Article change | Updates tracked article attachments in linked Jira issues. |
| `jira-migration-schedule.js` | Daily at 03:00 and 03:30 | Syncs unsynced reported issues, then checks the status of synced issues. |

## Configuration overview

### Global settings

`jiraAuthMode`, `jiraApiToken`, `jiraEndpointUrl`, `jiraCloudId`,
`youtrackBaseUrl`, and `youtrackApiToken` configure the integration boundaries.
`youtrackApiToken` is required only for manual Jira label synchronization.
`verboseNotify` and the notification channel settings control output for manual
syncs.

### Jira authentication

The default **Basic** mode preserves existing installations: `jiraApiToken`
contains the Base64 representation of `email:api-token`, and requests go to
`jiraEndpointUrl`. No existing setting needs to change.

**Scoped token** mode is opt-in and intended for an Atlassian service account.
Set `jiraAuthMode` to `Scoped token`, retain `jiraEndpointUrl` as the Jira site
URL for generated browse links, set `jiraCloudId` to the value after `/s/` in
the Atlassian Administration URL, and set `jiraApiToken` to the raw scoped API
token. Requests then use `Bearer` authentication through
`https://api.atlassian.com/ex/jira/<cloudId>/...`.

Create the service-account token with only the required Jira scopes. This
workflow normally needs `read:jira-work` and `write:jira-work`; project
permissions still restrict what the service account can read or modify. Do not
grant Jira administration merely for this integration.

Notification channels are `Disabled`, `ntfy`, `Teams`, and `Slack`. Treat all
webhook and topic URLs as secrets.

### Project settings

| Area | Settings |
|---|---|
| Target and execution | `jiraProjectSlug`, `syncMode`, `overrideCompleted` |
| Worklog synchronization | `worklogSyncMode` |
| Issue type mapping | `epicItemType`, `storyItemType`, `taskItemType`, `subTaskItemType` |
| Priority mapping | `priorityHighestName`, `priorityHighName`, `priorityMediumName`, `priorityLowName` and their Jira counterparts |
| State mapping | `statusDoneStates`, `statusInProgressStates` |
| Link synchronization | `linkSyncMode`, `linkTypeMappingJson` |
| Version synchronization | `youtrackVersionFieldName`, `jiraVersionFieldId`, `versionLabelPrefix` |
| Attachments and articles | `attachmentSyncMode`, `attachmentMaxSizeKb`, `attachmentAllowedMimeTypes`, `articleAttachmentPrefix` |
| Internal labels | `reservedLabelNames` |

For `linkTypeMappingJson`, each YouTrack link direction maps to a Jira link type
and must declare either `symmetric: true` or `jiraSide: "outward"` / `"inward"`.

```json
{
  "relates to": { "jiraType": "Relates", "symmetric": true },
  "depends on": { "jiraType": "Blocks", "jiraSide": "inward" }
}
```

## Important limitations

### Attachment synchronization

Attachment synchronization is opt-in through the project-level
`attachmentSyncMode` setting. With `Enabled`, newly added eligible files are
uploaded automatically and **Sync to Jira** also reconciles the issue's
existing attachments. The manual sync reads the Jira attachment inventory and
skips files that already have the same filename and byte size there.

The defaults accept files up to 5 MB with MIME types `image/png`, `image/jpeg`,
`image/gif`, `application/pdf`, and `text/plain`. Customize the size and MIME
allowlist per project. Attachment sync requires a linked `Jira ID`, respects
the effective sync mode, and never performs uploads in `Dry-Run`.

`reservedLabelNames` is a project-scoped, comma-separated exact label list.
Reserved labels stay internal to YouTrack: they are excluded from the Jira
issue payload and ignored by **Sync Jira Labels**. Any reserved label disables
attachment synchronization for the individual issue, without requiring an
issue custom field. The default reserved label is `jira:no-attachments`.

Attachment removal in YouTrack never removes the Jira copy. A failed attachment
upload during **Sync to Jira** is reported but does not revert an otherwise
successful issue synchronization.

### Worklog synchronization

Worklog synchronization is opt-in through the project-level `worklogSyncMode` setting. When enabled, new YouTrack work items are exported as Jira worklogs with their duration, date, text, author login, and work-item type. The workflow records a source identifier in a Jira worklog property and skips entries it has already exported. It never updates or deletes Jira worklogs.

The **Sync Jira Worklogs** action runs this export independently. It honors the effective Jira sync mode, including `Dry-Run`.

- Jira priority and issue type names must match the Jira project exactly.
- Comments are migrated only when a Jira issue is created, avoiding duplicate
  comment uploads.
- Link synchronization is the only bidirectional synchronization path; most
  Jira-side field changes are not copied back to YouTrack.
- The workflow never creates Jira project versions. Values without a matching
  Jira version are represented by managed labels.
- Attachment synchronization never deletes Jira attachments when a YouTrack
  attachment is removed.
- In YouTrack Cloud, enable `verboseNotify` to view detailed manual-sync output.

## Development and upload

From the repository root:

```powershell
npm test
npm run upload-jira-migration:test
npm run upload-jira-migration:prod
```

Upload targets use the local `.npmrc` configuration documented in the
[repository README](../README.md).

## Container integration environment

The Jira Synchronization Manager integration environment starts a local
YouTrack Server and connects it to a dedicated Jira Cloud Free sandbox. It
does not use a self-hosted Jira installation or a Jira Data Center license.
The container runner verifies both authenticated APIs, confirms access to the
configured sandbox project, runs the repository suite, and uploads the local
workflow package to the local YouTrack instance.

The integration environment defaults to service-account scoped-token
authentication. Set `JIRA_CLOUD_ID` to the value after `/s/` in the Atlassian
Administration URL and provide the raw API token. In the uploaded local
YouTrack workflow, select `Scoped token`, set `jiraCloudId` to the same value,
and paste the raw token in `jiraApiToken`.

Follow the [Jira Cloud sandbox runbook](../docs/runbooks/jira-cloud-sandbox-setup.md)
to create the sandbox project, service account, token, local profile, and
initial `Dry-Run` workflow configuration.

Basic authentication remains available for compatibility: set
`JIRA_CLOUD_AUTH_MODE=basic`, configure `JIRA_CLOUD_EMAIL`, and encode
`email:api-token` locally before setting `jiraApiToken` in YouTrack. Full setup,
execution, cleanup, and troubleshooting instructions are in the
[integration environment guide](../tests/integration/README.md#jira-migration).
Set `INTEGRATION_PROFILE` to select `.env.<profile>`; it defaults to `local`.

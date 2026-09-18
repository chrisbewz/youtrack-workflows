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
also use `Sync Subtasks`, `Jira Attachment Sync`, `Jira Link Sync`, and
`Jira Link Snapshot` fields.

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

## Rules and actions

| Rule | Trigger or command | Behavior |
|---|---|---|
| `jira-migration.js` | Issue change | Syncs reported issues when a mapped field, tag, version field, or sync setting changes. |
| `jira-migration-action.js` | **Sync to Jira** | Runs a full manual sync for a reported issue. |
| `jira-migration-check-action.js` | **Check Jira Status** | Reads the linked Jira status and updates `Jira State`. |
| `jira-link-sync-action.js` | **Sync Jira Links** | Reconciles mapped links for the selected issue and immediate children. |
| `jira-label-sync-action.js` | **Sync Jira Labels** | Adds Jira labels as YouTrack tags, creating missing tags when authorized. |
| `jira-attachment-sync.js` | New attachment | Uploads accepted attachments for opted-in issues. |
| `jira-article-sync.js` | Description or Jira ID change | Reconciles referenced YouTrack articles as Markdown attachments. |
| `jira-article-update-sync.js` | Article change | Updates tracked article attachments in linked Jira issues. |
| `jira-migration-schedule.js` | Daily at 03:00 and 03:30 | Syncs unsynced reported issues, then checks the status of synced issues. |

## Configuration overview

### Global settings

`jiraApiToken`, `jiraEndpointUrl`, `youtrackBaseUrl`, and `youtrackApiToken`
configure the integration boundaries. `youtrackApiToken` is required only for
manual Jira label synchronization. `verboseNotify` and the notification channel
settings control output for manual syncs.

Notification channels are `Disabled`, `ntfy`, `Teams`, and `Slack`. Treat all
webhook and topic URLs as secrets.

### Project settings

| Area | Settings |
|---|---|
| Target and execution | `jiraProjectSlug`, `syncMode`, `overrideCompleted` |
| Issue type mapping | `epicItemType`, `storyItemType`, `taskItemType`, `subTaskItemType` |
| Priority mapping | `priorityHighestName`, `priorityHighName`, `priorityMediumName`, `priorityLowName` and their Jira counterparts |
| State mapping | `statusDoneStates`, `statusInProgressStates` |
| Link synchronization | `linkSyncMode`, `linkTypeMappingJson` |
| Version synchronization | `youtrackVersionFieldName`, `jiraVersionFieldId`, `versionLabelPrefix` |
| Attachments and articles | `attachmentMaxSizeKb`, `attachmentAllowedMimeTypes`, `articleAttachmentPrefix` |

For `linkTypeMappingJson`, each YouTrack link direction maps to a Jira link type
and must declare either `symmetric: true` or `jiraSide: "outward"` / `"inward"`.

```json
{
  "relates to": { "jiraType": "Relates", "symmetric": true },
  "depends on": { "jiraType": "Blocks", "jiraSide": "inward" }
}
```

## Important limitations

- Jira priority and issue type names must match the Jira project exactly.
- Comments are migrated only when a Jira issue is created, avoiding duplicate
  comment uploads.
- Link synchronization is the only bidirectional synchronization path; most
  Jira-side field changes are not copied back to YouTrack.
- The workflow never creates Jira project versions. Values without a matching
  Jira version are represented by managed labels.
- Attachment synchronization only uploads newly added accepted files; it does
  not delete Jira attachments when a YouTrack attachment is removed.
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

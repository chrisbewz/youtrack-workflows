# YouTrack → Jira Sync Workflow

A [YouTrack workflow](https://www.jetbrains.com/help/youtrack/server/workflows-overview.html) that automatically mirrors YouTrack issues into a Jira project. Changes in YouTrack (field edits, state transitions, new issues) are pushed to Jira in real time via the Jira REST API. Optional notifications are dispatched to ntfy, Microsoft Teams, or Slack after each sync.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Requirements](#requirements)
- [YouTrack Custom Fields](#youtrack-custom-fields)
- [Installation](#installation)
- [Configuration](#configuration)
  - [Global Settings](#global-settings)
  - [Project-Level Settings](#project-level-settings)
  - [Priority Mapping](#priority-mapping)
  - [State Mapping](#state-mapping)
  - [Issue Type Mapping](#issue-type-mapping)
- [Sync Modes](#sync-modes)
- [Rules Reference](#rules-reference)
- [Local Debugging](#local-debugging)
- [Known Limitations](#known-limitations)

---

## How It Works

The workflow package (`jira-migration/`) contains four rule files that all share a single sync pipeline defined in `sync-core.js`.

```
YouTrack issue change
        │
        ▼
  jira-migration.js          ← onChange: fires on any mapped field change
  jira-migration-action.js   ← action:   "Sync to Jira" button (manual)
  jira-migration-schedule.js ← schedule: nightly bulk sync + status check
        │
        ▼
    sync-core.js  performSync()
        │
        ├─ Resolves Jira project components (if Subsystem is set)
        ├─ Builds Jira REST API v2 payload
        ├─ POST /rest/api/2/issue          → CREATE (no Jira ID yet)
        │  or PUT /rest/api/2/issue/{key}  → UPDATE (Jira ID already set)
        ├─ Migrates comments               (CREATE only, to avoid duplicates)
        ├─ POST /rest/api/2/issue/{key}/transitions  → status transition
        └─ notifyChannel()  → ntfy / Teams / Slack
```

### Suppression guard

When a Jira issue transitions to a "done" status category, the YouTrack `Jira State` field is set to `Closed`. Subsequent syncs for that issue are **suppressed** unless `overrideCompleted` is enabled for the project. Sub-tasks are always evaluated independently and are never suppressed.

---

## Requirements

| Requirement | Version |
|---|---|
| YouTrack | Server or Cloud |
| Node.js | 18+ (for local development only) |
| Jira | Cloud or Server with REST API v2 enabled |
| `@jetbrains/youtrack-scripting` CLI | `^0.2.1` |

Install dev dependencies:

```bash
npm install
```

---

## YouTrack Custom Fields

The following custom fields must exist in every YouTrack project where the workflow is attached. Field names are case-sensitive and must match exactly.

| Field name | Type | Values / Notes |
|---|---|---|
| `Jira ID` | String | Stores the Jira issue key after first sync (e.g. `PROJ-42`). Set automatically. |
| `Jira State` | Enum | `Open`, `Closed`. Reflects the Jira-side status category. Set automatically. |
| `Jira Sync` | Enum | `Enabled`, `Dry-Run`, `Disabled`. Per-issue override of the project sync mode. |
| `State` | State | Standard YouTrack state field. |
| `Priority` | Enum | Standard YouTrack priority field. |
| `Type` | Enum | Standard YouTrack type field. |
| `Estimation` | Period | Standard YouTrack estimation field. |
| `Subsystem` | Enum | Maps to a Jira component. Optional — leave blank to skip component assignment. |

---

## Installation

### 1. Configure credentials

Copy `.env.example` to `.env` (or edit `.env` directly) and fill in your values:

```env
JIRA_ENDPOINT=https://your-company.atlassian.net
JIRA_PROJECT_SLUG=PROJ
JIRA_TOKEN_ENCODED=<base64 of email:api_token>
```

Generate the encoded token:

```bash
echo -n "you@example.com:YOUR_API_TOKEN" | base64
```

Store the result in `JIRA_TOKEN_ENCODED`. The token itself is never committed — it is only used by the local debug harness.

### 2. Configure `.npmrc`

Host and token for your YouTrack instances are read from `.npmrc`. Add:

```ini
host_prod=https://your-youtrack.youtrack.cloud
token_prod=perm:YOUR_YOUTRACK_TOKEN

host_test=https://your-youtrack-test.youtrack.cloud
token_test=perm:YOUR_YOUTRACK_TEST_TOKEN
```

### 3. Upload the workflow

```bash
# Upload to the test environment first
npm run upload-jira-migration:test

# Upload to production
npm run upload-jira-migration:prod
```

### 4. Attach the workflow in YouTrack

In YouTrack admin, go to **Administration → Workflows**, find **Jira Synchronization Manager**, and attach it to the target project(s). Then configure the workflow settings per project (see [Configuration](#configuration)).

---

## Configuration

All settings are configured per-project in YouTrack's workflow settings UI after the workflow is attached. Settings marked **GLOBAL** apply to all projects sharing the same YouTrack instance; settings marked **PROJECT** are independent per project.

### Global Settings

| Setting | Description | Required |
|---|---|---|
| `jiraApiToken` | Base64-encoded `email:api_token` for Jira Basic Auth. | ✅ |
| `jiraEndpointUrl` | Jira base URL without trailing slash (e.g. `https://your-company.atlassian.net`). | ✅ |
| `youtrackBaseUrl` | YouTrack base URL. Used to generate project links in notifications. | ✗ |
| `verboseNotify` | When enabled, the full sync log is surfaced as a YouTrack notification popup on manual syncs. Useful in YouTrack Cloud where server logs are not accessible. | ✗ |
| `notificationChannel` | External channel for sync notifications: `Disabled`, `ntfy`, `Teams`, `Slack`. | ✗ |
| `ntfyTopicUrl` | Full ntfy topic URL (e.g. `https://ntfy.sh/your-topic`). Required when channel is `ntfy`. | ✗ |
| `teamsWebhookUrl` | Incoming Webhook URL from a Teams channel. Required when channel is `Teams`. | ✗ |
| `slackWebhookUrl` | Incoming Webhook URL from a Slack app. Required when channel is `Slack`. | ✗ |

### Project-Level Settings

| Setting | Description | Required |
|---|---|---|
| `jiraProjectSlug` | Key of the target Jira project (e.g. `PROJ`). | ✅ |
| `syncMode` | `Enabled`, `Dry-Run`, or `Disabled`. Controls sync for all issues in the project. | ✅ |
| `overrideCompleted` | When `true`, syncs issues even if `Jira State` is `Closed`. Default: `false`. | ✗ |

### Priority Mapping

Each priority tier has two settings — the **YouTrack field value** (source) and the **Jira priority name** (target). Both fall back to sensible defaults when left blank.

| YouTrack setting | Default | Jira setting | Default |
|---|---|---|---|
| `priorityHighestName` | `Show-stopper` | `priorityHighestNameJira` | `Highest` |
| `priorityHighName` | `Critical` | `priorityHighNameJira` | `High` |
| `priorityMediumName` | `Normal` | `priorityMediumNameJira` | `Medium` |
| `priorityLowName` | `Minor` | `priorityLowNameJira` | `Low` |

> **Note:** The Jira-side names (`priorityXxxNameJira`) must match **exactly** the priority names defined in your Jira project. To list them:
> ```bash
> curl -s -H "Authorization: Basic $JIRA_TOKEN_ENCODED" \
>   "$JIRA_ENDPOINT/rest/api/2/priority" | node -e \
>   "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>JSON.parse(d).forEach(p=>console.log(p.name)))"
> ```

### State Mapping

States are configured as comma-separated strings.

| Setting | Default | Maps to Jira |
|---|---|---|
| `statusDoneStates` | `Fixed,Verified,Closed,Can't Reproduce,Duplicate,Won't fix,Incomplete` | `Done` |
| `statusInProgressStates` | `In Progress` | `In Progress` |

Any state not listed in either setting maps to `To Do`.

Status transitions in Jira are looked up dynamically via `/rest/api/2/issue/{key}/transitions` — the workflow finds the transition whose `to.name` matches the mapped status. If no matching transition exists, the transition is silently skipped.

### Issue Type Mapping

| Setting | Default (YouTrack) | Maps to Jira |
|---|---|---|
| `epicItemType` | `Epic` | `Epic` |
| `storyItemType` | `Feature` | `Story` |
| `taskItemType` | `Task` | `Task` |
| `subTaskItemType` | `Subtask` | `Sub-task` |

Legacy types `Bug` → `Bug` and `Improvement` → `Story` are hardcoded for backward compatibility.

---

## Sync Modes

Sync mode is evaluated at two levels. The **project-level** `syncMode` setting is the master switch; the per-issue `Jira Sync` field can override it downward (e.g. force Dry-Run on a single issue even when the project is Enabled).

| `syncMode` (project) | `Jira Sync` (issue field) | Behaviour |
|---|---|---|
| `Disabled` | any | Sync skipped entirely. |
| `Enabled` | `Disabled` | Issue skipped. |
| `Enabled` | `Dry-Run` | Payload logged, no Jira write. |
| `Enabled` | `Enabled` | Full sync. |
| `Dry-Run` | any | Payload logged, no Jira write. |

---

## Rules Reference

| Rule file | Type | Trigger | Purpose |
|---|---|---|---|
| `jira-migration.js` | `onChange` | Any mapped field changes on a reported issue | Real-time sync to Jira |
| `jira-migration-action.js` | `action` | "Sync to Jira" button | Manual or forced re-sync |
| `jira-migration-check-action.js` | `action` | "Check Jira Status" button | Fetch Jira status and update `Jira State` |
| `jira-migration-schedule.js` | `onSchedule` (×2) | Daily 03:00 / 03:30 | Bulk sync of unsynced issues; bulk status check of synced issues |

**Tracked field changes** (onChange rule):
- `summary`, `description`
- `State`, `Priority`, `Type`, `Estimation`, `Subsystem`
- Tags
- `becomesReported` (new issue)

---

## Local Debugging

A local test harness is provided at `jira-migration/debug-local.js`. It replaces the YouTrack-only `http.Connection` class (which requires a JVM) with a synchronous `curl`-based implementation so `performSync` can be exercised against the real Jira API from a plain Node.js process.

```bash
node jira-migration/debug-local.js
```

Credentials are read from `.env`. Edit the `issue` and `ctx` objects inside the file to match the scenario under test.

**Key toggles:**

```js
// Safe — logs the Jira payload without making any API writes:
ctx.settings.syncMode = 'Dry-Run';

// Live — creates or updates a real Jira issue:
ctx.settings.syncMode = 'Enabled';

// Test CREATE (no Jira ID yet):
issue.fields['Jira ID'] = null;

// Test UPDATE (issue already exists in Jira):
issue.fields['Jira ID'] = 'PROJ-123';
```

---

## Known Limitations

### No bi-directional sync
Changes made directly in Jira are not reflected back in YouTrack. The `Jira State` field is the only piece of Jira-side state that is pulled back, and only via the scheduled status check or the "Check Jira Status" action.

### REST API v2 — plain text descriptions
The sync pipeline targets Jira REST API **v2**, which accepts `description` and comment `body` as plain strings only. Atlassian Document Format (ADF/rich text) is supported by API v3 only and is not used here. Formatting in YouTrack descriptions is lost on sync.

### API version inconsistency
`performSync` (create/update) uses REST API **v2**; `checkJiraStatus` uses REST API **v3** for the status category check. Both endpoints are available on Jira Cloud. Jira Server / Data Center users should verify v3 availability.

### Comments migrated on CREATE only
Comments are pushed to Jira once, during the initial CREATE. Subsequent comment additions in YouTrack are not synced to avoid duplicates. There is no deduplication mechanism.

### Status transitions depend on Jira workflow
If the Jira project's workflow does not expose a transition to the target status from the issue's current status, the transition is silently skipped and a warning is logged. No error is returned to the user.

### No attachment migration
File attachments are not transferred from YouTrack to Jira.

### Priority and type names are case-sensitive
Jira rejects payloads with unknown priority or issue type names. Values must match exactly what is configured in the target Jira project. Use the `priorityXxxNameJira` settings to align names when they differ from the defaults.

### Sub-tasks bypass the suppression guard
Issues with `Type` matching `subTaskItemType` are always synced regardless of the `Jira Closed` / `overrideCompleted` state. This is intentional but may cause unexpected updates if sub-tasks are closed in Jira directly.

### YouTrack Cloud — no server log access
In YouTrack Cloud, `console.log` output is not accessible to workflow authors. Enable `verboseNotify` and configure a notification channel to observe sync results.

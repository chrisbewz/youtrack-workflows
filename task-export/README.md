# Task Export

Task Export is a YouTrack app that adds **Export task** to the issue options
menu. It exports the current issue and, optionally, all of its subtasks as
UTF-8 Markdown, a browser-generated PDF, copied Markdown, or a ZIP archive.

## Requirements

- YouTrack 2024.3 or newer.
- `READ_ISSUE` permission for users who open the export dialog or call an
  endpoint.

## Using the export dialog

1. Open an issue and select **Export task** from the issue options menu.
2. Review the tasks to export. Each item shows the readable issue ID and its
   original title.
3. Drag tasks to set a manual order, or apply natural ordering by task title or
   task ID.
4. Optionally change export settings for this request and select **Update
   preview**. These values override the project defaults only for the current
   export; they never update project settings.
5. Select an output format on the right side of the split export button, then
   use the left side to run the selected export.

The available formats are:

- **Markdown**: one composed Markdown document.
- **PDF**: a browser-generated PDF that preserves headings, lists, emphasis,
  and clickable links.
- **Copy Markdown**: copies the composed document to the clipboard.
- **ZIP**: one Markdown file per exported task. Available only when separate
  files are enabled and more than one task is exported.

## Project settings

All settings are project-scoped and default to `false`.

| Setting | Effect |
|---|---|
| **Include subtasks** | Recursively includes subtasks in deterministic pre-order. |
| **Include task relation diagram** | Adds a Mermaid diagram for relations between exported tasks. |
| **Include fields** | Adds the task custom fields to each document. |
| **Include tags** | Adds task tags to each document. |
| **Separate files for multiple tasks** | Enables ZIP output for multi-task exports. |

The dialog initially uses these project defaults. Its request-only overrides are
sent to the data endpoint and are not persisted.

## Output behavior

- Each task title becomes a level-one Markdown heading and its description is
  preserved as Markdown.
- The Markdown endpoint emits subtasks in pre-order: root, first subtask tree,
  then the next subtask tree.
- A repeated issue reference is emitted once. The response includes the
  `X-Task-Export-Warnings` header when duplicates were skipped.
- Mermaid parent/subtask aliases are normalized into one parent-to-subtask edge,
  preventing duplicate arrows for the same relationship.
- The export operation is read-only: it does not modify issues or create
  attachments.

## HTTP endpoints

Both endpoints are issue-scoped and require `READ_ISSUE`.

| Endpoint | Response |
|---|---|
| `GET /api/issues/{issueId}/extensionEndpoints/task-export/markdown-export-http/markdown` | Downloadable Markdown document. |
| `GET /api/issues/{issueId}/extensionEndpoints/task-export/markdown-export-http/data` | JSON payload used by the dialog. |

The `data` endpoint accepts the following optional boolean query parameters:
`includeSubtasks`, `includeFields`, `includeTags`,
`includeTaskRelationDiagram`, and `separateFilesForMultipleTasks`. Each value
overrides its project setting only for that response.

## Development and upload

From the repository root:

```powershell
npm test
npm run upload-task-export:test
npm run upload-task-export:prod
```

Upload targets use the local `.npmrc` configuration documented in the
[repository README](../README.md).

# Task Export

The current increment exposes an issue-scoped HTTP handler that returns the
selected YouTrack issue, optionally including recursive subtasks, as a UTF-8
Markdown download.

## Endpoint

After uploading and enabling the app, call:

~~~text
GET /api/issues/{issueId}/extensionEndpoints/task-export/markdown-export-http/markdown
~~~

The endpoint requires READ_ISSUE permission and returns:

- Content-Type: text/markdown; charset=utf-8
- Content-Disposition: attachment
- Markdown with each issue title as H1 and its description under `## Descrição`

The project setting Include subtasks is disabled by default. When enabled,
issues are emitted in pre-order: root, first subtask tree, next subtask tree.
Repeated issue references are emitted once and reported in the
X-Task-Export-Warnings response header.

The optional project settings Include fields, Include tags and Include task
relation diagram add the corresponding sections to the Markdown output.

The endpoint does not modify the issue or create an attachment.

## Upload

~~~powershell
npm run upload-task-export:test --host_test=... --token_test=...
~~~

PDF, ZIP packaging and a UI action remain planned for subsequent increments.

# Task Export

The first increment exposes an issue-scoped HTTP handler that returns the
selected YouTrack issue as a UTF-8 Markdown download.

## Endpoint

After uploading and enabling the app, call:

~~~text
GET /api/issues/{issueId}/extensionEndpoints/task-export/markdown-export-http/markdown
~~~

The endpoint requires READ_ISSUE permission and returns:

- Content-Type: text/markdown; charset=utf-8
- Content-Disposition: attachment
- Markdown with the issue title as H1 and the description under ## Descrição

The endpoint does not modify the issue or create an attachment.

## Upload

~~~powershell
npm run upload-task-export:test --host_test=... --token_test=...
~~~

The PDF, subtasks, fields, tags, relation diagram, ZIP packaging and UI action
are planned for subsequent increments.

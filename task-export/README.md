# Task Export

The app exposes an issue-scoped HTTP handler and an issue options-menu action
that export the selected YouTrack issue as UTF-8 Markdown, PDF or ZIP.

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

## Issue action

The app adds Exportar task to the issue options menu. The action provides:

- Markdown download using the canonical composed document.
- PDF download generated in the browser.
- ZIP download with one Markdown file per task when Separate files for
  multiple tasks is enabled and more than one task is exported.

The JSON endpoint used by the widget is:

~~~text
GET /api/issues/{issueId}/extensionEndpoints/task-export/markdown-export-http/data
~~~

## Upload

~~~powershell
npm run upload-task-export:test --host_test=... --token_test=...
~~~

const { renderTaskMarkdown } = require('./markdown-renderer');
const { buildMarkdownDownloadHeaders } = require('./export-artifact');
const { collectIssues } = require('./issue-export-collector');
const { composeMarkdownDocuments } = require('./markdown-composer');

exports.httpHandler = {
  endpoints: [
    {
      scope: 'issue',
      method: 'GET',
      path: 'markdown',
      permissions: ['READ_ISSUE'],
      handle: ctx => {
        const collection = collectIssues(ctx.issue, {
          includeSubtasks: ctx.settings.includeSubtasks
        });
        const markdown = composeMarkdownDocuments(collection.issues.map(issue =>
          renderTaskMarkdown({
            summary: issue.summary,
            description: issue.description
          })
        ));

        const headers = buildMarkdownDownloadHeaders({
          idReadable: ctx.issue.idReadable,
          id: ctx.issue.id,
          summary: ctx.issue.summary
        });

        Object.entries(headers).forEach(([name, value]) => {
          ctx.response.addHeader(name, value);
        });
        if (collection.warnings.length > 0) {
          ctx.response.addHeader(
            'X-Task-Export-Warnings',
            String(collection.warnings.length)
          );
        }
        ctx.response.text(markdown);
      }
    }
  ]
};

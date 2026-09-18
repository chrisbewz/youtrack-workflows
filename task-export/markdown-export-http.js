const { renderTaskMarkdown } = require('./markdown-renderer');
const { buildMarkdownDownloadHeaders } = require('./export-artifact');

exports.httpHandler = {
  endpoints: [
    {
      scope: 'issue',
      method: 'GET',
      path: 'markdown',
      permissions: ['READ_ISSUE'],
      handle: ctx => {
        const markdown = renderTaskMarkdown({
          summary: ctx.issue.summary,
          description: ctx.issue.description
        });

        const headers = buildMarkdownDownloadHeaders({
          idReadable: ctx.issue.idReadable,
          id: ctx.issue.id,
          summary: ctx.issue.summary
        });

        Object.entries(headers).forEach(([name, value]) => {
          ctx.response.addHeader(name, value);
        });
        ctx.response.text(markdown);
      }
    }
  ]
};

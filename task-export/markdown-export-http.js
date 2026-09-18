const { renderTaskMarkdown } = require('./markdown-renderer');
const { buildMarkdownDownloadHeaders, buildMarkdownFilename } = require('./export-artifact');
const { collectIssues } = require('./issue-export-collector');
const { composeMarkdownDocuments } = require('./markdown-composer');
const { renderRelationDiagram } = require('./relation-diagram');

const isEnabled = value => value === true || value === 'true';

const buildExportPayload = ctx => {
  const collection = collectIssues(ctx.issue, {
    includeSubtasks: isEnabled(ctx.settings.includeSubtasks)
  });
  const documents = collection.issues.map(issue => ({
    task: {
      idReadable: issue.idReadable,
      summary: issue.summary
    },
    fileName: buildMarkdownFilename(issue),
    markdown: renderTaskMarkdown({
      summary: issue.summary,
      description: issue.description,
      fields: issue.fields,
      tags: issue.tags
    }, {
      includeFields: isEnabled(ctx.settings.includeFields),
      includeTags: isEnabled(ctx.settings.includeTags)
    })
  }));
  let markdown = composeMarkdownDocuments(documents.map(document => document.markdown));
  if (isEnabled(ctx.settings.includeTaskRelationDiagram)) {
    const diagram = renderRelationDiagram(collection.issues);
    if (diagram) markdown += '\n' + diagram;
  }
  return {
    issue: {
      id: ctx.issue.id,
      idReadable: ctx.issue.idReadable,
      summary: ctx.issue.summary
    },
    markdown,
    documents,
    warnings: collection.warnings,
    separateFilesForMultipleTasks: isEnabled(ctx.settings.separateFilesForMultipleTasks)
  };
};

const addWarningsHeader = (ctx, warnings) => {
  if (warnings.length > 0) {
    ctx.response.addHeader('X-Task-Export-Warnings', String(warnings.length));
  }
};

exports.httpHandler = {
  endpoints: [
    {
      scope: 'issue',
      method: 'GET',
      path: 'markdown',
      permissions: ['READ_ISSUE'],
      handle: ctx => {
        const payload = buildExportPayload(ctx);
        const headers = buildMarkdownDownloadHeaders(payload.issue);
        Object.entries(headers).forEach(([name, value]) => ctx.response.addHeader(name, value));
        addWarningsHeader(ctx, payload.warnings);
        ctx.response.text(payload.markdown);
      }
    },
    {
      scope: 'issue',
      method: 'GET',
      path: 'data',
      permissions: ['READ_ISSUE'],
      handle: ctx => ctx.response.json(buildExportPayload(ctx))
    }
  ]
};

exports.buildExportPayload = buildExportPayload;

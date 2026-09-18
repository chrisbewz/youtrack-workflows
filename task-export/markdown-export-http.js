const { renderTaskMarkdown } = require('./markdown-renderer');
const { buildMarkdownDownloadHeaders, buildMarkdownFilename } = require('./export-artifact');
const { collectIssues } = require('./issue-export-collector');
const { composeMarkdownDocuments } = require('./markdown-composer');
const { renderRelationDiagram } = require('./relation-diagram');

const isEnabled = value => value === true || value === 'true';

const OPTION_KEYS = [
  'includeSubtasks',
  'includeFields',
  'includeTags',
  'includeTaskRelationDiagram',
  'separateFilesForMultipleTasks'
];

const exportOptions = ctx => OPTION_KEYS.reduce((options, key) => {
  const requestValue = ctx.request && typeof ctx.request.getParameter === 'function'
    ? ctx.request.getParameter(key)
    : null;
  options[key] = requestValue === 'true' || requestValue === 'false'
    ? isEnabled(requestValue)
    : isEnabled(ctx.settings[key]);
  return options;
}, {});

const buildExportPayload = ctx => {
  const options = exportOptions(ctx);
  const collection = collectIssues(ctx.issue, {
    includeSubtasks: options.includeSubtasks
  });
  const documents = collection.issues.map(issue => ({
    task: {
      idReadable: issue.idReadable,
      summary: issue.summary,
      description: issue.description == null ? '' : String(issue.description)
    },
    fileName: buildMarkdownFilename(issue),
    originalTitle: issue.summary,
    markdown: renderTaskMarkdown({
      summary: issue.summary,
      description: issue.description,
      fields: issue.fields,
      tags: issue.tags
    }, {
      includeFields: options.includeFields,
      includeTags: options.includeTags
    })
  }));
  let trailingMarkdown = '';
  if (options.includeTaskRelationDiagram) {
    const diagram = renderRelationDiagram(collection.issues);
    if (diagram) trailingMarkdown = '\n' + diagram;
  }
  const markdown = composeMarkdownDocuments(documents.map(document => document.markdown)) + trailingMarkdown;
  return {
    issue: {
      id: ctx.issue.id,
      idReadable: ctx.issue.idReadable,
      summary: ctx.issue.summary
    },
    markdown,
    trailingMarkdown,
    documents,
    warnings: collection.warnings,
    separateFilesForMultipleTasks: options.separateFilesForMultipleTasks,
    projectOptions: OPTION_KEYS.reduce((projectOptions, key) => {
      projectOptions[key] = isEnabled(ctx.settings[key]);
      return projectOptions;
    }, {}),
    options
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

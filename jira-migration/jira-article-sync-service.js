const entities = require('@jetbrains/youtrack-scripting-api/entities');
const http = require('@jetbrains/youtrack-scripting-api/http');
const {
  extractArticleIds,
  buildMarkdownFile,
  parseStoredMappings,
  buildReconciliationPlan,
  evaluateArticleSync
} = require('./article-sync-service');

// Extension properties provide app-owned persistence without requiring custom fields.
// https://www.jetbrains.com/help/youtrack/devportal/apps-extension-properties.html
const readMappings = issue => parseStoredMappings(
  issue.extensionProperties && issue.extensionProperties.jiraArticleAttachments
);

const resolveFiles = (description, prefix) => {
  const files = [];
  const missing = [];
  extractArticleIds(description).forEach(articleId => {
    const article = entities.Article.findById(articleId);
    if (!article) {
      missing.push(articleId);
      return;
    }
    files.push(buildMarkdownFile(article, prefix));
  });
  return { files, missing };
};

const createJiraConnection = settings => {
  const connection = new http.Connection(settings.jiraEndpointUrl + '/rest/api/3', null, 15000);
  connection.addHeader('Authorization', 'Basic ' + settings.jiraApiToken);
  connection.addHeader('Accept', 'application/json');
  connection.addHeader('X-Atlassian-Token', 'no-check');
  return connection;
};

const uploadMarkdown = (connection, jiraKey, file) => {
  const response = connection.postSync(
    '/issue/' + encodeURIComponent(jiraKey) + '/attachments',
    {},
    {
      type: 'multipart/form-data',
      parts: [{
        name: 'file',
        size: file.size,
        fileName: file.fileName,
        content: file.content,
        contentType: file.mimeType
      }]
    }
  );
  if (!response || response.code !== 200) {
    throw new Error('upload de ' + file.fileName + ' falhou. HTTP ' +
      (response ? response.code : 'sem resposta'));
  }
  const payload = JSON.parse(response.response || '[]');
  if (!Array.isArray(payload) || !payload[0] || !payload[0].id) {
    throw new Error('Jira não retornou o attachment ID de ' + file.fileName);
  }
  return String(payload[0].id);
};

const deleteAttachment = (connection, attachmentId) => {
  const response = connection.deleteSync('/attachment/' + encodeURIComponent(attachmentId), {});
  if (!response || (response.code !== 204 && response.code !== 404)) {
    throw new Error('remoção do attachment Jira ' + attachmentId + ' falhou. HTTP ' +
      (response ? response.code : 'sem resposta'));
  }
};

const updateConsumers = (issue, previousIds, desiredIds) => {
  previousIds.forEach(articleId => {
    if (desiredIds.indexOf(articleId) !== -1) return;
    const article = entities.Article.findById(articleId);
    if (article) article.extensionProperties.jiraMarkdownConsumers.delete(issue);
  });
  desiredIds.forEach(articleId => {
    const article = entities.Article.findById(articleId);
    if (article) article.extensionProperties.jiraMarkdownConsumers.add(issue);
  });
};

const syncIssueArticles = (issue, settings) => {
  const eligibility = evaluateArticleSync(issue, settings);
  if (!eligibility.eligible) return { status: 'skipped', reason: eligibility.reason };

  const resolved = resolveFiles(issue.description, settings.articleAttachmentPrefix);
  const stored = readMappings(issue);
  // A referenced private/missing article is not the same as a removed reference.
  // Preserve its last known mapping instead of deleting the Jira attachment.
  resolved.missing.forEach(articleId => {
    if (stored[articleId]) {
      resolved.files.push({
        articleId,
        updated: stored[articleId].updated,
        fileName: stored[articleId].fileName
      });
    }
  });
  const plan = buildReconciliationPlan(resolved.files, stored);
  if (eligibility.isDryRun) {
    return { status: 'dry-run', plan, missing: resolved.missing };
  }

  if (!settings.jiraEndpointUrl || !settings.jiraApiToken) {
    throw new Error('configure jiraEndpointUrl e jiraApiToken antes da sincronização de artigos');
  }

  const connection = createJiraConnection(settings);
  const filesById = {};
  resolved.files.forEach(file => { filesById[file.articleId] = file; });
  const next = Object.assign({}, stored);
  const errors = [];

  plan.uploads.forEach(item => {
    const file = filesById[item.articleId];
    let attachmentId = null;
    try {
      attachmentId = uploadMarkdown(connection, eligibility.jiraKey, file);
      if (item.previousAttachmentId) {
        try {
          deleteAttachment(connection, item.previousAttachmentId);
        } catch (replacementError) {
          // Keep the old known-good mapping and compensate the new upload.
          try { deleteAttachment(connection, attachmentId); } catch (_) { /* logged below */ }
          throw replacementError;
        }
      }
      next[item.articleId] = {
        attachmentId,
        updated: file.updated,
        fileName: file.fileName
      };
    } catch (error) {
      errors.push(item.articleId + ': ' + error.message);
    }
  });
  plan.removals.forEach(item => {
    try {
      deleteAttachment(connection, item.attachmentId);
      delete next[item.articleId];
    } catch (error) {
      errors.push(item.articleId + ': ' + error.message);
    }
  });

  issue.extensionProperties.jiraArticleAttachments = JSON.stringify(next);
  updateConsumers(issue, Object.keys(stored), resolved.files.map(file => file.articleId));
  return { status: errors.length ? 'partial' : 'synced', plan, missing: resolved.missing, errors };
};

module.exports = { syncIssueArticles };

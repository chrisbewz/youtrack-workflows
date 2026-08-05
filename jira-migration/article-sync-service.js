const { evaluateSyncDecision, getFieldValueName } = require('./sync-decisions');

const ARTICLE_ID_PATTERN = /\b[A-Z][A-Z0-9_]*-A-\d+\b/g;

const extractArticleIds = description => {
  const matches = String(description || '').match(ARTICLE_ID_PATTERN) || [];
  return matches.filter((id, index) => matches.indexOf(id) === index);
};

const utf8Size = value => {
  let size = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) size += 1;
    else if (code < 0x800) size += 2;
    else if (code >= 0xD800 && code <= 0xDBFF && index + 1 < value.length &&
      value.charCodeAt(index + 1) >= 0xDC00 && value.charCodeAt(index + 1) <= 0xDFFF) {
      size += 4;
      index += 1;
    } else size += 3;
  }
  return size;
};

const sanitizePrefix = prefix => String(prefix || '')
  .replace(/[\\/\u0000-\u001f\u007f]/g, '')
  .replace(/[:*?"<>|]/g, '-')
  .slice(0, 80);

const buildMarkdownFile = (article, prefix) => {
  const content = '# ' + article.summary + '\n\n' + (article.content || '') + '\n';
  return {
    articleId: article.id,
    updated: article.updated,
    fileName: sanitizePrefix(prefix) + article.id + '.md',
    content,
    size: utf8Size(content),
    mimeType: 'text/markdown; charset=utf-8'
  };
};

const parseStoredMappings = value => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
};

const buildReconciliationPlan = (desired, stored) => {
  const desiredById = {};
  const plan = { uploads: [], removals: [], unchanged: [] };
  desired.forEach(file => {
    desiredById[file.articleId] = file;
    const previous = stored[file.articleId];
    if (previous && previous.updated === file.updated && previous.fileName === file.fileName) {
      plan.unchanged.push(file.articleId);
      return;
    }
    plan.uploads.push({
      articleId: file.articleId,
      updated: file.updated,
      fileName: file.fileName,
      previousAttachmentId: previous && previous.attachmentId ? previous.attachmentId : null
    });
  });
  Object.keys(stored).forEach(articleId => {
    if (!desiredById[articleId] && stored[articleId].attachmentId) {
      plan.removals.push({ articleId, attachmentId: stored[articleId].attachmentId });
    }
  });
  return plan;
};

const evaluateArticleSync = (issue, settings) => {
  const decision = evaluateSyncDecision(issue || { fields: {} }, settings || {});
  const jiraKey = getFieldValueName(issue && issue.fields && issue.fields['Jira ID']);
  if (!issue || issue.isReported !== true) {
    return { eligible: false, isDryRun: decision.isDryRun, reason: 'issue não reportada', jiraKey };
  }
  if (!jiraKey) {
    return { eligible: false, isDryRun: decision.isDryRun, reason: 'issue sem Jira ID', jiraKey };
  }
  if (!decision.shouldSync) {
    return { eligible: false, isDryRun: decision.isDryRun, reason: decision.reason, jiraKey };
  }
  return { eligible: true, isDryRun: decision.isDryRun, reason: null, jiraKey };
};

module.exports = {
  extractArticleIds,
  utf8Size,
  buildMarkdownFile,
  parseStoredMappings,
  buildReconciliationPlan,
  evaluateArticleSync
};

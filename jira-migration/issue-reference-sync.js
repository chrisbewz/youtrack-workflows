const { getFieldValueName } = require('./sync-decisions');

const ISSUE_ID_PATTERN = /(^|[^A-Z0-9_-])([A-Z][A-Z0-9_]*-\d+)\b/gm;
const PROTECTED_MARKDOWN_PATTERN = /(```[\s\S]*?```|`[^`\n]*`)/g;

const mapUnprotectedMarkdown = (source, transform) => String(source || '')
  .split(PROTECTED_MARKDOWN_PATTERN)
  .map((part, index) => index % 2 === 0 ? transform(part) : part)
  .join('');

const idsInText = text => {
  const ids = [];
  String(text || '').replace(ISSUE_ID_PATTERN, (match, prefix, id) => {
    if (ids.indexOf(id) === -1) ids.push(id);
    return match;
  });
  return ids;
};

const extractIssueReferences = description => {
  const ids = [];
  mapUnprotectedMarkdown(description, part => {
    idsInText(part).forEach(id => {
      if (ids.indexOf(id) === -1) ids.push(id);
    });
    return part;
  });
  return ids;
};

const isEnabledTarget = target => target &&
  getFieldValueName(target.fields && target.fields['Jira Sync']) === 'Enabled';

const collectReferenceTargets = (description, currentIssueId, lookup) => {
  const result = { targets: [], resolved: [], skipped: [] };
  extractIssueReferences(description).forEach(id => {
    if (id === currentIssueId) return;
    const target = lookup(id);
    if (!isEnabledTarget(target)) {
      result.skipped.push(id);
      return;
    }
    if (getFieldValueName(target.fields && target.fields['Jira ID'])) {
      result.resolved.push(id);
    } else {
      result.targets.push(target);
    }
  });
  return result;
};

const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const replaceBareId = (text, youTrackId, jiraId) => text.replace(
  new RegExp('(^|[^A-Z0-9_-])(' + escaped(youTrackId) + ')\\b', 'gm'),
  (match, prefix) => prefix + jiraId
);

const referencedIdFromLink = (label, url) => {
  const urlIds = idsInText(url);
  if (urlIds.length > 0) return urlIds[0];
  const labelIds = idsInText(label);
  return labelIds.length === 1 ? labelIds[0] : null;
};

const resolveDescriptionReferences = (description, lookup, jiraEndpoint) => {
  const baseUrl = String(jiraEndpoint || '').replace(/\/+$/, '');
  return mapUnprotectedMarkdown(description, part => {
    let transformed = part.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (full, label, url) => {
      const youTrackId = referencedIdFromLink(label, url);
      const target = youTrackId && lookup(youTrackId);
      if (!isEnabledTarget(target)) return full;
      const jiraId = getFieldValueName(target.fields && target.fields['Jira ID']);
      if (!jiraId) return full;
      const nextLabel = label === youTrackId ? jiraId : label;
      return '[' + nextLabel + '](' + baseUrl + '/browse/' + encodeURIComponent(jiraId) + ')';
    });

    extractIssueReferences(transformed).forEach(youTrackId => {
      const target = lookup(youTrackId);
      if (!isEnabledTarget(target)) return;
      const jiraId = getFieldValueName(target.fields && target.fields['Jira ID']);
      if (jiraId) transformed = replaceBareId(transformed, youTrackId, jiraId);
    });
    return transformed;
  });
};

const syncReferencedTargets = (issue, options) => {
  const context = options.context || { visiting: {} };
  if (!context.visiting) context.visiting = {};
  const references = collectReferenceTargets(issue.description, issue.id, options.lookup);
  const targets = references.targets.slice();
  (options.additionalTargets || []).forEach(target => {
    if (!targets.some(existing => existing.id === target.id)) targets.push(target);
  });
  const result = { planned: targets.map(target => target.id), cycles: [] };
  if (options.isDryRun) return result;

  context.visiting[issue.id] = true;
  try {
    targets.forEach(target => {
      if (context.visiting[target.id]) {
        result.cycles.push(target.id);
        return;
      }
      options.syncTarget(target, context);
    });
  } finally {
    delete context.visiting[issue.id];
  }
  return result;
};

module.exports = {
  extractIssueReferences,
  collectReferenceTargets,
  resolveDescriptionReferences,
  syncReferencedTargets
};

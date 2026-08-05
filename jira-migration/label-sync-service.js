const { getFieldValueName } = require('./sync-decisions');

const isLabelSyncEligible = issue => !!issue &&
  issue.isReported === true &&
  getFieldValueName(issue.fields && issue.fields['Jira Sync']) === 'Enabled' &&
  !!getFieldValueName(issue.fields && issue.fields['Jira ID']);

const normalizeJiraLabels = labels => {
  const normalized = [];
  (Array.isArray(labels) ? labels : []).forEach(label => {
    if (typeof label !== 'string') return;
    const name = label.trim();
    if (name && normalized.indexOf(name) === -1) normalized.push(name);
  });
  return normalized;
};

const syncJiraLabels = (labels, dependencies) => {
  const result = { labels: 0, unchanged: 0, reused: 0, created: 0, attached: 0 };

  normalizeJiraLabels(labels).forEach(name => {
    result.labels += 1;
    if (dependencies.hasTag(name)) {
      result.unchanged += 1;
      return;
    }

    let tag = dependencies.findTagByName(name);

    if (tag) {
      result.reused += 1;
    } else {
      tag = dependencies.createTag(name);
      result.created += 1;
    }

    if (!tag || !tag.id) {
      throw new Error('A integração não retornou uma tag válida para "' + name + '".');
    }

    dependencies.attachTag(tag);
    result.attached += 1;
  });

  return result;
};

module.exports = { isLabelSyncEligible, normalizeJiraLabels, syncJiraLabels };

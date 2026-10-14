const { filterReservedLabels } = require('./label-sync-service');

const getJiraLabels = (issue, settings) => {
  const tagNames = [];
  issue.tags.forEach(tag => tagNames.push(tag.name));
  return filterReservedLabels(tagNames, settings.reservedLabelNames).map(tagName => {
    // Jira labels cannot contain spaces.
    return tagName.replace(/\s+/g, '-');
  });
};

module.exports = { getJiraLabels };

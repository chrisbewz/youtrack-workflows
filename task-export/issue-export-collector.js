const getIssueIdentity = issue => {
  if (issue && (issue.idReadable || issue.id)) {
    return issue.idReadable || issue.id;
  }
  return issue;
};

const getIssueLabel = issue => {
  if (issue && (issue.idReadable || issue.id)) {
    return issue.idReadable || issue.id;
  }
  return 'unknown issue';
};

const getSubtasks = issue => {
  const links = issue && issue.links && issue.links['parent for'];
  if (!links || typeof links.forEach !== 'function') return [];

  const children = [];
  links.forEach(child => children.push(child));
  return children;
};

const collectIssues = (rootIssue, options = {}) => {
  if (!rootIssue) throw new TypeError('root issue is required');

  const includeSubtasks = options.includeSubtasks === true ||
    options.includeSubtasks === 'true';
  const getChildren = options.getChildren || getSubtasks;
  const issues = [];
  const warnings = [];
  const seen = new Set();

  const visit = issue => {
    const identity = getIssueIdentity(issue);
    if (seen.has(identity)) {
      warnings.push('Skipped repeated issue ' + getIssueLabel(issue) + '.');
      return;
    }

    seen.add(identity);
    issues.push(issue);
    if (!includeSubtasks) return;

    const children = getChildren(issue) || [];
    children.forEach(visit);
  };

  visit(rootIssue);
  return { issues, warnings };
};

module.exports = {
  collectIssues,
  getSubtasks
};

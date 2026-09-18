const slugify = value => {
  const normalized = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'task';
};

const buildMarkdownFilename = issue => {
  const issueId = issue && (issue.idReadable || issue.id);
  if (!issueId) throw new TypeError('issue id is required');

  return String(issueId).replace(/[^a-zA-Z0-9._-]/g, '-') +
    '-' + slugify(issue.summary) + '.md';
};

const buildMarkdownDownloadHeaders = issue => ({
  'Content-Type': 'text/markdown; charset=utf-8',
  'Content-Disposition': 'attachment; filename="' + buildMarkdownFilename(issue) + '"'
});

module.exports = {
  buildMarkdownFilename,
  buildMarkdownDownloadHeaders,
  slugify
};

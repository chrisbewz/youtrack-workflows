const composeMarkdownDocuments = documents => {
  if (!documents || documents.length === 0) return '';
  return documents.join('\n---\n\n');
};

module.exports = {
  composeMarkdownDocuments
};

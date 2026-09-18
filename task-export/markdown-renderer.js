const TITLE_SPECIAL_CHARACTERS = new Set([
  '\\',
  String.fromCharCode(96),
  '*',
  '_',
  '{',
  '}',
  '[',
  ']',
  '(',
  ')',
  '#',
  '>',
  '|'
]);

const escapeMarkdownTitle = summary => Array.from(summary, character =>
  TITLE_SPECIAL_CHARACTERS.has(character) ? '\\' + character : character
).join('');

const renderTaskMarkdown = issue => {
  if (!issue || typeof issue.summary !== 'string' || issue.summary.trim() === '') {
    throw new TypeError('summary must be a non-empty string');
  }

  const description = issue.description == null ? '' : String(issue.description);
  return '# ' + escapeMarkdownTitle(issue.summary) + '\n\n' +
    '## Descrição\n\n' +
    description +
    (description === '' || description.endsWith('\n') ? '' : '\n');
};

module.exports = {
  escapeMarkdownTitle,
  renderTaskMarkdown
};

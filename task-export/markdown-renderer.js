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

const valueToText = value => {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value.presentation) return String(value.presentation);
  if (value.name) return String(value.name);
  return String(value);
};

const collectValues = value => {
  if (!value || typeof value.forEach !== 'function') {
    return [valueToText(value)].filter(Boolean);
  }

  const values = [];
  value.forEach(item => {
    const text = valueToText(item);
    if (text) values.push(text);
  });
  return values;
};

const escapeTableCell = value => String(value)
  .replace(/\|/g, '\\|')
  .replace(/\r?\n/g, ' ');

const renderFieldsSection = fields => {
  if (!fields || typeof fields !== 'object') return '';

  const rows = Object.keys(fields)
    .sort()
    .flatMap(name => {
      const values = collectValues(fields[name]);
      return values.length > 0
        ? ['| ' + escapeTableCell(name) + ' | ' + escapeTableCell(values.join(', ')) + ' |']
        : [];
    });

  if (rows.length === 0) return '';
  return '## Campos\n\n| Campo | Valor |\n| --- | --- |\n' + rows.join('\n');
};

const renderTagsSection = tags => {
  const values = collectValues(tags).map(escapeTableCell);
  if (values.length === 0) return '';
  return '## Tags\n\n' + values.map(value => String.fromCharCode(96) + value + String.fromCharCode(96)).join(', ');
};

const renderTaskMarkdown = (issue, options = {}) => {
  if (!issue || typeof issue.summary !== 'string' || issue.summary.trim() === '') {
    throw new TypeError('summary must be a non-empty string');
  }

  const description = issue.description == null ? '' : String(issue.description);
  let markdown = '# ' + escapeMarkdownTitle(issue.summary) + '\n\n' +
    '## Descrição\n\n' +
    description +
    (description === '' || description.endsWith('\n') ? '' : '\n');

  const sections = [];
  if (options.includeFields === true || options.includeFields === 'true') {
    sections.push(renderFieldsSection(issue.fields));
  }
  if (options.includeTags === true || options.includeTags === 'true') {
    sections.push(renderTagsSection(issue.tags));
  }

  sections.filter(Boolean).forEach(section => {
    markdown += (markdown.endsWith('\n\n') ? '' : '\n') + section + '\n';
  });
  return markdown;
};

module.exports = {
  escapeMarkdownTitle,
  renderFieldsSection,
  renderTagsSection,
  renderTaskMarkdown
};

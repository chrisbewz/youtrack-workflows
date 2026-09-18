const issueIdentity = issue => issue && (issue.idReadable || issue.id);

const mermaidId = issue => String(issueIdentity(issue))
  .replace(/[^a-zA-Z0-9_]/g, '_');

const mermaidLabel = issue => String(issueIdentity(issue) + ' — ' + (issue.summary || ''))
  .replace(/"/g, '\\\\"')
  .replace(/\r?\n/g, ' ');

const normalizedRelationName = name => String(name || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const normalizeRelation = (name, source, target) => {
  const normalizedName = normalizedRelationName(name);
  if (normalizedName === 'parent for' || normalizedName === 'progenitor para') {
    return { label: 'subtask', source, target };
  }
  if (normalizedName === 'subtask of' || normalizedName === 'subtarefa de' || normalizedName === 'subtask') {
    return { label: 'subtask', source: target, target: source };
  }
  return { label: name, source, target };
};

const renderRelationDiagram = issues => {
  if (!issues || issues.length < 2) return '';

  const exported = new Set(issues.map(issueIdentity));
  const edges = [];
  const seenEdges = new Set();

  issues.forEach(source => {
    const links = source.links || {};
    Object.keys(links).sort().forEach(name => {
      const targets = links[name];
      if (!targets || typeof targets.forEach !== 'function') return;
      targets.forEach(target => {
        if (!exported.has(issueIdentity(target))) return;
        const relation = normalizeRelation(name, source, target);
        const key = [
          issueIdentity(relation.source),
          relation.label,
          issueIdentity(relation.target)
        ].join('|');
        if (seenEdges.has(key)) return;
        seenEdges.add(key);
        edges.push(relation);
      });
    });
  });

  if (edges.length === 0) return '';

  const lines = [
    '## Relações entre tasks',
    '',
    String.fromCharCode(96).repeat(3) + 'mermaid',
    'flowchart TD'
  ];
  issues.forEach(issue => {
    lines.push('  ' + mermaidId(issue) + '["' + mermaidLabel(issue) + '"]');
  });
  edges.forEach(edge => {
    lines.push(
      '  ' + mermaidId(edge.source) + ' -->|' + edge.label + '| ' + mermaidId(edge.target)
    );
  });
  lines.push(String.fromCharCode(96).repeat(3));
  return lines.join('\n') + '\n';
};

module.exports = {
  renderRelationDiagram
};

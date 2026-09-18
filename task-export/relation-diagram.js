const issueIdentity = issue => issue && (issue.idReadable || issue.id);

const mermaidId = issue => String(issueIdentity(issue))
  .replace(/[^a-zA-Z0-9_]/g, '_');

const mermaidLabel = issue => String(issueIdentity(issue) + ' — ' + (issue.summary || ''))
  .replace(/"/g, '\\\\"')
  .replace(/\r?\n/g, ' ');

const relationLabel = name => {
  if (name === 'parent for' || name === 'subtask of') return 'subtask';
  return name;
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
        const targetIdentity = issueIdentity(target);
        if (!exported.has(targetIdentity)) return;
        const key = [
          issueIdentity(source),
          relationLabel(name),
          targetIdentity
        ].join('|');
        if (seenEdges.has(key)) return;
        seenEdges.add(key);
        edges.push({
          label: relationLabel(name),
          source,
          target
        });
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

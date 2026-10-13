const test = require('node:test');
const assert = require('node:assert/strict');

const { renderRelationDiagram } = require('../task-export/relation-diagram');

test('omits the relation section when there are not enough issues', () => {
  assert.equal(renderRelationDiagram([{ idReadable: 'YOU-1', summary: 'Root' }]), '');
});

test('renders only relations between exported issues', () => {
  const child = {
    idReadable: 'YOU-2',
    summary: 'Child task',
    links: {}
  };
  const external = {
    idReadable: 'YOU-99',
    summary: 'External',
    links: {}
  };
  const root = {
    idReadable: 'YOU-1',
    summary: 'Root',
    links: {
      'parent for': {
        forEach: callback => [child, external].forEach(callback)
      }
    }
  };

  assert.equal(
    renderRelationDiagram([root, child]),
    '## Relações entre tasks\n\n' +
    String.fromCharCode(96).repeat(3) + 'mermaid\n' +
    'flowchart TD\n' +
    '  YOU_1["YOU-1 — Root"]\n' +
    '  YOU_2["YOU-2 — Child task"]\n' +
    '  YOU_1 -->|subtask| YOU_2\n' +
    String.fromCharCode(96).repeat(3) + '\n'
  );
});

test('collapses localized parent and subtask link aliases into one parent-to-child edge', () => {
  const parent = { idReadable: 'E3-374', summary: 'Parent', links: {} };
  const child = { idReadable: 'E3-363', summary: 'Child', links: {} };
  parent.links = {
    'parent for': { forEach: callback => callback(child) },
    'progenitor para': { forEach: callback => callback(child) }
  };
  child.links = {
    'subtask of': { forEach: callback => callback(parent) },
    'subtarefa de': { forEach: callback => callback(parent) },
    subtask: { forEach: callback => callback(parent) }
  };

  const diagram = renderRelationDiagram([parent, child]);

  assert.equal((diagram.match(/-->\|subtask\|/g) || []).length, 1);
  assert.match(diagram, /E3_374 -->\|subtask\| E3_363/);
});

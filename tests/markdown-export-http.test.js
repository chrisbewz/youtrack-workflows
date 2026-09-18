const test = require('node:test');
const assert = require('node:assert/strict');

const { httpHandler } = require('../task-export/markdown-export-http');

test('JSON export endpoint returns documents and export options for the widget', () => {
  const response = { json: value => { response.value = value; } };
  const issue = {
    id: '3-374',
    idReadable: 'E3-374',
    summary: 'Root task',
    description: 'Root description',
    fields: [],
    tags: [],
    links: {
      'parent for': {
        forEach: callback => callback({
          id: '3-375',
          idReadable: 'E3-375',
          summary: 'Child task',
          description: 'Child description',
          fields: [],
          tags: [],
          links: {}
        })
      }
    }
  };
  const endpoint = httpHandler.endpoints.find(item => item.path === 'data');

  endpoint.handle({
    issue,
    settings: {
      includeSubtasks: true,
      includeFields: false,
      includeTags: false,
      includeTaskRelationDiagram: false,
      separateFilesForMultipleTasks: true
    },
    response
  });

  assert.equal(response.value.documents.length, 2);
  assert.equal(response.value.documents[0].fileName, 'E3-374-root-task.md');
  assert.equal(response.value.documents[1].markdown, '# Child task\n\n## Descrição\n\nChild description\n');
  assert.equal(response.value.separateFilesForMultipleTasks, true);
});

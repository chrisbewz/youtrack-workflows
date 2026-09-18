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
  assert.equal(response.value.documents[0].originalTitle, 'Root task');
  assert.equal(response.value.documents[1].originalTitle, 'Child task');
  assert.deepEqual(response.value.documents[0].task, {
    idReadable: 'E3-374', summary: 'Root task', description: 'Root description'
  });
  assert.deepEqual(response.value.documents[1].task, {
    idReadable: 'E3-375', summary: 'Child task', description: 'Child description'
  });
  assert.equal(response.value.documents[1].markdown, '# Child task\n\n## Descrição\n\nChild description\n');
  assert.equal(response.value.separateFilesForMultipleTasks, true);
  assert.equal(response.value.trailingMarkdown, '');
});

test('JSON export endpoint applies request-only export option overrides', () => {
  const response = { json: value => { response.value = value; } };
  const endpoint = httpHandler.endpoints.find(item => item.path === 'data');

  endpoint.handle({
    issue: {
      id: '3-374', idReadable: 'E3-374', summary: 'Root task', description: 'Root description',
      fields: { Priority: { name: 'Critical' } }, tags: [], links: {}
    },
    settings: {
      includeSubtasks: false,
      includeFields: true,
      includeTags: false,
      includeTaskRelationDiagram: false,
      separateFilesForMultipleTasks: false
    },
    request: { getParameter: name => name === 'includeFields' ? 'false' : null },
    response
  });

  assert.equal(response.value.projectOptions.includeFields, true);
  assert.equal(response.value.options.includeFields, false);
  assert.doesNotMatch(response.value.markdown, /## Campos/);
});

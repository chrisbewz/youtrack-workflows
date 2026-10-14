const test = require('node:test');
const assert = require('node:assert/strict');

const {
  fetchJiraAttachments,
  uploadAttachments
} = require('../jira-migration/attachment-sync-runtime');

test('YOU-5 reads the Jira attachment inventory needed for manual-sync deduplication', () => {
  const calls = [];
  const connection = {
    getSync(path, query) {
      calls.push({ path, query });
      return { code: 200, response: JSON.stringify({ fields: { attachment: [{ filename: 'demo.gif', size: 100 }] } }) };
    }
  };

  assert.deepEqual(fetchJiraAttachments(connection, 'ABC-12'), [{ filename: 'demo.gif', size: 100 }]);
  assert.deepEqual(calls, [{
    path: '/issue/ABC-12',
    query: { fields: 'attachment(filename,size)' }
  }]);
});

test('YOU-5 uploads eligible attachments with Jira multipart requirements', () => {
  const headers = [];
  const calls = [];
  const connection = {
    addHeader(name, value) { headers.push([name, value]); },
    postSync(path, query, payload) {
      calls.push({ path, query, payload });
      return { code: 200 };
    }
  };
  const parts = [{ name: 'file', size: 100, fileName: 'demo.gif', content: 'stream' }];

  uploadAttachments(connection, 'ABC-12', parts);

  assert.deepEqual(headers, [
    ['Accept', 'application/json'],
    ['X-Atlassian-Token', 'no-check']
  ]);
  assert.deepEqual(calls, [{
    path: '/issue/ABC-12/attachments',
    query: {},
    payload: { type: 'multipart/form-data', parts }
  }]);
});

test('YOU-5 reports a failed Jira attachment upload', () => {
  const connection = {
    addHeader() {},
    postSync: () => ({ code: 403, response: 'Forbidden' })
  };

  assert.throws(() => uploadAttachments(connection, 'ABC-12', []), /HTTP 403: Forbidden/);
});

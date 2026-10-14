const fetchJiraAttachments = (connection, jiraKey) => {
  const response = connection.getSync(
    '/issue/' + encodeURIComponent(jiraKey),
    { fields: 'attachment(filename,size)' }
  );
  if (!response || response.code !== 200) {
    throw new Error('Leitura de anexos do Jira falhou. HTTP ' +
      (response ? response.code : 'sem resposta') +
      (response && response.response ? ': ' + response.response : ''));
  }
  const jiraIssue = response.response ? JSON.parse(response.response) : {};
  return jiraIssue.fields && Array.isArray(jiraIssue.fields.attachment)
    ? jiraIssue.fields.attachment
    : [];
};

const uploadAttachments = (connection, jiraKey, parts) => {
  connection.addHeader('Accept', 'application/json');
  connection.addHeader('X-Atlassian-Token', 'no-check');

  const response = connection.postSync(
    '/issue/' + encodeURIComponent(jiraKey) + '/attachments',
    {},
    { type: 'multipart/form-data', parts }
  );
  if (!response || response.code !== 200) {
    throw new Error('Upload para o Jira falhou. HTTP ' + (response ? response.code : 'sem resposta') +
      (response && response.response ? ': ' + response.response : ''));
  }
};

module.exports = { fetchJiraAttachments, uploadAttachments };

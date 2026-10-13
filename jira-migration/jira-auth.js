const SCOPED_TOKEN_AUTH_MODE = 'Scoped token';
const ATLASSIAN_API_GATEWAY = 'https://api.atlassian.com/ex/jira/';

const isScopedTokenAuth = settings => settings.jiraAuthMode === SCOPED_TOKEN_AUTH_MODE;

const withoutTrailingSlash = value => String(value || '').replace(/\/+$/, '');

const getJiraApiBaseUrl = (settings, apiVersion) => {
  const version = apiVersion || '3';
  if (isScopedTokenAuth(settings)) {
    const cloudId = String(settings.jiraCloudId || '').trim();
    if (!cloudId) return null;
    return ATLASSIAN_API_GATEWAY + encodeURIComponent(cloudId) + '/rest/api/' + version;
  }

  const endpoint = withoutTrailingSlash(settings.jiraEndpointUrl);
  return endpoint ? endpoint + '/rest/api/' + version : null;
};

const getJiraAuthorization = settings => {
  const credential = String(settings.jiraApiToken || '').trim();
  if (!credential) return null;
  return (isScopedTokenAuth(settings) ? 'Bearer ' : 'Basic ') + credential;
};

const getJiraConfigurationError = settings => {
  if (!String(settings.jiraApiToken || '').trim()) {
    return 'Configure jiraApiToken before synchronizing with Jira.';
  }
  if (isScopedTokenAuth(settings) && !String(settings.jiraCloudId || '').trim()) {
    return 'Configure jiraCloudId when Jira Authentication Mode is Scoped token.';
  }
  if (!isScopedTokenAuth(settings) && !withoutTrailingSlash(settings.jiraEndpointUrl)) {
    return 'Configure jiraEndpointUrl before synchronizing with Jira.';
  }
  return null;
};

const createJiraConnection = (http, settings, timeout, apiVersion) => {
  const error = getJiraConfigurationError(settings);
  if (error) throw new Error(error);

  const connection = new http.Connection(getJiraApiBaseUrl(settings, apiVersion), null, timeout);
  connection.addHeader('Authorization', getJiraAuthorization(settings));
  return connection;
};

module.exports = {
  SCOPED_TOKEN_AUTH_MODE,
  createJiraConnection,
  getJiraApiBaseUrl,
  getJiraAuthorization,
  getJiraConfigurationError,
  isScopedTokenAuth
};

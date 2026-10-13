# ADR-002: Support scoped service-account authentication alongside Basic authentication

## Status

Accepted

## Date

2026-09-18

## Context

The Jira Synchronization Manager previously authenticated every Jira Cloud
request with Basic authentication against the site URL. That configuration uses
a Base64 `email:api-token` value and is already deployed in existing YouTrack
instances.

The container integration environment needs a dedicated Atlassian service
account. Service-account API tokens are scoped and must use the Atlassian API
Gateway with a Cloud ID. Replacing the current method outright would break
existing workflow settings and require credentials to be reconfigured.

## Decision

Keep **Basic** as the default `jiraAuthMode` and add opt-in **Scoped token**
mode.

- Basic mode preserves `jiraEndpointUrl` and Base64 `jiraApiToken` behavior.
- Scoped token mode uses `jiraCloudId`, a raw `jiraApiToken`, `Bearer`
  authentication, and `https://api.atlassian.com/ex/jira/<cloudId>/rest/api`.
- The shared authentication helper is used by every Jira-facing workflow path:
  issue sync, status checks, links, labels, attachments, and article
  attachments.
- The integration runner selects `scoped-token` through its environment
  profile, while retaining `basic` as an explicit compatibility option.

## Consequences

- Existing production integrations remain unchanged unless an administrator
  explicitly selects Scoped token mode.
- Service-account credentials can use least-privilege Jira scopes such as
  `read:jira-work` and `write:jira-work`.
- Scoped configurations must retain the Cloud ID and must use the API Gateway;
  a site URL alone is insufficient for API calls.
- The same token setting has mode-dependent representation and must be treated
  as secret in either form.

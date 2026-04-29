/**
 * debug-local.js — Local test harness for performSync.
 *
 * Replaces the YouTrack-only http.Connection (which calls Java internals) with a
 * curl-based synchronous HTTP implementation so performSync can be run against the
 * real Jira API from a plain Node.js process.
 *
 * Usage:
 *   node jira-migration/debug-local.js
 *
 * Credentials are read from the .env file at the project root (JIRA_ENDPOINT,
 * JIRA_PROJECT_SLUG, JIRA_TOKEN_ENCODED).
 *
 * Edit the `issue` and `ctx` objects below to match the scenario you want to test.
 * Set `syncMode: 'Dry-Run'` to inspect the payload without actually creating/updating
 * anything in Jira.
 */

'use strict';

// Load .env from the project root (one level up from jira-migration/).
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const Module          = require('module');
const { spawnSync }   = require('child_process');

// ---------------------------------------------------------------------------
// Synchronous HTTP via curl (no extra npm dependencies required).
// curl is bundled with Windows 10 1803+ and available on macOS/Linux.
// ---------------------------------------------------------------------------
function curlSync(method, baseUrl, uri, headers, body) {
  const url  = baseUrl + (uri || '');
  const args = ['-s', '-w', '\n__HTTP_STATUS__%{http_code}', '-X', method.toUpperCase()];

  headers.forEach(h => {
    args.push('-H', h.name + ': ' + h.value);
  });

  if (body) {
    args.push('--data-raw', body);
  }

  args.push(url);

  const result = spawnSync('curl', args, { encoding: 'utf8', timeout: 30000 });

  if (result.error) {
    console.error('[debug-local] curl error:', result.error.message);
    return { code: 0, response: result.error.message };
  }

  const stdout       = result.stdout || '';
  const splitMarker  = '\n__HTTP_STATUS__';
  const markerIndex  = stdout.lastIndexOf(splitMarker);
  const responseBody = markerIndex >= 0 ? stdout.substring(0, markerIndex) : stdout;
  const statusStr    = markerIndex >= 0 ? stdout.substring(markerIndex + splitMarker.length).trim() : '0';

  return { code: parseInt(statusStr, 10) || 0, response: responseBody };
}

// ---------------------------------------------------------------------------
// Mock: @jetbrains/youtrack-scripting-api/http
// Mirrors the Connection API used in sync-core.js.
// ---------------------------------------------------------------------------
function MockConnection(baseUrl) {
  this.baseUrl = baseUrl;
  this.headers = [];
}

MockConnection.prototype.addHeader = function (name, value) {
  if (typeof name === 'object') {
    this.headers.push(name);
  } else {
    this.headers.push({ name: name, value: value });
  }
  return this;
};

MockConnection.prototype.getSync = function (uri, queryParams) {
  // Append simple query params if provided as an object.
  let fullUri = uri || '';
  if (queryParams && typeof queryParams === 'object' && !Array.isArray(queryParams)) {
    const qs = Object.entries(queryParams).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
    if (qs) fullUri += (fullUri.includes('?') ? '&' : '?') + qs;
  }
  return curlSync('GET', this.baseUrl, fullUri, this.headers, null);
};

MockConnection.prototype.postSync = function (uri, queryParams, payload) {
  return curlSync('POST', this.baseUrl, uri, this.headers, payload);
};

MockConnection.prototype.putSync = function (uri, queryParams, payload) {
  return curlSync('PUT', this.baseUrl, uri, this.headers, payload);
};

const mockHttp = { Connection: MockConnection };

// ---------------------------------------------------------------------------
// Mock: @jetbrains/youtrack-scripting-api/workflow
// ---------------------------------------------------------------------------
const mockWorkflow = {
  message: (msg) => console.log('[workflow.message]', msg),
  check:   (cond, msg) => { if (!cond) throw new Error('[workflow.check failed] ' + msg); }
};

// ---------------------------------------------------------------------------
// Intercept require() calls before loading sync-core.
// ---------------------------------------------------------------------------
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '@jetbrains/youtrack-scripting-api/http')     return mockHttp;
  if (request === '@jetbrains/youtrack-scripting-api/workflow') return mockWorkflow;
  return originalLoad.apply(this, arguments);
};

const { performSync } = require('../jira-migration/sync-core');

// ---------------------------------------------------------------------------
// Fake issue — edit this to match the scenario you want to test.
//
// Key fields performSync reads:
//   issue.id, .summary, .description, .comments, .project, .tags
//   issue.fields['Jira Sync']   — { presentation: 'Enabled' | 'Dry-Run' | 'Disabled' }
//   issue.fields['Jira ID']     — existing Jira key (string) or null → determines CREATE vs UPDATE
//   issue.fields['Jira State']  — { name: 'Closed' | ... } or null
//   issue.fields.State          — { name: 'Open' | 'In Progress' | 'Fixed' | ... }
//   issue.fields.Priority       — { name: 'Normal' | 'Critical' | ... }
//   issue.fields.Type           — { name: 'Task' | 'Feature' | 'Epic' | 'Subtask' | 'Bug' | ... }
//   issue.fields.Subsystem      — { name: '...' } or null  (resolves to a Jira component)
//   issue.fields.Estimation     — { minutes: 60 } or null
// ---------------------------------------------------------------------------
const issue = {
  id:          'someId',
  summary:     'Test issue for local debug',
  description: 'Testing sync pipeline from local Node.js environment.',
  comments:    [],
  tags:        [],
  project:     { name: 'WTD-E3', shortName: 'E3' },
  fields: {
    'Jira Sync':  { presentation: 'Enabled' },  // 'Dry-Run' to skip real API writes
    'Jira ID':    'PROJJ-122',                          // null → CREATE; set to 'PROJ-123' to test UPDATE
    'Jira State': null,
    State:        { name: 'Open' },
    Priority:     { name: 'Trivial' },
    Type:         { name: 'Task' },
    Subsystem:    { name: 'wtd-e3-installer'},
    Estimation:   null
  }
};

// ---------------------------------------------------------------------------
// Fake ctx — settings mirror the YouTrack workflow settings schema.
// Credentials come from .env; everything else can be overridden here.
// ---------------------------------------------------------------------------
const ctx = {
  settings: {
    jiraEndpointUrl:       process.env.JIRA_ENDPOINT,
    jiraProjectSlug:       process.env.JIRA_PROJECT_SLUG,
    jiraApiToken:          process.env.JIRA_TOKEN_ENCODED,
    syncMode:              'Enabled',  // Change to 'Enabled' to make real writes
    youtrackBaseUrl:       'https://youtrack.example.com',
    overrideCompleted:     false,
    subTaskItemType:       'Subtask',
    epicItemType:          'Epic',
    storyItemType:         'Feature',
    taskItemType:          'Task',
    priorityHighestName:   'Show-stopper',
    priorityHighestNameJira:   'Critical',
    priorityHighName:      'Critical',
    priorityHighNameJira:      'Major',
    priorityMediumName:    'Normal',
    priorityMediumNameJira:    'Minor',
    priorityLowName:       'Minor',
    priorityLowNameJira:       'Trivial',
    statusDoneStates:      "Fixed,Verified,Closed,Can't Reproduce,Duplicate,Won't fix,Incomplete",
    statusInProgressStates: 'In Progress'
  }
};

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
console.log('=== debug-local: performSync ===');
console.log('Jira endpoint :', ctx.settings.jiraEndpointUrl);
console.log('Jira project  :', ctx.settings.jiraProjectSlug);
console.log('Sync mode     :', ctx.settings.syncMode);
console.log('Issue         :', issue.id, '—', issue.summary);
console.log('Jira ID       :', issue.fields['Jira ID'] || '(none → CREATE)');
console.log('');

const logs   = [];
const result = performSync(issue, ctx, 'local debug run', /* stateChanged */ true, logs);

console.log('\n=== Sync Result ===');
console.log(JSON.stringify(result, null, 2));

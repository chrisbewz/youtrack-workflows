/**
 * sync-core.js — Shared Jira sync logic for the jira-migration package.
 *
 * Consumed via require('./sync-core') by:
 *   - jira-migration.js          (onChange rule)
 *   - jira-migration-action.js   (action rule)
 *   - jira-migration-schedule.js (onSchedule rule)
 *
 * NOTE: This relies on local CommonJS require resolution within the package.
 * The youtrack-workflow CLI packages all files in the directory into a zip,
 * so relative requires should resolve correctly at runtime.
 * If the YouTrack runtime does not support local requires, each rule file
 * would need to inline these helpers directly.
 */

const http = require('@jetbrains/youtrack-scripting-api/http');
const workflow = require('@jetbrains/youtrack-scripting-api/workflow');

// --- NOTIFICATION MESSAGE BUILDER ---

/**
 * Builds a structured, human-readable notification message for a single-issue sync result.
 *
 * Uses mrkdwn syntax (Slack-compatible). Readable as plain text on channels like ntfy
 * that do not process markdown. Sections with no content are omitted automatically.
 * The dry-run indicator is intentionally excluded from the output.
 *
 * @param {Object}   syncResult
 * @param {string}   syncResult.issueId      - YouTrack issue ID (e.g. YOU-45)
 * @param {string}   syncResult.issueSummary - Issue summary text
 * @param {string}   syncResult.jiraKey      - Jira issue key, or null if unavailable
 * @param {string}   syncResult.jiraBaseUrl  - Jira instance base URL (no trailing slash)
 * @param {string}   syncResult.projectKey   - Jira project key (e.g. BACK)
 * @param {string}   syncResult.operation    - 'created' | 'updated' | 'skipped' | 'error'
 * @param {string[]} syncResult.changes      - Human-readable change descriptions (for updates)
 * @param {string}   syncResult.errorMsg     - Error description (for errors and skips)
 * @param {Date}     syncResult.timestamp    - Sync timestamp
 * @returns {string} Formatted notification message string
 */
const buildSyncMessage = (syncResult) => {
  const { projectKey, jiraBaseUrl, issueId, issueSummary, jiraKey, operation, changes, errorMsg, timestamp } = syncResult;

  const pad = n => String(n).padStart(2, '0');
  const d = timestamp instanceof Date ? timestamp : new Date();
  const dateStr = pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() +
    '  ' + pad(d.getHours()) + ':' + pad(d.getMinutes());

  const lines = ['🔄 *Sync Jira* — ' + (projectKey || issueId) + '  |  ' + dateStr, ''];

  const jiraUrl = jiraKey && jiraBaseUrl ? jiraBaseUrl + '/browse/' + jiraKey : null;
  const jiraRef = jiraUrl ? '<' + jiraUrl + '|' + jiraKey + '>' : (jiraKey || issueId);

  if (operation === 'created') {
    lines.push('✅ *Criada*');
    lines.push('  • ' + jiraRef + ' — ' + issueSummary);
  } else if (operation === 'updated') {
    lines.push('🔁 *Atualizada*');
    const changeStr = changes && changes.length > 0 ? changes.join(' | ') : 'campos atualizados';
    lines.push('  • ' + jiraRef + ' — ' + changeStr);
  } else if (operation === 'error') {
    lines.push('⚠️ *Erro*');
    lines.push('  • ' + (jiraKey || issueId) + ' — ' + (errorMsg || 'erro desconhecido'));
  } else if (operation === 'skipped') {
    lines.push('⏭️ *Ignorada*');
    lines.push('  • ' + issueId + ' — ' + (errorMsg || 'sync ignorado'));
  }

  return lines.join('\n');
};

// --- MAPPING HELPERS ---

const getJiraStatus = (issue) => {
  const statusMapping = {
    'Submitted': 'To Do',
    'Open': 'To Do',
    'To be discussed': 'To Do',
    'Reopened': 'To Do',
    'In Progress': 'In Progress',
    'Fixed': 'Done',
    'Verified': 'Done',
    'Closed': 'Done',
    'Can\'t Reproduce': 'Done',
    'Duplicate': 'Done',
    'Won\'t fix': 'Done',
    'Incomplete': 'Done'
  };
  return statusMapping[issue.fields.State.name] || 'To Do';
};

const getJiraIssueType = (issue) => {
  const typeMapping = {
    'Bug': 'Bug',
    'Feature': 'Story',
    'Task': 'Task',
    'Epic': 'Epic',
    'Subtask': 'Sub-task',
    'Improvement': 'Story'
  };
  return typeMapping[issue.fields.Type.name] || 'Task';
};

const getJiraPriority = (issue) => {
  const priorityMapping = {
    'Show-stopper': 'Highest',
    'Critical': 'High',
    'Major': 'Medium',
    'Normal': 'Medium',
    'Minor': 'Low'
  };
  return priorityMapping[issue.fields.Priority.name] || 'Medium';
};

const getJiraLabels = (issue) => {
  const jiraLabels = [];
  issue.tags.forEach(tag => {
    // Jira labels cannot contain spaces
    jiraLabels.push(tag.name.replace(/\s+/g, '-'));
  });
  return jiraLabels;
};

const getJiraComponents = (issue, connection, projectKey, log) => {
  let jiraComponents = [];
  if (issue.fields.Subsystem) {
    const subsystemName = issue.fields.Subsystem.name;
    const componentsResponse = connection.getSync('/project/' + projectKey + '/components');
    if (componentsResponse && componentsResponse.code === 200) {
      const availableComponents = JSON.parse(componentsResponse.response);
      const matchedComponent = availableComponents.find(c => c.name.toLowerCase() === subsystemName.toLowerCase());
      if (matchedComponent) {
        jiraComponents.push({ name: matchedComponent.name });
      } else {
        log('[Jira Sync] Component match not found in Jira for subsystem: ' + subsystemName + '. Skipping component setup.');
      }
    } else {
      log('[Jira Sync] Failed to fetch components from Jira. Skipping component setup.');
    }
  }
  return jiraComponents;
};

const getJiraEstimation = (issue) => {
  // YouTrack's Estimation field (periodType) returns a Period object — .minutes extracts the numeric value.
  if (issue.fields.Estimation && issue.fields.Estimation.minutes > 0) {
    return issue.fields.Estimation.minutes + 'm';
  }
  return null;
};

const buildJiraPayload = (issue, components, mappings, projectKey) => {
  const payload = {
    fields: {
      project: { key: projectKey },
      summary: issue.summary,
      priority: { name: mappings.priority },
      labels: mappings.labels,
      description: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: issue.description || 'No description provided'
              }
            ]
          }
        ]
      },
      issuetype: { name: mappings.issueType }
    }
  };

  if (components && components.length > 0) {
    payload.fields.components = components;
  }

  if (mappings.estimation) {
    payload.fields.timetracking = {
      originalEstimate: mappings.estimation,
      remainingEstimate: mappings.estimation
    };
  }

  return payload;
};

// --- CORE SYNC FUNCTION ---

/**
 * Performs the full sync pipeline for a single issue.
 *
 * @param {Object}   issue          - The YouTrack issue to sync.
 * @param {Object}   ctx            - The workflow context (provides ctx.settings).
 * @param {string}   triggerReason  - Human-readable description of what triggered this sync.
 * @param {boolean}  [stateChanged=true] - Whether to attempt a Jira status transition.
 *                                         Pass false when neither becomesReported nor State changed.
 * @param {Array}    [collector]    - Optional array to accumulate log messages for
 *                                   surfacing via workflow.message() in user-triggered rules.
 *                                   When provided, all log lines are pushed here in addition
 *                                   to console.log, so the caller can display them in the UI.
 */
const performSync = (issue, ctx, triggerReason, stateChanged, collector) => {
  // log() writes to console always, and also pushes to the collector when provided.
  // This allows the action rule to surface log output via workflow.message() in YouTrack Cloud,
  // where server-side console logs are not accessible to users.
  const log = (msg) => {
    console.log(msg);
    if (collector) collector.push(msg);
  };

  const jiraEndpoint = ctx.settings.jiraEndpointUrl;
  const jiraProjectSlug = ctx.settings.jiraProjectSlug;
  const jiraApiToken = ctx.settings.jiraApiToken;
  const syncMode = ctx.settings.syncMode || 'Disabled';

  // Structured result object — populated throughout the sync pipeline and returned to the
  // caller so it can build a human-readable notification without parsing raw log lines.
  const syncResult = {
    issueId:      issue.id,
    issueSummary: issue.summary,
    jiraKey:      null,
    jiraBaseUrl:  jiraEndpoint || '',
    projectKey:   jiraProjectSlug || '',
    operation:    'skipped',
    changes:      triggerReason ? triggerReason.split(' | ') : [],
    errorMsg:     null,
    timestamp:    new Date()
  };

  if (!jiraEndpoint || !jiraProjectSlug || !jiraApiToken) {
    log('[Jira Sync] Missing required settings (jiraEndpointUrl, jiraProjectSlug or jiraApiToken). Skipping issue: ' + issue.id);
    syncResult.errorMsg = 'configurações obrigatórias ausentes';
    return syncResult;
  }

  if (syncMode === 'Disabled') {
    log('[Jira Sync] Sync disabled for project. Skipping issue: ' + issue.id);
    syncResult.errorMsg = 'sync desabilitado para o projeto';
    return syncResult;
  }

  const JIRA_URL = jiraEndpoint + '/rest/api/3';
  const JIRA_PROJECT_KEY = jiraProjectSlug;
  const isDryRun = syncMode === 'Dry-Run';

  // --- TRIGGER SUMMARY ---
  log('[Jira Sync] Triggered for issue: ' + issue.id + ' | Mode: ' + syncMode);
  log('[Jira Sync] Reason: ' + (triggerReason || 'unspecified'));

  // --- EVALUATED MAPPINGS ---
  // Computed once and reused in both logging and payload building.
  const mappings = {
    status:     getJiraStatus(issue),
    issueType:  getJiraIssueType(issue),
    priority:   getJiraPriority(issue),
    labels:     getJiraLabels(issue),
    estimation: getJiraEstimation(issue)
  };

  // --- JIRA CONTEXT ---
  const jiraDataKey = issue.fields['Jira ID'] || null;
  const isUpdate = !!jiraDataKey;
  log('[Jira Sync] Jira Project Key: ' + JIRA_PROJECT_KEY);
  log('[Jira Sync] Jira Issue ID: ' + (jiraDataKey || 'not yet assigned') + ' | Operation: ' + (isUpdate ? 'UPDATE' : 'CREATE'));
  log('[Jira Sync] Mappings → IssueType: ' + mappings.issueType + ' | Priority: ' + mappings.priority + ' | Status: ' + mappings.status);
  log('[Jira Sync] Mappings → Labels: [' + (mappings.labels.length > 0 ? mappings.labels.join(', ') : 'none') + '] | Estimation: ' + (mappings.estimation || 'none'));
  if (issue.fields.Subsystem) {
    log('[Jira Sync] Mappings → Subsystem: "' + issue.fields.Subsystem.name + '" (component lookup ' + (isDryRun ? 'skipped in dry-run' : 'will be resolved') + ')');
  }

  // --- CONNECTION SETUP ---
  const connection = new http.Connection(JIRA_URL, null, 2000);
  connection.addHeader('Authorization', 'Basic ' + jiraApiToken);
  connection.addHeader('Content-Type', 'application/json');

  const jiraComponents = isDryRun ? [] : getJiraComponents(issue, connection, JIRA_PROJECT_KEY, log);
  const jiraPayload = buildJiraPayload(issue, jiraComponents, mappings, JIRA_PROJECT_KEY);

  if (isDryRun) {
    log('[Jira Sync][DRY-RUN] Full Jira payload: ' + JSON.stringify(jiraPayload, null, 2));
  }

  // --- CREATE OR UPDATE ---
  let resolvedJiraKey = jiraDataKey;

  if (!isDryRun) {
    if (!isUpdate) {
      const response = connection.postSync('/issue', {}, JSON.stringify(jiraPayload));
      if (response && response.code === 201) {
        const jiraData = JSON.parse(response.response);
        resolvedJiraKey = jiraData.key;
        issue.fields['Jira ID'] = resolvedJiraKey;
        syncResult.operation = 'created';
        syncResult.jiraKey   = resolvedJiraKey;
        workflow.message('Issue migrated to Jira: ' + resolvedJiraKey);
      } else {
        const errMsg = 'Failed to migrate issue to Jira. Error: ' + response.response;
        log('[Jira Sync] ' + errMsg);
        syncResult.operation = 'error';
        syncResult.errorMsg  = 'falha ao criar issue: ' + response.response;
        workflow.message(errMsg);
        return syncResult;
      }
    } else {
      const response = connection.putSync('/issue/' + resolvedJiraKey, {}, JSON.stringify(jiraPayload));
      if (response && response.code === 204) {
        syncResult.operation = 'updated';
        syncResult.jiraKey   = resolvedJiraKey;
        workflow.message('Jira issue updated: ' + resolvedJiraKey);
      } else {
        const errMsg = 'Failed to update Jira issue ' + resolvedJiraKey + '. Error: ' + response.response;
        log('[Jira Sync] ' + errMsg);
        syncResult.operation = 'error';
        syncResult.jiraKey   = resolvedJiraKey;
        syncResult.errorMsg  = 'falha ao atualizar: ' + response.response;
        workflow.message(errMsg);
        return syncResult;
      }
    }
  } else {
    if (!isUpdate) {
      resolvedJiraKey      = 'DRY-RUN-KEY';
      syncResult.operation = 'created';
      syncResult.jiraKey   = null; // not a real key in dry-run
      log('[Jira Sync][DRY-RUN] Would CREATE new Jira issue.');
    } else {
      syncResult.operation = 'updated';
      syncResult.jiraKey   = resolvedJiraKey;
      log('[Jira Sync][DRY-RUN] Would UPDATE Jira issue: ' + resolvedJiraKey);
    }
  }

  // --- MIGRATE COMMENTS (only on CREATE to avoid duplicates) ---
  if (!isUpdate) {
    const commentCount = issue.comments.length || 0;
    log('[Jira Sync] Comments to migrate: ' + commentCount);

    issue.comments.forEach(comment => {
      const commentPayload = {
        body: {
          type: 'doc',
          version: 1,
          content: [{
            type: 'paragraph',
            content: [{
              type: 'text',
              text: comment.text
            }]
          }]
        }
      };
      if (!isDryRun) {
        const commentResponse = connection.postSync('/issue/' + resolvedJiraKey + '/comment', {}, JSON.stringify(commentPayload));
        if (!commentResponse || commentResponse.code !== 201) {
          log('[Jira Sync] Failed to migrate comment to ' + resolvedJiraKey + '. Error: ' + (commentResponse ? commentResponse.response : 'No response'));
        }
      } else {
        const preview = comment.text.length > 50 ? comment.text.substring(0, 50) + '...' : comment.text;
        log('[Jira Sync][DRY-RUN] Would migrate comment: "' + preview + '"');
      }
    });
  }

  // --- TRANSITION STATUS IF NEEDED ---
  // stateChanged defaults to true when not explicitly provided (e.g. action/schedule rules
  // where every sync should attempt to align the Jira status with the current YouTrack state).
  const shouldTransition = stateChanged !== false;
  if (shouldTransition && mappings.status !== 'To Do') {
    if (!isDryRun) {
      const transitionsResponse = connection.getSync('/issue/' + resolvedJiraKey + '/transitions');
      if (transitionsResponse && transitionsResponse.code === 200) {
        const transitions = JSON.parse(transitionsResponse.response).transitions;
        const transition = transitions.find(t => t.to.name === mappings.status);
        if (transition) {
          const transitionPayload = { transition: { id: transition.id } };
          const transitionResponse = connection.postSync('/issue/' + resolvedJiraKey + '/transitions', {}, JSON.stringify(transitionPayload));
          if (!transitionResponse || transitionResponse.code !== 204) {
            log('[Jira Sync] Failed to transition ' + resolvedJiraKey + ' to "' + mappings.status + '". Error: ' + (transitionResponse ? transitionResponse.response : 'No response'));
          }
        } else {
          log('[Jira Sync] No matching transition found in Jira for status: "' + mappings.status + '". Skipping transition.');
        }
      } else {
        log('[Jira Sync] Failed to fetch transitions for ' + resolvedJiraKey + '. Error: ' + (transitionsResponse ? transitionsResponse.response : 'No response'));
      }
    } else {
      log('[Jira Sync][DRY-RUN] Would transition issue to status: "' + mappings.status + '"');
    }
  }

  return syncResult;
};

// --- NOTIFICATION HELPERS ---

/**
 * Splits a full webhook URL into host + full path and POSTs to it.
 *
 * http.Connection expects only the host (scheme + authority) as its base URL.
 * Passing a base URL that already contains a path causes the connection to
 * normalize to just the host, which corrupts the request path for multi-segment
 * webhook URLs like Slack (/services/T.../B.../token) and Teams (/webhookb2/...).
 *
 * Correct split strategy: find the first '/' after '://' to isolate the host,
 * then pass the remainder as the full path to postSync.
 *
 * Example — Slack:
 *   https://hooks.slack.com/services/T123/B456/token
 *   → host: https://hooks.slack.com
 *   → path: /services/T123/B456/token
 *
 * Example — ntfy:
 *   https://ntfy.sh/my-topic
 *   → host: https://ntfy.sh
 *   → path: /my-topic
 *
 * @param {string} webhookUrl - Full URL including path.
 * @param {Object} headers    - Request headers object.
 * @param {string} body       - Raw request body string.
 * @returns {Object|null} YouTrack HTTP response object, or null on error.
 */
const postToWebhook = (webhookUrl, headers, body) => {
  // Webhook URL fields use plain string settings (no format:"secret") so webhookUrl
  // is a primitive string here. We split at the host boundary because http.Connection
  // expects only the scheme+host as its base URL, with the full path in postSync.
  const protocolEnd = webhookUrl.indexOf('://') + 3;
  const pathStart = webhookUrl.indexOf('/', protocolEnd);
  const host = pathStart === -1 ? webhookUrl : webhookUrl.substring(0, pathStart);
  const path = pathStart === -1 ? '/' : webhookUrl.substring(pathStart);
  const connection = new http.Connection(host, null, 5000);
  return connection.postSync(path, headers, body);
};

/**
 * ntfy.sh — plain text POST with Title header.
 * Works with ntfy.sh (hosted) and self-hosted ntfy instances.
 */
const notifyNtfy = (topicUrl, issueId, message) => {
  try {
    const response = postToWebhook(topicUrl, {
      'Title': 'Jira Sync: ' + issueId,
      'Content-Type': 'text/plain; charset=utf-8'
    }, message);

    if (!response || response.code < 200 || response.code >= 300) {
      console.log('[Notify][ntfy] Failed: HTTP ' + (response ? response.code : 'no response'));
    } else {
      console.log('[Notify][ntfy] Sent for issue: ' + issueId);
    }
  } catch (e) {
    console.log('[Notify][ntfy] Error: ' + e);
  }
};

/**
 * Microsoft Teams — Incoming Webhook using the legacy MessageCard format,
 * which is universally supported by all Teams incoming webhook connectors.
 */
const notifyTeams = (webhookUrl, issueId, message) => {
  try {
    const payload = JSON.stringify({
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      'summary': 'Jira Sync: ' + issueId,
      'themeColor': '0076D7',
      'sections': [{
        'activityTitle': 'Jira Sync: ' + issueId,
        'activityText': message
      }]
    });

    const response = postToWebhook(webhookUrl, {
      'Content-Type': 'application/json'
    }, payload);

    if (!response || response.code < 200 || response.code >= 300) {
      console.log('[Notify][Teams] Failed: HTTP ' + (response ? response.code : 'no response'));
    } else {
      console.log('[Notify][Teams] Sent for issue: ' + issueId);
    }
  } catch (e) {
    console.log('[Notify][Teams] Error: ' + e);
  }
};

/**
 * Slack — Incoming Webhook using the blocks API for formatted mrkdwn output.
 */
const notifySlack = (webhookUrl, issueId, message) => {
  try {
    const payload = JSON.stringify({
      'blocks': [
        {
          'type': 'section',
          'text': { 'type': 'mrkdwn', 'text': message }
        }
      ]
    });

    const response = postToWebhook(webhookUrl, {
      'Content-Type': 'application/json'
    }, payload);

    if (!response || response.code < 200 || response.code >= 300) {
      console.log('[Notify][Slack] Failed: HTTP ' + (response ? response.code : 'no response'));
    } else {
      console.log('[Notify][Slack] Sent for issue: ' + issueId);
    }
  } catch (e) {
    console.log('[Notify][Slack] Error: ' + e);
  }
};

/**
 * Dispatches a structured sync notification to the configured external channel.
 * Reads `notificationChannel` from settings and routes to the matching notifier.
 * No-ops when channel is 'Disabled' or syncResult is absent.
 *
 * @param {Object} settings   - ctx.settings from the workflow context.
 * @param {Object} syncResult - Structured result object returned by performSync.
 */
const notifyChannel = (settings, syncResult) => {
  const channel = settings.notificationChannel || 'Disabled';
  if (channel === 'Disabled' || !syncResult) return;

  const message = buildSyncMessage(syncResult);
  const issueId = syncResult.issueId;

  if (channel === 'ntfy') {
    if (!settings.ntfyTopicUrl) {
      console.log('[Notify] ntfy selected but ntfyTopicUrl is not configured.');
      return;
    }
    notifyNtfy(settings.ntfyTopicUrl, issueId, message);
  } else if (channel === 'Teams') {
    if (!settings.teamsWebhookUrl) {
      console.log('[Notify] Teams selected but teamsWebhookUrl is not configured.');
      return;
    }
    notifyTeams(settings.teamsWebhookUrl, issueId, message);
  } else if (channel === 'Slack') {
    if (!settings.slackWebhookUrl) {
      console.log('[Notify] Slack selected but slackWebhookUrl is not configured.');
      return;
    }
    notifySlack(settings.slackWebhookUrl, issueId, message);
  } else {
    console.log('[Notify] Unknown notification channel: ' + channel);
  }
};

module.exports = { performSync, notifyChannel, buildSyncMessage };

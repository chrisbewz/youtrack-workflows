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

// --- NOTIFICATION MESSAGE BUILDERS ---

/**
 * Shared syncResult field reference for all builders:
 * @param {string}   syncResult.issueId                  - YouTrack issue ID (e.g. YOU-45)
 * @param {string}   syncResult.issueSummary             - Issue summary text
 * @param {string}   syncResult.jiraKey                  - Jira issue key, or null if unavailable
 * @param {string}   syncResult.jiraBaseUrl              - Jira instance base URL (no trailing slash)
 * @param {string}   syncResult.projectKey               - Jira project key (e.g. BACK)
 * @param {string}   syncResult.youtrackProjectName      - YouTrack project display name (e.g. WTD-E3)
 * @param {string}   syncResult.youtrackProjectShortName - YouTrack project short name (e.g. E3)
 * @param {string}   syncResult.youtrackBaseUrl          - YouTrack instance base URL (no trailing slash)
 * @param {boolean}  syncResult.isDryRun                 - Whether this was a dry-run execution
 * @param {string}   syncResult.operation                - 'created' | 'updated' | 'skipped' | 'error'
 * @param {string[]} syncResult.changes                  - Human-readable change descriptions (for updates)
 * @param {string}   syncResult.errorMsg                 - Error description (for errors and skips)
 * @param {Date}     syncResult.timestamp                - Sync timestamp
 */

/**
 * Builds a Slack/ntfy notification message using mrkdwn syntax and emojis.
 * Readable as plain text on ntfy which does not process markdown.
 * @returns {string} Formatted mrkdwn message string.
 */
const buildSlackMessage = (syncResult) => {
  const {
    projectKey, jiraBaseUrl, issueId, issueSummary, jiraKey, operation, changes, errorMsg, timestamp,
    youtrackProjectName, youtrackProjectShortName, youtrackBaseUrl, isDryRun
  } = syncResult;

  const pad = n => String(n).padStart(2, '0');
  const d = timestamp instanceof Date ? timestamp : new Date();
  const dateStr = pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() +
    '  ' + pad(d.getHours()) + ':' + pad(d.getMinutes());

  // Build the project reference: a clickable link when youtrackBaseUrl is configured,
  // or plain text fallback otherwise.
  const projectLabel = youtrackProjectName || youtrackProjectShortName || projectKey || issueId;
  const projectRef = (youtrackBaseUrl && youtrackProjectShortName)
    ? '<' + youtrackBaseUrl + '/issues/' + youtrackProjectShortName + '|' + projectLabel + '>'
    : projectLabel;

  const dryRunSuffix = isDryRun ? '  _(dry-run)_' : '';

  const lines = ['🔄 *Sync Jira* — ' + projectRef + '  |  ' + dateStr + dryRunSuffix, ''];

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

/**
 * Builds a Teams MessageCard payload object for the given sync result.
 *
 * Uses only ASCII-safe characters — no emojis — to avoid UTF-8 encoding
 * issues with YouTrack's http.Connection when posting to Teams Workflows webhooks.
 * Links use the [text](url) syntax supported in MessageCard activityText fields.
 * Theme color varies by operation to provide quick visual feedback.
 *
 * @returns {{ themeColor: string, title: string, subtitle: string, text: string }}
 */
const buildTeamsMessage = (syncResult) => {
  const {
    projectKey, jiraBaseUrl, issueId, issueSummary, jiraKey, operation, changes, errorMsg, timestamp,
    youtrackProjectName, youtrackProjectShortName, youtrackBaseUrl, isDryRun
  } = syncResult;

  const pad = n => String(n).padStart(2, '0');
  const d = timestamp instanceof Date ? timestamp : new Date();
  const dateStr = pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() +
    '  ' + pad(d.getHours()) + ':' + pad(d.getMinutes());

  const projectLabel = youtrackProjectName || youtrackProjectShortName || projectKey || issueId;
  const projectRef = (youtrackBaseUrl && youtrackProjectShortName)
    ? '[' + projectLabel + '](' + youtrackBaseUrl + '/issues/' + youtrackProjectShortName + ')'
    : projectLabel;

  const dryRunSuffix = isDryRun ? ' (dry-run)' : '';
  const title = 'Sync Jira | ' + projectRef + ' | ' + dateStr + dryRunSuffix;

  const jiraUrl = jiraKey && jiraBaseUrl ? jiraBaseUrl + '/browse/' + jiraKey : null;
  const jiraRef = jiraUrl ? '[' + jiraKey + '](' + jiraUrl + ')' : (jiraKey || issueId);

  let themeColor, subtitle, text;

  if (operation === 'created') {
    themeColor = '00B050';
    subtitle   = 'CRIADA';
    text       = jiraRef + ' - ' + issueSummary;
  } else if (operation === 'updated') {
    themeColor = '0076D7';
    subtitle   = 'ATUALIZADA';
    const changeStr = changes && changes.length > 0 ? changes.join(' | ') : 'campos atualizados';
    text = jiraRef + ' - ' + changeStr;
  } else if (operation === 'error') {
    themeColor = 'FF0000';
    subtitle   = 'ERRO';
    text       = (jiraKey || issueId) + ' - ' + (errorMsg || 'erro desconhecido');
  } else {
    themeColor = '808080';
    subtitle   = 'IGNORADA';
    text       = issueId + ' - ' + (errorMsg || 'sync ignorado');
  }

  return { themeColor, title, subtitle, text };
};

// --- MAPPING HELPERS ---

const getJiraStatus = (issue, settings) => {
  const stateName = issue.fields.State.name;

  // Parse a comma-separated setting string into a trimmed array.
  // Falls back to the provided defaults when the setting is absent or blank.
  const parseStates = (raw, defaults) => {
    const src = (raw && raw.trim()) ? raw : defaults;
    return src.split(',').map(v => v.trim()).filter(Boolean);
  };

  const doneStates       = parseStates(settings.statusDoneStates,       "Fixed,Verified,Closed,Can't Reproduce,Duplicate,Won't fix,Incomplete");
  const inProgressStates = parseStates(settings.statusInProgressStates, 'In Progress');

  if (doneStates.indexOf(stateName)       !== -1) return 'Done';
  if (inProgressStates.indexOf(stateName) !== -1) return 'In Progress';
  return 'To Do';
};

const getJiraIssueType = (issue, settings) => {
  const typeName = issue.fields.Type ? issue.fields.Type.name : '';

  // Project-level type configuration takes priority.
  // Each setting maps a YouTrack type name to one of the four standard Jira issue types.
  // Empty/missing settings fall back to the hardcoded default names below.
  if (typeName === (settings.epicItemType    || 'Epic'))    return 'Epic';
  if (typeName === (settings.storyItemType   || 'Feature')) return 'Story';
  if (typeName === (settings.taskItemType    || 'Task'))    return 'Task';
  if (typeName === (settings.subTaskItemType || 'Subtask')) return 'Sub-task';

  // Legacy mappings for types not covered by the four configurable slots above.
  // These remain hardcoded for backward compatibility.
  const legacyMapping = {
    'Bug':         'Bug',
    'Improvement': 'Story'
  };
  return legacyMapping[typeName] || 'Task';
};

const getJiraPriority = (issue, settings) => {
  const priorityName = issue.fields.Priority.name;

  // Each tier has two settings:
  //   priorityXxxName      — the YouTrack field value to match (source)
  //   priorityXxxNameJira  — the Jira priority name to send in the payload (target)
  // Both fall back to sensible defaults when left blank.
  const tiers = [
    {
      ytName:   settings.priorityHighestName     || 'Show-stopper',
      jiraName: settings.priorityHighestNameJira || 'Highest'
    },
    {
      ytName:   settings.priorityHighName     || 'Critical',
      jiraName: settings.priorityHighNameJira || 'High'
    },
    {
      ytName:   settings.priorityMediumName     || 'Normal',
      jiraName: settings.priorityMediumNameJira || 'Medium'
    },
    {
      ytName:   settings.priorityLowName     || 'Minor',
      jiraName: settings.priorityLowNameJira || 'Low'
    }
  ];

  const matched = tiers.find(t => t.ytName === priorityName);
  if (matched) return matched.jiraName;

  // Legacy fallback: 'Major' was historically mapped to Medium and is not
  // configurable in this version (discussed and deferred in YOU-4).
  if (priorityName === 'Major') return settings.priorityMediumNameJira || 'Medium';

  return settings.priorityMediumNameJira || 'Medium';
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
      // REST API v2 expects description as a plain string (wiki markup / plain text).
      // ADF objects are only supported by REST API v3.
      description: issue.description || 'No description provided',
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
  const issueSyncMode = issue.fields["Jira Sync"].presentation || 'Disabled';

  // Structured result object — populated throughout the sync pipeline and returned to the
  // caller so it can build a human-readable notification without parsing raw log lines.
  const syncResult = {
    issueId:                  issue.id,
    issueSummary:             issue.summary,
    jiraKey:                  null,
    jiraBaseUrl:              jiraEndpoint || '',
    projectKey:               jiraProjectSlug || '',
    youtrackProjectName:      issue.project ? issue.project.name : (jiraProjectSlug || ''),
    youtrackProjectShortName: issue.project ? issue.project.shortName : '',
    youtrackBaseUrl:          ctx.settings.youtrackBaseUrl || '',
    isDryRun:                 syncMode === 'Dry-Run',
    issueIsDryRun:            issueSyncMode === 'Dry-Run',
    operation:                'skipped',
    changes:                  triggerReason ? triggerReason.split(' | ') : [],
    errorMsg:                 null,
    timestamp:                new Date()
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

  // Suppression guard: if Jira Closed is set and overrideCompleted is not explicitly enabled,
  // skip this issue to avoid overwriting a status change made directly in Jira.
  // This does not apply to Sub-tasks, which are evaluated independently per issue.
  const jiraStateField    = issue.fields['Jira State'];
  const jiraStateName     = jiraStateField && jiraStateField.name ? jiraStateField.name : jiraStateField;
  const isJiraClosed      = jiraStateName === 'Closed';
  const overrideCompleted = ctx.settings.overrideCompleted === true || ctx.settings.overrideCompleted === 'true';
  const isSubTask         = issue.fields.Type && issue.fields.Type.name === (ctx.settings.subTaskItemType || 'Subtask');

  if (isJiraClosed && !overrideCompleted && !isSubTask) {
    log('[Jira Sync] Issue ' + issue.id + ' is marked as Jira Closed and overrideCompleted is disabled. Skipping sync.');
    syncResult.operation = 'skipped';
    syncResult.errorMsg  = 'issue encerrada no Jira (overrideCompleted desabilitado)';
    return syncResult;
  }

  const JIRA_URL = jiraEndpoint + '/rest/api/2';
  const JIRA_PROJECT_KEY = jiraProjectSlug;

  // --- TRIGGER SUMMARY ---
  log('[Jira Sync] Triggered for issue: ' + issue.id + ' | Mode: ' + syncMode + ' | Issue Sync Mode: ' + issueSyncMode);
  log('[Jira Sync] Reason: ' + (triggerReason || 'unspecified'));

  // --- EVALUATED MAPPINGS ---
  // Computed once and reused in both logging and payload building.
  const mappings = {
    status:     getJiraStatus(issue, ctx.settings),
    issueType:  getJiraIssueType(issue, ctx.settings),
    priority:   getJiraPriority(issue, ctx.settings),
    labels:     getJiraLabels(issue),
    estimation: getJiraEstimation(issue)
  };

  const isDryRun = syncMode === 'Dry-Run' | issueSyncMode === 'Dry-Run';
  const isSyncDisabled = syncMode === 'Disabled' | issueSyncMode === 'Disabled';
  const isSyncEnabled = !isDryRun && !isSyncDisabled;

  // --- JIRA CONTEXT ---
  const jiraDataKey = issue.fields['Jira ID'] || null;
  const isUpdate = !!jiraDataKey;
  log('[Jira Sync] Jira Project Key: ' + JIRA_PROJECT_KEY);
  log('[Jira Sync] Jira Issue ID: ' + (jiraDataKey || 'not yet assigned') + ' | Operation: ' + (isUpdate ? 'UPDATE' : 'CREATE'));
  log('[Jira Sync] Mappings → IssueType: ' + mappings.issueType + ' | Priority: ' + mappings.priority + ' | Status: ' + mappings.status);
  log('[Jira Sync] Mappings → Labels: [' + (mappings.labels.length > 0 ? mappings.labels.join(', ') : 'none') + '] | Estimation: ' + (mappings.estimation || 'none'));
  if (issue.fields.Subsystem) {
    log('[Jira Sync] Mappings → Subsystem: "' + issue.fields.Subsystem.name + '" (component lookup ' + (isSyncEnabled ? 'will be resolved' : 'skipped in dry-run') + ')');
  }

  // --- CONNECTION SETUP ---
  const connection = new http.Connection(JIRA_URL, null, 2000);
  connection.addHeader('Authorization', 'Basic ' + jiraApiToken);
  connection.addHeader('Content-Type', 'application/json');

  const jiraComponents = isSyncEnabled ? getJiraComponents(issue, connection, JIRA_PROJECT_KEY, log) : 'skipped in dry-run';
  const jiraPayload = buildJiraPayload(issue, jiraComponents, mappings, JIRA_PROJECT_KEY);

  if (isDryRun) {
    log('[Jira Sync][DRY-RUN] Full Jira payload: ' + JSON.stringify(jiraPayload, null, 2));
  }
  // --- CREATE OR UPDATE ---
  let resolvedJiraKey = jiraDataKey;

  if (isSyncEnabled) {
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
      // REST API v2 expects body as a plain string.
      const commentPayload = { body: comment.text };
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
    if (isSyncEnabled) {
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

// --- JIRA STATUS CHECK ---

/**
 * Checks the current status of a Jira issue and updates the YouTrack `Jira Closed`
 * boolean field accordingly.
 *
 * Uses Jira's status category (To Do / In Progress / Done) rather than comparing
 * status names directly, so it works regardless of how the Jira project names its statuses.
 *
 * Behaviour:
 *  - If the issue has no `Jira ID`, it is skipped.
 *  - If the Jira status category is "done", `Jira Closed` is set to true.
 *  - If the Jira status is not "done" (e.g. re-opened), `Jira Closed` is reset to false.
 *
 * @param {Object}  issue     - The YouTrack issue.
 * @param {Object}  ctx       - Workflow context (provides ctx.settings).
 * @param {Array}   [collector] - Optional log collector (same pattern as performSync).
 * @returns {{ issueId: string, jiraKey: string|null, jiraClosed: boolean|null, skipped: boolean, errorMsg: string|null }}
 */
const checkJiraStatus = (issue, ctx, collector) => {
  const log = (msg) => {
    console.log(msg);
    if (collector) collector.push(msg);
  };

  const result = {
    issueId:   issue.id,
    jiraKey:   null,
    jiraClosed: null,
    skipped:   false,
    errorMsg:  null
  };

  const jiraKey       = issue.fields['Jira ID'] || null;
  const jiraEndpoint  = ctx.settings.jiraEndpointUrl;
  const jiraApiToken  = ctx.settings.jiraApiToken;

  if (!jiraKey) {
    log('[Jira Check] No Jira ID on issue ' + issue.id + '. Skipping.');
    result.skipped  = true;
    result.errorMsg = 'Jira ID nao preenchido';
    return result;
  }

  if (!jiraEndpoint || !jiraApiToken) {
    log('[Jira Check] Missing required settings. Skipping issue: ' + issue.id);
    result.skipped  = true;
    result.errorMsg = 'configuracoes obrigatorias ausentes';
    return result;
  }

  result.jiraKey = jiraKey;

  const JIRA_URL = jiraEndpoint + '/rest/api/3';
  const connection = new http.Connection(JIRA_URL, null, 2000);
  connection.addHeader('Authorization', 'Basic ' + jiraApiToken);
  connection.addHeader('Content-Type', 'application/json');

  // Request only the status field to keep the response lightweight.
  const response = connection.getSync('/issue/' + jiraKey, { fields: 'status' });

  if (!response || response.code !== 200) {
    const errMsg = 'Failed to fetch Jira issue ' + jiraKey + '. HTTP ' + (response ? response.code : 'no response');
    log('[Jira Check] ' + errMsg);
    result.skipped  = true;
    result.errorMsg = errMsg;
    return result;
  }

  const jiraIssue       = JSON.parse(response.response);
  const statusCategory  = jiraIssue.fields.status.statusCategory.key; // 'new' | 'indeterminate' | 'done'
  const statusName      = jiraIssue.fields.status.name;
  const isClosed        = statusCategory === 'done';

  log('[Jira Check] ' + issue.id + ' → Jira ' + jiraKey + ' status: "' + statusName + '" (category: ' + statusCategory + ') → Jira Closed: ' + isClosed);

  // Jira State is a YouTrack enum field with values 'Open' and 'Closed'.
  issue.fields['Jira State'] = isClosed ? 'Closed' : 'Open';
  result.jiraClosed = isClosed;

  return result;
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
  // postSync(uri, queryParams, payload) — the second argument is query parameters,
  // NOT headers. Headers must be registered via addHeader() before the request is sent.
  Object.keys(headers).forEach(function(name) {
    connection.addHeader(name, headers[name]);
  });
  return connection.postSync(path, null, body);
};

/**
 * ntfy.sh — plain text POST with Title header.
 * Reuses the Slack/mrkdwn message builder: ntfy renders it as plain text,
 * so emojis and mrkdwn symbols are displayed as-is without issues.
 * Works with ntfy.sh (hosted) and self-hosted ntfy instances.
 */
const notifyNtfy = (topicUrl, syncResult) => {
  try {
    const message = buildSlackMessage(syncResult);
    const response = postToWebhook(topicUrl, {
      'Title': 'Jira Sync: ' + syncResult.issueId,
      'Content-Type': 'text/plain; charset=utf-8'
    }, message);

    if (!response || response.code < 200 || response.code >= 300) {
      console.log('[Notify][ntfy] Failed: HTTP ' + (response ? response.code : 'no response'));
    } else {
      console.log('[Notify][ntfy] Sent for issue: ' + syncResult.issueId);
    }
  } catch (e) {
    console.log('[Notify][ntfy] Error: ' + e);
  }
};

/**
 * Microsoft Teams — Posts a MessageCard to a Teams Workflows webhook URL.
 *
 * Uses buildTeamsMessage which produces ASCII-only content (no emojis) to avoid
 * UTF-8 encoding failures in YouTrack's http.Connection. Theme color and subtitle
 * vary by operation for quick visual differentiation in the Teams channel.
 */
const notifyTeams = (webhookUrl, syncResult) => {
  try {
    const msg = buildTeamsMessage(syncResult);
    const payload = JSON.stringify({
      '@type':      'MessageCard',
      '@context':   'http://schema.org/extensions',
      'summary':    'Sync Jira: ' + syncResult.issueId,
      'themeColor': msg.themeColor,
      'sections': [{
        'activityTitle':    msg.title,
        'activitySubtitle': msg.subtitle,
        'activityText':     msg.text
      }]
    });

    const response = postToWebhook(webhookUrl, {
      'Content-Type': 'application/json'
    }, payload);

    if (!response || response.code < 200 || response.code >= 300) {
      console.log('[Notify][Teams] Failed: HTTP ' + (response ? response.code : 'no response'));
    } else {
      console.log('[Notify][Teams] Sent for issue: ' + syncResult.issueId);
    }
  } catch (e) {
    console.log('[Notify][Teams] Error: ' + e);
  }
};

/**
 * Slack — Incoming Webhook using the blocks API for formatted mrkdwn output.
 * Uses buildSlackMessage which supports emojis and Slack's mrkdwn link syntax.
 */
const notifySlack = (webhookUrl, syncResult) => {
  try {
    const message = buildSlackMessage(syncResult);
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
      console.log('[Notify][Slack] Sent for issue: ' + syncResult.issueId);
    }
  } catch (e) {
    console.log('[Notify][Slack] Error: ' + e);
  }
};

/**
 * Dispatches a structured sync notification to the configured external channel.
 * Reads `notificationChannel` from settings and routes to the matching notifier.
 * Each notifier is responsible for building its own channel-specific message.
 * No-ops when channel is 'Disabled' or syncResult is absent.
 *
 * @param {Object} settings   - ctx.settings from the workflow context.
 * @param {Object} syncResult - Structured result object returned by performSync.
 */
const notifyChannel = (settings, syncResult) => {
  const channel = settings.notificationChannel || 'Disabled';
  if (channel === 'Disabled' || !syncResult) return;

  if (channel === 'ntfy') {
    if (!settings.ntfyTopicUrl) {
      console.log('[Notify] ntfy selected but ntfyTopicUrl is not configured.');
      return;
    }
    notifyNtfy(settings.ntfyTopicUrl, syncResult);
  } else if (channel === 'Teams') {
    if (!settings.teamsWebhookUrl) {
      console.log('[Notify] Teams selected but teamsWebhookUrl is not configured.');
      return;
    }
    notifyTeams(settings.teamsWebhookUrl, syncResult);
  } else if (channel === 'Slack') {
    if (!settings.slackWebhookUrl) {
      console.log('[Notify] Slack selected but slackWebhookUrl is not configured.');
      return;
    }
    notifySlack(settings.slackWebhookUrl, syncResult);
  } else {
    console.log('[Notify] Unknown notification channel: ' + channel);
  }
};

module.exports = { performSync, checkJiraStatus, notifyChannel, buildSlackMessage, buildTeamsMessage };

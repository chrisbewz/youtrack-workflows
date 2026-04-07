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

  if (!jiraEndpoint || !jiraProjectSlug || !jiraApiToken) {
    log('[Jira Sync] Missing required settings (jiraEndpointUrl, jiraProjectSlug or jiraApiToken). Skipping issue: ' + issue.id);
    return;
  }

  if (syncMode === 'Disabled') {
    log('[Jira Sync] Sync disabled for project. Skipping issue: ' + issue.id);
    return;
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
        workflow.message('Issue migrated to Jira: ' + resolvedJiraKey);
      } else {
        const errMsg = 'Failed to migrate issue to Jira. Error: ' + response.response;
        log('[Jira Sync] ' + errMsg);
        workflow.message(errMsg);
        return;
      }
    } else {
      const response = connection.putSync('/issue/' + resolvedJiraKey, {}, JSON.stringify(jiraPayload));
      if (response && response.code === 204) {
        workflow.message('Jira issue updated: ' + resolvedJiraKey);
      } else {
        const errMsg = 'Failed to update Jira issue ' + resolvedJiraKey + '. Error: ' + response.response;
        log('[Jira Sync] ' + errMsg);
        workflow.message(errMsg);
        return;
      }
    }
  } else {
    if (!isUpdate) {
      resolvedJiraKey = 'DRY-RUN-KEY';
      log('[Jira Sync][DRY-RUN] Would CREATE new Jira issue.');
    } else {
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
};

module.exports = { performSync };

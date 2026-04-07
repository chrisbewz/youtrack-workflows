const entities = require('@jetbrains/youtrack-scripting-api/entities');
const http = require('@jetbrains/youtrack-scripting-api/http');
const workflow = require('@jetbrains/youtrack-scripting-api/workflow');

/**
 * YouTrack to Jira Migration Workflow
 * Refactored for maintainability using minor mapping functions.
 */

const shouldEvalRule = (ctx) => {
  if (!ctx.issue.isReported)
    return false;

  const issue = ctx.issue;

  return issue.becomesReported                  ||
    issue.oldValue('summary') !== null          ||
    issue.oldValue('description') !== null      ||
    issue.fields.State.isChanged                ||
    issue.fields.Priority.isChanged             ||
    issue.fields.Type.isChanged                 ||
    issue.fields.Estimation.isChanged           ||
    issue.fields.Subsystem.isChanged            ||
    issue.tags.isChanged;
};

exports.rule = entities.Issue.onChange({
  title: 'Jira Sync',
  guard: (ctx) => {
    return shouldEvalRule(ctx);
  },
  action: (ctx) => {
    const issue = ctx.issue;

    const jiraEndpoint = ctx.settings.jiraEndpointUrl;
    const jiraProjectSlug = ctx.settings.jiraProjectSlug;
    const jiraApiToken = ctx.settings.jiraApiToken;
    const syncMode = ctx.settings.syncMode || 'Disabled';

    // Guard against missing settings before any logic runs.
    // Without this, JIRA_URL would resolve to "undefined/rest/api/3" and fail with a cryptic error.
    if (!jiraEndpoint || !jiraProjectSlug || !jiraApiToken) {
      console.log('[Jira Sync] Missing required settings (jiraEndpointUrl, jiraProjectSlug or jiraApiToken). Skipping.');
      return;
    }

    if (syncMode === 'Disabled') {
      console.log('[Jira Sync] Sync disabled for project. Skipping issue: ' + issue.id);
      return;
    }

    const JIRA_URL = jiraEndpoint + '/rest/api/3';
    const JIRA_PROJECT_KEY = jiraProjectSlug;

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

    const getJiraComponents = (issue, connection, projectKey) => {
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
            console.log('[Jira Sync] Component match not found in Jira for subsystem: ' + subsystemName + '. Skipping component setup.');
          }
        } else {
          console.log('[Jira Sync] Failed to fetch components from Jira. Skipping component setup.');
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

    // Builds a human-readable list of what changed in the issue on this cycle.
    // Mirrors the checks in shouldEvalRule so the log reflects exactly what triggered the workflow.
    const buildChangeSummary = (issue) => {
      const changes = [];

      if (issue.becomesReported) {
        changes.push('Issue became reported (new)');
      }

      const oldSummary = issue.oldValue('summary');
      if (oldSummary !== null) {
        changes.push('Summary: "' + oldSummary + '" → "' + issue.summary + '"');
      }

      // Description is omitted from the diff to avoid flooding logs with large text blocks.
      // Presence of oldValue is enough to confirm it changed.
      if (issue.oldValue('description') !== null) {
        changes.push('Description changed');
      }

      if (issue.fields.State.isChanged) {
        changes.push('State → "' + issue.fields.State.name + '"');
      }

      if (issue.fields.Priority.isChanged) {
        changes.push('Priority → "' + issue.fields.Priority.name + '"');
      }

      if (issue.fields.Type.isChanged) {
        changes.push('Type → "' + issue.fields.Type.name + '"');
      }

      if (issue.fields.Estimation.isChanged) {
        const estimation = issue.fields.Estimation ? issue.fields.Estimation.minutes + 'm' : 'none';
        changes.push('Estimation → ' + estimation);
      }

      if (issue.fields.Subsystem.isChanged) {
        const subsystem = issue.fields.Subsystem ? '"' + issue.fields.Subsystem.name + '"' : 'none';
        changes.push('Subsystem → ' + subsystem);
      }

      if (issue.tags.isChanged) {
        changes.push('Tags changed');
      }

      return changes;
    };

    const buildJiraPayload = (issue, components, mappings) => {
      const payload = {
        fields: {
          project: { key: JIRA_PROJECT_KEY },
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

    // --- CONNECTION SETUP ---
    const connection = new http.Connection(JIRA_URL, null, 2000);
    connection.addHeader('Authorization', 'Basic ' + jiraApiToken);
    connection.addHeader('Content-Type', 'application/json');

    // --- EXECUTION LOGIC ---
    const isDryRun = syncMode === 'Dry-Run';

    // --- TRIGGER SUMMARY ---
    // Logged in both modes: gives visibility over what caused the workflow to run,
    // useful for auditing and debugging both in dry-run and in production.
    const changes = buildChangeSummary(issue);
    console.log('[Jira Sync] Triggered for issue: ' + issue.id + ' | Mode: ' + syncMode);
    console.log('[Jira Sync] Changes detected: ' + (changes.length > 0 ? changes.join(' | ') : 'none'));

    // --- EVALUATED MAPPINGS ---
    // Computed once here and reused in both logging and buildJiraPayload,
    // avoiding redundant calls to the mapping helper functions.
    const mappings = {
      status:    getJiraStatus(issue),
      issueType: getJiraIssueType(issue),
      priority:  getJiraPriority(issue),
      labels:    getJiraLabels(issue),
      estimation: getJiraEstimation(issue)
    };

    // --- JIRA CONTEXT ---
    // Logged in both modes to confirm which Jira project and issue are being targeted,
    // making it easy to cross-reference logs with the Jira side.
    const jiraDataKey = issue.fields['Jira ID'] || null;
    const isUpdate = !!jiraDataKey;
    console.log('[Jira Sync] Jira Project Key: ' + JIRA_PROJECT_KEY);
    console.log('[Jira Sync] Jira Issue ID: ' + (jiraDataKey || 'not yet assigned') + ' | Operation: ' + (isUpdate ? 'UPDATE' : 'CREATE'));

    // Logged in both modes so you can always trace how YouTrack values were translated to Jira equivalents.
    console.log('[Jira Sync] Mappings → IssueType: ' + mappings.issueType + ' | Priority: ' + mappings.priority + ' | Status: ' + mappings.status);
    console.log('[Jira Sync] Mappings → Labels: [' + (mappings.labels.length > 0 ? mappings.labels.join(', ') : 'none') + '] | Estimation: ' + (mappings.estimation || 'none'));
    if (issue.fields.Subsystem) {
      console.log('[Jira Sync] Mappings → Subsystem: "' + issue.fields.Subsystem.name + '" (component lookup ' + (isDryRun ? 'skipped in dry-run' : 'will be resolved') + ')');
    }

    const jiraComponents = isDryRun ? [] : getJiraComponents(issue, connection, JIRA_PROJECT_KEY);
    const jiraPayload = buildJiraPayload(issue, jiraComponents, mappings);

    if (isDryRun) {
      console.log('[Jira Sync][DRY-RUN] Full Jira payload: ' + JSON.stringify(jiraPayload, null, 2));
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
          workflow.message('Failed to migrate issue to Jira. Error: ' + response.response);
          return;
        }
      } else {
        const response = connection.putSync('/issue/' + resolvedJiraKey, {}, JSON.stringify(jiraPayload));
        if (response && response.code === 204) {
          workflow.message('Jira issue updated: ' + resolvedJiraKey);
        } else {
          workflow.message('Failed to update Jira issue ' + resolvedJiraKey + '. Error: ' + response.response);
          return;
        }
      }
    } else {
      if (!isUpdate) {
        resolvedJiraKey = 'DRY-RUN-KEY';
        console.log('[Jira Sync][DRY-RUN] Would CREATE new Jira issue.');
      } else {
        console.log('[Jira Sync][DRY-RUN] Would UPDATE Jira issue: ' + resolvedJiraKey);
      }
    }

    // --- MIGRATE COMMENTS (only on CREATE to avoid duplicates) ---
    if (!isUpdate) {
      // FIX: .length is the correct property for YouTrack collections; .size was always returning 0.
      const commentCount = issue.comments.length || 0;
      // Logged in both modes: useful to know upfront how many comments will be sent.
      console.log('[Jira Sync] Comments to migrate: ' + commentCount);

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
            console.log('[Jira Sync] Failed to migrate comment to ' + resolvedJiraKey + '. Error: ' + (commentResponse ? commentResponse.response : 'No response'));
          }
        } else {
          const preview = comment.text.length > 50 ? comment.text.substring(0, 50) + '...' : comment.text;
          console.log('[Jira Sync][DRY-RUN] Would migrate comment: "' + preview + '"');
        }
      });
    }

    // --- TRANSITION STATUS IF NEEDED ---
    // FIX: Transition is now only attempted when the issue was newly reported or when State
    // explicitly changed. Previously it ran on every workflow execution (e.g. summary edits),
    // causing unnecessary API calls and potential errors when the issue was already in the target state.
    const stateChanged = issue.becomesReported || issue.fields.State.isChanged;
    if (stateChanged && mappings.status !== 'To Do') {
      if (!isDryRun) {
        const transitionsResponse = connection.getSync('/issue/' + resolvedJiraKey + '/transitions');
        if (transitionsResponse && transitionsResponse.code === 200) {
          const transitions = JSON.parse(transitionsResponse.response).transitions;
          const transition = transitions.find(t => t.to.name === mappings.status);
          if (transition) {
            const transitionPayload = { transition: { id: transition.id } };
            const transitionResponse = connection.postSync('/issue/' + resolvedJiraKey + '/transitions', {}, JSON.stringify(transitionPayload));
            if (!transitionResponse || transitionResponse.code !== 204) {
              console.log('[Jira Sync] Failed to transition ' + resolvedJiraKey + ' to "' + mappings.status + '". Error: ' + (transitionResponse ? transitionResponse.response : 'No response'));
            }
          } else {
            console.log('[Jira Sync] No matching transition found in Jira for status: "' + mappings.status + '". Skipping transition.');
          }
        } else {
          console.log('[Jira Sync] Failed to fetch transitions for ' + resolvedJiraKey + '. Error: ' + (transitionsResponse ? transitionsResponse.response : 'No response'));
        }
      } else {
        console.log('[Jira Sync][DRY-RUN] Would transition issue to status: "' + mappings.status + '"');
      }
    }
  },
  requirements: {
    'Jira ID': {
      type: entities.Field.stringType,
      name: 'Jira ID'
    },
    State: {
      type: entities.State.fieldType
    },
    Type: {
      type: entities.EnumField.fieldType
    },
    Priority: {
      type: entities.EnumField.fieldType
    },
    Estimation: {
      type: entities.Field.periodType,
      name: 'Estimation'
    },
    Subsystem: {
      type: entities.EnumField.fieldType
    }
  }
});

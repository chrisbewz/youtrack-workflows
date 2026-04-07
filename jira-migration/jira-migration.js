const entities = require('@jetbrains/youtrack-scripting-api/entities');
const search = require('@jetbrains/youtrack-scripting-api/search');
const http = require('@jetbrains/youtrack-scripting-api/http');
const workflow = require('@jetbrains/youtrack-scripting-api/workflow');

/**
 * YouTrack to Jira Migration Workflow
 * Refactored for maintainability using minor mapping functions.
 */

// --- CONFIGURATION ---
// JIRA_AUTH is intentionally absent here. The API token is stored as a secret
// in settings.json and accessed at runtime via ctx.settings.jiraApiToken.
// Store the pre-encoded Base64 value (btoa('email:api-token')) through the app package UI.
const JIRA_URL = `${ctx.settings.jiraEndpointUrl}/rest/api/3`;

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

    // --- MAPPING HELPERS ---
    const JIRA_PROJECT_KEY = issue.project.fields.PID;

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

    const buildJiraPayload = (issue, components) => {
      const jiraPriority = getJiraPriority(issue);
      const jiraIssueType = getJiraIssueType(issue);
      const jiraLabels = getJiraLabels(issue);
      const jiraEstimation = getJiraEstimation(issue);

      const payload = {
        fields: {
          project: { key: JIRA_PROJECT_KEY },
          summary: issue.summary,
          priority: { name: jiraPriority },
          labels: jiraLabels,
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
          issuetype: { name: jiraIssueType }
        }
      };

      if (components && components.length > 0) {
        payload.fields.components = components;
      }

      if (jiraEstimation) {
        payload.fields.timetracking = {
          originalEstimate: jiraEstimation,
          remainingEstimate: jiraEstimation
        };
      }

      return payload;
    };

    // --- CONNECTION SETUP ---
    const connection = new http.Connection(JIRA_URL, null, 2000);
    connection.addHeader('Authorization', 'Basic ' + ctx.settings.jiraApiToken);
    connection.addHeader('Content-Type', 'application/json');

    // --- EXECUTION LOGIC ---
    const syncMode = issue.fields['Jira Sync'] ? issue.fields['Jira Sync'].name : 'Disabled';

    if (syncMode === 'Disabled') {
      console.log('[Jira Sync] Sync disabled for issue: ' + issue.id + '. Skipping.');
      return;
    }

    const isDryRun = syncMode === 'Dry-Run';

    // --- TRIGGER SUMMARY ---
    // Logged in both modes: gives visibility over what caused the workflow to run,
    // useful for auditing and debugging both in dry-run and in production.
    const changes = buildChangeSummary(issue);
    console.log('[Jira Sync] Triggered for issue: ' + issue.id + ' | Mode: ' + syncMode);
    console.log('[Jira Sync] Changes detected: ' + (changes.length > 0 ? changes.join(' | ') : 'none'));

    // --- JIRA CONTEXT ---
    // Logged in both modes to confirm which Jira project and issue are being targeted,
    // making it easy to cross-reference logs with the Jira side.
    const jiraDataKey = issue.fields['Jira ID'] || null;
    const isUpdate = !!jiraDataKey;
    console.log('[Jira Sync] Jira Project Key: ' + JIRA_PROJECT_KEY);
    console.log('[Jira Sync] Jira Issue ID: ' + (jiraDataKey || 'not yet assigned') + ' | Operation: ' + (isUpdate ? 'UPDATE' : 'CREATE'));

    // --- EVALUATED MAPPINGS ---
    // Logged in both modes so you can always trace how YouTrack values were translated
    // to Jira equivalents, regardless of whether the run is a simulation or not.
    const jiraStatus = getJiraStatus(issue);
    const jiraIssueType = getJiraIssueType(issue);
    const jiraLabels = getJiraLabels(issue);
    const jiraEstimation = getJiraEstimation(issue);
    console.log('[Jira Sync] Mappings → IssueType: ' + jiraIssueType + ' | Priority: ' + getJiraPriority(issue) + ' | Status: ' + jiraStatus);
    console.log('[Jira Sync] Mappings → Labels: [' + (jiraLabels.length > 0 ? jiraLabels.join(', ') : 'none') + '] | Estimation: ' + (jiraEstimation || 'none'));
    if (issue.fields.Subsystem) {
      console.log('[Jira Sync] Mappings → Subsystem: "' + issue.fields.Subsystem.name + '" (component lookup ' + (isDryRun ? 'skipped in dry-run' : 'will be resolved') + ')');
    }

    // FIX: Dry-Run previously triggered a real HTTP call to fetch Jira components,
    // making the simulation not fully offline. Component lookup is now skipped in dry-run.
    const jiraComponents = isDryRun ? [] : getJiraComponents(issue, connection, JIRA_PROJECT_KEY);
    const jiraPayload = buildJiraPayload(issue, jiraComponents);

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
      const commentCount = issue.comments.size || 0;
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
    if (jiraStatus && jiraStatus !== 'To Do') {
      if (!isDryRun) {
        const transitionsResponse = connection.getSync('/issue/' + resolvedJiraKey + '/transitions');
        if (transitionsResponse && transitionsResponse.code === 200) {
          const transitions = JSON.parse(transitionsResponse.response).transitions;
          const transition = transitions.find(t => t.to.name === jiraStatus);
          if (transition) {
            const transitionPayload = { transition: { id: transition.id } };
            const transitionResponse = connection.postSync('/issue/' + resolvedJiraKey + '/transitions', {}, JSON.stringify(transitionPayload));
            if (!transitionResponse || transitionResponse.code !== 204) {
              console.log('[Jira Sync] Failed to transition ' + resolvedJiraKey + ' to "' + jiraStatus + '". Error: ' + (transitionResponse ? transitionResponse.response : 'No response'));
            }
          } else {
            console.log('[Jira Sync] No matching transition found in Jira for status: "' + jiraStatus + '". Skipping transition.');
          }
        } else {
          console.log('[Jira Sync] Failed to fetch transitions for ' + resolvedJiraKey + '. Error: ' + (transitionsResponse ? transitionsResponse.response : 'No response'));
        }
      } else {
        console.log('[Jira Sync][DRY-RUN] Would transition issue to status: "' + jiraStatus + '"');
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
    'Jira Sync': {
      type: entities.EnumField.fieldType,
      name: 'Jira Sync'
    },
    Subsystem: {
      type: entities.EnumField.fieldType
    }
  }
});

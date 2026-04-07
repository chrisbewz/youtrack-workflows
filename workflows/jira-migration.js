const entities = require('@jetbrains/youtrack-scripting-api/entities');
const http = require('@jetbrains/youtrack-scripting-api/http');
const workflow = require('@jetbrains/youtrack-scripting-api/workflow');

/**
 * YouTrack to Jira Migration Workflow
 * Refactored for maintainability using minor mapping functions.
 */

exports.rule = entities.Issue.onChange({
  title: 'Migrate to Jira',
  guard: (ctx) => {
    // We migrate if the issue is reported.
    return ctx.issue.isReported;
  },
  action: (ctx) => {
    const issue = ctx.issue;

    // --- CONFIGURATION ---
    const JIRA_URL = 'https://jiracloudweg.atlassian.net/rest/api/3';
    const JIRA_AUTH = 'Basic ' + Buffer.from('christianb@weg.net:your-api-token').toString('base64');
    const JIRA_PROJECT_KEY = 'PROJ';

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
            console.log('Component match not found in Jira for subsystem: ' + subsystemName + '. Skipping component setup.');
          }
        } else {
          console.log('Failed to fetch components from Jira. Skipping component setup.');
        }
      }
      return jiraComponents;
    };

    const getJiraEstimation = (issue) => {
      // YouTrack Estimation field returns a Period in minutes
      if (issue.fields.Estimation) {
        return issue.fields.Estimation + 'm'; // Jira API v3 accepts 'Nm' format
      }
      return null;
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
    connection.addHeader('Authorization', JIRA_AUTH);
    connection.addHeader('Content-Type', 'application/json');

    // --- EXECUTION LOGIC ---
    const syncMode = issue.fields['Jira Sync'] ? issue.fields['Jira Sync'].name : 'Disabled';

    if (syncMode === 'Disabled') {
      console.log('Jira Sync is Disabled. Skipping changes for item: ' + issue.id);
      return;
    }

    const isDryRun = syncMode === 'Dry-Run';
    const jiraStatus = getJiraStatus(issue);
    const jiraComponents = getJiraComponents(issue, connection, JIRA_PROJECT_KEY);

    if (isDryRun) {
      console.log('DRY-RUN: Captured information for item: ' + issue.id);
      console.log('DRY-RUN: Jira Issue Type: ' + getJiraIssueType(issue));
      console.log('DRY-RUN: Jira Priority: ' + getJiraPriority(issue));
      console.log('DRY-RUN: Jira Status Mapping: ' + jiraStatus);
      if (jiraComponents.length > 0) {
        console.log('DRY-RUN: Jira Components: ' + jiraComponents.map(c => c.name).join(', '));
      }
    }

    const jiraPayload = buildJiraPayload(issue, jiraComponents);

    if (isDryRun) {
      console.log('DRY-RUN: Jira Payload: ' + JSON.stringify(jiraPayload, null, 2));
    }

    let jiraDataKey = issue.fields['Jira ID'];
    const isUpdate = !!jiraDataKey;

    if (!isDryRun) {
      if (!isUpdate) {
        // Create new issue
        const response = connection.postSync('/issue', {}, JSON.stringify(jiraPayload));
        if (response && response.code === 201) {
          const jiraData = JSON.parse(response.response);
          jiraDataKey = jiraData.key;
          issue.fields['Jira ID'] = jiraDataKey;
          workflow.message('Issue migrated to Jira: ' + jiraDataKey);
        } else {
          workflow.message('Failed to migrate issue to Jira. Error: ' + response.response);
          return;
        }
      } else {
        // Update existing issue
        const response = connection.putSync('/issue/' + jiraDataKey, {}, JSON.stringify(jiraPayload));
        if (response && response.code === 204) {
          workflow.message('Jira issue updated: ' + jiraDataKey);
        } else {
          workflow.message('Failed to update Jira issue ' + jiraDataKey + '. Error: ' + response.response);
          return;
        }
      }
    } else {
      if (!isUpdate) {
        jiraDataKey = 'DRY-RUN-KEY';
        console.log('DRY-RUN: Skipping actual issue creation in Jira.');
      } else {
        console.log('DRY-RUN: Skipping actual issue update in Jira for ' + jiraDataKey);
      }
    }

    // --- MIGRATE COMMENTS (Only for new issues to avoid duplicates) ---
    if (!isUpdate) {
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
          connection.postSync('/issue/' + jiraDataKey + '/comment', {}, JSON.stringify(commentPayload));
        } else {
          console.log('DRY-RUN: Would migrate comment: "' + comment.text.substring(0, 50) + '..."');
        }
      });
    }

    // --- TRANSITION STATUS IF NEEDED ---
    if (jiraStatus && jiraStatus !== 'To Do') {
      if (!isDryRun) {
        const transitionsResponse = connection.getSync('/issue/' + jiraDataKey + '/transitions');
        if (transitionsResponse && transitionsResponse.code === 200) {
          const transitions = JSON.parse(transitionsResponse.response).transitions;
          const transition = transitions.find(t => t.to.name === jiraStatus);
          if (transition) {
            const transitionPayload = { transition: { id: transition.id } };
            connection.postSync('/issue/' + jiraDataKey + '/transitions', {}, JSON.stringify(transitionPayload));
          }
        }
      } else {
        console.log('DRY-RUN: Would transition issue to Jira status: ' + jiraStatus);
      }
    }
  },
  requirements: {
    'Jira ID': {
      type: entities.Field.stringType,
      name: 'Jira ID'
    },
    'State': {
      type: entities.State.fieldType
    },
    'Type': {
      type: entities.EnumField.fieldType
    },
    'Priority': {
      type: entities.EnumField.fieldType
    },
    'Estimation': {
      type: entities.Field.periodType,
      name: 'Estimation'
    },
    'Jira Sync': {
      type: entities.EnumField.fieldType,
      name: 'Jira Sync'
    },
    'Subsystem': {
      type: entities.EnumField.fieldType
    }
  }
});

const entities = require('@jetbrains/youtrack-scripting-api/entities');
const workflow = require('@jetbrains/youtrack-scripting-api/workflow');
const syncCore = require('./sync-core');

/**
 * Action rule — Adds a "Check Jira Status" button to individual issues.
 *
 * Fetches the current status of the linked Jira issue and updates the `Jira Closed`
 * field on the YouTrack issue accordingly. If the Jira issue is in a "done" status
 * category, `Jira Closed` is set to true and subsequent syncs will be suppressed
 * (unless `overrideCompleted` is enabled for the project).
 *
 * Available in both Enabled and Dry-Run modes, but only when a `Jira ID` is set —
 * there is nothing to check if the issue has not been synced yet.
 *
 * When `verboseNotify` is enabled, the result is surfaced via workflow.message().
 */

exports.rule = entities.Issue.action({
  title: 'Jira Status Check',
  command: 'Check Jira Status',
  guard: (ctx) => {
    const syncMode = ctx.settings.syncMode || 'Disabled';
    return syncMode !== 'Disabled' &&
      ctx.issue.isReported &&
      !!ctx.issue.fields['Jira ID'];
  },
  action: (ctx) => {
    const verboseNotify = ctx.settings.verboseNotify === true || ctx.settings.verboseNotify === 'true';
    const collector = verboseNotify ? [] : null;

    const result = syncCore.checkJiraStatus(ctx.issue, ctx, collector);

    if (verboseNotify && collector && collector.length > 0) {
      workflow.message(collector.join('\n'));
    }

    if (!result.skipped) {
      const statusMsg = result.jiraClosed
        ? 'Jira issue ' + result.jiraKey + ' is closed. Sync suppressed for this issue.'
        : 'Jira issue ' + result.jiraKey + ' is active. Sync remains enabled.';
      workflow.message(statusMsg);
    }
  },
  requirements: {
    'Jira ID': {
      type: entities.Field.stringType,
      name: 'Jira ID'
    },
    'Jira State': {
      type: entities.EnumField.fieldType,
      name: 'Jira State'
    },
    State: {
      type: entities.State.fieldType
    },
    Type: {
      type: entities.EnumField.fieldType
    }
  }
});

const entities = require('@jetbrains/youtrack-scripting-api/entities');
const workflow = require('@jetbrains/youtrack-scripting-api/workflow');
const syncCore = require('./sync-core');

/**
 * Action rule — exports only YouTrack work items to the linked Jira issue.
 * It deliberately avoids the regular issue payload, comments, links, and status sync.
 */
exports.rule = entities.Issue.action({
  title: 'Jira Worklog Sync',
  command: 'Sync Jira Worklogs',
  guard: ctx => {
    const mode = ctx.settings.syncMode || 'Disabled';
    return ctx.issue.isReported &&
      mode !== 'Disabled' &&
      ctx.settings.worklogSyncMode === 'Enabled' &&
      !!ctx.issue.fields['Jira ID'];
  },
  action: ctx => {
    const collector = [];
    syncCore.syncOnlyWorklogs(ctx.issue, ctx, collector);
    workflow.message(collector.join('\n'));
  },
  requirements: {
    'Jira ID': {
      type: entities.Field.stringType,
      name: 'Jira ID'
    }
  }
});

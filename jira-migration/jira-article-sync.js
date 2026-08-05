const entities = require('@jetbrains/youtrack-scripting-api/entities');
const workflow = require('@jetbrains/youtrack-scripting-api/workflow');
const { syncIssueArticles } = require('./jira-article-sync-service');

exports.rule = entities.Issue.onChange({
  title: 'Jira Referenced Article Sync',
  guard: ctx => ctx.issue.isReported && (
    ctx.issue.becomesReported ||
    ctx.issue.oldValue('description') !== null ||
    ctx.issue.oldValue('Jira ID') !== null
  ),
  action: ctx => {
    try {
      const result = syncIssueArticles(ctx.issue, ctx.settings);
      if (result.status === 'dry-run') {
        workflow.message('Jira Article Sync (Dry-Run) | uploads: ' + result.plan.uploads.length +
          ' | remoções: ' + result.plan.removals.length);
      } else if (result.status === 'partial') {
        workflow.message('Jira Article Sync parcial: ' + result.errors.join(' | '));
      }
    } catch (error) {
      console.log('[Jira Article Sync] ' + error);
      workflow.check(false, 'Jira Article Sync falhou: ' + error.message);
    }
  },
  requirements: {
    'Jira ID': {
      type: entities.Field.stringType,
      name: 'Jira ID'
    }
  }
});

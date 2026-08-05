const entities = require('@jetbrains/youtrack-scripting-api/entities');
const workflow = require('@jetbrains/youtrack-scripting-api/workflow');
const { getIssueTree, syncIssueLinks } = require('./link-sync-service');
const { createLinkDependencies } = require('./jira-link-runtime');
const { getFieldValueName } = require('./sync-decisions');

exports.rule = entities.Issue.action({
  title: 'Jira Link Sync',
  command: 'Sync Jira Links',
  guard: ctx => {
    const issue = ctx.issue;
    const projectMode = ctx.settings.linkSyncMode || 'Disabled';
    const issueMode = getFieldValueName(issue.fields['Jira Link Sync']);
    const effectiveMode = issueMode || projectMode;
    return issue.isReported && effectiveMode !== 'Disabled' &&
      getFieldValueName(issue.fields['Jira Sync']) === 'Enabled' &&
      !!getFieldValueName(issue.fields['Jira ID']);
  },
  action: ctx => {
    try {
      const results = [];
      getIssueTree(ctx.issue).forEach(issue => {
        const issueMode = getFieldValueName(issue.fields['Jira Link Sync']);
        const effectiveMode = issueMode || ctx.settings.linkSyncMode || 'Disabled';
        const snapshotField = issue.project.findFieldByName('Jira Link Snapshot');
        workflow.check(
          effectiveMode === 'Dry-Run' || ctx.settings.syncMode === 'Dry-Run' ||
            effectiveMode === 'Disabled' || !!snapshotField,
          'Adicione o campo string opcional "Jira Link Snapshot" ao projeto antes da sincronização de links.'
        );
        results.push(syncIssueLinks(issue, ctx.settings, createLinkDependencies(ctx, issue.project)));
      });

      const processed = results.filter(result => result.plan);
      const total = (side, operation) => processed.reduce(
        (sum, result) => sum + result.plan[side][operation].length,
        0
      );
      const conflicts = processed.reduce((sum, result) => sum + result.plan.conflicts.length, 0);
      workflow.message('Jira Link Sync | itens: ' + processed.length +
        ' | Jira +' + total('jira', 'add') + '/-' + total('jira', 'remove') +
        ' | YouTrack +' + total('youtrack', 'add') + '/-' + total('youtrack', 'remove') +
        ' | conflitos: ' + conflicts);
    } catch (error) {
      console.log('[Jira Link Sync] ' + error);
      workflow.check(false, 'Jira Link Sync falhou: ' + error.message);
    }
  },
  requirements: {
    'Jira ID': { type: entities.Field.stringType, name: 'Jira ID' }
  }
});

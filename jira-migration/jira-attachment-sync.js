const entities = require('@jetbrains/youtrack-scripting-api/entities');
const http = require('@jetbrains/youtrack-scripting-api/http');
const workflow = require('@jetbrains/youtrack-scripting-api/workflow');
const { getFieldValueName } = require('./sync-decisions');
const { isAttachmentSyncEligible, buildUploadPlan } = require('./attachment-sync-service');
const { createJiraConnection, getJiraConfigurationError } = require('./jira-auth');
const { uploadAttachments } = require('./attachment-sync-runtime');

// YouTrack provides IssueAttachment.content as an InputStream and supports it
// directly in multipart parts:
// https://www.jetbrains.com/help/youtrack/devportal/v1-IssueAttachment.html
// https://www.jetbrains.com/help/youtrack/devportal/JS-Workflow-REST-API.html
// Jira requires a multipart part named "file" and X-Atlassian-Token: no-check:
// https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-attachments/
exports.rule = entities.Issue.onChange({
  title: 'Jira Attachment Sync',
  guard: ctx => isAttachmentSyncEligible(ctx.issue, ctx.settings) &&
    ctx.issue.attachments.added.isNotEmpty(),
  action: ctx => {
    try {
      const jiraConfigurationError = getJiraConfigurationError(ctx.settings);
      workflow.check(!jiraConfigurationError,
        jiraConfigurationError || 'Configure Jira authentication before synchronizing attachments.');

      const added = [];
      ctx.issue.attachments.added.forEach(attachment => added.push(attachment));
      const plan = buildUploadPlan(added, ctx.settings);

      if (plan.uploads.length > 0) {
        const connection = createJiraConnection(http, ctx.settings, 15000);
        uploadAttachments(connection, getFieldValueName(ctx.issue.fields['Jira ID']), plan.uploads);
      }

      const skipped = plan.skipped.map(item => item.name + ' (' + item.reason + ')');
      workflow.message('Jira Attachment Sync | enviados: ' + plan.uploads.length +
        ' | ignorados: ' + plan.skipped.length +
        (skipped.length ? ' | ' + skipped.join(', ') : ''));
    } catch (error) {
      console.log('[Jira Attachment Sync] ' + error);
      workflow.check(false, 'Jira Attachment Sync falhou: ' + error.message);
    }
  },
  requirements: {
    'Jira ID': {
      type: entities.Field.stringType,
      name: 'Jira ID'
    },
  }
});

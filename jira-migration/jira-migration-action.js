const entities = require('@jetbrains/youtrack-scripting-api/entities');
const workflow = require('@jetbrains/youtrack-scripting-api/workflow');
const syncCore = require('./sync-core');

/**
 * Action rule — Adds a "Sync to Jira" command button to individual issues.
 * Allows forcing sync on demand, useful for issues that predate the workflow
 * or that need a manual re-sync after a failure.
 *
 * The button is available in both Enabled and Dry-Run modes.
 * Status transition is always attempted since the intent is a full sync.
 *
 * When the global `verboseNotify` setting is enabled, all sync log lines are
 * collected and surfaced via workflow.message() — useful in YouTrack Cloud
 * where server-side console logs are not accessible to users.
 */

exports.rule = entities.Issue.action({
  title: 'Jira Manual Sync',
  command: 'Sync to Jira',
  guard: (ctx) => {
    const syncMode = ctx.settings.syncMode || 'Disabled';
    return syncMode !== 'Disabled' && ctx.issue.isReported;
  },
  action: (ctx) => {
    const user = ctx.currentUser ? ctx.currentUser.login : 'unknown';

    // YouTrack may return boolean settings as the string "true" instead of the
    // boolean true — using strict equality (=== true) silently evaluates to false.
    // Normalizing with a loose truthy check covers both cases.
    const verboseNotify = ctx.settings.verboseNotify === true || ctx.settings.verboseNotify === 'true';
    const channelRaw = ctx.settings.notificationChannel;
    const hasExternalChannel = !!channelRaw && channelRaw !== 'Disabled';

    // Diagnostic: always surface the raw settings values so misconfiguration is visible.
    // This message fires regardless of verboseNotify and before any sync logic runs.
    workflow.message(
      '[Jira Sync] Action triggered by: ' + user +
      ' | verboseNotify raw: ' + JSON.stringify(ctx.settings.verboseNotify) +
      ' | notificationChannel: ' + JSON.stringify(channelRaw)
    );

    // Collector is only allocated when at least one output channel needs log lines.
    const needsCollector = verboseNotify || hasExternalChannel;
    const collector = needsCollector ? [] : null;

    syncCore.performSync(ctx.issue, ctx, 'Manual sync requested by ' + user, true, collector);

    if (collector && collector.length > 0) {
      // Surface logs in the YouTrack UI as a notification popup.
      if (verboseNotify) {
        workflow.message(collector.join('\n'));
      }
      // Dispatch to the configured external notification channel (ntfy / Teams / Slack).
      if (hasExternalChannel) {
        syncCore.notifyChannel(ctx.settings, ctx.issue.id, collector);
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

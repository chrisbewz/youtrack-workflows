const entities = require('@jetbrains/youtrack-scripting-api/entities');
const syncCore = require('./sync-core');

/**
 * onSchedule rule — Periodically syncs reported issues that have no Jira ID yet.
 *
 * Designed to handle projects with pre-existing issues when the workflow is first enabled,
 * or to recover issues that were skipped due to errors in previous runs.
 *
 * Runs daily at 03:00 (Quartz cron: seconds minutes hours day month weekday).
 * To change the schedule, update the cron expression below.
 * Reference: https://www.quartz-scheduler.org/documentation/quartz-2.x/tutorials/crontrigger.html
 *
 * The guard filters to Enabled mode only — Dry-Run is intentionally excluded here
 * to avoid running a scheduled simulation that could be noisy without explicit intent.
 * Use the "Sync to Jira" action button on individual issues for dry-run testing.
 */

exports.rule = entities.Issue.onSchedule({
  title: 'Jira Bulk Sync (Unsynced Issues)',
  // Selects reported issues without a Jira ID — i.e. not yet synced.
  // The guard further filters by project syncMode, so only enabled projects are processed.
  search: 'has: -{Jira ID} #Reported',
  cron: '0 0 3 * * ?',
  guard: (ctx) => {
    const syncMode = ctx.settings.syncMode || 'Disabled';
    return syncMode === 'Enabled' &&
      !!ctx.settings.jiraProjectSlug &&
      !!ctx.settings.jiraApiToken &&
      !!ctx.settings.jiraEndpointUrl;
  },
  action: (ctx) => {
    // Status transition is always attempted for bulk sync — the issue may have
    // any state and Jira should reflect it from the first sync.
    syncCore.performSync(ctx.issue, ctx, 'Scheduled bulk sync (unsynced issue)', true);
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

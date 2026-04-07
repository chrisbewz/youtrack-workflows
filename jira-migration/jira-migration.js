const entities = require('@jetbrains/youtrack-scripting-api/entities');
const syncCore = require('./sync-core');

/**
 * onChange rule — Syncs a YouTrack issue to Jira whenever a mapped field changes.
 * Core sync logic lives in sync-core.js and is shared with the action and schedule rules.
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

// Builds a human-readable list of what changed in this onChange cycle.
const buildChangeSummary = (issue) => {
  const changes = [];

  if (issue.becomesReported) {
    changes.push('Issue became reported (new)');
  }

  const oldSummary = issue.oldValue('summary');
  if (oldSummary !== null) {
    changes.push('Summary: "' + oldSummary + '" → "' + issue.summary + '"');
  }

  // Description diff omitted to avoid flooding logs with large text blocks.
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

exports.rule = entities.Issue.onChange({
  title: 'Jira Sync',
  guard: (ctx) => shouldEvalRule(ctx),
  action: (ctx) => {
    const issue = ctx.issue;
    const changes = buildChangeSummary(issue);
    const triggerReason = changes.length > 0 ? changes.join(' | ') : 'Field changes';

    // Transition should only be attempted when the state actually changed.
    const stateChanged = issue.becomesReported || issue.fields.State.isChanged;

    syncCore.performSync(issue, ctx, triggerReason, stateChanged);
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

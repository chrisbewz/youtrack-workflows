const WORK_ITEM_PROPERTY_KEY = 'youtrack-work-item';
const { describeError } = require('./error-message');

const toArray = collection => {
  const values = [];
  if (collection && typeof collection.forEach === 'function') collection.forEach(value => values.push(value));
  return values;
};

const getDurationMinutes = workItem => {
  if (typeof workItem.duration === 'number') return workItem.duration;
  return workItem.duration && workItem.duration.minutes;
};

const toJiraStartedDate = timestamp => new Date(timestamp).toISOString().replace('Z', '+0000');

const getExportedWorkItemIds = jiraWorklogs => {
  const exported = {};
  jiraWorklogs.forEach(worklog => {
    toArray(worklog.properties).forEach(property => {
      if (property.key === WORK_ITEM_PROPERTY_KEY && property.value && property.value.id !== undefined) {
        exported[String(property.value.id)] = true;
      }
    });
  });
  return exported;
};

const buildJiraWorklog = workItem => ({
  timeSpentSeconds: getDurationMinutes(workItem) * 60,
  started: toJiraStartedDate(workItem.date),
  comment: workItem.description || '',
  properties: [{
    key: WORK_ITEM_PROPERTY_KEY,
    value: {
      id: String(workItem.id),
      author: workItem.author && workItem.author.login || null,
      type: workItem.type && workItem.type.name || null
    }
  }]
});

const syncWorklogs = (issue, jiraKey, dependencies, log) => {
  const result = { exported: 0, skipped: 0, failed: 0 };
  const workItems = toArray(issue.workItems);
  const exportedIds = getExportedWorkItemIds(dependencies.fetchJiraWorklogs(jiraKey));

  workItems.forEach(workItem => {
    const workItemId = String(workItem.id);
    const durationMinutes = getDurationMinutes(workItem);
    if (!workItem.id || !Number.isFinite(durationMinutes) || durationMinutes <= 0 || !Number.isFinite(workItem.date)) {
      result.skipped += 1;
      log('[Jira Sync] Work item ' + workItemId + ' skipped: invalid id, duration, or date.');
      return;
    }
    if (exportedIds[workItemId]) {
      result.skipped += 1;
      return;
    }

    try {
      dependencies.createJiraWorklog(jiraKey, buildJiraWorklog(workItem));
      exportedIds[workItemId] = true;
      result.exported += 1;
    } catch (error) {
      result.failed += 1;
      log('[Jira Sync] Work item ' + workItemId + ' failed to export: ' + describeError(error));
    }
  });

  log('[Jira Sync] Worklogs: exported ' + result.exported + ', skipped ' + result.skipped + ', failed ' + result.failed + '.');
  return result;
};

module.exports = {
  WORK_ITEM_PROPERTY_KEY,
  buildJiraWorklog,
  getExportedWorkItemIds,
  syncWorklogs
};

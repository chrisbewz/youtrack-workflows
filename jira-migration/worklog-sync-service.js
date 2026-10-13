const WORK_ITEM_PROPERTY_KEY = 'youtrack-work-item';
const { describeError } = require('./error-message');
const { describeWorkItemsRuntime } = require('./worklog-runtime-diagnostics');

const toArray = collection => {
  const values = [];
  const size = collection && Number(collection.size);
  if (collection && typeof collection.get === 'function' && Number.isFinite(size) && size >= 0) {
    for (let index = 0; index < size; index += 1) values.push(collection.get(index));
    return values;
  }
  if (collection && typeof collection.forEach === 'function') {
    collection.forEach(function(value) { values.push(value); });
  }
  return values;
};

const getDurationMinutes = workItem => {
  if (typeof workItem.duration === 'number') return workItem.duration;
  return workItem.duration && workItem.duration.minutes;
};

const getWorkItemTimestamp = workItem => {
  if (typeof workItem.date === 'number') return workItem.date;
  return Date.parse(workItem.date);
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
  started: toJiraStartedDate(getWorkItemTimestamp(workItem)),
  comment: workItem.description || workItem.text || '',
  properties: [{
    key: WORK_ITEM_PROPERTY_KEY,
    value: {
      id: String(workItem.id),
      author: workItem.author && workItem.author.login || null,
      type: workItem.type && workItem.type.name || null
    }
  }]
});

const syncWorklogs = (issue, jiraKey, dependencies, log, options) => {
  const result = { exported: 0, skipped: 0, failed: 0 };
  if (options && options.diagnostics) {
    const diagnostics = describeWorkItemsRuntime(issue.workItems);
    log('[Jira Sync][Diagnostic] workItems collection: ' + diagnostics.collection);
    diagnostics.items.forEach(item => log('[Jira Sync][Diagnostic] workItem ' + item));
  }
  const workItems = toArray(issue.workItems);
  const exportedIds = getExportedWorkItemIds(dependencies.fetchJiraWorklogs(jiraKey));

  workItems.forEach(workItem => {
    const workItemId = String(workItem.id);
    const durationMinutes = getDurationMinutes(workItem);
    if (!workItem.id || !Number.isFinite(durationMinutes) || durationMinutes <= 0 || !Number.isFinite(getWorkItemTimestamp(workItem))) {
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
  toArray,
  buildJiraWorklog,
  getExportedWorkItemIds,
  syncWorklogs
};

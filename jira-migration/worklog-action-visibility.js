/**
 * The manual worklog action must remain discoverable even when a project is
 * not configured for worklog synchronization. syncOnlyWorklogs performs the
 * detailed validation and reports the reason to the user when it is invoked.
 */
const canShowWorklogSyncAction = issue => !!issue.isReported;

module.exports = { canShowWorklogSyncAction };

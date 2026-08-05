const getJiraStatus = (issue, settings) => {
  const stateName = issue.fields.State.name;

  const parseStates = (raw, defaults) => {
    const src = (raw && raw.trim()) ? raw : defaults;
    return src.split(',').map(value => value.trim()).filter(Boolean);
  };

  const doneStates = parseStates(
    settings.statusDoneStates,
    "Fixed,Verified,Closed,Can't Reproduce,Duplicate,Won't fix,Incomplete"
  );
  const inProgressStates = parseStates(settings.statusInProgressStates, 'In Progress');

  if (doneStates.indexOf(stateName) !== -1) return 'Done';
  if (inProgressStates.indexOf(stateName) !== -1) return 'In Progress';
  return 'To Do';
};

const getJiraIssueType = (issue, settings) => {
  const typeName = issue.fields.Type ? issue.fields.Type.name : '';

  if (typeName === (settings.epicItemType || 'Epic')) return 'Epic';
  if (typeName === (settings.storyItemType || 'Feature')) return 'Story';
  if (typeName === (settings.taskItemType || 'Task')) return 'Task';
  if (typeName === (settings.subTaskItemType || 'Subtask')) return 'Sub-task';

  const legacyMapping = {
    Bug: 'Bug',
    Improvement: 'Story'
  };
  return legacyMapping[typeName] || 'Task';
};

const getJiraPriority = (issue, settings) => {
  const priorityName = issue.fields.Priority.name;
  const tiers = [
    {
      ytName: settings.priorityHighestName || 'Show-stopper',
      jiraName: settings.priorityHighestNameJira || 'Highest'
    },
    {
      ytName: settings.priorityHighName || 'Critical',
      jiraName: settings.priorityHighNameJira || 'High'
    },
    {
      ytName: settings.priorityMediumName || 'Normal',
      jiraName: settings.priorityMediumNameJira || 'Medium'
    },
    {
      ytName: settings.priorityLowName || 'Minor',
      jiraName: settings.priorityLowNameJira || 'Low'
    }
  ];

  const matched = tiers.find(tier => tier.ytName === priorityName);
  if (matched) return matched.jiraName;
  if (priorityName === 'Major') return settings.priorityMediumNameJira || 'Medium';
  return settings.priorityMediumNameJira || 'Medium';
};

const isJiraStatusClosed = statusCategory => statusCategory === 'done';

module.exports = { getJiraStatus, getJiraIssueType, getJiraPriority, isJiraStatusClosed };

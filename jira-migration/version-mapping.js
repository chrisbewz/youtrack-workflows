const valueName = value => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  return String(value.name || value.presentation || '').trim();
};

const getYouTrackVersionNames = (issue, fieldName) => {
  if (!fieldName || !issue || !issue.fields) return [];
  const value = issue.fields[fieldName];
  if (!value) return [];

  const names = [];
  if (typeof value.forEach === 'function') {
    value.forEach(item => names.push(valueName(item)));
  } else {
    names.push(valueName(value));
  }
  return names.filter((name, index) => name && names.indexOf(name) === index);
};

const versionLabel = (name, prefix) => {
  const slug = name.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug ? prefix + slug : '';
};

const buildVersionPlan = options => {
  const versionNames = options.versionNames || [];
  const jiraVersions = options.jiraVersions || [];
  const prefix = options.labelPrefix || 'yt-version-';
  const available = options.jiraFieldAvailable && options.jiraFieldId;
  const byName = {};
  jiraVersions.forEach(version => {
    byName[String(version.name || '').trim().toLowerCase()] = version;
  });

  const matches = [];
  const fallbackNames = [];
  versionNames.forEach(name => {
    const match = available && byName[name.toLowerCase()];
    if (match) matches.push(match);
    else fallbackNames.push(name);
  });

  const labels = (options.existingLabels || []).filter(label => label.indexOf(prefix) !== 0);
  fallbackNames.forEach(name => {
    const label = versionLabel(name, prefix);
    if (label && labels.indexOf(label) === -1) labels.push(label);
  });

  const fields = { labels };
  if (available) fields[options.jiraFieldId] = matches.map(version => ({ id: version.id }));

  return {
    fields,
    versionNamesInField: matches.map(version => version.name),
    versionNamesInLabels: fallbackNames
  };
};

module.exports = { getYouTrackVersionNames, buildVersionPlan, versionLabel };

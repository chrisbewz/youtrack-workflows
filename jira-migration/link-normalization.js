const { getFieldValueName } = require('./sync-decisions');

const parseLinkTypeMapping = raw => {
  let mapping;
  try {
    mapping = JSON.parse(raw || '{}');
  } catch (error) {
    throw new Error('linkTypeMappingJson inválido: ' + error.message);
  }

  Object.keys(mapping).forEach(linkName => {
    const entry = mapping[linkName];
    if (!entry || typeof entry.jiraType !== 'string' || !entry.jiraType.trim()) {
      throw new Error('linkTypeMappingJson: jiraType ausente para "' + linkName + '"');
    }
    if (!entry.symmetric && entry.jiraSide !== 'outward' && entry.jiraSide !== 'inward') {
      throw new Error('linkTypeMappingJson: jiraSide deve ser outward ou inward para "' + linkName + '"');
    }
  });

  return mapping;
};

const addLink = (state, pair, jiraType) => {
  if (!state[pair]) state[pair] = [];
  if (state[pair].indexOf(jiraType) === -1) state[pair].push(jiraType);
  state[pair].sort();
};

const symmetricPair = (left, right) => [left, right].sort().join('|');

const mappingEntriesForJiraType = (mapping, jiraType) => Object.keys(mapping)
  .map(linkName => ({ linkName, ...mapping[linkName] }))
  .filter(entry => entry.jiraType === jiraType);

const normalizeJiraLinks = (currentJiraKey, jiraLinks, mapping) => {
  const state = {};
  const linkIds = {};

  (jiraLinks || []).forEach(link => {
    const jiraType = link.type && link.type.name;
    const entries = mappingEntriesForJiraType(mapping, jiraType);
    if (entries.length === 0) return;

    const remoteOutwardKey = link.outwardIssue && link.outwardIssue.key;
    const remoteInwardKey = link.inwardIssue && link.inwardIssue.key;
    const isSymmetric = entries.some(entry => entry.symmetric);
    let pair;

    if (isSymmetric) {
      const remoteKey = remoteOutwardKey || remoteInwardKey;
      if (!remoteKey) return;
      pair = symmetricPair(currentJiraKey, remoteKey);
    } else if (remoteInwardKey) {
      pair = currentJiraKey + '>' + remoteInwardKey;
    } else if (remoteOutwardKey) {
      pair = remoteOutwardKey + '>' + currentJiraKey;
    } else {
      return;
    }

    addLink(state, pair, jiraType);
    if (link.id) linkIds[pair + '\u0000' + jiraType] = link.id;
  });

  return { state, linkIds };
};

const normalizeYouTrackLinks = (issue, mapping) => {
  const currentJiraKey = getFieldValueName(issue.fields && issue.fields['Jira ID']);
  const state = {};
  const targets = {};
  const skipped = [];

  Object.keys(mapping).sort().forEach(linkName => {
    const linkSet = issue.links && issue.links[linkName];
    if (!linkSet || typeof linkSet.forEach !== 'function') return;
    const entry = mapping[linkName];

    linkSet.forEach(target => {
      const targetJiraKey = getFieldValueName(target.fields && target.fields['Jira ID']);
      const targetSyncMode = getFieldValueName(target.fields && target.fields['Jira Sync']);
      if (!targetJiraKey) {
        skipped.push({ linkName, reason: 'target sem Jira ID' });
        return;
      }
      if (targetSyncMode !== 'Enabled') {
        skipped.push({ linkName, reason: 'target com Jira Sync diferente de Enabled' });
        return;
      }

      let pair;
      if (entry.symmetric) pair = symmetricPair(currentJiraKey, targetJiraKey);
      else if (entry.jiraSide === 'outward') pair = currentJiraKey + '>' + targetJiraKey;
      else pair = targetJiraKey + '>' + currentJiraKey;

      addLink(state, pair, entry.jiraType);
      targets[targetJiraKey] = target;
    });
  });

  return { state, targets, skipped };
};

const resolveLinkOperation = (currentJiraKey, operation, mapping) => {
  const symmetric = operation.pair.indexOf('|') !== -1;
  const separator = symmetric ? '|' : '>';
  const endpoints = operation.pair.split(separator);
  const outwardKey = endpoints[0];
  const inwardKey = endpoints[1];
  if (currentJiraKey !== outwardKey && currentJiraKey !== inwardKey) {
    throw new Error('Issue ' + currentJiraKey + ' não pertence ao par ' + operation.pair);
  }

  const currentSide = currentJiraKey === outwardKey ? 'outward' : 'inward';
  const entry = Object.keys(mapping).sort()
    .map(linkName => ({ linkName, ...mapping[linkName] }))
    .find(candidate => candidate.jiraType === operation.link &&
      (symmetric ? candidate.symmetric : candidate.jiraSide === currentSide));
  if (!entry) {
    throw new Error('Mapeamento reverso ausente para ' + operation.link + ' (' + currentSide + ')');
  }

  return {
    linkName: entry.linkName,
    targetJiraKey: currentJiraKey === outwardKey ? inwardKey : outwardKey,
    jiraPayload: {
      type: { name: operation.link },
      outwardIssue: { key: outwardKey },
      inwardIssue: { key: inwardKey }
    }
  };
};

module.exports = {
  parseLinkTypeMapping,
  normalizeJiraLinks,
  normalizeYouTrackLinks,
  resolveLinkOperation
};

const { getFieldValueName, evaluateSyncDecision } = require('./sync-decisions');

const DEFAULT_MAX_SIZE_KB = 5120;
const DEFAULT_MIME_TYPES = 'image/png,image/jpeg,image/gif,application/pdf,text/plain';
const DEFAULT_RESERVED_LABEL_NAMES = 'jira:no-attachments';

const toArray = collection => {
  const values = [];
  if (collection && typeof collection.forEach === 'function') {
    collection.forEach(value => values.push(value));
  }
  return values;
};

const getReservedLabelNames = settings => {
  const names = [];
  (settings && settings.reservedLabelNames || DEFAULT_RESERVED_LABEL_NAMES)
    .split(',')
    .map(name => name.trim())
    .filter(Boolean)
    .forEach(name => {
      if (names.indexOf(name) === -1) names.push(name);
    });
  return names;
};

const hasReservedLabel = (issue, settings) => {
  const reserved = getReservedLabelNames(settings);
  return toArray(issue && issue.tags).some(tag => tag && reserved.indexOf(tag.name) !== -1);
};

const isAttachmentSyncEnabled = settings => settings && settings.attachmentSyncMode === 'Enabled';

const isAttachmentSyncEligible = (issue, settings) => {
  const decision = evaluateSyncDecision(issue, settings);
  return !!issue && issue.isReported === true &&
    !!getFieldValueName(issue.fields && issue.fields['Jira ID']) &&
    isAttachmentSyncEnabled(settings) &&
    !hasReservedLabel(issue, settings) &&
    decision.shouldSync && !decision.isDryRun;
};

const parseAllowedMimeTypes = value => (value || DEFAULT_MIME_TYPES)
  .split(',')
  .map(type => type.trim())
  .filter(Boolean);

const evaluateAttachment = (attachment, settings) => {
  const maxSizeKb = Number(settings.attachmentMaxSizeKb) || DEFAULT_MAX_SIZE_KB;
  if (attachment.size > maxSizeKb * 1024) {
    return { accepted: false, reason: 'Excede o tamanho máximo de ' + maxSizeKb + ' KB' };
  }
  const allowed = parseAllowedMimeTypes(settings.attachmentAllowedMimeTypes);
  if (allowed.indexOf(attachment.mimeType) === -1) {
    return { accepted: false, reason: 'MIME não permitido: ' + (attachment.mimeType || 'desconhecido') };
  }
  return { accepted: true };
};

const attachmentIdentity = attachment => {
  const name = attachment && (attachment.filename || attachment.name);
  const size = attachment && Number(attachment.size);
  return name && Number.isFinite(size) ? name + '\u0000' + size : null;
};

const buildUploadPlan = (attachments, settings, existingAttachments) => {
  const plan = { uploads: [], skipped: [] };
  const existing = {};
  toArray(existingAttachments).forEach(attachment => {
    const identity = attachmentIdentity(attachment);
    if (identity) existing[identity] = true;
  });
  attachments.forEach(attachment => {
    const decision = evaluateAttachment(attachment, settings);
    if (!decision.accepted) {
      plan.skipped.push({ name: attachment.name, reason: decision.reason });
      return;
    }
    if (existing[attachmentIdentity(attachment)]) {
      plan.skipped.push({ name: attachment.name, reason: 'Já existe no Jira' });
      return;
    }
    plan.uploads.push({
      name: 'file',
      size: attachment.size,
      fileName: attachment.name,
      content: attachment.content
    });
  });
  return plan;
};

module.exports = {
  DEFAULT_MAX_SIZE_KB,
  DEFAULT_MIME_TYPES,
  DEFAULT_RESERVED_LABEL_NAMES,
  toArray,
  getReservedLabelNames,
  hasReservedLabel,
  isAttachmentSyncEnabled,
  isAttachmentSyncEligible,
  evaluateAttachment,
  buildUploadPlan
};

const { getFieldValueName } = require('./sync-decisions');

const DEFAULT_MAX_SIZE_KB = 5120;
const DEFAULT_MIME_TYPES = 'image/png,image/jpeg,application/pdf,text/plain';

const isAttachmentSyncEnabled = issue =>
  getFieldValueName(issue && issue.fields && issue.fields['Jira Attachment Sync']) === 'Enabled';

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

const buildUploadPlan = (attachments, settings) => {
  const plan = { uploads: [], skipped: [] };
  attachments.forEach(attachment => {
    const decision = evaluateAttachment(attachment, settings);
    if (!decision.accepted) {
      plan.skipped.push({ name: attachment.name, reason: decision.reason });
      return;
    }
    plan.uploads.push({
      name: 'file',
      size: attachment.size,
      fileName: attachment.name,
      content: attachment.content,
      contentType: attachment.mimeType
    });
  });
  return plan;
};

module.exports = {
  DEFAULT_MAX_SIZE_KB,
  DEFAULT_MIME_TYPES,
  isAttachmentSyncEnabled,
  evaluateAttachment,
  buildUploadPlan
};

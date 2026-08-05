const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isAttachmentSyncEnabled,
  evaluateAttachment,
  buildUploadPlan
} = require('../jira-migration/attachment-sync-service');

test('YOU-5 keeps attachment sync disabled unless the issue explicitly enables it', () => {
  assert.equal(isAttachmentSyncEnabled({ fields: {} }), false);
  assert.equal(isAttachmentSyncEnabled({ fields: { 'Jira Attachment Sync': { name: 'Disabled' } } }), false);
  assert.equal(isAttachmentSyncEnabled({ fields: { 'Jira Attachment Sync': { name: 'Enabled' } } }), true);
});

test('YOU-5 accepts configured MIME types within the size limit', () => {
  assert.deepEqual(evaluateAttachment(
    { name: 'evidence.pdf', size: 1024, mimeType: 'application/pdf' },
    { attachmentMaxSizeKb: 5, attachmentAllowedMimeTypes: 'image/png, application/pdf' }
  ), { accepted: true });
});

test('YOU-5 rejects oversized and unsupported attachments before reading content', () => {
  assert.match(evaluateAttachment(
    { name: 'large.pdf', size: 6144, mimeType: 'application/pdf' },
    { attachmentMaxSizeKb: 5, attachmentAllowedMimeTypes: 'application/pdf' }
  ).reason, /tamanho/);
  assert.match(evaluateAttachment(
    { name: 'sheet.xlsx', size: 1024, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    { attachmentMaxSizeKb: 5, attachmentAllowedMimeTypes: 'application/pdf' }
  ).reason, /MIME/);
});

test('YOU-5 builds uploads only for accepted newly added attachments', () => {
  const plan = buildUploadPlan([
    { name: 'image.png', size: 100, mimeType: 'image/png', content: 'png-stream' },
    { name: 'archive.zip', size: 100, mimeType: 'application/zip', content: 'zip-stream' }
  ], { attachmentMaxSizeKb: 5120, attachmentAllowedMimeTypes: 'image/png,application/pdf' });

  assert.deepEqual(plan.uploads, [{
    name: 'file', size: 100, fileName: 'image.png', content: 'png-stream', contentType: 'image/png'
  }]);
  assert.deepEqual(plan.skipped, [{ name: 'archive.zip', reason: 'MIME não permitido: application/zip' }]);
});

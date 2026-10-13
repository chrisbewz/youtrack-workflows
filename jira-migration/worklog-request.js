const buildWorklogQuery = startAt => ({
  expand: 'properties',
  startAt: String(startAt),
  maxResults: '1000'
});

module.exports = { buildWorklogQuery };

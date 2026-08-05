const entities = require('@jetbrains/youtrack-scripting-api/entities');
const { syncIssueArticles } = require('./jira-article-sync-service');

// Article.onChange and Article content metadata are documented by YouTrack:
// https://www.jetbrains.com/help/youtrack/devportal/v1-Article.html
exports.rule = entities.Article.onChange({
  title: 'Jira Referenced Article Update Sync',
  guard: ctx => ctx.article.isChanged('content') || ctx.article.isChanged('summary'),
  action: ctx => {
    ctx.article.extensionProperties.jiraMarkdownConsumers.forEach(issue => {
      try {
        const result = syncIssueArticles(issue, ctx.settings);
        if (result.status === 'partial') {
          console.log('[Jira Article Update Sync] ' + issue.id + ': ' + result.errors.join(' | '));
        }
      } catch (error) {
        console.log('[Jira Article Update Sync] ' + issue.id + ': ' + error);
      }
    });
  },
  requirements: {}
});

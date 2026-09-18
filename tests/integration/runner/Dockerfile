FROM node:22-alpine

WORKDIR /workspace

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY scripts ./scripts
COPY tests ./tests
COPY jira-migration ./jira-migration
COPY task-export ./task-export

ENTRYPOINT ["node", "tests/integration/run-workflow-integration.js"]

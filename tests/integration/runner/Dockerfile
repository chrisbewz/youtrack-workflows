ARG NODE_IMAGE=node:22-alpine
FROM ${NODE_IMAGE}

WORKDIR /workspace

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY scripts ./scripts
COPY tests ./tests
COPY jira-migration ./jira-migration
COPY task-export ./task-export

ENTRYPOINT ["node", "tests/integration/run-workflow-integration.js"]

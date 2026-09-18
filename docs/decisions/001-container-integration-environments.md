# ADR-001: Use isolated YouTrack containers with a Jira Cloud sandbox

## Status

Accepted

## Date

2026-09-18

## Context

The repository publishes independently deployable YouTrack workflows. Unit
tests validate shared logic but do not verify package upload or authentication
against the actual integrations. Running Jira Data Center locally would add a
commercial license requirement and a stateful database solely for testing.

## Decision

Each workflow owns a Docker Compose environment under `tests/integration/`.
Every environment starts an isolated local YouTrack Server with persistent
named volumes and a reusable Node runner image.

- `task-export` uses local YouTrack only.
- `jira-migration` uses local YouTrack plus a dedicated Jira Cloud Free
  sandbox supplied through local environment variables or CI secrets.

The runner validates configuration without echoing secret values, waits for
YouTrack, verifies authenticated YouTrack and Jira Cloud access, runs `npm
test`, and uploads the selected local package to the local YouTrack instance.

## Alternatives considered

### Jira Data Center in Docker

Rejected because a durable development license is required and adds Jira and
database lifecycle management to every local test environment.

### An API stub instead of Jira Cloud

Rejected as the sole integration check. A stub is useful for isolated unit
tests but cannot validate the authentication, permission, or response behavior
of the Jira REST API used by the workflow.

### One shared YouTrack container for every workflow

Rejected because workflow settings, data, and package versions could leak
between tests. Separate Compose projects make failures reproducible.

## Consequences

- Docker usage requires one-time, operator-led YouTrack wizard setup and a
  local permanent token; neither is committed.
- Jira Cloud credentials are limited to a dedicated sandbox account and
  project, supplied through ignored `.env.local` files or CI secrets.
- `docker compose down` keeps configured volumes for reuse. `down -v` resets
  the YouTrack wizard state and must only be used intentionally.
- The environment validates packaging and connectivity today. Scenario-level
  workflow fixtures can be added incrementally without changing the isolation
  boundary.

# Repository Guide for Agents

## Purpose

This repository contains independently deployable YouTrack workflows and apps.
Treat each top-level workflow directory as an isolated product: keep its code,
manifest, settings schema, tests, and README aligned.

## Repository layout

| Path | Responsibility |
|---|---|
| `jira-migration/` | Jira Synchronization Manager workflow. |
| `task-export/` | Task Export YouTrack app. |
| `scripts/upload-workflow.js` | Shared staging and upload script. |
| `tests/` | Node test suite for shared and workflow-specific behavior. |
| `tests/integration/` | Isolated Docker Compose environments and integration runner. |
| `mise.toml` | Repository Node version and local validation/integration commands. |
| `README.md` | Repository overview, local configuration, commands, and workflow index. |

## Workflow documentation

Use the root README as the workflow index. Read the workflow-specific README
before changing its behavior or publishing it:

| Workflow | Documentation |
|---|---|
| Jira Synchronization Manager | [`jira-migration/README.md`](jira-migration/README.md) |
| Task Export | [`task-export/README.md`](task-export/README.md) |

Documentation is part of the definition of done for every workflow change. Any
change that affects a workflow's behavior, settings, endpoints, triggers,
required fields, output, permissions, publication process, or operational
limitations **must** update that workflow's README in the same change. Scale the
documentation update to the impact of the change; do not defer it to a later
task. This prevents implementation and workflow documentation from drifting.
Keep workflow documentation in English.

## Maintenance workflow

1. Inspect the relevant manifest, settings schema, implementation, tests, and
   workflow README before making a change.
2. Preserve unrelated working-tree changes. Never add `.npmrc`, `.env`, IDE
   directories, or other local configuration to a change.
3. Add or update a focused regression test for behavior changes.
   For integration-environment changes, update `tests/integration/README.md`
   and the affected workflow README in the same change.
4. Run the narrowest relevant tests, then run the full suite:

   ```powershell
   npm test
   git diff --check
   ```

5. Update the workflow version in its `manifest.json` before an upload when the
   workflow behavior or assets have changed.
6. Confirm the workflow README describes the changed behavior before declaring
   the work complete. Review the root workflow table whenever a workflow is
   added, renamed, or retired.

## Publication

Publication requires explicit user authorization. Upload only the requested
workflow and environment:

```powershell
npm run upload-jira-migration:test
npm run upload-jira-migration:prod
npm run upload-task-export:test
npm run upload-task-export:prod
```

The upload target is configured locally through `.npmrc`; never print, read
back, copy, or commit its tokens. The root [README](README.md) documents the
expected local configuration and the workflow READMEs document the workflow
specific publication context.

## Workflow-specific conventions

- `jira-migration/` uses YouTrack workflow rules. Settings are declared in
  `jira-migration/settings.json`; custom-field names are a compatibility
  contract and must not be changed casually.
- `task-export/` is a YouTrack app. Keep its widget, HTTP handler, settings,
  export artifacts, and dialog behavior coherent. The export operation must
  remain read-only.
- Use UTF-8 source files. Do not alter user-provided local files under
  `.vs/` or any ignored configuration directory.

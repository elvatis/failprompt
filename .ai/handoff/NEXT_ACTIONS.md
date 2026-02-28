# failprompt: Next Actions

> Last updated: 2026-02-28
> Generated from MANIFEST.json task queue.

---

## Status Summary

| Status  | Count |
| ------- | ----- |
| Done    | 3     |
| Ready   | 1     |
| Blocked | 0     |

---

## Ready - Work These Next

### T-004: Add GitLab CI support [medium]

**Goal:** Support GitLab pipelines in addition to GitHub Actions.

**Context:** GitLab uses `CI_JOB_NAME`, `CI_PIPELINE_ID` env vars and `gitlab-ci.yml` log format. The `log-fetcher.ts` needs a GitLab adapter alongside the existing `gh` shell-out.

**What to do:**
- Add a GitLab CI log fetcher that reads pipeline logs via GitLab API or `glab` CLI
- Detect GitLab CI environment variables (`CI_JOB_NAME`, `CI_PIPELINE_ID`)
- Parse GitLab-specific log format (ANSI color codes, section markers)
- Add tests with fixture strings (no real API calls)

**Files:**
- `src/log-fetcher.ts` - add GitLab adapter
- `src/ci-provider.ts` - may need GitLab detection logic
- `src/__tests__/` - new test fixtures for GitLab log format

**Definition of done:** `npm run lint && npm run build && npm test` all pass. GitLab CI logs can be fetched and parsed into the same structured format as GitHub Actions logs.

**GitHub Issue:** [#1](https://github.com/elvatis/failprompt/issues/1)

---

## Blocked

_No blocked tasks._

---

## Recently Completed

| Task | Title | Completed |
| ---- | ----- | --------- |
| T-003 | Add ESLint setup | 2026-02-28 |
| T-001 | Add GitLab CI support (CI_JOB_NAME, CI_PIPELINE_ID env vars, gitlab-ci.yml log format) | 2026-02-27 |
| T-002 | ESLint setup with typescript-eslint strict rules | 2026-02-27 |

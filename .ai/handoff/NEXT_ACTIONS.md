# failprompt: Next Actions

> Last updated: 2026-02-21
> Priority order. Work top-down.

---

## 1. GitLab CI support (Phase 2)

**Goal:** Support GitLab pipelines in addition to GitHub Actions.

GitLab uses `CI_JOB_NAME`, `CI_PIPELINE_ID` env vars and the `gitlab-ci.yml` log format.
The `log-fetcher.ts` would need a GitLab adapter alongside the existing `gh` shell-out.

---

## 3. ESLint setup (optional)

Add `@typescript-eslint/eslint-plugin` with strict rules. Low priority - code is already
clean and type-safe. Nice to have for contribution hygiene.

---

## Recently Completed

| Item | Resolution |
| ---- | ---------- |
| Project setup | Repo initialized, README, AAHP files |
| Research | gh CLI approach confirmed, commander chosen, no competing OSS tools found |
| Architecture | 4-module split (index/log-fetcher/error-extractor/prompt-builder), gh shell-out |
| MVP implementation | 29/29 tests, build clean, npm-ready |
| Review round | Opus: APPROVED, ChatGPT: APPROVED WITH CHANGES |
| Post-review fixes | Env validation, PKCE bounds, redirect URI hardening (adapted from AEGIS pattern) |
| gh log format bug | Parsing fixed: job/step/timestamp prefix now correctly stripped, step name extracted from metadata |
| Integration tests | 3 scenarios: TypeScript error, npm ERR!, Jest failure - all passing |
| GitHub Actions CI | `.github/workflows/ci.yml` live - runs on every push |
| Real E2E test | Tested against own failing CI run (22257459273) - output validated |
| npm publish | v0.1.0 live on npmjs.com/package/failprompt - npx failprompt works globally |
| Blog update | blog.elvatis.com AAHP article section 8.2 updated with npm link + E2E test description |

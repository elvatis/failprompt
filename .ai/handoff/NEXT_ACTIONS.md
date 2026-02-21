# failprompt: Next Actions for Incoming Agent

> Priority order. Work top-down. Each item is self-contained.
> Last updated: 2026-02-21 after AAHP re-run validation.

---

## Status: MVP COMPLETE

The failprompt MVP is fully implemented, tested (29/29), and pushed to main.
Build is clean. npm publish is ready.

---

## 1. npm Publish (Human Action Required)

**Goal:** Make `npx failprompt` work for everyone.

**Steps:**
```bash
cd /home/chef-linux/.openclaw/workspace/failprompt
npm login    # authenticate with npm registry
npm publish  # triggers prepublishOnly (build + test) then publishes
```

**Checklist:**
- `package.json` version is `0.1.0` - bump to `1.0.0` before publish if desired
- `README.md` has correct usage examples
- `bin` field points to `dist/index.js`
- `files` whitelist is set (`dist/`, `README.md`)
- `prepublishOnly` runs build + tests automatically

---

## 2. GitHub Actions CI Workflow (Optional, Low Priority)

**Goal:** Auto-run tests on every push and PR.

Create `.github/workflows/ci.yml`:
```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
      - run: npm run build
      - run: npm test
```

---

## 3. GitLab CI Support (Future Feature)

**Goal:** Support fetching logs from GitLab CI pipelines.

**Research needed:**
- GitLab CI REST API for job logs
- `glab` CLI equivalent of `gh run view --log-failed`
- Log format differences (GitLab uses ANSI sections, different markers)

**Implementation:**
- Add `src/gitlab-fetcher.ts` with GitLab-specific log fetching
- Auto-detect provider from git remote URL (github.com vs gitlab.com)
- Add `--provider gitlab` flag as override

---

## Recently Completed

| Item                      | Resolution                                        |
| ------------------------- | ------------------------------------------------- |
| Project setup             | Repo initialized, README + AAHP files             |
| SONAR research            | gh CLI confirmed, commander confirmed, no existing competitors |
| OPUS architecture         | 4-module split, gh shell-out, 3-tier error heuristics |
| MVP implementation        | 4 modules + 25 tests on feat/mvp                  |
| Review round (4 + ChatGPT)| allErrors rendered, extended heuristics, better gh errors |
| Phase 5 FIX               | 29 tests passing, npm publish ready               |
| AAHP re-run validation    | All phases verified, 29/29 tests pass, main branch |

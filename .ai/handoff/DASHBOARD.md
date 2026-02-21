# failprompt — Build Dashboard

> Updated by agents after every completed task.
> Last updated: 2026-02-21 — initial setup

---

## 🏗️ Build Health

| Check        | Status      | Notes                        |
| ------------ | ----------- | ---------------------------- |
| `tsc --build`| ⏳ Pending  | No code yet                  |
| `npm test`   | ⏳ Pending  | No tests yet                 |
| `npm run lint`| ⏳ Pending | Not configured yet           |

---

## 📦 Modules

| Module                | Status       | Tests  | Notes                            |
| --------------------- | ------------ | ------ | -------------------------------- |
| `src/index.ts`        | ⏳ Pending   | —      | CLI entrypoint                   |
| `src/log-fetcher.ts`  | ⏳ Pending   | —      | `gh run view --log-failed` shell |
| `src/error-extractor.ts` | ⏳ Pending | —    | `##[error]` / `##[group]` parser |
| `src/prompt-builder.ts`  | ⏳ Pending | —    | LLM prompt template              |

---

## 🚀 Distribution

| Channel     | Status         | Notes                           |
| ----------- | -------------- | ------------------------------- |
| npm publish | ⏳ Not yet     | Needs passing build + tests     |
| npx support | ⏳ Not yet     | Needs `bin` field in package.json |
| GitHub CI   | ⏳ Not yet     | No workflows configured         |

---

## 🤖 Pipeline State

| Field          | Value                  |
| -------------- | ---------------------- |
| Current task   | MVP implementation     |
| Phase          | 3 — Sonnet building    |
| Last completed | Opus ADR               |

---

## 📋 Open Tasks (strategic priority)

| # | Task                              | Priority  | Blocked by         | Ready?     |
| - | --------------------------------- | --------- | ------------------ | ---------- |
| 1 | MVP — GitHub Actions support      | 🔴 HIGH   | —                  | 🔄 Running |
| 2 | GitLab CI support                 | 🟠 MEDIUM | MVP must ship first | ⏳ After MVP |
| 3 | Jenkins support                   | 🟡 LOW    | MVP + GitLab first | ⏳ Deferred |
| 4 | npm publish                       | 🟠 MEDIUM | Passing tests      | ⏳ After MVP |

---

## 🔄 Update Instructions (for agents)

1. Update module status rows to ✅ after implementation
2. Update test counts once tests exist
3. Update Pipeline State after each phase
4. Move completed tasks to "Recently Completed"

**Rules:** Skip blocked tasks. Notify project owner only on fully completed tasks.

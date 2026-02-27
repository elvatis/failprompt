# failprompt: Build Dashboard

> Last updated: 2026-02-21

---

## Build Health

| Check         | Status | Notes                                    |
| ------------- | ------ | ---------------------------------------- |
| `tsc`         | ✅     | Clean, zero errors, strict mode          |
| `npm test`    | ✅     | 42/42 tests (3 suites)                   |
| GitHub CI     | ✅     | `.github/workflows/ci.yml` live on main  |
| npm publish   | ✅     | Live: npmjs.com/package/failprompt v0.1.0 |

---

## Modules

| Module                   | Status | Tests | Notes                                        |
| ------------------------ | ------ | ----- | -------------------------------------------- |
| `src/index.ts`           | Done   | -     | CLI entrypoint, all flags wired              |
| `src/log-fetcher.ts`     | Done   | -     | gh shell-out, auth guard, friendly errors    |
| `src/error-extractor.ts` | Done   | 17    | gh log format, ##[error], heuristics, fallback |
| `src/prompt-builder.ts`  | Done   | 12    | structured prompt, source context injection  |
| Integration tests        | Done   | 13    | TS error, npm ERR!, Jest failure scenarios   |

---

## Tested Scenarios

| Scenario                 | Input                          | Step extracted | Output |
| ------------------------ | ------------------------------ | -------------- | ------ |
| TypeScript compile error | `src/parser.ts(42,7): TS2345` | `Run build`    | ✅     |
| npm ERR! missing module  | `Cannot find module 'express'` | `Run server`   | ✅     |
| Jest assertion failure   | `Expected: 401, Received: 200` | `Run tests`    | ✅     |
| Real CI (own repo)       | Run 22257459273, elvatis/failprompt | `Run tests` | ✅     |

---

## Distribution

| Channel     | Status  | Notes                                         |
| ----------- | ------- | --------------------------------------------- |
| npm publish | Ready   | `bin`, `files`, shebang, `prepublishOnly` set |
| npx support | Ready   | `npx failprompt` works after publish          |
| GitHub CI   | Live    | Runs on every push to main                    |

---

## Open Tasks

| # | Task            | Priority | Blocked by    | Ready?   |
| - | --------------- | -------- | ------------- | -------- |
| 1 | GitLab CI       | LOW      | After publish | Deferred |
| 2 | ESLint setup    | LOW      | -             | Optional |

---

## Completed

| Task                              | Agent            | Date       |
| --------------------------------- | ---------------- | ---------- |
| Research (gh API, commander, npm) | Sonar/Akido      | 2026-02-21 |
| Architecture decisions (ADR)      | Opus             | 2026-02-21 |
| MVP implementation (29 tests)     | Sonnet           | 2026-02-21 |
| Opus + ChatGPT review round       | Opus + ChatGPT   | 2026-02-21 |
| gh log format bug fix             | Akido            | 2026-02-21 |
| 3 integration test scenarios      | Akido            | 2026-02-21 |
| GitHub Actions CI workflow        | Akido            | 2026-02-21 |
| Real end-to-end test (own CI)     | Akido            | 2026-02-21 |
| npm publish v0.1.0                | Emre + Akido     | 2026-02-21 |
| AAHP blog article updated         | Akido            | 2026-02-21 |

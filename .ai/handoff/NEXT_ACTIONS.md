# NEXT_ACTIONS - failprompt

> Last updated: 2026-03-02
> Phase: maintenance (v0.1.0 published, 75/75 tests passing)

---

## Ready - Work These Next

### T-005: Multi-file source context in prompts [high] (issue #3)
- **Goal:** Include source context for all referenced files, not just the first one
- **Context:** Currently `prompt-builder.ts` only calls `readFileContext()` on `filePaths[0]`. When an error spans multiple files (e.g. a type mismatch between caller and callee), the prompt only shows one side. Including all referenced files gives the LLM much better context to diagnose the root cause.
- **What to do:**
  1. In `prompt-builder.ts`, iterate over all entries in `filePaths` (cap at 5 to avoid bloat)
  2. Call `readFileContext()` for each and render a separate `### Source Context` block per file
  3. Update the `FileContext` rendering to show the file path as a subheading
  4. Add unit tests in `prompt-builder.test.ts` for multi-file scenarios
  5. Add an integration test with a log referencing 2-3 files
- **Files:** `src/prompt-builder.ts`, `src/__tests__/prompt-builder.test.ts`, `src/__tests__/integration.test.ts`
- **Definition of Done:**
  - [ ] All referenced files (up to 5) appear in the prompt output
  - [ ] Each source block shows its file path and extension-based syntax highlighting
  - [ ] Gracefully skips files that don't exist locally
  - [ ] All existing tests still pass
  - [ ] New tests cover multi-file and missing-file edge cases

### T-006: Expand file path extraction for monorepos [high] (issue #4)
- **Goal:** Detect file paths in error logs from monorepo layouts and stack traces
- **Context:** `extractFilePaths()` in `error-extractor.ts` only matches `src/`, `lib/`, and `./` prefixed paths. Real-world monorepos use `packages/`, `apps/`, `test/`, and stack traces show paths like `at Object.<anonymous> (/home/runner/work/repo/packages/core/index.ts:42:5)`. These are missed entirely, resulting in prompts with no source context.
- **What to do:**
  1. Add path prefixes: `packages/`, `apps/`, `test/`, `tests/`, `dist/`, `build/`
  2. Add stack trace pattern: extract paths from `at ... (filepath:line:col)` format
  3. Add Windows path support: `src\\foo.ts` in addition to `src/foo.ts`
  4. Support uppercase extensions: `.TS`, `.TSX`, `.JS`, `.JSX`
  5. Deduplicate extracted paths
  6. Add tests for each new pattern
- **Files:** `src/error-extractor.ts`, `src/__tests__/error-extractor.test.ts`
- **Definition of Done:**
  - [ ] Paths with `packages/`, `apps/`, `test/`, `tests/` prefixes are extracted
  - [ ] Stack trace file paths are extracted (Node.js `at` format)
  - [ ] Duplicate paths are removed
  - [ ] All existing 31 error-extractor tests still pass
  - [ ] New tests cover each added pattern

### T-007: Mock-based tests for log fetcher CLI interactions [medium] (issue #5)
- **Goal:** Test `log-fetcher.ts` without requiring real `gh`/`glab` CLI installations
- **Context:** The log fetcher is the most fragile module - it shells out to `gh` and `glab` via `execSync`. Currently there are zero unit tests for this module. If `gh` changes its output format or error messages, regressions would go undetected. Mock-based tests would catch these without needing CI credentials.
- **What to do:**
  1. Create `src/__tests__/log-fetcher.test.ts`
  2. Mock `child_process.execSync` using `jest.mock()`
  3. Test `fetchFailedLog()`: successful fetch, gh not installed, gh not authenticated, repo not found
  4. Test `fetchGitLabFailedLog()`: successful multi-step API flow, glab not installed, pipeline not found
  5. Test `detectLatestFailedRunId()`: parse gh run list output, no failed runs found
  6. Test `detectLatestFailedPipelineId()`: parse glab ci list JSON output
  7. Test error mapping functions (`mapGhError`, `mapGlabError`)
- **Files:** `src/log-fetcher.ts`, `src/__tests__/log-fetcher.test.ts`
- **Definition of Done:**
  - [ ] New test file with at least 15 tests covering both providers
  - [ ] All `execSync` calls are mocked (no real CLI needed)
  - [ ] Auth check flows tested (available, not installed, not authenticated)
  - [ ] Error mapping produces correct user-friendly messages
  - [ ] All existing tests still pass

### T-008: Add --branch flag and fix default branch fallback [medium] (issue #6)
- **Goal:** Let users specify a branch explicitly and stop assuming "main" as the default
- **Context:** `detectLatestFailedRunId()` falls back to `"main"` when `git branch --show-current` fails. This silently returns wrong results on repos with `master`, `develop`, or other default branches. A `--branch` flag solves this and also enables querying failures from branches the user isn't currently on.
- **What to do:**
  1. Add `--branch <name>` / `-b` flag in `src/index.ts` via Commander
  2. Pass branch to `fetchFailedLog()` and `fetchGitLabFailedLog()` as an option
  3. In `detectLatestFailedRunId()`, use provided branch or detected branch, and error clearly if neither works (instead of silently falling back to "main")
  4. Update README.md usage table and examples
  5. Add unit test for the new flag
- **Files:** `src/index.ts`, `src/log-fetcher.ts`, `README.md`
- **Definition of Done:**
  - [ ] `--branch` / `-b` flag accepted and passed through to log fetching
  - [ ] No silent fallback to "main" - clear error if branch unknown
  - [ ] README documents the new flag
  - [ ] Existing tests still pass

### T-009: Add --json output mode for programmatic use [low] (issue #7)
- **Goal:** Support `--json` flag that outputs structured JSON instead of Markdown
- **Context:** As failprompt gets adopted, users may want to integrate it into scripts, editor plugins, or MCP servers that consume structured data rather than Markdown text. A JSON output mode makes failprompt composable with other tools.
- **What to do:**
  1. Add `--json` flag in `src/index.ts`
  2. When set, output a JSON object with fields: `repo`, `branch`, `runId`, `provider`, `stepName`, `errors`, `fullContext`, `filePaths`, `sourceContext` (array of file contents)
  3. Skip the Markdown formatting in `prompt-builder.ts` and return raw data
  4. Add tests for JSON output structure and valid JSON parsing
  5. Update README with `--json` usage example
- **Files:** `src/index.ts`, `src/prompt-builder.ts`, `src/__tests__/prompt-builder.test.ts`, `README.md`
- **Definition of Done:**
  - [ ] `--json` flag produces valid, parseable JSON to stdout
  - [ ] JSON includes all fields needed to reconstruct the Markdown prompt
  - [ ] `--json` combined with `--output` writes JSON to file
  - [ ] README documents the flag with a usage example
  - [ ] All existing tests still pass

---

## Blocked

_(none)_

---

## Recently Completed

| Task  | Title                                                                                  | Completed  |
| ----- | -------------------------------------------------------------------------------------- | ---------- |
| T-004 | Add GitLab CI support                                                                  | 2026-02-28 |
| T-003 | Add ESLint setup                                                                       | 2026-02-28 |
| T-001 | Add GitLab CI support (CI_JOB_NAME, CI_PIPELINE_ID env vars, gitlab-ci.yml log format) | 2026-02-27 |
| T-002 | ESLint setup with typescript-eslint strict rules                                       | 2026-02-27 |

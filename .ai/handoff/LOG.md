# failprompt — Agent Journal

> **Append-only.** This file is the immutable history of every agent decision.
> Newest entries at the top.

---

## 2026-02-21 — Project Bootstrap

**By:** Akido (OpenClaw main agent)
**Context:** failprompt is created as a public AAHP case study.
The goal is to demonstrate the full AAHP pipeline on a real, useful CLI tool.

**Decisions:**
- Tool: `failprompt` — parse CI failure logs, generate LLM-ready prompts
- Language: TypeScript / Node.js (broad developer audience, fits AAHP community)
- Scope MVP: GitHub Actions support first, pipe-friendly output, clipboard-ready
- AAHP note: prominently in README so the repo purpose is clear
- License: MIT (max adoption)

**Next:** Sonar researches GitHub Actions API + existing CI log parsing libraries.
Then Opus designs the architecture. Then Sonnet builds it.

## [SONAR] Research — 2026-02-21

**GitHub Actions API:**
- Endpoint: `GET /repos/{owner}/{repo}/actions/runs/{run_id}/logs` — returns a ZIP archive
- Simpler: `gh run view --log-failed` dumps failed step logs to stdout (already works, but: no extraction, no LLM formatting, terminal only)
- Auth: `GITHUB_TOKEN` env var or `gh` CLI auth — `gh` is the practical choice (avoids manual token handling)
- Log format inside ZIP: one `.txt` file per step, prefixed with timestamps + ANSI codes

**Existing tools / gaps:**
- `gh run view --log-failed` — closest thing. Dumps raw logs. No extraction, no structure, not LLM-optimised.
- No tool exists that: extracts the relevant error section + pulls git context + formats as LLM prompt. That's the gap.

**CLI library recommendation:** `commander` — most stable, widest ecosystem, zero surprise. `citty` is trendy but overkill for MVP.

**ESM vs CJS:** ESM (`"type": "module"`) — Node 18+ LTS handles it cleanly. `npx` compatible. Shebang: `#!/usr/bin/env node`.

**Clipboard strategy:** Don't use `clipboardy` — adds a dependency and breaks in headless environments. Better: pipe-friendly stdout by default, print a hint at the end: `# Tip: pipe to pbcopy / xclip / wl-copy`. Let the OS handle it.

**Error extraction heuristics:**
- GitHub Actions log markers: `##[error]`, `Error:`, lines after `##[endgroup]` before process exit
- Failing step identifiable by: non-zero exit in the step log + `##[error]Process completed with exit code N`
- Strategy: find the last `##[group]` before the error → that's the failing step name. Extract from there to end.

**Sources:**
- https://docs.github.com/en/rest/actions/workflow-runs#download-workflow-run-logs
- gh CLI docs: `gh run view --help`

**Recommendation for Opus:**
- Use `gh run view --log-failed` as the log source (shell out to `gh`) — avoids API auth complexity for MVP
- Parse stdout from `gh`, extract error section with regex on `##[error]` markers
- `commander` for CLI args, ESM, pipe-friendly stdout, no clipboard dependency

## [OPUS] ADR: failprompt Architecture — 2026-02-21

### Package structure
Split into 4 small modules under `src/`:

```
src/
  index.ts          — CLI entry point (commander setup, arg parsing, orchestration)
  log-fetcher.ts    — shells out to `gh`, returns raw log string
  error-extractor.ts — parses raw log, returns structured error object
  prompt-builder.ts  — takes extracted error + optional file context, returns formatted prompt string
```

Rationale: each module has one job, testable in isolation. Still only 4 files — not over-engineered.

### Log source
**Shell out to `gh run view --log-failed`** (via `child_process.execSync`).

Rationale:
- `gh` handles auth (OAuth, SSH, token) — zero auth code for us
- `gh` is already installed for anyone using GitHub Actions professionally
- Avoids ZIP download + extraction complexity of the REST API
- For "latest failed run": use `gh run list --branch $(git branch --show-current) --status failure --limit 1 --json databaseId --jq '.[0].databaseId'` to auto-detect the run ID
- If `gh` is not installed, exit with a clear error: `"failprompt requires the GitHub CLI (gh). Install: https://cli.github.com"`

### Error extraction algorithm

Input: raw stdout from `gh run view <id> --log-failed`

Step-by-step:
1. Split log into lines
2. Find all lines matching `##[error]` — collect their indices
3. For each `##[error]` line, scan backwards to find the nearest `##[group]` line — that's the step/context header
4. For the **last** `##[error]` occurrence (usually the root cause):
   - Extract from the `##[group]` line (or 30 lines before the error, whichever is closer) through 5 lines after the `##[error]` line (or end of output)
   - Strip ANSI codes: `line.replace(/\x1b\[[0-9;]*m/g, '')`
   - Strip GitHub timestamp prefixes: `line.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/g, '')`
5. Also collect ALL `##[error]` lines as a summary list
6. Return: `{ stepName: string, errorLines: string[], allErrors: string[], fullContext: string }`

Key regexes:
- `##[error]` marker: `/^##\[error\](.+)/`
- `##[group]` marker: `/^##\[group\](.+)/`
- ANSI strip: `/\x1b\[[0-9;]*m/g`
- Timestamp strip: `/^\d{4}-\d{2}-\d{2}T[\d:.Z]+\s*/`
- File path extraction from error: `/(?:^|\s)([\w./\\-]+\.[a-z]{1,4}):(\d+)/` (e.g. `src/foo.ts:42`)

### Prompt template

```markdown
# CI Failure — Fix This Error

## Error Summary
{allErrors joined by newline, each prefixed with "- "}

## Failed Step: {stepName}
```
{fullContext}
```

{IF fileContext}
## Relevant File: {filePath}
```{ext}
{fileContent}
```
{ENDIF}

## Instructions
Analyze the CI error above. Explain the root cause and provide a fix.
If you see the relevant source file, show the corrected code.
```

### CLI interface

```
failprompt                          # auto-detect: latest failed run on current branch
failprompt --run <id>               # specific run ID
failprompt --repo <owner/repo>      # override repo (default: git remote origin)
failprompt --output <file>          # write to file instead of stdout
failprompt --no-context             # skip git file context extraction
failprompt --verbose                # print debug info to stderr
failprompt --version                # version from package.json
failprompt --help                   # help text
```

All flags have short aliases: `-r`, `-R`, `-o`, `-v`.

### Dependencies

Production:
- `commander` — CLI argument parsing

Dev:
- `typescript`
- `@types/node`
- `tsup` — bundle to single ESM file for `npx` compat
- `vitest` — testing

That's it. Zero runtime dependencies beyond `commander`. Node builtins (`child_process`, `fs`, `path`) handle the rest.

### Git context
**Yes** — auto-detect and include the failing file.

Algorithm:
1. From the extracted error lines, apply file path regex: `/(?:^|\s)([\w./\\-]+\.[a-z]{1,4}):(\d+)/`
2. Take the first match — that's likely the file that caused the error
3. Check if the file exists locally (`fs.existsSync`)
4. If yes, read it and include in the prompt (max 200 lines centered around the error line number)
5. If no match or file doesn't exist, skip silently (prompt still works without it)

### Branch
`feat/mvp`

### Instructions for Sonnet

1. Create branch `feat/mvp` from `main`
2. `npm init -y`, set `"type": "module"`, add `"bin": { "failprompt": "./dist/index.js" }`
3. Install deps: `commander` (prod), `typescript @types/node tsup vitest` (dev)
4. Create `tsconfig.json`: target ES2022, module NodeNext, outDir dist, strict true
5. Create `tsup.config.ts`: entry `src/index.ts`, format esm, shims true, banner with shebang
6. Implement `src/log-fetcher.ts`: export `fetchFailedLog(runId?: string, repo?: string): string` — shells out to `gh`, auto-detects run ID if not provided
7. Implement `src/error-extractor.ts`: export `extractErrors(rawLog: string): ExtractedError` — follows the algorithm above exactly
8. Implement `src/prompt-builder.ts`: export `buildPrompt(error: ExtractedError, fileContext?: FileContext): string` — uses the template above
9. Implement `src/index.ts`: commander setup, wire the 3 modules together, handle `--output` (write to file) vs stdout
10. Add `scripts`: `"build": "tsup"`, `"dev": "tsx src/index.ts"`, `"test": "vitest run"`
11. Write tests in `test/error-extractor.test.ts` with sample GitHub Actions log snippets
12. Build, verify `npx .` works locally
13. Commit: `feat(cli): implement failprompt MVP [AAHP-auto]`
14. Push branch, update STATUS.md and NEXT_ACTIONS.md

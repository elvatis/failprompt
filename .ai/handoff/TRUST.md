# failprompt — Trust Register

> Tracks what is verified, assumed, or unknown.
> **verified** = agent ran code/tests to confirm · **assumed** = derived from docs/config · **untested** = unknown

---

## Build System

| Property                    | Status    | Last Verified | Agent | Notes                  |
| --------------------------- | --------- | ------------- | ----- | ---------------------- |
| `tsc --build` passes        | untested  | —             | —     | No code yet            |
| `npm test` passes           | untested  | —             | —     | No tests yet           |
| `npx failprompt` works      | untested  | —             | —     | No dist yet            |

## Core Logic

| Property                                  | Status   | Last Verified | Agent | Notes                                         |
| ----------------------------------------- | -------- | ------------- | ----- | --------------------------------------------- |
| `gh` CLI log fetching works               | assumed  | —             | —     | Based on `gh run view --log-failed` docs       |
| `##[error]` marker reliably identifies errors | assumed | —            | —     | Based on GitHub Actions log format docs        |
| ANSI stripping regex is complete          | untested | —             | —     | Needs testing with real log samples            |
| Git file path extraction from errors      | untested | —             | —     | Regex heuristic — may miss edge cases          |
| Cross-platform stdout piping works        | assumed  | —             | —     | Standard Unix pipe — should work everywhere    |

## Distribution

| Property                     | Status   | Last Verified | Agent | Notes              |
| ---------------------------- | -------- | ------------- | ----- | ------------------ |
| `bin` field works with `npx` | untested | —             | —     | Standard pattern   |
| npm publish succeeds         | untested | —             | —     | Not attempted yet  |

---

*Re-verify after each major change. Verified status degrades after refactors.*

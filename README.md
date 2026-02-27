# failprompt

> **Parse CI failure logs and generate ready-to-paste AI prompts, in one command.**

```bash
npx failprompt
# → prints a structured LLM-ready prompt to stdout, ready for Claude / ChatGPT / Copilot
```

---

## The Problem

Every developer using AI has done this manually:

1. CI fails on GitHub Actions
2. Open the run, scroll through 200 lines of logs
3. Copy the relevant error
4. Paste into Claude: *"what's wrong with this?"*
5. Paste the relevant file
6. Get the fix

`failprompt` automates steps 2–5.

---

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **[GitHub CLI (`gh`)](https://cli.github.com)**: installed and authenticated

```bash
# Install gh (macOS)
brew install gh

# Install gh (Linux)
sudo apt install gh   # or follow https://cli.github.com/manual/installation

# Authenticate
gh auth login
```

---

## Installation

```bash
# Global install
npm install -g failprompt

# Or run directly without installing
npx failprompt
```

---

## Usage

```bash
# Auto-detect latest failed run on current branch
failprompt

# Specific run ID
failprompt --run 1234567890

# Different repo
failprompt --repo owner/repo

# Write prompt to file instead of stdout
failprompt --output prompt.md

# Skip source file context extraction
failprompt --no-context

# Verbose debug output (sent to stderr)
failprompt --verbose

# Pipe to clipboard (macOS)
failprompt | pbcopy

# Pipe to clipboard (Linux)
failprompt | xclip -selection clipboard

# Pipe to clipboard (Windows)
failprompt | clip
```

### Flags

| Flag | Short | Description |
|------|-------|-------------|
| `--run <id>` | `-r` | Specific GitHub Actions run ID |
| `--repo <owner/repo>` | `-R` | Repository (default: git remote origin) |
| `--output <file>` | `-o` | Write prompt to file |
| `--no-context` | | Skip git source context extraction |
| `--verbose` | `-v` | Print debug info to stderr |
| `--version` | `-V` | Output version number |
| `--help` | | Show help |

---

## How It Works

1. Shells out to `gh run view --log-failed` to fetch the failed step log
2. Strips ANSI codes and timestamps from raw output
3. Detects error lines via `##[error]` markers, with fallbacks for `Error:`, `npm ERR!`, `FAILED`, `ENOENT`, `SyntaxError:`, and more
4. Finds the failing step name from `##[group]` markers
5. Extracts the relevant ±30-line error context block
6. If a file path is referenced in the error, reads ±20 lines from that file
7. Outputs a structured Markdown prompt optimised for LLMs

---

## Output Format

```markdown
## CI Failure - owner/repo / branch
**Run:** <run-id>
**Failing step:** <step-name>

### All Errors
- ##[error]Process completed with exit code 1.

### Error
```
<error context block>
```

### Source Context
```ts
<relevant file snippet>
```

### Task
Fix the error above. Explain what caused it and provide the corrected code.
```

---

## ⚠️ AAHP Case Study

> **This project is a public demonstration of the [AAHP Protocol](https://github.com/homeofe/AAHP).**
>
> It was built end-to-end by a multi-agent pipeline (Sonar → Opus → Sonnet → Review → Fix)
> with no manual code writing. Every decision is documented in `.ai/handoff/LOG.md`.
>
> The goal is to show how AAHP enables autonomous, auditable, multi-agent software development
>, not just as a concept, but as a working repository you can clone and inspect.
>
> Read the handoff files to see exactly what each agent decided and why:
> - [`.ai/handoff/STATUS.md`](.ai/handoff/STATUS.md), current build state
> - [`.ai/handoff/LOG.md`](.ai/handoff/LOG.md), full agent journal
> - [`.ai/handoff/NEXT_ACTIONS.md`](.ai/handoff/NEXT_ACTIONS.md), task queue

---

## License

MIT

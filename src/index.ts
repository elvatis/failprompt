#!/usr/bin/env node
import { Command } from 'commander';
import { writeFileSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { fetchFailedLog } from './log-fetcher.js';
import { extractErrors } from './error-extractor.js';
import { buildPrompt } from './prompt-builder.js';

/** Detect current git repo in "owner/repo" format from remote origin */
function detectRepo(): string {
  try {
    const remoteUrl = execSync('git remote get-url origin', { stdio: 'pipe' })
      .toString()
      .trim();
    // Handle SSH: git@github.com:owner/repo.git
    const sshMatch = remoteUrl.match(/git@[^:]+:(.+?)(?:\.git)?$/);
    if (sshMatch) return sshMatch[1];
    // Handle HTTPS: https://github.com/owner/repo.git
    const httpsMatch = remoteUrl.match(/https?:\/\/[^/]+\/(.+?)(?:\.git)?$/);
    if (httpsMatch) return httpsMatch[1];
    return remoteUrl;
  } catch {
    return 'unknown/repo';
  }
}

/** Detect current branch */
function detectBranch(): string {
  try {
    return execSync('git branch --show-current', { stdio: 'pipe' })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

/** Read version from package.json (relative to this file) */
function getVersion(): string {
  try {
    // In dist/, package.json is one level up
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'));
    return pkg.version as string;
  } catch {
    return '0.1.0';
  }
}

const program = new Command();

program
  .name('failprompt')
  .description('Parse CI failure logs and generate ready-to-paste AI prompts')
  .version(getVersion(), '-V, --version', 'Output version number')
  .option('-r, --run <id>', 'Specific GitHub Actions run ID (default: auto-detect latest failed)')
  .option('-R, --repo <owner/repo>', 'Repository in owner/repo format (default: git remote origin)')
  .option('-o, --output <file>', 'Write prompt to file instead of stdout')
  .option('--no-context', 'Skip git source context extraction')
  .option('-v, --verbose', 'Print debug info to stderr')
  .action(async (options) => {
    const verbose = (msg: string) => {
      if (options.verbose) process.stderr.write(`[verbose] ${msg}\n`);
    };

    try {
      // Resolve repo and branch
      const repo = options.repo ?? detectRepo();
      const branch = detectBranch();
      const runId = options.run ?? 'latest';

      verbose(`Repo: ${repo}`);
      verbose(`Branch: ${branch}`);
      verbose(`Run ID: ${runId}`);

      // Fetch the log
      verbose('Fetching failed CI log via gh...');
      const rawLog = fetchFailedLog(options.run, options.repo);

      verbose(`Fetched ${rawLog.length} bytes of log output.`);

      // Extract errors
      verbose('Extracting errors from log...');
      const error = extractErrors(rawLog);

      verbose(`Step: ${error.stepName}`);
      verbose(`Errors found: ${error.allErrors.length}`);
      verbose(`File paths: ${error.filePaths.join(', ')}`);

      // Build prompt
      verbose('Building LLM prompt...');
      const prompt = buildPrompt({
        repo,
        branch,
        runId,
        includeContext: options.context !== false,
        error,
      });

      // Output
      if (options.output) {
        writeFileSync(options.output, prompt, 'utf-8');
        process.stderr.write(`✓ Prompt written to ${options.output}\n`);
      } else {
        process.stdout.write(prompt + '\n');
        process.stderr.write(
          '\n# Tip: pipe to pbcopy (macOS) / xclip -sel clip (Linux) / clip (Windows)\n'
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`\n✗ Error: ${msg}\n`);
      process.exit(1);
    }
  });

program.parse(process.argv);

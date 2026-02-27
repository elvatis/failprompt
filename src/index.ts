#!/usr/bin/env node
import { Command } from 'commander';
import { writeFileSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { fetchFailedLog, fetchGitLabFailedLog } from './log-fetcher.js';
import { extractErrors } from './error-extractor.js';
import { buildPrompt } from './prompt-builder.js';
import { detectCIProvider } from './ci-provider.js';
import type { CIProvider } from './ci-provider.js';

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
    const raw: unknown = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'));
    if (typeof raw === 'object' && raw !== null && 'version' in raw && typeof (raw as { version: unknown }).version === 'string') {
      return (raw as { version: string }).version;
    }
    return '0.1.0';
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
  .option('-p, --pipeline <id>', 'Specific GitLab CI pipeline ID (default: auto-detect latest failed)')
  .option('-P, --provider <type>', 'CI provider: github, gitlab, auto (default: auto)', 'auto')
  .option('-R, --repo <owner/repo>', 'Repository in owner/repo format (default: git remote origin)')
  .option('-o, --output <file>', 'Write prompt to file instead of stdout')
  .option('--no-context', 'Skip git source context extraction')
  .option('-v, --verbose', 'Print debug info to stderr')
  .action((options: {
    run?: string;
    pipeline?: string;
    provider: string;
    repo?: string;
    output?: string;
    context?: boolean;
    verbose?: boolean;
  }) => {
    const log = (msg: string) => {
      if (options.verbose) process.stderr.write(`[verbose] ${msg}\n`);
    };

    try {
      // Resolve CI provider
      let provider: CIProvider | 'auto' = 'auto';
      if (options.provider === 'github' || options.provider === 'gitlab') {
        provider = options.provider;
      } else if (options.provider !== 'auto') {
        throw new Error(`Unknown provider "${options.provider}". Use: github, gitlab, or auto`);
      }

      // Auto-detect provider from env vars if not specified
      if (provider === 'auto') {
        const detected = detectCIProvider();
        if (detected.provider !== 'unknown') {
          provider = detected.provider;
          log(`Auto-detected CI provider: ${provider}`);
        }
      }

      // If --pipeline is given, force GitLab provider
      if (options.pipeline && provider === 'auto') {
        provider = 'gitlab';
      }

      // Resolve repo and branch
      const repo = options.repo ?? detectRepo();
      const branch = detectBranch();

      // Determine the run/pipeline ID for the prompt
      const runId = options.run ?? options.pipeline ?? 'latest';

      log(`Provider: ${provider}`);
      log(`Repo: ${repo}`);
      log(`Branch: ${branch}`);
      log(`Run/Pipeline ID: ${runId}`);

      // Fetch the log based on provider
      let rawLog: string;
      if (provider === 'gitlab') {
        log('Fetching failed CI log via glab...');
        rawLog = fetchGitLabFailedLog(options.pipeline);
      } else {
        log('Fetching failed CI log via gh...');
        rawLog = fetchFailedLog(options.run, options.repo);
      }

      log(`Fetched ${rawLog.length} bytes of log output.`);

      // Extract errors (provider hint for log format detection)
      log('Extracting errors from log...');
      const resolvedProvider = provider === 'auto' ? 'auto' : provider;
      const error = extractErrors(rawLog, resolvedProvider);

      log(`Step: ${error.stepName}`);
      log(`Errors found: ${error.allErrors.length}`);
      log(`File paths: ${error.filePaths.join(', ')}`);

      // Build prompt
      log('Building LLM prompt...');
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
        process.stderr.write(`Prompt written to ${options.output}\n`);
      } else {
        process.stdout.write(prompt + '\n');
        process.stderr.write(
          '\n# Tip: pipe to pbcopy (macOS) / xclip -sel clip (Linux) / clip (Windows)\n'
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`\nError: ${msg}\n`);
      process.exit(1);
    }
  });

program.parse(process.argv);

#!/usr/bin/env node
import { Command } from 'commander';
import { writeFileSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { fetchFailedLog, fetchGitLabFailedLog } from './log-fetcher.js';
import { extractErrors } from './error-extractor.js';
import { buildPrompt } from './prompt-builder.js';
import { detectCIProvider } from './ci-provider.js';
import type { CIProvider } from './ci-provider.js';
import type { ExtractedError } from './error-extractor.js';

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

/** Structured JSON output shape for --json mode */
interface JsonOutput {
  repo: string;
  branch: string;
  runId: string;
  provider: string;
  stepName: string;
  errors: string[];
  filePaths: string[];
  sourceContext: string;
}

/** Build structured JSON output from extracted error data */
function buildJsonOutput(options: {
  repo: string;
  branch: string;
  runId: string;
  provider: string;
  error: ExtractedError;
}): JsonOutput {
  return {
    repo: options.repo,
    branch: options.branch,
    runId: options.runId,
    provider: options.provider,
    stepName: options.error.stepName,
    errors: options.error.allErrors,
    filePaths: options.error.filePaths,
    sourceContext: options.error.fullContext,
  };
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
  .option('-b, --branch <name>', 'Branch name to look up failed runs on (no silent fallback)')
  .option('-o, --output <file>', 'Write prompt to file instead of stdout')
  .option('--no-context', 'Skip git source context extraction')
  .option('--json', 'Output structured JSON instead of a markdown prompt')
  .option('-v, --verbose', 'Print debug info to stderr')
  .action((options: {
    run?: string;
    pipeline?: string;
    provider: string;
    repo?: string;
    branch?: string;
    output?: string;
    context?: boolean;
    json?: boolean;
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

      // Branch resolution: --branch flag takes priority; otherwise detect from git.
      // When --branch is given, it is passed explicitly to avoid silent fallbacks.
      const branch = options.branch ?? detectBranch();

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
        // Pass the explicit branch (if given) to prevent silent fallback to "main"
        rawLog = fetchFailedLog(options.run, options.repo, options.branch);
      }

      log(`Fetched ${rawLog.length} bytes of log output.`);

      // Extract errors (provider hint for log format detection)
      log('Extracting errors from log...');
      const resolvedProvider = provider === 'auto' ? 'auto' : provider;
      const error = extractErrors(rawLog, resolvedProvider);

      log(`Step: ${error.stepName}`);
      log(`Errors found: ${error.allErrors.length}`);
      log(`File paths: ${error.filePaths.join(', ')}`);

      // Determine resolved provider string for output
      const providerLabel = provider === 'auto' ? 'unknown' : provider;

      // --json mode: output structured JSON
      if (options.json) {
        const jsonOut = buildJsonOutput({
          repo,
          branch,
          runId,
          provider: providerLabel,
          error,
        });
        process.stdout.write(JSON.stringify(jsonOut, null, 2) + '\n');
        return;
      }

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

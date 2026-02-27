import { execSync } from 'child_process';

// ---------------------------------------------------------------------------
// GitHub Actions (gh CLI)
// ---------------------------------------------------------------------------

/**
 * Maps a raw gh CLI error message to a user-friendly, actionable message.
 */
function mapGhError(rawMsg: string): string {
  if (/command not found/i.test(rawMsg) || /gh: not found/i.test(rawMsg)) {
    return 'Install GitHub CLI: https://cli.github.com';
  }
  if (/not logged into|authentication required|auth/i.test(rawMsg)) {
    return 'Run: gh auth login';
  }
  if (/could not resolve|repository not found|not found/i.test(rawMsg)) {
    return 'Check repo name and that you have access';
  }
  return `gh error: ${rawMsg}`;
}

/**
 * Checks if the `gh` CLI is installed and authenticated.
 * Throws a clear, user-friendly error if not.
 */
function assertGhAvailable(): void {
  try {
    execSync('gh --version', { stdio: 'pipe' });
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    // gh --version failing almost always means gh is not installed
    if (/command not found|not found|no such file/i.test(raw)) {
      throw new Error('Install GitHub CLI: https://cli.github.com');
    }
    throw new Error(`failprompt requires the GitHub CLI (gh). ${mapGhError(raw)}`);
  }

  try {
    execSync('gh auth status', { stdio: 'pipe' });
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    throw new Error(`Not authenticated with GitHub CLI. Run: gh auth login\n(${mapGhError(raw)})`);
  }
}

/**
 * Auto-detects the latest failed run ID on the current branch.
 */
function detectLatestFailedRunId(repo?: string): string {
  const repoFlag = repo ? `--repo ${repo}` : '';
  let branch: string;
  try {
    branch = execSync('git branch --show-current', { stdio: 'pipe' })
      .toString()
      .trim();
  } catch {
    branch = 'main';
  }

  const cmd = `gh run list --branch "${branch}" --status failure --limit 1 --json databaseId --jq '.[0].databaseId' ${repoFlag}`.trim();

  try {
    const result = execSync(cmd, { stdio: 'pipe' }).toString().trim();
    if (!result || result === 'null') {
      throw new Error(`No failed runs found on branch "${branch}".`);
    }
    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to detect latest failed run: ${msg}`);
  }
}

/**
 * Fetches the failed log from GitHub Actions via the `gh` CLI.
 *
 * @param runId  - Optional specific run ID. If omitted, auto-detects latest failed run.
 * @param repo   - Optional repo in "owner/repo" format. Defaults to origin.
 * @returns Raw log string from `gh run view --log-failed`
 */
export function fetchFailedLog(runId?: string, repo?: string): string {
  assertGhAvailable();

  const resolvedRunId = runId ?? detectLatestFailedRunId(repo);
  const repoFlag = repo ? `--repo ${repo}` : '';

  const cmd = `gh run view ${resolvedRunId} --log-failed ${repoFlag}`.trim();

  try {
    const output = execSync(cmd, {
      stdio: 'pipe',
      maxBuffer: 50 * 1024 * 1024, // 50 MB
    });
    return output.toString();
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to fetch CI log for run ${resolvedRunId}: ${mapGhError(raw)}`);
  }
}

// ---------------------------------------------------------------------------
// GitLab CI (glab CLI)
// ---------------------------------------------------------------------------

/**
 * Maps a raw glab CLI error message to a user-friendly, actionable message.
 */
function mapGlabError(rawMsg: string): string {
  if (/command not found/i.test(rawMsg) || /glab: not found/i.test(rawMsg)) {
    return 'Install GitLab CLI: https://gitlab.com/gitlab-org/cli';
  }
  if (/not logged in|auth/i.test(rawMsg)) {
    return 'Run: glab auth login';
  }
  if (/not found|404/i.test(rawMsg)) {
    return 'Check project path and that you have access';
  }
  return `glab error: ${rawMsg}`;
}

/**
 * Checks if the `glab` CLI is installed and authenticated.
 * Throws a clear, user-friendly error if not.
 */
function assertGlabAvailable(): void {
  try {
    execSync('glab --version', { stdio: 'pipe' });
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    if (/command not found|not found|no such file/i.test(raw)) {
      throw new Error('Install GitLab CLI: https://gitlab.com/gitlab-org/cli');
    }
    throw new Error(`failprompt requires the GitLab CLI (glab). ${mapGlabError(raw)}`);
  }

  try {
    execSync('glab auth status', { stdio: 'pipe' });
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    throw new Error(`Not authenticated with GitLab CLI. Run: glab auth login\n(${mapGlabError(raw)})`);
  }
}

/**
 * Auto-detects the latest failed pipeline ID on the current branch.
 */
function detectLatestFailedPipelineId(): string {
  let branch: string;
  try {
    branch = execSync('git branch --show-current', { stdio: 'pipe' })
      .toString()
      .trim();
  } catch {
    branch = 'main';
  }

  // glab ci list outputs pipelines; filter for failed status
  const cmd = `glab ci list --status failed --per-page 1 --output json`;

  try {
    const result = execSync(cmd, { stdio: 'pipe' }).toString().trim();
    if (!result || result === '[]') {
      throw new Error(`No failed pipelines found on branch "${branch}".`);
    }
    const parsed: unknown = JSON.parse(result);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error(`No failed pipelines found on branch "${branch}".`);
    }
    const first: unknown = parsed[0];
    if (typeof first !== 'object' || first === null || !('id' in first)) {
      throw new Error('Unexpected pipeline format from glab');
    }
    return String((first as { id: unknown }).id);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('No failed pipelines')) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to detect latest failed pipeline: ${msg}`);
  }
}

/**
 * Fetches the failed job log from GitLab CI via the `glab` CLI.
 *
 * Uses the GitLab API through glab to:
 * 1. Find the failed pipeline (or use the provided pipelineId)
 * 2. List jobs in that pipeline and find the failed one
 * 3. Fetch the job trace (log output)
 *
 * @param pipelineId - Optional specific pipeline ID. If omitted, auto-detects latest failed.
 * @returns Raw log string from the failed GitLab CI job
 */
export function fetchGitLabFailedLog(pipelineId?: string): string {
  assertGlabAvailable();

  const resolvedPipelineId = pipelineId ?? detectLatestFailedPipelineId();

  // Get jobs for the pipeline via GitLab API
  const jobsCmd = `glab api "projects/:fullpath/pipelines/${resolvedPipelineId}/jobs"`;
  let jobsResult: string;
  try {
    jobsResult = execSync(jobsCmd, { stdio: 'pipe' }).toString();
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to list jobs for pipeline ${resolvedPipelineId}: ${mapGlabError(raw)}`);
  }

  const jobs: unknown = JSON.parse(jobsResult);
  if (!Array.isArray(jobs)) {
    throw new Error('Unexpected response from GitLab API: expected an array of jobs');
  }

  // Find the first failed job
  const failedJob = jobs.find(
    (j: unknown): j is { id: number; name: string; status: string } =>
      typeof j === 'object' &&
      j !== null &&
      'status' in j &&
      (j as { status: unknown }).status === 'failed'
  );

  if (!failedJob) {
    throw new Error(`No failed jobs in pipeline ${resolvedPipelineId}`);
  }

  // Fetch the job trace (log output)
  const traceCmd = `glab api "projects/:fullpath/jobs/${String(failedJob.id)}/trace"`;
  try {
    const output = execSync(traceCmd, {
      stdio: 'pipe',
      maxBuffer: 50 * 1024 * 1024,
    });
    return output.toString();
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to fetch log for job ${failedJob.name}: ${mapGlabError(raw)}`);
  }
}

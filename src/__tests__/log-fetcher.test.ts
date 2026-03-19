/**
 * T-007: Mock-based tests for log-fetcher CLI interactions.
 *
 * Mocks child_process.execSync to test all CLI edge cases without
 * requiring gh/glab to be installed or authenticated.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock child_process before importing the module under test
// ---------------------------------------------------------------------------
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'child_process';
import { fetchFailedLog, fetchGitLabFailedLog } from '../log-fetcher.js';

const mockExecSync = vi.mocked(execSync);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Make execSync return a Buffer-like value for a specific invocation */
function execReturns(value: string): ReturnType<typeof Buffer.from> {
  return Buffer.from(value) as ReturnType<typeof Buffer.from>;
}

/** Make execSync throw an error with the given message */
function execThrows(message: string): never {
  const err = new Error(message);
  throw err;
}

// ---------------------------------------------------------------------------
// fetchFailedLog (GitHub Actions via gh CLI)
// ---------------------------------------------------------------------------

describe('fetchFailedLog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns log output when gh is installed, authenticated, and run succeeds', () => {
    // gh --version → ok
    mockExecSync.mockImplementationOnce(() => execReturns('gh version 2.40.0'));
    // gh auth status → ok
    mockExecSync.mockImplementationOnce(() => execReturns(''));
    // git branch --show-current → main (for auto-detect)
    mockExecSync.mockImplementationOnce(() => execReturns('main'));
    // gh run list → run id
    mockExecSync.mockImplementationOnce(() => execReturns('9876543210'));
    // gh run view --log-failed → log content
    mockExecSync.mockImplementationOnce(() =>
      execReturns('##[error]Process completed with exit code 1.\nsome log content')
    );

    const result = fetchFailedLog();
    expect(result).toContain('##[error]');
    expect(result).toContain('some log content');
  });

  it('uses the provided run ID directly (skips auto-detect)', () => {
    // gh --version
    mockExecSync.mockImplementationOnce(() => execReturns('gh version 2.40.0'));
    // gh auth status
    mockExecSync.mockImplementationOnce(() => execReturns(''));
    // gh run view 12345 --log-failed (no detect calls)
    mockExecSync.mockImplementationOnce(() => execReturns('log for run 12345'));

    const result = fetchFailedLog('12345');
    expect(result).toBe('log for run 12345');
  });

  it('passes --repo flag when repo is specified', () => {
    mockExecSync.mockImplementationOnce(() => execReturns('gh version 2.40.0'));
    mockExecSync.mockImplementationOnce(() => execReturns(''));
    // With a runId provided, skip detect; execSync is called for the view command
    mockExecSync.mockImplementationOnce(() => execReturns('repo-specific log'));

    const result = fetchFailedLog('42', 'owner/repo');
    expect(result).toBe('repo-specific log');

    // Verify the command included --repo
    const lastCall = mockExecSync.mock.calls[2][0] as string;
    expect(lastCall).toContain('--repo owner/repo');
    expect(lastCall).toContain('42');
  });

  it('throws a clear error when gh is not installed', () => {
    mockExecSync.mockImplementationOnce(() => {
      execThrows('gh: command not found');
    });

    expect(() => fetchFailedLog('123')).toThrow('Install GitHub CLI: https://cli.github.com');
  });

  it('throws a clear error when gh is not authenticated', () => {
    // gh --version succeeds
    mockExecSync.mockImplementationOnce(() => execReturns('gh version 2.40.0'));
    // gh auth status fails
    mockExecSync.mockImplementationOnce(() => {
      execThrows('You are not logged into any GitHub hosts. Run gh auth login');
    });

    expect(() => fetchFailedLog('123')).toThrow('Not authenticated with GitHub CLI');
    expect(() => {
      vi.resetAllMocks();
      mockExecSync.mockImplementationOnce(() => execReturns('gh version 2.40.0'));
      mockExecSync.mockImplementationOnce(() => {
        execThrows('authentication required');
      });
      fetchFailedLog('123');
    }).toThrow('Not authenticated with GitHub CLI');
  });

  it('throws a clear error when repo is not found', () => {
    mockExecSync.mockImplementationOnce(() => execReturns('gh version 2.40.0'));
    mockExecSync.mockImplementationOnce(() => execReturns(''));
    mockExecSync.mockImplementationOnce(() => {
      execThrows('repository not found: owner/missing');
    });

    expect(() => fetchFailedLog('123', 'owner/missing')).toThrow(
      'Check repo name and that you have access'
    );
  });

  it('throws when fetching the log fails for an unknown reason', () => {
    mockExecSync.mockImplementationOnce(() => execReturns('gh version 2.40.0'));
    mockExecSync.mockImplementationOnce(() => execReturns(''));
    mockExecSync.mockImplementationOnce(() => {
      execThrows('some unexpected error from gh');
    });

    expect(() => fetchFailedLog('999')).toThrow('Failed to fetch CI log for run 999');
  });
});

// ---------------------------------------------------------------------------
// detectLatestFailedRunId (via fetchFailedLog without a runId)
// ---------------------------------------------------------------------------

describe('detectLatestFailedRunId (via fetchFailedLog auto-detect)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('auto-detects run ID from the current branch', () => {
    mockExecSync.mockImplementationOnce(() => execReturns('gh version 2.40.0'));
    mockExecSync.mockImplementationOnce(() => execReturns(''));
    // git branch
    mockExecSync.mockImplementationOnce(() => execReturns('feature/my-branch'));
    // gh run list --branch "feature/my-branch" ...
    mockExecSync.mockImplementationOnce(() => execReturns('9999999999'));
    // gh run view
    mockExecSync.mockImplementationOnce(() => execReturns('auto-detected log'));

    const result = fetchFailedLog();
    expect(result).toBe('auto-detected log');

    // The run list command should reference the branch
    const runListCall = mockExecSync.mock.calls[3][0] as string;
    expect(runListCall).toContain('feature/my-branch');
  });

  it('falls back to "main" when git branch command fails', () => {
    mockExecSync.mockImplementationOnce(() => execReturns('gh version 2.40.0'));
    mockExecSync.mockImplementationOnce(() => execReturns(''));
    // git branch fails
    mockExecSync.mockImplementationOnce(() => {
      execThrows('not a git repo');
    });
    // gh run list --branch "main" ...
    mockExecSync.mockImplementationOnce(() => execReturns('1111111111'));
    // gh run view
    mockExecSync.mockImplementationOnce(() => execReturns('fallback log'));

    const result = fetchFailedLog();
    expect(result).toBe('fallback log');

    const runListCall = mockExecSync.mock.calls[3][0] as string;
    expect(runListCall).toContain('"main"');
  });

  it('throws when no failed runs are found', () => {
    mockExecSync.mockImplementationOnce(() => execReturns('gh version 2.40.0'));
    mockExecSync.mockImplementationOnce(() => execReturns(''));
    mockExecSync.mockImplementationOnce(() => execReturns('main'));
    // gh run list returns null (no failed runs)
    mockExecSync.mockImplementationOnce(() => execReturns('null'));

    expect(() => fetchFailedLog()).toThrow('No failed runs found on branch');
  });

  it('throws when no failed runs result is empty', () => {
    mockExecSync.mockImplementationOnce(() => execReturns('gh version 2.40.0'));
    mockExecSync.mockImplementationOnce(() => execReturns(''));
    mockExecSync.mockImplementationOnce(() => execReturns('main'));
    // gh run list returns empty string
    mockExecSync.mockImplementationOnce(() => execReturns(''));

    expect(() => fetchFailedLog()).toThrow('No failed runs found on branch');
  });
});

// ---------------------------------------------------------------------------
// fetchGitLabFailedLog (GitLab CI via glab CLI)
// ---------------------------------------------------------------------------

describe('fetchGitLabFailedLog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns log output when glab is installed, authenticated, and pipeline succeeds', () => {
    // glab --version
    mockExecSync.mockImplementationOnce(() => execReturns('glab version 1.40.0'));
    // glab auth status
    mockExecSync.mockImplementationOnce(() => execReturns(''));
    // glab api pipelines jobs
    mockExecSync.mockImplementationOnce(() =>
      execReturns(JSON.stringify([{ id: 42, name: 'build', status: 'failed' }]))
    );
    // glab api jobs trace
    mockExecSync.mockImplementationOnce(() => execReturns('ERROR: Job failed: exit code 1\nlog line'));

    const result = fetchGitLabFailedLog('999');
    expect(result).toContain('ERROR: Job failed');
    expect(result).toContain('log line');
  });

  it('throws a clear error when glab is not installed', () => {
    mockExecSync.mockImplementationOnce(() => {
      execThrows('glab: command not found');
    });

    expect(() => fetchGitLabFailedLog('1')).toThrow(
      'Install GitLab CLI: https://gitlab.com/gitlab-org/cli'
    );
  });

  it('throws a clear error when glab is not authenticated', () => {
    mockExecSync.mockImplementationOnce(() => execReturns('glab version 1.40.0'));
    mockExecSync.mockImplementationOnce(() => {
      execThrows('You are not logged in to GitLab. Run glab auth login');
    });

    expect(() => fetchGitLabFailedLog('1')).toThrow(
      'Not authenticated with GitLab CLI'
    );
  });

  it('throws when no failed jobs found in pipeline', () => {
    mockExecSync.mockImplementationOnce(() => execReturns('glab version 1.40.0'));
    mockExecSync.mockImplementationOnce(() => execReturns(''));
    // All jobs are successful
    mockExecSync.mockImplementationOnce(() =>
      execReturns(JSON.stringify([{ id: 10, name: 'build', status: 'success' }]))
    );

    expect(() => fetchGitLabFailedLog('123')).toThrow(
      'No failed jobs in pipeline 123'
    );
  });

  it('throws when job list fetch fails', () => {
    mockExecSync.mockImplementationOnce(() => execReturns('glab version 1.40.0'));
    mockExecSync.mockImplementationOnce(() => execReturns(''));
    mockExecSync.mockImplementationOnce(() => {
      execThrows('not found');
    });

    expect(() => fetchGitLabFailedLog('404')).toThrow(
      'Failed to list jobs for pipeline 404'
    );
  });

  it('throws when job trace fetch fails', () => {
    mockExecSync.mockImplementationOnce(() => execReturns('glab version 1.40.0'));
    mockExecSync.mockImplementationOnce(() => execReturns(''));
    mockExecSync.mockImplementationOnce(() =>
      execReturns(JSON.stringify([{ id: 77, name: 'test', status: 'failed' }]))
    );
    mockExecSync.mockImplementationOnce(() => {
      execThrows('glab api error: 500 internal server error');
    });

    expect(() => fetchGitLabFailedLog('777')).toThrow(
      'Failed to fetch log for job test'
    );
  });
});

// ---------------------------------------------------------------------------
// detectLatestFailedPipelineId (via fetchGitLabFailedLog without a pipelineId)
// ---------------------------------------------------------------------------

describe('detectLatestFailedPipelineId (via fetchGitLabFailedLog auto-detect)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('auto-detects the latest failed pipeline and fetches its log', () => {
    // glab --version
    mockExecSync.mockImplementationOnce(() => execReturns('glab version 1.40.0'));
    // glab auth status
    mockExecSync.mockImplementationOnce(() => execReturns(''));
    // git branch
    mockExecSync.mockImplementationOnce(() => execReturns('main'));
    // glab ci list --status failed --per-page 1 --output json
    mockExecSync.mockImplementationOnce(() =>
      execReturns(JSON.stringify([{ id: 555 }]))
    );
    // glab api pipelines/555/jobs
    mockExecSync.mockImplementationOnce(() =>
      execReturns(JSON.stringify([{ id: 88, name: 'deploy', status: 'failed' }]))
    );
    // glab api jobs/88/trace
    mockExecSync.mockImplementationOnce(() => execReturns('pipeline auto-detect log'));

    const result = fetchGitLabFailedLog();
    expect(result).toBe('pipeline auto-detect log');
  });

  it('throws when no failed pipelines are found (empty array)', () => {
    mockExecSync.mockImplementationOnce(() => execReturns('glab version 1.40.0'));
    mockExecSync.mockImplementationOnce(() => execReturns(''));
    mockExecSync.mockImplementationOnce(() => execReturns('main'));
    // glab ci list returns empty
    mockExecSync.mockImplementationOnce(() => execReturns('[]'));

    expect(() => fetchGitLabFailedLog()).toThrow('No failed pipelines found on branch');
  });

  it('throws when glab ci list returns empty string', () => {
    mockExecSync.mockImplementationOnce(() => execReturns('glab version 1.40.0'));
    mockExecSync.mockImplementationOnce(() => execReturns(''));
    mockExecSync.mockImplementationOnce(() => execReturns('main'));
    mockExecSync.mockImplementationOnce(() => execReturns(''));

    expect(() => fetchGitLabFailedLog()).toThrow('No failed pipelines found on branch');
  });
});

// ---------------------------------------------------------------------------
// Error mapping functions (tested via public API surface)
// ---------------------------------------------------------------------------

describe('error mapping (mapGhError / mapGlabError via thrown messages)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('maps "command not found" to install instruction for gh', () => {
    mockExecSync.mockImplementationOnce(() => {
      execThrows('gh: not found');
    });
    expect(() => fetchFailedLog()).toThrow('Install GitHub CLI: https://cli.github.com');
  });

  it('maps "not logged into" to auth instruction for gh', () => {
    mockExecSync.mockImplementationOnce(() => execReturns('gh version 2.40.0'));
    mockExecSync.mockImplementationOnce(() => {
      execThrows('not logged into any GitHub hosts');
    });
    expect(() => fetchFailedLog('1')).toThrow('Run: gh auth login');
  });

  it('maps "could not resolve" to repo access hint for gh', () => {
    mockExecSync.mockImplementationOnce(() => execReturns('gh version 2.40.0'));
    mockExecSync.mockImplementationOnce(() => execReturns(''));
    mockExecSync.mockImplementationOnce(() => {
      execThrows('could not resolve owner/badrepo');
    });
    expect(() => fetchFailedLog('1', 'owner/badrepo')).toThrow(
      'Check repo name and that you have access'
    );
  });

  it('maps "command not found" to install instruction for glab', () => {
    mockExecSync.mockImplementationOnce(() => {
      execThrows('glab: not found');
    });
    expect(() => fetchGitLabFailedLog('1')).toThrow(
      'Install GitLab CLI: https://gitlab.com/gitlab-org/cli'
    );
  });

  it('maps "not found" (404) to repo access hint for glab', () => {
    mockExecSync.mockImplementationOnce(() => execReturns('glab version 1.40.0'));
    mockExecSync.mockImplementationOnce(() => execReturns(''));
    mockExecSync.mockImplementationOnce(() => {
      execThrows('project not found: 404');
    });
    expect(() => fetchGitLabFailedLog('999')).toThrow(
      'Check project path and that you have access'
    );
  });
});

import { detectCIProvider, detectProviderFromLog } from '../ci-provider.js';

// ---------------------------------------------------------------------------
// detectCIProvider (env var detection)
// ---------------------------------------------------------------------------

describe('detectCIProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Clear CI-related vars
    delete process.env['CI_JOB_NAME'];
    delete process.env['CI_PIPELINE_ID'];
    delete process.env['CI_PIPELINE_URL'];
    delete process.env['GITHUB_ACTIONS'];
    delete process.env['GITHUB_JOB'];
    delete process.env['GITHUB_RUN_ID'];
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('detects GitLab CI from CI_JOB_NAME', () => {
    process.env['CI_JOB_NAME'] = 'build';
    process.env['CI_PIPELINE_ID'] = '12345';
    const result = detectCIProvider();
    expect(result.provider).toBe('gitlab');
    expect(result.jobName).toBe('build');
    expect(result.runId).toBe('12345');
  });

  test('detects GitLab CI from CI_PIPELINE_ID alone', () => {
    process.env['CI_PIPELINE_ID'] = '99999';
    const result = detectCIProvider();
    expect(result.provider).toBe('gitlab');
    expect(result.runId).toBe('99999');
  });

  test('detects GitHub Actions from GITHUB_ACTIONS', () => {
    process.env['GITHUB_ACTIONS'] = 'true';
    process.env['GITHUB_JOB'] = 'test';
    process.env['GITHUB_RUN_ID'] = '67890';
    const result = detectCIProvider();
    expect(result.provider).toBe('github');
    expect(result.jobName).toBe('test');
    expect(result.runId).toBe('67890');
  });

  test('returns unknown when no CI env vars are set', () => {
    const result = detectCIProvider();
    expect(result.provider).toBe('unknown');
    expect(result.jobName).toBe('');
    expect(result.runId).toBe('');
  });

  test('GitLab takes precedence when both are set', () => {
    process.env['CI_JOB_NAME'] = 'deploy';
    process.env['CI_PIPELINE_ID'] = '111';
    process.env['GITHUB_ACTIONS'] = 'true';
    const result = detectCIProvider();
    expect(result.provider).toBe('gitlab');
  });

  test('includes CI_PIPELINE_URL when available', () => {
    process.env['CI_JOB_NAME'] = 'test';
    process.env['CI_PIPELINE_ID'] = '222';
    process.env['CI_PIPELINE_URL'] = 'https://gitlab.com/myorg/myapp/-/pipelines/222';
    const result = detectCIProvider();
    expect(result.pipelineUrl).toBe('https://gitlab.com/myorg/myapp/-/pipelines/222');
  });
});

// ---------------------------------------------------------------------------
// detectProviderFromLog (log content heuristics)
// ---------------------------------------------------------------------------

describe('detectProviderFromLog', () => {
  test('detects GitLab from section_start marker', () => {
    const log = 'section_start:1234567890:build_script\r\n$ npm run build\nsection_end:1234567890:build_script\r';
    expect(detectProviderFromLog(log)).toBe('gitlab');
  });

  test('detects GitHub from ##[error] marker', () => {
    const log = '##[group]Run tests\n##[error]Process completed with exit code 1.';
    expect(detectProviderFromLog(log)).toBe('github');
  });

  test('detects GitHub from tab-separated format', () => {
    const log = 'Build\tRun tests\t2026-02-21T10:00:01.000Z some output';
    expect(detectProviderFromLog(log)).toBe('github');
  });

  test('returns unknown for plain text log', () => {
    const log = 'Running build...\nBuild succeeded.\nDone.';
    expect(detectProviderFromLog(log)).toBe('unknown');
  });
});

/**
 * Integration tests: full pipeline from raw gh log to prompt output.
 * Each scenario uses a realistic gh log snippet from a different failure type.
 */
import { extractErrors } from '../error-extractor.js';
import { buildPrompt } from '../prompt-builder.js';

// ---------------------------------------------------------------------------
// Scenario 1: TypeScript compile error (tsc fails on type mismatch)
// ---------------------------------------------------------------------------
const TS_COMPILE_LOG = `
Build\tInstall dependencies\t2026-02-21T10:00:01.000Z added 42 packages in 3s
Build\tRun build\t2026-02-21T10:00:05.000Z ##[group]Run npx tsc
Build\tRun build\t2026-02-21T10:00:06.000Z src/parser.ts(42,7): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
Build\tRun build\t2026-02-21T10:00:06.000Z src/parser.ts(42,7): error TS2345:   Type 'undefined' is not assignable to type 'string'.
Build\tRun build\t2026-02-21T10:00:07.000Z Found 1 error in src/parser.ts(42,7)
Build\tRun build\t2026-02-21T10:00:07.000Z ##[endgroup]
Build\tRun build\t2026-02-21T10:00:07.000Z ##[error]Process completed with exit code 2.
`.trim();

// ---------------------------------------------------------------------------
// Scenario 2: npm ERR! missing module (dependency not installed)
// ---------------------------------------------------------------------------
const NPM_ERR_LOG = `
Deploy\tInstall dependencies\t2026-02-21T11:00:01.000Z npm warn deprecated glob@7.2.3
Deploy\tRun server\t2026-02-21T11:00:10.000Z ##[group]Run node dist/server.js
Deploy\tRun server\t2026-02-21T11:00:10.000Z node:internal/modules/cjs/loader:1148
Deploy\tRun server\t2026-02-21T11:00:10.000Z   throw err;
Deploy\tRun server\t2026-02-21T11:00:10.000Z   ^
Deploy\tRun server\t2026-02-21T11:00:10.000Z Error: Cannot find module 'express'
Deploy\tRun server\t2026-02-21T11:00:10.000Z Require stack:
Deploy\tRun server\t2026-02-21T11:00:10.000Z - /home/runner/work/app/dist/server.js
Deploy\tRun server\t2026-02-21T11:00:10.000Z npm ERR! code 1
Deploy\tRun server\t2026-02-21T11:00:10.000Z npm ERR! path /home/runner/work/app
Deploy\tRun server\t2026-02-21T11:00:10.000Z npm ERR! command failed
Deploy\tRun server\t2026-02-21T11:00:11.000Z ##[endgroup]
Deploy\tRun server\t2026-02-21T11:00:11.000Z ##[error]Process completed with exit code 1.
`.trim();

// ---------------------------------------------------------------------------
// Scenario 3: Jest test failure (realistic vitest/jest output)
// ---------------------------------------------------------------------------
const JEST_FAILURE_LOG = `
Test\tRun tests\t2026-02-21T12:00:01.000Z ##[group]Run npm test
Test\tRun tests\t2026-02-21T12:00:03.000Z PASS src/__tests__/utils.test.ts
Test\tRun tests\t2026-02-21T12:00:04.000Z FAIL src/__tests__/auth.test.ts
Test\tRun tests\t2026-02-21T12:00:04.000Z   ● auth › login › returns 401 for invalid credentials
Test\tRun tests\t2026-02-21T12:00:04.000Z     expect(received).toBe(expected)
Test\tRun tests\t2026-02-21T12:00:04.000Z     Expected: 401
Test\tRun tests\t2026-02-21T12:00:04.000Z     Received: 200
Test\tRun tests\t2026-02-21T12:00:04.000Z     at src/__tests__/auth.test.ts:34:5
Test\tRun tests\t2026-02-21T12:00:04.000Z Test Suites: 1 failed, 1 passed, 2 total
Test\tRun tests\t2026-02-21T12:00:04.000Z Tests:       1 failed, 12 passed, 13 total
Test\tRun tests\t2026-02-21T12:00:05.000Z ##[endgroup]
Test\tRun tests\t2026-02-21T12:00:05.000Z ##[error]Process completed with exit code 1.
`.trim();

// ---------------------------------------------------------------------------
// Scenario 1 tests: TypeScript compile error
// ---------------------------------------------------------------------------
describe('scenario 1: TypeScript compile error', () => {
  it('identifies the failing step as the build step', () => {
    const result = extractErrors(TS_COMPILE_LOG);
    expect(result.stepName).toBe('Run build');
  });

  it('strips gh metadata prefix from error lines', () => {
    const result = extractErrors(TS_COMPILE_LOG);
    const hasRawPrefix = result.errorLines.some((l) => l.includes('\tRun build\t'));
    expect(hasRawPrefix).toBe(false);
  });

  it('extracts the TypeScript error code (TS2345) in the context', () => {
    const result = extractErrors(TS_COMPILE_LOG);
    const hasErrorCode = result.errorLines.some((l) => l.includes('TS2345'));
    expect(hasErrorCode).toBe(true);
  });

  it('extracts file path from TypeScript error', () => {
    const result = extractErrors(TS_COMPILE_LOG);
    expect(result.filePaths.some((p) => p.includes('src/'))).toBe(true);
  });

  it('builds a complete prompt with TS error context', () => {
    const error = extractErrors(TS_COMPILE_LOG);
    const prompt = buildPrompt({
      repo: 'homeofe/myapp',
      branch: 'feat/auth',
      runId: '11111',
      includeContext: false,
      error,
    });
    expect(prompt).toContain('## CI Failure');
    expect(prompt).toContain('Run build');
    expect(prompt).toContain('TS2345');
    expect(prompt).toContain('### Task');
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 tests: npm ERR! missing module
// ---------------------------------------------------------------------------
describe('scenario 2: npm ERR! missing module', () => {
  it('identifies the failing step as the run step', () => {
    const result = extractErrors(NPM_ERR_LOG);
    expect(result.stepName).toBe('Run server');
  });

  it('captures the Cannot find module error', () => {
    const result = extractErrors(NPM_ERR_LOG);
    const hasModuleError = result.errorLines.some((l) =>
      l.includes("Cannot find module 'express'")
    );
    expect(hasModuleError).toBe(true);
  });

  it('does not include raw timestamps in output', () => {
    const result = extractErrors(NPM_ERR_LOG);
    const hasTimestamp = result.errorLines.some((l) =>
      /\d{4}-\d{2}-\d{2}T[\d:.]+Z/.test(l)
    );
    expect(hasTimestamp).toBe(false);
  });

  it('builds a prompt that is paste-ready for an LLM', () => {
    const error = extractErrors(NPM_ERR_LOG);
    const prompt = buildPrompt({
      repo: 'homeofe/myapp',
      branch: 'main',
      runId: '22222',
      includeContext: false,
      error,
    });
    expect(prompt).toContain('Cannot find module');
    expect(prompt).toContain('Fix the error above');
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 tests: Jest test failure
// ---------------------------------------------------------------------------
describe('scenario 3: Jest test failure', () => {
  it('identifies the failing step', () => {
    const result = extractErrors(JEST_FAILURE_LOG);
    expect(result.stepName).toBe('Run tests');
  });

  it('captures the assertion failure details', () => {
    const result = extractErrors(JEST_FAILURE_LOG);
    const hasAssertion = result.errorLines.some((l) => l.includes('Expected: 401'));
    expect(hasAssertion).toBe(true);
  });

  it('extracts file path from jest stack trace', () => {
    const result = extractErrors(JEST_FAILURE_LOG);
    expect(result.filePaths.some((p) => p.includes('src/'))).toBe(true);
  });

  it('full prompt contains the received vs expected values', () => {
    const error = extractErrors(JEST_FAILURE_LOG);
    const prompt = buildPrompt({
      repo: 'homeofe/myapp',
      branch: 'fix/auth',
      runId: '33333',
      includeContext: false,
      error,
    });
    expect(prompt).toContain('Expected: 401');
    expect(prompt).toContain('Received: 200');
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: GitLab CI build failure (realistic gitlab-ci.yml log)
// ---------------------------------------------------------------------------
const GITLAB_BUILD_LOG = [
  '\x1b[0Ksection_start:1700000001:prepare_executor\r\x1b[0K\x1b[0;33mPreparing the "docker" executor\x1b[0;m',
  'Using Docker executor with image node:20-alpine...',
  '\x1b[0Ksection_end:1700000002:prepare_executor\r\x1b[0K',
  '\x1b[0Ksection_start:1700000003:get_sources\r\x1b[0K\x1b[0;33mGetting source from Git repository\x1b[0;m',
  'Fetching changes with git depth set to 50...',
  '\x1b[0Ksection_end:1700000004:get_sources\r\x1b[0K',
  '\x1b[0Ksection_start:1700000005:build_script\r\x1b[0K\x1b[0;33mExecuting "step_script" stage\x1b[0;m',
  '\x1b[32;1m$ npm ci\x1b[0;m',
  'added 142 packages in 4s',
  '\x1b[32;1m$ npm run build\x1b[0;m',
  '> myapp@1.0.0 build',
  '> tsc',
  'src/api/handler.ts(15,3): error TS2322: Type \'string\' is not assignable to type \'number\'.',
  'src/api/handler.ts(28,10): error TS2345: Argument of type \'undefined\' is not assignable.',
  'Found 2 errors in src/api/handler.ts.',
  'ERROR: Job failed: exit code 2',
  '\x1b[0Ksection_end:1700000006:build_script\r\x1b[0K',
].join('\n');

// ---------------------------------------------------------------------------
// Scenario 5: GitLab CI test failure (Jest via gitlab-ci.yml)
// ---------------------------------------------------------------------------
const GITLAB_TEST_LOG = [
  '\x1b[0Ksection_start:1700000001:build_script\r\x1b[0K\x1b[32;1m$ npm test\x1b[0;m',
  'PASS src/__tests__/utils.test.ts',
  'FAIL src/__tests__/auth.test.ts',
  '  \x1b[31m\x1b[1m● auth > login > rejects invalid token\x1b[22m\x1b[39m',
  '    expect(received).toThrow()',
  '',
  '    Expected: to throw',
  '    Received: function did not throw',
  '',
  '      at src/__tests__/auth.test.ts:42:5',
  'Tests: 1 failed, 8 passed, 9 total',
  'ERROR: Job failed: exit code 1',
  '\x1b[0Ksection_end:1700000002:build_script\r\x1b[0K',
].join('\n');

// ---------------------------------------------------------------------------
// Scenario 4 tests: GitLab CI build failure
// ---------------------------------------------------------------------------
describe('scenario 4: GitLab CI build failure', () => {
  it('identifies the failing section as build_script', () => {
    const result = extractErrors(GITLAB_BUILD_LOG, 'gitlab');
    expect(result.stepName).toBe('build_script');
  });

  it('strips ANSI and section markers from error lines', () => {
    const result = extractErrors(GITLAB_BUILD_LOG, 'gitlab');
    const hasAnsi = result.errorLines.some((l) => /\x1b\[/.test(l));
    expect(hasAnsi).toBe(false);
    const hasSectionMarker = result.errorLines.some((l) => l.includes('section_start'));
    expect(hasSectionMarker).toBe(false);
  });

  it('captures TypeScript error codes from GitLab log', () => {
    const result = extractErrors(GITLAB_BUILD_LOG, 'gitlab');
    expect(result.errorLines.some((l) => l.includes('TS2322'))).toBe(true);
  });

  it('extracts file paths from GitLab error output', () => {
    const result = extractErrors(GITLAB_BUILD_LOG, 'gitlab');
    expect(result.filePaths.some((p) => p.includes('src/'))).toBe(true);
  });

  it('builds a complete prompt from GitLab CI log', () => {
    const error = extractErrors(GITLAB_BUILD_LOG, 'gitlab');
    const prompt = buildPrompt({
      repo: 'myorg/myapp',
      branch: 'feat/api',
      runId: '55555',
      includeContext: false,
      error,
    });
    expect(prompt).toContain('## CI Failure');
    expect(prompt).toContain('build_script');
    expect(prompt).toContain('TS2322');
    expect(prompt).toContain('### Task');
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 tests: GitLab CI test failure
// ---------------------------------------------------------------------------
describe('scenario 5: GitLab CI test failure', () => {
  it('identifies the failing section', () => {
    const result = extractErrors(GITLAB_TEST_LOG, 'gitlab');
    expect(result.stepName).toBe('build_script');
  });

  it('captures the assertion failure details', () => {
    const result = extractErrors(GITLAB_TEST_LOG, 'gitlab');
    expect(result.errorLines.some((l) => l.includes('function did not throw'))).toBe(true);
  });

  it('extracts file path from test stack trace', () => {
    const result = extractErrors(GITLAB_TEST_LOG, 'gitlab');
    expect(result.filePaths.some((p) => p.includes('src/'))).toBe(true);
  });

  it('full prompt includes expected vs received from GitLab log', () => {
    const error = extractErrors(GITLAB_TEST_LOG, 'gitlab');
    const prompt = buildPrompt({
      repo: 'myorg/myapp',
      branch: 'fix/auth',
      runId: '66666',
      includeContext: false,
      error,
    });
    expect(prompt).toContain('function did not throw');
    expect(prompt).toContain('Fix the error above');
  });
});

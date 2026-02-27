import { extractErrors, extractFilePaths, normalizeGitLabLog } from '../error-extractor.js';

// ---------------------------------------------------------------------------
// Fixture logs
// ---------------------------------------------------------------------------

const SIMPLE_LOG = `
2024-01-15T10:00:00.0000000Z ##[group]Run npm test
2024-01-15T10:00:01.0000000Z Running tests...
2024-01-15T10:00:02.0000000Z \x1b[31mFAIL\x1b[0m src/app.test.ts
2024-01-15T10:00:03.0000000Z ##[error]Process completed with exit code 1.
2024-01-15T10:00:03.0000000Z ##[endgroup]
`.trim();

const MULTI_STEP_LOG = `
2024-01-15T10:00:00.0000000Z ##[group]Install dependencies
2024-01-15T10:00:01.0000000Z npm install
2024-01-15T10:00:02.0000000Z added 100 packages
2024-01-15T10:00:03.0000000Z ##[endgroup]
2024-01-15T10:00:04.0000000Z ##[group]Run linter
2024-01-15T10:00:05.0000000Z Running ESLint...
2024-01-15T10:00:06.0000000Z src/foo.ts:10:5 - error: unexpected token
2024-01-15T10:00:07.0000000Z ##[error]Process completed with exit code 1.
2024-01-15T10:00:08.0000000Z ##[endgroup]
`.trim();

const LOG_WITH_FILE_PATH = `
2024-01-15T10:00:00.0000000Z ##[group]Run build
2024-01-15T10:00:01.0000000Z > tsc
2024-01-15T10:00:02.0000000Z ##[error]src/index.ts:42:10 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
2024-01-15T10:00:03.0000000Z ##[endgroup]
`.trim();

const LOG_WITH_ANSI = `
2024-01-15T10:00:00.0000000Z ##[group]Run tests
2024-01-15T10:00:01.0000000Z \x1b[32m●\x1b[0m \x1b[1mshould pass\x1b[0m
2024-01-15T10:00:02.0000000Z \x1b[31mFAIL\x1b[0m src/app.test.ts
2024-01-15T10:00:03.0000000Z ##[error]Test suite failed to run.
2024-01-15T10:00:04.0000000Z ##[endgroup]
`.trim();

const EMPTY_LOG = '';

const NO_ERROR_LOG = `
2024-01-15T10:00:00.0000000Z ##[group]Run build
2024-01-15T10:00:01.0000000Z Build successful
2024-01-15T10:00:02.0000000Z ##[endgroup]
`.trim();

const MULTI_ERROR_LOG = `
2024-01-15T10:00:00.0000000Z ##[group]Run tests
2024-01-15T10:00:01.0000000Z Test 1 failed
2024-01-15T10:00:02.0000000Z ##[error]First error: test assertion failed
2024-01-15T10:00:03.0000000Z ##[endgroup]
2024-01-15T10:00:04.0000000Z ##[group]Run coverage
2024-01-15T10:00:05.0000000Z Collecting coverage...
2024-01-15T10:00:06.0000000Z ##[error]Second error: coverage below threshold
2024-01-15T10:00:07.0000000Z ##[endgroup]
`.trim();

// New fixtures for extended error detection tests

const NPM_ERR_LOG = `
2024-01-15T10:00:00.0000000Z ##[group]Run install
2024-01-15T10:00:01.0000000Z npm ERR! code ENOENT
2024-01-15T10:00:02.0000000Z npm ERR! syscall open
2024-01-15T10:00:03.0000000Z npm ERR! path /home/runner/work/package.json
2024-01-15T10:00:04.0000000Z npm ERR! errno -2
2024-01-15T10:00:05.0000000Z ##[endgroup]
`.trim();

const PLAIN_ERROR_LOG = `
2024-01-15T10:00:00.0000000Z ##[group]Run build
2024-01-15T10:00:01.0000000Z > tsc --noEmit
2024-01-15T10:00:02.0000000Z Error: Cannot find module 'react'
2024-01-15T10:00:03.0000000Z     at Function.Module._resolveFilename
2024-01-15T10:00:04.0000000Z ##[endgroup]
`.trim();

const NO_MARKERS_LOG = `
2024-01-15T10:00:00.0000000Z Step started
2024-01-15T10:00:01.0000000Z Running task
2024-01-15T10:00:02.0000000Z Task completed normally
2024-01-15T10:00:03.0000000Z Post-step cleanup
2024-01-15T10:00:04.0000000Z All done
`.trim();

const MATRIX_ERROR_LOG = `
2024-01-15T10:00:00.0000000Z ##[group]Run tests (node-18)
2024-01-15T10:00:01.0000000Z Test suite started
2024-01-15T10:00:02.0000000Z ##[error]node-18: Test failed: expected 1 to equal 2
2024-01-15T10:00:03.0000000Z ##[endgroup]
2024-01-15T10:00:04.0000000Z ##[group]Run tests (node-20)
2024-01-15T10:00:05.0000000Z Test suite started
2024-01-15T10:00:06.0000000Z ##[error]node-20: Test failed: undefined is not a function
2024-01-15T10:00:07.0000000Z ##[endgroup]
2024-01-15T10:00:08.0000000Z ##[group]Run tests (node-22)
2024-01-15T10:00:09.0000000Z Test suite started
2024-01-15T10:00:10.0000000Z ##[error]node-22: Test failed: timeout after 5000ms
2024-01-15T10:00:11.0000000Z ##[endgroup]
`.trim();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extractErrors', () => {
  test('1. Extracts step name correctly from a simple log', () => {
    const result = extractErrors(SIMPLE_LOG);
    expect(result.stepName).toBe('Run npm test');
  });

  test('2. Finds ##[error] lines and collects them in allErrors', () => {
    const result = extractErrors(SIMPLE_LOG);
    expect(result.allErrors).toHaveLength(1);
    expect(result.allErrors[0]).toContain('Process completed with exit code 1');
  });

  test('3. Strips ANSI escape codes from output', () => {
    const result = extractErrors(LOG_WITH_ANSI);
    // None of the error lines should contain ANSI sequences
    for (const line of result.errorLines) {
      expect(line).not.toMatch(/\x1b\[/);
    }
  });

  test('4. Handles empty log gracefully (returns empty result)', () => {
    const result = extractErrors(EMPTY_LOG);
    expect(result.stepName).toBe('(unknown)');
    expect(result.errorLines).toHaveLength(0);
    expect(result.allErrors).toHaveLength(0);
    expect(result.fullContext).toBe('');
    expect(result.filePaths).toHaveLength(0);
  });

  test('5. Handles log with no error markers - falls back to last 30 lines', () => {
    const result = extractErrors(NO_ERROR_LOG);
    // With no ##[error] markers and no extended error patterns,
    // extractErrors falls back to the last 30 lines so the user gets something useful
    expect(result.stepName).toBe('(unknown)');
    expect(result.allErrors).toHaveLength(0); // no real error lines detected
    // errorLines should contain the log lines (fallback output)
    expect(result.errorLines.length).toBeGreaterThan(0);
    expect(result.fullContext).toBeTruthy();
  });

  test('6. With multiple steps, picks the LAST failing step', () => {
    const result = extractErrors(MULTI_STEP_LOG);
    // The last ##[group] before the last ##[error] is "Run linter"
    expect(result.stepName).toBe('Run linter');
  });

  test('7. Collects all ##[error] lines when multiple errors exist', () => {
    const result = extractErrors(MULTI_ERROR_LOG);
    expect(result.allErrors).toHaveLength(2);
    expect(result.allErrors[0]).toContain('First error');
    expect(result.allErrors[1]).toContain('Second error');
  });

  test('8. Strips timestamps from output lines', () => {
    const result = extractErrors(SIMPLE_LOG);
    for (const line of result.errorLines) {
      expect(line).not.toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  test('9. fullContext is a non-empty string when errors are found', () => {
    const result = extractErrors(SIMPLE_LOG);
    expect(result.fullContext).toBeTruthy();
    expect(typeof result.fullContext).toBe('string');
  });

  test('10. Error lines are limited to 50 lines maximum', () => {
    // Create a log with many lines
    const manyLines = Array.from({ length: 100 }, () =>
      `2024-01-15T10:00:00.0000000Z ##[group]Big step`
    );
    manyLines.push(...Array.from({ length: 100 }, (_, i) =>
      `2024-01-15T10:00:01.0000000Z Line ${String(i)}: some output`
    ));
    manyLines.push('2024-01-15T10:00:02.0000000Z ##[error]Something failed');
    const bigLog = manyLines.join('\n');
    const result = extractErrors(bigLog);
    expect(result.errorLines.length).toBeLessThanOrEqual(50);
  });
});

describe('extractFilePaths', () => {
  test('11. Extracts file path from a TypeScript error line', () => {
    const lines = ['##[error]src/index.ts:42:10 - error TS2345'];
    const paths = extractFilePaths(lines);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths[0]).toContain('src/index.ts');
  });

  test('12. Extracts paths with src/ prefix', () => {
    const result = extractErrors(LOG_WITH_FILE_PATH);
    expect(result.filePaths.length).toBeGreaterThan(0);
    expect(result.filePaths[0]).toMatch(/src\/index\.ts/i);
  });

  test('13. Returns empty array when no file paths found', () => {
    const lines = ['##[error]Process completed with exit code 1.'];
    const paths = extractFilePaths(lines);
    expect(paths).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Extended error detection tests (Fix 2)
// ---------------------------------------------------------------------------

describe('Extended error detection', () => {
  test('14. Detects npm ERR! lines as errors (no ##[error] marker needed)', () => {
    const result = extractErrors(NPM_ERR_LOG);
    expect(result.errorLines.length).toBeGreaterThan(0);
    expect(result.fullContext).toContain('npm ERR!');
    // allErrors should include the npm ERR! lines
    expect(result.allErrors.length).toBeGreaterThan(0);
  });

  test('15. Detects plain "Error:" prefix without ##[error] marker', () => {
    const result = extractErrors(PLAIN_ERROR_LOG);
    expect(result.errorLines.length).toBeGreaterThan(0);
    // Should detect "Error: Cannot find module 'react'"
    expect(result.fullContext).toContain('Error:');
    expect(result.allErrors.length).toBeGreaterThan(0);
  });

  test('16. Falls back to last 30 lines when no markers or error patterns found', () => {
    const result = extractErrors(NO_MARKERS_LOG);
    // Should return lines (last 30 fallback), not empty
    expect(result.errorLines.length).toBeGreaterThan(0);
    // allErrors should be empty (no error lines found)
    expect(result.allErrors).toHaveLength(0);
    // stepName is unknown since there are no group markers either
    expect(result.stepName).toBe('(unknown)');
  });

  test('17. Matrix build log with multiple job errors - all captured in allErrors', () => {
    const result = extractErrors(MATRIX_ERROR_LOG);
    // All 3 ##[error] lines from the 3 matrix jobs should be collected
    expect(result.allErrors).toHaveLength(3);
    expect(result.allErrors.some((e) => e.includes('node-18'))).toBe(true);
    expect(result.allErrors.some((e) => e.includes('node-20'))).toBe(true);
    expect(result.allErrors.some((e) => e.includes('node-22'))).toBe(true);
    // Context should focus on the last error (node-22)
    expect(result.stepName).toBe('Run tests (node-22)');
  });
});

// ---------------------------------------------------------------------------
// GitLab CI log format tests
// ---------------------------------------------------------------------------

const GITLAB_SIMPLE_LOG = [
  '\x1b[0Ksection_start:1700000001:build_script\r\x1b[0K\x1b[32;1m$ npm run build\x1b[0;m',
  'src/index.ts(10,5): error TS2345: Argument of type \'string\' is not assignable.',
  'ERROR: Job failed: exit code 1',
  '\x1b[0Ksection_end:1700000002:build_script\r\x1b[0K',
].join('\n');

const GITLAB_MULTI_SECTION_LOG = [
  '\x1b[0Ksection_start:1700000001:prepare_executor\r\x1b[0KPreparing the "docker" executor',
  'Using Docker executor...',
  '\x1b[0Ksection_end:1700000002:prepare_executor\r\x1b[0K',
  '\x1b[0Ksection_start:1700000003:build_script\r\x1b[0K\x1b[32;1m$ npm test\x1b[0;m',
  'FAIL src/app.test.ts',
  '  Expected: 200',
  '  Received: 500',
  'ERROR: Job failed: exit code 1',
  '\x1b[0Ksection_end:1700000004:build_script\r\x1b[0K',
].join('\n');

const GITLAB_NPM_ERROR_LOG = [
  '\x1b[0Ksection_start:1700000001:build_script\r\x1b[0K$ npm install',
  'npm ERR! code ENOENT',
  'npm ERR! syscall open',
  'npm ERR! path /builds/myorg/myapp/package.json',
  '\x1b[0Ksection_end:1700000002:build_script\r\x1b[0K',
].join('\n');

const GITLAB_NO_SECTIONS_LOG = [
  '\x1b[32;1m$ npm run build\x1b[0;m',
  'Building...',
  'Error: Cannot find module \'react\'',
  'ERROR: Job failed: exit code 1',
].join('\n');

describe('normalizeGitLabLog', () => {
  test('18. Converts section_start to ##[group]', () => {
    const normalized = normalizeGitLabLog(GITLAB_SIMPLE_LOG);
    expect(normalized).toContain('##[group]build_script');
    expect(normalized).not.toContain('section_start');
  });

  test('19. Converts section_end to ##[endgroup]', () => {
    const normalized = normalizeGitLabLog(GITLAB_SIMPLE_LOG);
    expect(normalized).toContain('##[endgroup]');
    expect(normalized).not.toContain('section_end');
  });

  test('20. Converts ERROR: Job failed to ##[error]', () => {
    const normalized = normalizeGitLabLog(GITLAB_SIMPLE_LOG);
    expect(normalized).toContain('##[error]ERROR: Job failed');
  });

  test('21. Strips ANSI escape codes', () => {
    const normalized = normalizeGitLabLog(GITLAB_SIMPLE_LOG);
    expect(normalized).not.toMatch(/\x1b\[/);
  });

  test('22. Strips carriage returns', () => {
    const normalized = normalizeGitLabLog(GITLAB_SIMPLE_LOG);
    expect(normalized).not.toContain('\r');
  });
});

describe('GitLab CI error extraction', () => {
  test('23. Extracts step name from GitLab section marker', () => {
    const result = extractErrors(GITLAB_SIMPLE_LOG, 'gitlab');
    expect(result.stepName).toBe('build_script');
  });

  test('24. Detects ERROR: Job failed as a ##[error] line', () => {
    const result = extractErrors(GITLAB_SIMPLE_LOG, 'gitlab');
    expect(result.allErrors.length).toBeGreaterThan(0);
    expect(result.allErrors.some((e) => e.includes('Job failed'))).toBe(true);
  });

  test('25. Captures TypeScript error from GitLab build log', () => {
    const result = extractErrors(GITLAB_SIMPLE_LOG, 'gitlab');
    expect(result.fullContext).toContain('TS2345');
  });

  test('26. Handles multi-section GitLab log - focuses on failing section', () => {
    const result = extractErrors(GITLAB_MULTI_SECTION_LOG, 'gitlab');
    expect(result.stepName).toBe('build_script');
    expect(result.fullContext).toContain('FAIL');
  });

  test('27. Captures npm ERR! from GitLab log', () => {
    const result = extractErrors(GITLAB_NPM_ERROR_LOG, 'gitlab');
    expect(result.fullContext).toContain('npm ERR!');
  });

  test('28. Auto-detects GitLab provider from log content', () => {
    // Use 'auto' (default) - should detect GitLab from section markers
    const result = extractErrors(GITLAB_SIMPLE_LOG);
    expect(result.stepName).toBe('build_script');
    expect(result.allErrors.some((e) => e.includes('Job failed'))).toBe(true);
  });

  test('29. Handles GitLab log without section markers', () => {
    const result = extractErrors(GITLAB_NO_SECTIONS_LOG, 'gitlab');
    // Should still find errors via heuristics
    expect(result.errorLines.length).toBeGreaterThan(0);
    expect(result.fullContext).toContain('Cannot find module');
  });

  test('30. Strips ANSI from GitLab error output', () => {
    const result = extractErrors(GITLAB_MULTI_SECTION_LOG, 'gitlab');
    for (const line of result.errorLines) {
      expect(line).not.toMatch(/\x1b\[/);
    }
  });

  test('31. Extracts file paths from GitLab error lines', () => {
    const result = extractErrors(GITLAB_MULTI_SECTION_LOG, 'gitlab');
    expect(result.filePaths.some((p) => p.includes('src/'))).toBe(true);
  });
});

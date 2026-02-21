import { extractErrors, extractFilePaths } from '../error-extractor.js';

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

  test('5. Handles log with no errors gracefully', () => {
    const result = extractErrors(NO_ERROR_LOG);
    expect(result.stepName).toBe('(unknown)');
    expect(result.errorLines).toHaveLength(0);
    expect(result.allErrors).toHaveLength(0);
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
    const manyLines = Array.from({ length: 100 }, (_, i) =>
      `2024-01-15T10:00:00.0000000Z ##[group]Big step`
    );
    manyLines.push(...Array.from({ length: 100 }, (_, i) =>
      `2024-01-15T10:00:01.0000000Z Line ${i}: some output`
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

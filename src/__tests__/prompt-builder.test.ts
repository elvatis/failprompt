import { buildPrompt, readFileContext } from '../prompt-builder.js';
import type { ExtractedError } from '../error-extractor.js';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import os from 'os';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_ERROR: ExtractedError = {
  stepName: 'Run tests',
  errorLines: [
    '##[group]Run tests',
    'FAIL src/app.test.ts',
    '  ● test suite failed to run',
    '##[error]Process completed with exit code 1.',
    '##[endgroup]',
  ],
  allErrors: ['##[error]Process completed with exit code 1.'],
  fullContext: `##[group]Run tests
FAIL src/app.test.ts
  ● test suite failed to run
##[error]Process completed with exit code 1.
##[endgroup]`,
  filePaths: ['src/app.test.ts'],
};

const MOCK_ERROR_NO_FILES: ExtractedError = {
  stepName: 'Deploy',
  errorLines: ['##[error]Deployment failed: timeout'],
  allErrors: ['##[error]Deployment failed: timeout'],
  fullContext: '##[error]Deployment failed: timeout',
  filePaths: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildPrompt', () => {
  test('1. Output contains header with repo name', () => {
    const prompt = buildPrompt({
      repo: 'myorg/myapp',
      branch: 'main',
      runId: '12345',
      includeContext: false,
      error: MOCK_ERROR,
    });
    expect(prompt).toContain('myorg/myapp');
    expect(prompt).toContain('## CI Failure');
  });

  test('2. Output contains branch name', () => {
    const prompt = buildPrompt({
      repo: 'myorg/myapp',
      branch: 'feat/my-feature',
      runId: '99',
      includeContext: false,
      error: MOCK_ERROR,
    });
    expect(prompt).toContain('feat/my-feature');
  });

  test('3. Output contains run ID', () => {
    const prompt = buildPrompt({
      repo: 'myorg/myapp',
      branch: 'main',
      runId: 'latest',
      includeContext: false,
      error: MOCK_ERROR,
    });
    expect(prompt).toContain('**Run:** latest');
  });

  test('4. Output contains failing step name', () => {
    const prompt = buildPrompt({
      repo: 'myorg/myapp',
      branch: 'main',
      runId: '123',
      includeContext: false,
      error: MOCK_ERROR,
    });
    expect(prompt).toContain('**Failing step:** Run tests');
  });

  test('5. Output contains Error section in a code block', () => {
    const prompt = buildPrompt({
      repo: 'myorg/myapp',
      branch: 'main',
      runId: '123',
      includeContext: false,
      error: MOCK_ERROR,
    });
    expect(prompt).toContain('### Error');
    expect(prompt).toContain('```');
    expect(prompt).toContain('Process completed with exit code 1');
  });

  test('6. Output WITHOUT context has no Source Context block', () => {
    const prompt = buildPrompt({
      repo: 'myorg/myapp',
      branch: 'main',
      runId: '123',
      includeContext: false,
      error: MOCK_ERROR,
    });
    expect(prompt).not.toContain('### Source Context');
  });

  test('7. Output contains Task section', () => {
    const prompt = buildPrompt({
      repo: 'myorg/myapp',
      branch: 'main',
      runId: '123',
      includeContext: false,
      error: MOCK_ERROR,
    });
    expect(prompt).toContain('### Task');
    expect(prompt).toContain('Fix the error above');
  });

  test('8. Output with includeContext=true but no file paths: no Source Context block', () => {
    const prompt = buildPrompt({
      repo: 'myorg/myapp',
      branch: 'main',
      runId: '123',
      includeContext: true,
      error: MOCK_ERROR_NO_FILES,
    });
    // No file paths → no source context even with includeContext=true
    expect(prompt).not.toContain('### Source Context');
  });

  test('9. Output with SOURCE context contains file content', () => {
    // Create a temp file to simulate found source context
    const tmpDir = os.tmpdir();
    const tmpFile = join(tmpDir, 'app.test.ts');
    writeFileSync(tmpFile, 'describe("suite", () => {\n  it("test", () => {});\n});\n', 'utf-8');

    try {
      const errorWithRealFile: ExtractedError = {
        ...MOCK_ERROR,
        filePaths: [tmpFile],
      };

      const prompt = buildPrompt({
        repo: 'myorg/myapp',
        branch: 'main',
        runId: '123',
        includeContext: true,
        error: errorWithRealFile,
      });

      // If the file was found and read, Source Context block should appear
      expect(prompt).toContain('### Source Context');
      expect(prompt).toContain('describe');
    } finally {
      unlinkSync(tmpFile);
    }
  });

  test('10. Prompt structure: header → error → task (in correct order)', () => {
    const prompt = buildPrompt({
      repo: 'myorg/myapp',
      branch: 'main',
      runId: '123',
      includeContext: false,
      error: MOCK_ERROR,
    });

    const headerIdx = prompt.indexOf('## CI Failure');
    const errorIdx = prompt.indexOf('### Error');
    const taskIdx = prompt.indexOf('### Task');

    expect(headerIdx).toBeLessThan(errorIdx);
    expect(errorIdx).toBeLessThan(taskIdx);
  });
});

describe('readFileContext', () => {
  test('11. Returns null for a non-existent file', () => {
    const result = readFileContext('src/__nonexistent__file__.ts');
    expect(result).toBeNull();
  });

  test('12. Returns file content and extension for an existing file', () => {
    const tmpDir = os.tmpdir();
    const tmpFile = join(tmpDir, 'test-context.ts');
    writeFileSync(tmpFile, 'export const x = 42;\n', 'utf-8');

    try {
      const result = readFileContext(tmpFile);
      expect(result).not.toBeNull();
      expect(result?.extension).toBe('ts');
      expect(result?.content).toContain('export const x = 42');
    } finally {
      unlinkSync(tmpFile);
    }
  });
});

import { buildPrompt, readFileContext } from '../prompt-builder.js';
import type { ExtractedError } from '../error-extractor.js';
import { writeFileSync, unlinkSync } from 'fs';
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

// ---------------------------------------------------------------------------
// T-005: Multi-file source context in prompts
// ---------------------------------------------------------------------------

describe('buildPrompt - multi-file source context (T-005)', () => {
  test('13. Renders separate Source Context block for each found file (2 files)', () => {
    const tmpDir = os.tmpdir();
    const tmpFile1 = join(tmpDir, 'file1-t005.ts');
    const tmpFile2 = join(tmpDir, 'file2-t005.ts');
    writeFileSync(tmpFile1, 'export const a = 1;\n', 'utf-8');
    writeFileSync(tmpFile2, 'export const b = 2;\n', 'utf-8');

    try {
      const errorWith2Files: ExtractedError = {
        stepName: 'Run tests',
        errorLines: ['##[error]Fail'],
        allErrors: ['##[error]Fail'],
        fullContext: '##[error]Fail',
        filePaths: [tmpFile1, tmpFile2],
      };

      const prompt = buildPrompt({
        repo: 'myorg/myapp',
        branch: 'main',
        runId: '123',
        includeContext: true,
        error: errorWith2Files,
      });

      // Should have TWO Source Context sections
      const occurrences = (prompt.match(/### Source Context/g) || []).length;
      expect(occurrences).toBe(2);
      expect(prompt).toContain('export const a = 1');
      expect(prompt).toContain('export const b = 2');
    } finally {
      unlinkSync(tmpFile1);
      unlinkSync(tmpFile2);
    }
  });

  test('14. Caps at 5 files even when more than 5 file paths provided', () => {
    const tmpDir = os.tmpdir();
    const tmpFiles: string[] = [];
    for (let i = 0; i < 7; i++) {
      const f = join(tmpDir, `cap-test-t005-${String(i)}.ts`);
      writeFileSync(f, `export const v${String(i)} = ${String(i)};\n`, 'utf-8');
      tmpFiles.push(f);
    }

    try {
      const errorWith7Files: ExtractedError = {
        stepName: 'Run tests',
        errorLines: ['##[error]Fail'],
        allErrors: ['##[error]Fail'],
        fullContext: '##[error]Fail',
        filePaths: tmpFiles,
      };

      const prompt = buildPrompt({
        repo: 'myorg/myapp',
        branch: 'main',
        runId: '123',
        includeContext: true,
        error: errorWith7Files,
      });

      // Should have at most 5 Source Context sections
      const occurrences = (prompt.match(/### Source Context/g) || []).length;
      expect(occurrences).toBeLessThanOrEqual(5);
      expect(occurrences).toBeGreaterThan(0);
    } finally {
      for (const f of tmpFiles) unlinkSync(f);
    }
  });

  test('15. Gracefully skips files that do not exist locally', () => {
    const tmpDir = os.tmpdir();
    const existingFile = join(tmpDir, 'existing-t005.ts');
    writeFileSync(existingFile, 'export const exists = true;\n', 'utf-8');

    try {
      const errorMixed: ExtractedError = {
        stepName: 'Run tests',
        errorLines: ['##[error]Fail'],
        allErrors: ['##[error]Fail'],
        fullContext: '##[error]Fail',
        filePaths: [
          '/nonexistent/path/foo.ts',
          existingFile,
          '/another/missing/bar.ts',
        ],
      };

      const prompt = buildPrompt({
        repo: 'myorg/myapp',
        branch: 'main',
        runId: '123',
        includeContext: true,
        error: errorMixed,
      });

      // Only the existing file should generate a Source Context block
      const occurrences = (prompt.match(/### Source Context/g) || []).length;
      expect(occurrences).toBe(1);
      expect(prompt).toContain('export const exists = true');
    } finally {
      unlinkSync(existingFile);
    }
  });

  test('16. Each Source Context block shows the file path as a subheading', () => {
    const tmpDir = os.tmpdir();
    const tmpFile = join(tmpDir, 'subheading-t005.ts');
    writeFileSync(tmpFile, 'const x = 1;\n', 'utf-8');

    try {
      const error: ExtractedError = {
        stepName: 'Run tests',
        errorLines: ['##[error]Fail'],
        allErrors: ['##[error]Fail'],
        fullContext: '##[error]Fail',
        filePaths: [tmpFile],
      };

      const prompt = buildPrompt({
        repo: 'myorg/myapp',
        branch: 'main',
        runId: '123',
        includeContext: true,
        error,
      });

      // The file path should appear as a subheading (bold or code) after Source Context
      expect(prompt).toContain('### Source Context');
      // File path shown as **File:** `path`
      expect(prompt).toContain('**File:**');
      expect(prompt).toContain(tmpFile);
    } finally {
      unlinkSync(tmpFile);
    }
  });

  test('17. With includeContext=false, no Source Context block even with multiple files', () => {
    const tmpDir = os.tmpdir();
    const tmpFile = join(tmpDir, 'no-ctx-t005.ts');
    writeFileSync(tmpFile, 'const y = 2;\n', 'utf-8');

    try {
      const error: ExtractedError = {
        stepName: 'Run tests',
        errorLines: ['##[error]Fail'],
        allErrors: ['##[error]Fail'],
        fullContext: '##[error]Fail',
        filePaths: [tmpFile, tmpFile],
      };

      const prompt = buildPrompt({
        repo: 'myorg/myapp',
        branch: 'main',
        runId: '123',
        includeContext: false,
        error,
      });

      expect(prompt).not.toContain('### Source Context');
    } finally {
      unlinkSync(tmpFile);
    }
  });

  test('18. All non-existent files gracefully skipped - no Source Context block at all', () => {
    const error: ExtractedError = {
      stepName: 'Run tests',
      errorLines: ['##[error]Fail'],
      allErrors: ['##[error]Fail'],
      fullContext: '##[error]Fail',
      filePaths: [
        '/definitely/does/not/exist/a.ts',
        '/definitely/does/not/exist/b.ts',
      ],
    };

    const prompt = buildPrompt({
      repo: 'myorg/myapp',
      branch: 'main',
      runId: '123',
      includeContext: true,
      error,
    });

    // All missing → no Source Context block
    expect(prompt).not.toContain('### Source Context');
    // Task section still present
    expect(prompt).toContain('### Task');
  });
});

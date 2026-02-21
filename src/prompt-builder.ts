import type { ExtractedError } from './error-extractor.js';
import { readFileSync, existsSync } from 'fs';
import { extname } from 'path';

export interface FileContext {
  filePath: string;
  content: string;
  extension: string;
}

export interface PromptOptions {
  repo: string;
  branch: string;
  runId: string;
  includeContext: boolean;
  error: ExtractedError;
}

/**
 * Tries to read a source file from the local repo and extract ±20 lines
 * around the failing line number (if known from the path like file.ts:42).
 */
export function readFileContext(filePath: string): FileContext | null {
  // Strip line number suffix (e.g. src/foo.ts:42 → src/foo.ts)
  const pathWithoutLine = filePath.replace(/:\d+$/, '');
  const lineMatch = filePath.match(/:(\d+)$/);
  const errorLine = lineMatch ? parseInt(lineMatch[1], 10) : null;

  // Try the path as-is, then without leading ./
  const candidates = [pathWithoutLine, pathWithoutLine.replace(/^\.\//, '')];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      try {
        const raw = readFileSync(candidate, 'utf-8');
        const allLines = raw.split('\n');

        let content: string;
        if (errorLine !== null) {
          // ±20 lines around the error line (1-indexed)
          const start = Math.max(0, errorLine - 21);
          const end = Math.min(allLines.length, errorLine + 20);
          content = allLines.slice(start, end).join('\n');
        } else {
          // Max 200 lines
          content = allLines.slice(0, 200).join('\n');
        }

        const ext = extname(candidate).replace('.', '') || 'text';
        return { filePath: candidate, content, extension: ext };
      } catch {
        return null;
      }
    }
  }

  return null;
}

/**
 * Builds a structured LLM prompt from an extracted CI error.
 *
 * Format:
 * ## CI Failure — [repo] / [branch]
 * **Run:** [run-id or "latest"]
 * **Failing step:** [step name]
 *
 * ### Error
 * ```
 * [extracted error lines, max 50 lines]
 * ```
 *
 * ### Source Context
 * ```[ext]
 * [file content around the failing line, ±20 lines]
 * ```
 *
 * ### Task
 * Fix the error above. Explain what caused it and provide the corrected code.
 */
export function buildPrompt(options: PromptOptions): string {
  const { repo, branch, runId, includeContext, error } = options;

  const parts: string[] = [];

  // Header
  parts.push(`## CI Failure — ${repo} / ${branch}`);
  parts.push(`**Run:** ${runId}`);
  parts.push(`**Failing step:** ${error.stepName}`);
  parts.push('');

  // Error section
  parts.push('### Error');
  parts.push('```');
  parts.push(error.fullContext || '(no error output captured)');
  parts.push('```');
  parts.push('');

  // Source context (optional)
  if (includeContext && error.filePaths.length > 0) {
    const fileCtx = readFileContext(error.filePaths[0]);
    if (fileCtx) {
      parts.push('### Source Context');
      parts.push(`\`\`\`${fileCtx.extension}`);
      parts.push(fileCtx.content);
      parts.push('```');
      parts.push('');
    }
  }

  // Task
  parts.push('### Task');
  parts.push(
    'Fix the error above. Explain what caused it and provide the corrected code.'
  );

  return parts.join('\n');
}

/**
 * Result of error extraction from a raw CI log.
 */
export interface ExtractedError {
  /** Name of the failing step (from ##[group] marker) */
  stepName: string;
  /** Lines from the failing step context + error lines */
  errorLines: string[];
  /** All ##[error] lines found in the log (or extended error lines as fallback) */
  allErrors: string[];
  /** Full context block as a single string */
  fullContext: string;
  /** File paths extracted from error lines */
  filePaths: string[];
}

/** Strip ANSI escape codes */
function stripAnsi(line: string): string {
  return line.replace(/\x1b\[[0-9;]*m/g, '');
}

/** Strip GitHub Actions timestamp prefixes like "2024-01-01T12:00:00.0000000Z " */
function stripTimestamp(line: string): string {
  return line.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/gm, '');
}

/**
 * Parse a line from `gh run view --log-failed`.
 * The format is: "<job>\t<step>\t<timestamp> <content>"
 * Returns { job, step, content } if parseable, otherwise { content: original line }.
 */
export function parseGhLogLine(line: string): { job: string; step: string; content: string } {
  const parts = line.split('\t');
  if (parts.length >= 3) {
    const job = parts[0].trim();
    const step = parts[1].trim();
    // remainder after the two tabs, strip leading timestamp
    const raw = parts.slice(2).join('\t');
    const content = stripTimestamp(stripAnsi(raw)).trim();
    return { job, step, content };
  }
  // Not a gh log line - treat as plain content
  return { job: '', step: '', content: stripTimestamp(stripAnsi(line)).trim() };
}

/** Clean a single line: parse gh format, then strip ANSI + timestamps */
function cleanLine(line: string): string {
  return parseGhLogLine(line).content;
}

/**
 * Returns true if a line matches broader error heuristics beyond ##[error].
 * Covers: plain Error:/error: prefixes, FAILED, npm ERR!, ENOENT, SyntaxError, etc.
 */
function isExtendedError(line: string): boolean {
  return (
    /^(Error|error):/.test(line) ||
    /\bFAILED\b/.test(line) ||
    /failed with exit code/i.test(line) ||
    /^npm ERR!/i.test(line) ||
    /\bENOENT\b/.test(line) ||
    /Cannot find module/i.test(line) ||
    /^SyntaxError:/i.test(line)
  );
}

/**
 * Extract file paths from error lines.
 * Matches patterns like: ./src/foo.ts:42, src/foo.ts, lib/bar.js:10
 */
export function extractFilePaths(lines: string[]): string[] {
  const pathRegex = /(?:\.\/|src\/|lib\/)[\w/.-]+\.[a-z]+(?::\d+)?/gi;
  const paths = new Set<string>();
  for (const line of lines) {
    const matches = line.match(pathRegex);
    if (matches) {
      for (const m of matches) {
        paths.add(m);
      }
    }
  }
  return Array.from(paths);
}

/**
 * Core context-extraction logic shared by primary and extended error modes.
 * Given the index of the last (most relevant) error line, extracts a context
 * block: from the nearest ##[group] (or 30 lines before) through ##[endgroup]
 * (or 5 lines after), capped at 50 lines.
 */
function extractContext(
  lines: string[],
  errorIndices: number[],
  parsedMeta?: Array<{ job: string; step: string; content: string }>
): {
  stepName: string;
  errorLines: string[];
  fullContext: string;
  filePaths: string[];
  allErrors: string[];
} {
  const allErrors = errorIndices.map((i) => lines[i]);

  // Focus on the last error — most likely the root cause
  const lastErrorIdx = errorIndices[errorIndices.length - 1];

  // Try to get step name from gh log metadata first (tab-separated format)
  let stepName = '(unknown)';
  if (parsedMeta) {
    // Find the step name from the error line or nearest preceding line with a step
    for (let i = lastErrorIdx; i >= 0; i--) {
      if (parsedMeta[i]?.step) {
        stepName = parsedMeta[i].step;
        break;
      }
    }
  }

  // Fallback: scan backwards for ##[group] marker
  let groupIdx = -1;
  if (stepName === '(unknown)') {
    for (let i = lastErrorIdx; i >= 0; i--) {
      const groupMatch = lines[i].match(/^##\[group\](.+)/i);
      if (groupMatch) {
        groupIdx = i;
        stepName = groupMatch[1].trim();
        break;
      }
    }
  }

  // Determine start: group line or 30 lines before error (whichever is more recent)
  const contextStart =
    groupIdx >= 0 ? groupIdx : Math.max(0, lastErrorIdx - 30);

  // Determine end: find ##[endgroup] after last error, or 5 lines after, or EOF
  let contextEnd = Math.min(lines.length - 1, lastErrorIdx + 5);
  for (let i = lastErrorIdx; i < lines.length; i++) {
    if (/^##\[endgroup\]/i.test(lines[i])) {
      contextEnd = i;
      break;
    }
  }

  // Include all error lines that appear after contextEnd
  const afterErrorLines: string[] = [];
  for (const idx of errorIndices) {
    if (idx > contextEnd) {
      afterErrorLines.push(lines[idx]);
    }
  }

  // Build error lines block
  const contextLines = lines.slice(contextStart, contextEnd + 1);
  const errorLines = [...contextLines, ...afterErrorLines].filter(
    (l) => l.trim() !== ''
  );

  // Limit to 50 lines
  const limitedErrorLines = errorLines.slice(0, 50);

  const fullContext = limitedErrorLines.join('\n');
  const filePaths = extractFilePaths(limitedErrorLines);

  return { stepName, errorLines: limitedErrorLines, fullContext, filePaths, allErrors };
}

/**
 * Extract structured error information from a raw GitHub Actions log.
 *
 * Algorithm:
 * 1. Split into lines, strip ANSI + timestamps
 * 2. Find all ##[error] lines → collect indices (primary)
 * 3. If none found, try extended heuristics: Error:, FAILED, npm ERR!, ENOENT, etc.
 * 4. If still none found, fall back to last 30 lines (better than empty output)
 * 5. Focus on the LAST matching line (usually the root cause)
 * 6. Scan backwards for nearest ##[group] → failing step name
 * 7. Extract context: from ##[group] through ##[endgroup] (or ±30/5 lines)
 * 8. Extract file paths from error lines
 */
export function extractErrors(rawLog: string): ExtractedError {
  const empty: ExtractedError = {
    stepName: '(unknown)',
    errorLines: [],
    allErrors: [],
    fullContext: '',
    filePaths: [],
  };

  if (!rawLog || rawLog.trim() === '') {
    return empty;
  }

  const rawLines = rawLog.split('\n');

  // Pre-parse gh log format to extract step names per line
  const parsed = rawLines.map(parseGhLogLine);
  const lines = parsed.map((p) => p.content);

  // --- Primary: ##[error] markers ---
  const markerErrorIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^##\[error\]/i.test(lines[i])) {
      markerErrorIndices.push(i);
    }
  }

  if (markerErrorIndices.length > 0) {
    const result = extractContext(lines, markerErrorIndices, parsed);
    return {
      stepName: result.stepName,
      errorLines: result.errorLines,
      allErrors: result.allErrors,
      fullContext: result.fullContext,
      filePaths: result.filePaths,
    };
  }

  // --- Fallback 1: Extended error heuristics ---
  const extendedErrorIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isExtendedError(lines[i])) {
      extendedErrorIndices.push(i);
    }
  }

  if (extendedErrorIndices.length > 0) {
    const result = extractContext(lines, extendedErrorIndices, parsed);
    return {
      stepName: result.stepName,
      errorLines: result.errorLines,
      allErrors: result.allErrors,
      fullContext: result.fullContext,
      filePaths: result.filePaths,
    };
  }

  // --- Fallback 2: Last 30 lines (better than empty output) ---
  const last30 = lines.slice(-30).filter((l) => l.trim() !== '');
  if (last30.length > 0) {
    return {
      stepName: '(unknown)',
      errorLines: last30,
      allErrors: [],
      fullContext: last30.join('\n'),
      filePaths: extractFilePaths(last30),
    };
  }

  return empty;
}

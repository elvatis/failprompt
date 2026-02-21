/**
 * Result of error extraction from a raw CI log.
 */
export interface ExtractedError {
  /** Name of the failing step (from ##[group] marker) */
  stepName: string;
  /** Lines from the failing step context + error lines */
  errorLines: string[];
  /** All ##[error] lines found in the log */
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

/** Clean a single line: strip ANSI + timestamps */
function cleanLine(line: string): string {
  return stripTimestamp(stripAnsi(line));
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
 * Extract structured error information from a raw GitHub Actions log.
 *
 * Algorithm:
 * 1. Split into lines, strip ANSI + timestamps
 * 2. Find all ##[error] lines → collect indices
 * 3. For each ##[error], scan backwards for nearest ##[group] → failing step name
 * 4. Focus on the LAST ##[error] (usually the root cause)
 * 5. Extract context: from the ##[group] line through ##[endgroup] + all ##[error] lines after
 * 6. Extract file paths from error lines
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
  const lines = rawLines.map(cleanLine);

  // Collect indices of ##[error] lines
  const errorIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^##\[error\]/i.test(lines[i])) {
      errorIndices.push(i);
    }
  }

  if (errorIndices.length === 0) {
    return empty;
  }

  // Collect all ##[error] lines as summary
  const allErrors = errorIndices.map((i) => lines[i]);

  // Focus on the last ##[error] — most likely the root cause
  const lastErrorIdx = errorIndices[errorIndices.length - 1];

  // Scan backwards from last error to find nearest ##[group]
  let groupIdx = -1;
  let stepName = '(unknown)';
  for (let i = lastErrorIdx; i >= 0; i--) {
    const groupMatch = lines[i].match(/^##\[group\](.+)/i);
    if (groupMatch) {
      groupIdx = i;
      stepName = groupMatch[1].trim();
      break;
    }
  }

  // Determine start: group line or 30 lines before error (whichever is more recent)
  const contextStart =
    groupIdx >= 0
      ? groupIdx
      : Math.max(0, lastErrorIdx - 30);

  // Determine end: find ##[endgroup] after last error, or 5 lines after, or EOF
  let contextEnd = Math.min(lines.length - 1, lastErrorIdx + 5);
  for (let i = lastErrorIdx; i < lines.length; i++) {
    if (/^##\[endgroup\]/i.test(lines[i])) {
      contextEnd = i;
      break;
    }
  }

  // Include all ##[error] lines that appear after contextEnd
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

  return {
    stepName,
    errorLines: limitedErrorLines,
    allErrors,
    fullContext,
    filePaths,
  };
}

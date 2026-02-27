/**
 * CI provider detection and metadata extraction.
 *
 * Supports GitHub Actions and GitLab CI. Provider is detected from
 * environment variables (when running in CI) or from log content heuristics.
 */

export type CIProvider = 'github' | 'gitlab' | 'unknown'

export interface CIMetadata {
  provider: CIProvider
  /** Job name (GITHUB_JOB or CI_JOB_NAME) */
  jobName: string
  /** Run/pipeline ID (GITHUB_RUN_ID or CI_PIPELINE_ID) */
  runId: string
  /** Pipeline URL (CI_PIPELINE_URL for GitLab) */
  pipelineUrl: string
}

/**
 * Detect CI provider from environment variables.
 *
 * GitLab CI sets CI_JOB_NAME and CI_PIPELINE_ID.
 * GitHub Actions sets GITHUB_ACTIONS and GITHUB_RUN_ID.
 */
export function detectCIProvider(): CIMetadata {
  // GitLab CI
  if (process.env['CI_JOB_NAME'] || process.env['CI_PIPELINE_ID']) {
    return {
      provider: 'gitlab',
      jobName: process.env['CI_JOB_NAME'] ?? '',
      runId: process.env['CI_PIPELINE_ID'] ?? '',
      pipelineUrl: process.env['CI_PIPELINE_URL'] ?? '',
    }
  }

  // GitHub Actions
  if (process.env['GITHUB_ACTIONS']) {
    return {
      provider: 'github',
      jobName: process.env['GITHUB_JOB'] ?? '',
      runId: process.env['GITHUB_RUN_ID'] ?? '',
      pipelineUrl: '',
    }
  }

  return { provider: 'unknown', jobName: '', runId: '', pipelineUrl: '' }
}

/**
 * Detect CI provider from the raw log content.
 *
 * GitLab logs contain `section_start:TIMESTAMP:NAME` markers.
 * GitHub logs contain `##[error]`, `##[group]`, or tab-separated job/step prefixes.
 */
export function detectProviderFromLog(rawLog: string): CIProvider {
  if (/section_start:\d+:/.test(rawLog)) return 'gitlab'
  if (/##\[(error|group|endgroup)\]/i.test(rawLog)) return 'github'
  if (/^[^\t]+\t[^\t]+\t\d{4}-\d{2}-\d{2}T/m.test(rawLog)) return 'github'
  return 'unknown'
}

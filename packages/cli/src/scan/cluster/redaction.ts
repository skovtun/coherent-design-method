/**
 * Privacy preflight for B-2b LLM run. Codex Q11: samples may contain emails,
 * tokens, secrets, or internal product names. v0 strategy: detect-and-warn
 * (no auto-redaction). The user decides whether to redact at the source.
 *
 * Auto-redaction defers — silently mangling context degrades label quality
 * and is hard to test for regressions. A loud warning lets the user fix the
 * scan input (.coherentignore, redaction in source files) before paying for
 * an LLM call.
 */

import type { Cluster } from './types.js'

const PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'email', re: /[\w.+-]+@[\w-]+\.[\w.-]+/ },
  { name: 'bearer-token', re: /\bbearer\s+[A-Za-z0-9._~+/=-]{16,}/i },
  { name: 'api-key-like', re: /\b(?:api[_-]?key|secret|password|passwd)\b[^a-z0-9]*[A-Za-z0-9._/+=-]{8,}/i },
  { name: 'aws-key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/ },
  { name: 'ssn-like', re: /\b\d{3}-\d{2}-\d{4}\b/ },
]

export interface RedactionHit {
  cluster_id: string
  pattern: string
  sample_file: string
  sample_line: number
}

export function scanClustersForSecrets(clusters: Cluster[]): RedactionHit[] {
  const hits: RedactionHit[] = []
  for (const cluster of clusters) {
    for (const member of cluster.members) {
      const haystack = `${member.raw_class_string}\n${member.surrounding_context}`
      for (const { name, re } of PATTERNS) {
        if (re.test(haystack)) {
          hits.push({
            cluster_id: cluster.cluster_id,
            pattern: name,
            sample_file: member.file,
            sample_line: member.line,
          })
          break // one hit per (cluster, member); don't double-count overlapping patterns
        }
      }
    }
  }
  return hits
}

/** Returns a short human warning. Empty string when no hits. */
export function formatRedactionWarning(hits: RedactionHit[]): string {
  if (hits.length === 0) return ''
  const byPattern = new Map<string, number>()
  for (const h of hits) byPattern.set(h.pattern, (byPattern.get(h.pattern) ?? 0) + 1)
  const breakdown = Array.from(byPattern.entries())
    .map(([k, v]) => `${k} ×${v}`)
    .join(', ')
  const examples = hits
    .slice(0, 3)
    .map(h => `  - ${h.sample_file}:${h.sample_line} (${h.pattern}, cluster ${h.cluster_id})`)
    .join('\n')
  return [
    `⚠ ${hits.length} cluster sample(s) look like they may contain secrets/PII (${breakdown}):`,
    examples,
    'These will be sent to the LLM. Consider scrubbing source files or excluding them via .coherentignore.',
    '',
  ].join('\n')
}
